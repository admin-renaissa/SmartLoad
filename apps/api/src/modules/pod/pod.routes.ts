import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { successResponse, errorResponse, UserRole } from '@smartload/shared';
import { parsePagination, buildPaginationMeta } from '@smartload/shared';
import { PODStatus, POStatus } from '@prisma/client';
import { enqueuePodDispatchNotifications } from '../../workers/pod-creation.processor.js';
import { dataUrlToBuffer, uploadObject } from '../../lib/object-storage.js';
import { generatePodPdfBuffer } from './pod-pdf.service.js';

export const podRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/pod/link/:token — PUBLIC
  fastify.get('/link/:token', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { token } = request.params as { token: string };

    const pod = await fastify.prisma.proofOfDelivery.findUnique({
      where: { linkToken: token },
      include: {
        session: {
          include: {
            purchaseOrder: {
              include: {
                client: true,
                lineItems: {
                  include: { variant: { include: { product: true } } },
                },
              },
            },
            vehicle: true,
          },
        },
        lineItems: {
          include: { lineItem: { include: { variant: { include: { product: true } } } } },
        },
      },
    });

    if (!pod) return reply.code(404).send(errorResponse('POD link not found'));
    if (new Date() > pod.linkExpiresAt) {
      await fastify.prisma.proofOfDelivery.update({
        where: { id: pod.id },
        data: { status: PODStatus.EXPIRED },
      });
      return reply.code(410).send(errorResponse('This delivery acknowledgement link has expired'));
    }

    return reply.send(successResponse(pod));
  });

  // POST /api/v1/pod/:id/request-otp — PUBLIC
  fastify.post('/:id/request-otp', {
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { receiverPhone } = z.object({ receiverPhone: z.string().min(10) }).parse(request.body);

    const pod = await fastify.prisma.proofOfDelivery.findUnique({ where: { id } });
    if (!pod) return reply.code(404).send(errorResponse('POD not found'));
    if (new Date() > pod.linkExpiresAt) return reply.code(410).send(errorResponse('Link expired'));

    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await fastify.prisma.proofOfDelivery.update({
      where: { id },
      data: { otpHash: hashedOtp, otpExpiresAt, receiverPhone, status: PODStatus.LINK_SENT, otpAttempts: 0 },
    });

    // Queue SMS notification
    const { Queue } = await import('bullmq');
    const notifQueue = new Queue('notifications', {
      connection: {
        host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
        port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
      },
    });
    await notifQueue.add('send', {
      channel: 'SMS',
      recipientPhone: receiverPhone,
      type: 'POD_OTP',
      variables: { otp, expiryMinutes: '10' },
    });
    await notifQueue.close();

    const maskedPhone = receiverPhone.slice(0, 3) + 'XXXXXX' + receiverPhone.slice(-2);
    return reply.send(successResponse({ message: `OTP sent to ${maskedPhone}` }));
  });

  // POST /api/v1/pod/:id/verify-otp — PUBLIC
  fastify.post('/:id/verify-otp', {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { otp } = z.object({ otp: z.string().length(6) }).parse(request.body);

    const pod = await fastify.prisma.proofOfDelivery.findUnique({ where: { id } });
    if (!pod) return reply.code(404).send(errorResponse('POD not found'));
    if (!pod.otpHash || !pod.otpExpiresAt) return reply.code(400).send(errorResponse('OTP not requested'));
    if (new Date() > pod.otpExpiresAt) return reply.code(400).send(errorResponse('OTP expired. Request a new one.'));
    if (pod.otpAttempts >= 5) return reply.code(429).send(errorResponse('Too many failed attempts. Request a new OTP.'));

    const valid = await bcrypt.compare(otp, pod.otpHash);
    if (!valid) {
      await fastify.prisma.proofOfDelivery.update({
        where: { id },
        data: { otpAttempts: { increment: 1 } },
      });
      return reply.code(400).send(errorResponse('Invalid OTP'));
    }

    await fastify.prisma.proofOfDelivery.update({
      where: { id },
      data: { status: PODStatus.OTP_VERIFIED },
    });

    // Issue short-lived POD token (double cast needed — POD payload is not the standard JwtPayload)
    const podToken = fastify.jwt.sign(
      { podId: id, type: 'pod' } as unknown as Parameters<typeof fastify.jwt.sign>[0],
      { expiresIn: '2h' },
    );

    return reply.send(successResponse({ podToken }));
  });

  // POST /api/v1/pod/:id/acknowledge — PUBLIC (pod-token)
  fastify.post('/:id/acknowledge', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Verify POD-scoped JWT
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send(errorResponse('POD token required'));
    }
    try {
      const decoded = fastify.jwt.verify<{ podId: string; type: string }>(authHeader.slice(7));
      if (decoded.type !== 'pod' || decoded.podId !== id) {
        return reply.code(403).send(errorResponse('Invalid POD token'));
      }
    } catch {
      return reply.code(401).send(errorResponse('Invalid or expired POD token'));
    }

    const MAX_DATA_URL_CHARS = 6_500_000;
    const dto = z.object({
      receiverName: z.string().min(1),
      acknowledgedItems: z.array(z.object({
        lineItemId: z.string(),
        acknowledgedBoxes: z.number().int().min(0),
        discrepancyReason: z.string().optional(),
      })),
      discrepancyNotes: z.string().optional(),
      geoLat: z.number().optional(),
      geoLng: z.number().optional(),
      signatureDataUrl: z.string().max(MAX_DATA_URL_CHARS).optional(),
      deliveryPhotoDataUrl: z.string().max(MAX_DATA_URL_CHARS).optional(),
    }).parse(request.body);

    const pod = await fastify.prisma.proofOfDelivery.findUnique({
      where: { id },
      include: { lineItems: true },
    });

    if (!pod) return reply.code(404).send(errorResponse('POD not found'));
    if (pod.status === PODStatus.ACKNOWLEDGED || pod.status === PODStatus.DISPUTED) {
      return reply.code(400).send(errorResponse('POD already acknowledged'));
    }

    let hasDiscrepancy = false;

    await fastify.prisma.$transaction(async (tx) => {
      for (const item of dto.acknowledgedItems) {
        const podLineItem = pod.lineItems.find((li) => li.lineItemId === item.lineItemId);
        if (!podLineItem) continue;

        const discrepancyBoxes = podLineItem.deliveredBoxes - item.acknowledgedBoxes;
        if (discrepancyBoxes > 0) hasDiscrepancy = true;

        await tx.pODLineItem.update({
          where: { id: podLineItem.id },
          data: {
            acknowledgedBoxes: item.acknowledgedBoxes,
            discrepancyBoxes: Math.max(0, discrepancyBoxes),
            discrepancyReason: item.discrepancyReason,
          },
        });
      }

      const newStatus = hasDiscrepancy ? PODStatus.DISPUTED : PODStatus.ACKNOWLEDGED;

      await tx.proofOfDelivery.update({
        where: { id },
        data: {
          status: newStatus,
          receiverName: dto.receiverName,
          geoLat: dto.geoLat,
          geoLng: dto.geoLng,
          discrepancyNotes: dto.discrepancyNotes,
          acknowledgedAt: new Date(),
        },
      });

      // Update PO status to DELIVERED
      const session = await tx.dispatchSession.findUnique({ where: { id: pod.sessionId } });
      if (session) {
        await tx.purchaseOrder.update({
          where: { id: session.poId },
          data: { status: POStatus.DELIVERED },
        });
      }
    });

    let signatureImageUrl: string | null = null;
    if (dto.signatureDataUrl) {
      const parsed = dataUrlToBuffer(dto.signatureDataUrl);
      if (parsed) {
        if (parsed.buffer.length > 4 * 1024 * 1024) {
          fastify.log.warn('POD signature image exceeds 4MB; skipped');
        } else {
          try {
            signatureImageUrl = await uploadObject(
              `pod/${id}/signature-${Date.now()}.png`,
              parsed.buffer,
              parsed.contentType || 'image/png',
            );
            await fastify.prisma.proofOfDelivery.update({
              where: { id },
              data: { signatureImageUrl },
            });
          } catch (err) {
            fastify.log.warn({ err }, 'POD signature upload failed (check S3 / MinIO env)');
          }
        }
      }
    }

    let receiverPhotoUrl: string | null = null;
    if (dto.deliveryPhotoDataUrl) {
      const parsed = dataUrlToBuffer(dto.deliveryPhotoDataUrl);
      if (parsed) {
        if (parsed.buffer.length > 4 * 1024 * 1024) {
          fastify.log.warn('POD delivery photo exceeds 4MB; skipped');
        } else {
          const ext = (parsed.contentType || '').includes('png') ? 'png' : 'jpg';
          try {
            receiverPhotoUrl = await uploadObject(
              `pod/${id}/delivery-photo-${Date.now()}.${ext}`,
              parsed.buffer,
              parsed.contentType || 'image/jpeg',
            );
            await fastify.prisma.proofOfDelivery.update({
              where: { id },
              data: { receiverPhotoUrl },
            });
          } catch (err) {
            fastify.log.warn({ err }, 'POD delivery photo upload failed (check S3 / MinIO env)');
          }
        }
      }
    }

    let podPdfUrl: string | null = null;
    try {
      const pdfBuf = await generatePodPdfBuffer(
        fastify.prisma,
        id,
        dto.signatureDataUrl ?? null,
        dto.deliveryPhotoDataUrl ?? null,
      );
      podPdfUrl = await uploadObject(`pod/${id}/pod-${Date.now()}.pdf`, pdfBuf, 'application/pdf');
      await fastify.prisma.proofOfDelivery.update({
        where: { id },
        data: { podPdfUrl },
      });
    } catch (err) {
      fastify.log.warn({ err }, 'POD PDF generation or upload failed');
    }

    const accountsEmail = process.env.ACCOUNTS_NOTIFICATION_EMAIL;
    if (accountsEmail) {
      const { Queue } = await import('bullmq');
      const { QUEUES } = await import('@smartload/shared');
      const q = new Queue(QUEUES.NOTIFICATIONS, {
        connection: {
          host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
          port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
        },
      });
      try {
        await q.add('pod-ack-email', {
          channel: 'EMAIL',
          recipientEmail: accountsEmail,
          type: 'POD_ACK_ACCOUNTS',
          variables: { podId: id, podPdfUrl: podPdfUrl ?? '' },
        });
      } finally {
        await q.close();
      }
    }

    return reply.send(successResponse({
      status: hasDiscrepancy ? 'DISPUTED' : 'ACKNOWLEDGED',
      message: hasDiscrepancy
        ? 'Delivery acknowledged with discrepancies. Our team will contact you.'
        : 'Delivery successfully acknowledged. Thank you!',
      podPdfUrl,
    }));
  });

  fastify.get(
    '/:id/pdf',
    { preHandler: fastify.requireRole(UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.ACCOUNTS, UserRole.CLIENT) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const pod = await fastify.prisma.proofOfDelivery.findUnique({ where: { id } });
      if (!pod) return reply.code(404).send(errorResponse('POD not found'));
      const buf = await generatePodPdfBuffer(fastify.prisma, id, null);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="POD-${id.slice(0, 8)}.pdf"`);
      return reply.send(buf);
    },
  );

  // GET /api/v1/pod — PRIVATE: list all PODs
  fastify.get('/', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; status?: PODStatus };
    const { page, limit, skip } = parsePagination({ page: Number(query.page), limit: Number(query.limit) });

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;

    const [pods, total] = await Promise.all([
      fastify.prisma.proofOfDelivery.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          session: {
            include: {
              purchaseOrder: { include: { client: { select: { id: true, name: true } } } },
              vehicle: { select: { registrationNumber: true } },
            },
          },
        },
      }),
      fastify.prisma.proofOfDelivery.count({ where }),
    ]);

    return reply.send(successResponse(pods, buildPaginationMeta(total, page, limit)));
  });

  // POST /api/v1/pod/:id/resend-link — PRIVATE
  fastify.post('/:id/resend-link', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const pod = await fastify.prisma.proofOfDelivery.findUnique({
      where: { id },
      include: {
        lineItems: true,
        session: {
          include: {
            purchaseOrder: { include: { client: true } },
            vehicle: true,
          },
        },
      },
    });

    if (!pod) return reply.code(404).send(errorResponse('POD not found'));

    const podUrl = `${process.env.APP_BASE_URL}/pod/${pod.linkToken}`;
    const phone = pod.receiverPhone || pod.session.purchaseOrder.client.phone;
    const v = pod.session.vehicle;

    const variables = {
      companyName: process.env.COMPANY_NAME ?? 'SmartLoad',
      poNumber: pod.session.purchaseOrder.poNumber,
      vehicleReg: v.registrationNumber,
      driverName: v.driverName ?? '',
      driverPhone: v.driverPhone ?? '',
      podUrl,
      clientName: pod.session.purchaseOrder.client.name,
      itemCount: String(pod.lineItems.length),
      totalBoxes: String(pod.session.totalBoxesScanned ?? 0),
    };

    await enqueuePodDispatchNotifications(phone, pod.session.purchaseOrder.client.email, variables);

    return reply.send(successResponse({ message: `POD link resent to ${phone ?? 'client'}` }));
  });
};

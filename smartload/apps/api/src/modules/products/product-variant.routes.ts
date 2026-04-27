import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BarcodeFormat, successResponse, errorResponse, UserRole } from '@smartload/shared';
import { generateBarcodeValue } from '@smartload/shared';

const variantSchema = z.object({
  colourCode: z.string().min(2).toUpperCase(),
  colourName: z.string().min(2),
  lengthMm: z.number().positive().optional(),
  widthMm: z.number().positive().optional(),
  thicknessMm: z.number().positive().optional(),
  barcodeValue: z.string().min(4),
  barcodeFormat: z.nativeEnum(BarcodeFormat).default(BarcodeFormat.QR),
  imageUrl: z.string().url().optional(),
  mrpPaise: z.number().int().positive().optional(),
});

export const productVariantRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/products/:productId/variants
  fastify.get('/products/:productId/variants', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const variants = await fastify.prisma.productVariant.findMany({
      where: { productId },
      include: { inventoryStock: true },
      orderBy: { colourCode: 'asc' },
    });
    return reply.send(successResponse(variants));
  });

  // POST /api/v1/products/:productId/variants
  fastify.post('/products/:productId/variants', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const dto = variantSchema.parse(request.body);

    const product = await fastify.prisma.product.findUnique({ where: { id: productId } });
    if (!product) return reply.code(404).send(errorResponse('Product not found'));

    const barcodeValue =
      dto.barcodeValue ||
      generateBarcodeValue(
        product.sku,
        dto.colourCode,
        dto.lengthMm,
        dto.widthMm,
        dto.thicknessMm
      );

    const variant = await fastify.prisma.$transaction(async (tx) => {
      const v = await tx.productVariant.create({
        data: {
          productId,
          colourCode: dto.colourCode,
          colourName: dto.colourName,
          lengthMm: dto.lengthMm,
          widthMm: dto.widthMm,
          thicknessMm: dto.thicknessMm,
          barcodeValue,
          barcodeFormat: dto.barcodeFormat,
          imageUrl: dto.imageUrl,
          mrpPaise: dto.mrpPaise,
        },
      });
      await tx.inventoryStock.create({
        data: { variantId: v.id, totalBoxes: 0, reservedBoxes: 0 },
      });
      return v;
    });

    return reply.code(201).send(successResponse(variant));
  });

  // PATCH /api/v1/products/:productId/variants/:variantId
  fastify.patch('/products/:productId/variants/:variantId', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { variantId } = request.params as { productId: string; variantId: string };
    const dto = variantSchema.partial().parse(request.body);
    const variant = await fastify.prisma.productVariant.update({
      where: { id: variantId },
      data: dto,
    });
    await fastify.redis.del(`variant:barcode:${variant.barcodeValue}`);
    return reply.send(successResponse(variant));
  });

  // DELETE /api/v1/products/:productId/variants/:variantId
  fastify.delete('/products/:productId/variants/:variantId', { preHandler: fastify.requireRole(UserRole.ADMIN) }, async (request, reply) => {
    const { variantId } = request.params as { productId: string; variantId: string };
    await fastify.prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
    return reply.send(successResponse({ message: 'Variant deactivated' }));
  });

  // GET /api/v1/variants/lookup?barcode=XXX  — critical scan endpoint
  fastify.get('/variants/lookup', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { barcode } = request.query as { barcode?: string };
    if (!barcode) return reply.code(400).send(errorResponse('barcode query param required'));

    const cacheKey = `variant:barcode:${barcode}`;
    const cached = await fastify.redis.get(cacheKey);
    if (cached) {
      return reply.send(successResponse(JSON.parse(cached)));
    }

    const variant = await fastify.prisma.productVariant.findUnique({
      where: { barcodeValue: barcode },
      include: {
        product: { include: { category: true } },
        inventoryStock: true,
      },
    });

    if (!variant) return reply.code(404).send(errorResponse('Barcode not found in product master'));

    await fastify.redis.setex(cacheKey, 3600, JSON.stringify(variant));

    return reply.send(successResponse(variant));
  });

  // POST /api/v1/variants/generate-labels — generate QR label PDF
  fastify.post('/variants/generate-labels', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const { variantIds } = z.object({ variantIds: z.array(z.string()).min(1) }).parse(request.body);

    const variants = await fastify.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });

    if (variants.length === 0) return reply.code(404).send(errorResponse('No variants found'));

    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    const QRCode = await import('qrcode');

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const LABELS_PER_ROW = 2;
    const LABELS_PER_COL = 2;
    const LABELS_PER_PAGE = LABELS_PER_ROW * LABELS_PER_COL;
    const PAGE_WIDTH = 595;
    const PAGE_HEIGHT = 842;
    const LABEL_WIDTH = PAGE_WIDTH / LABELS_PER_ROW;
    const LABEL_HEIGHT = PAGE_HEIGHT / LABELS_PER_COL;
    const QR_SIZE = 120;
    const PADDING = 20;

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    for (let i = 0; i < variants.length; i++) {
      if (i > 0 && i % LABELS_PER_PAGE === 0) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      }

      const v = variants[i];
      const labelIndex = i % LABELS_PER_PAGE;
      const col = labelIndex % LABELS_PER_ROW;
      const row = Math.floor(labelIndex / LABELS_PER_ROW);

      const x = col * LABEL_WIDTH + PADDING;
      const y = PAGE_HEIGHT - (row + 1) * LABEL_HEIGHT + PADDING;

      const qrPayload = JSON.stringify({
        sku: v.product.sku,
        variantId: v.id,
        colourCode: v.colourCode,
        colourName: v.colourName,
        lengthMm: v.lengthMm,
        widthMm: v.widthMm,
        thicknessMm: v.thicknessMm,
        piecesPerBox: v.product.piecesPerBox,
      });

      const qrDataUrl = await QRCode.default.toDataURL(qrPayload, { width: QR_SIZE, margin: 1 });
      const qrImageBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      const qrImage = await pdfDoc.embedPng(qrImageBytes);

      page.drawImage(qrImage, { x, y: y + 60, width: QR_SIZE, height: QR_SIZE });

      page.drawText(v.product.sku, { x, y: y + 45, size: 10, font: boldFont, color: rgb(0, 0, 0) });
      page.drawText(`${v.colourName} (${v.colourCode})`, { x, y: y + 30, size: 9, font, color: rgb(0.2, 0.2, 0.2) });

      const dims = [v.lengthMm, v.widthMm, v.thicknessMm].filter(Boolean).join(' × ');
      if (dims) page.drawText(`${dims} mm`, { x, y: y + 15, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
      page.drawText(`${v.product.piecesPerBox} pcs/box`, { x, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    }

    const pdfBytes = await pdfDoc.save();
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="qr-labels-${Date.now()}.pdf"`);
    return reply.send(Buffer.from(pdfBytes));
  });
};

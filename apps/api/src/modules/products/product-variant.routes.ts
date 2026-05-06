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

  // POST /api/v1/variants/generate-labels — generate professional QR label PDF
  fastify.post('/variants/generate-labels', { preHandler: fastify.requireAuth }, async (request, reply) => {
    const schema = z.object({
      variantIds: z.array(z.string()).min(1),
      orderInfo: z.object({
        orderId: z.string().optional(),
        clientName: z.string().optional(),
        date: z.string().optional(),
        totalBoxes: z.number().optional(),
      }).optional(),
    });

    const { variantIds, orderInfo } = schema.parse(request.body);

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
    const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

    // Label Size: 4x6 inches approx (288 x 432 points)
    const WIDTH = 300;
    const HEIGHT = 450;
    const CENTER = WIDTH / 2;

    for (const v of variants) {
      // Determine how many labels to print for this variant
      // If orderInfo.totalBoxes is provided, we print that many labels (one per box)
      const count = orderInfo?.totalBoxes ?? 1;

      for (let boxNum = 1; boxNum <= count; boxNum++) {
        const page = pdfDoc.addPage([WIDTH, HEIGHT]);

        // 1. QR CODE (Centerpiece)
        const qrPayload = JSON.stringify({
          sku: v.product.sku,
          variantId: v.id,
          colourCode: v.colourCode,
          orderId: orderInfo?.orderId,
          box: boxNum,
          total: count,
        });

        const QR_SIZE = 140;
        const qrDataUrl = await QRCode.default.toDataURL(qrPayload, { width: QR_SIZE * 2, margin: 1 });
        const qrImageBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
        const qrImage = await pdfDoc.embedPng(qrImageBytes);

        page.drawImage(qrImage, {
          x: CENTER - QR_SIZE / 2,
          y: HEIGHT - QR_SIZE - 40,
          width: QR_SIZE,
          height: QR_SIZE
        });

        // 2. PRODUCT INFO
        let currentY = HEIGHT - QR_SIZE - 70;

        const drawCenteredText = (text: string, size: number, f = font, color = rgb(0, 0, 0)) => {
          const width = f.widthOfTextAtSize(text, size);
          page.drawText(text, { x: CENTER - width / 2, y: currentY, size, font: f, color });
          currentY -= (size + 8);
        };

        drawCenteredText(v.product.name.toUpperCase(), 16, boldFont);
        drawCenteredText(`${v.colourName} (${v.colourCode})`, 13, font, rgb(0.2, 0.2, 0.2));

        const dims = [v.lengthMm, v.widthMm, v.thicknessMm].filter(Boolean).join(' × ');
        if (dims) drawCenteredText(`${dims} mm`, 12, font, rgb(0.3, 0.3, 0.3));
        drawCenteredText(`${v.product.piecesPerBox} pcs/box`, 11, font, rgb(0.4, 0.4, 0.4));

        // 3. ORDER INFO SECTION
        currentY -= 15;
        page.drawLine({
          start: { x: 40, y: currentY + 10 },
          end: { x: WIDTH - 40, y: currentY + 10 },
          thickness: 1,
          color: rgb(0.8, 0.8, 0.8)
        });

        const drawField = (label: string, value: string) => {
          const labelWidth = boldFont.widthOfTextAtSize(label, 10);
          page.drawText(label, { x: 45, y: currentY, size: 10, font: boldFont, color: rgb(0.4, 0.4, 0.4) });
          page.drawText(value, { x: 45 + labelWidth + 5, y: currentY, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
          currentY -= 16;
        };

        if (orderInfo?.orderId) {
          drawField('Order ID:', orderInfo.orderId);
          drawField('Client:', orderInfo.clientName || 'N/A');
          drawField('Date:', orderInfo.date || new Date().toLocaleDateString('en-IN'));
          if (count > 1) {
            drawField('Box:', `${boxNum} of ${count}`);
          }
        } else {
          // Stock label style
          drawField('Type:', 'STOCK MASTER');
          drawField('Printed:', new Date().toLocaleDateString('en-IN'));
        }

        // 4. BARCODE TEXT (Monospace at bottom)
        currentY -= 10;
        page.drawLine({
          start: { x: 40, y: currentY + 10 },
          end: { x: WIDTH - 40, y: currentY + 10 },
          thickness: 1,
          color: rgb(0.8, 0.8, 0.8)
        });
        
        const barcodeText = `Barcode: ${v.barcodeValue}`;
        const bWidth = monoFont.widthOfTextAtSize(barcodeText, 9);
        page.drawText(barcodeText, {
          x: CENTER - bWidth / 2,
          y: 40,
          size: 9,
          font: monoFont,
          color: rgb(0.3, 0.3, 0.3)
        });
      }
    }

    const pdfBytes = await pdfDoc.save();
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="label-${Date.now()}.pdf"`);
    return reply.send(Buffer.from(pdfBytes));
  });
};

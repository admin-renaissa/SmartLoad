import type { FastifyInstance } from 'fastify';
import { MovementType as PrismaMovementType } from '@prisma/client';
import {
  AppError,
  parsePagination,
  buildPaginationMeta,
  generateDocCode,
  CODE_PREFIXES,
} from '@smartload/shared';
import type { CreateGRNInput, ListGRNQuery } from './grn.schema.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class GRNService {
  constructor(private readonly app: FastifyInstance) {}

  private async nextGRNNumber(): Promise<string> {
    const dayKey = new Date().toISOString().slice(0, 10);
    const seq = await this.app.redis.incr(`seq:grn:${dayKey}`);
    if (seq === 1) await this.app.redis.expire(`seq:grn:${dayKey}`, 172800);
    return generateDocCode(CODE_PREFIXES.GRN, seq);
  }

  async createGRN(input: CreateGRNInput, userId: string) {
    const variantIds = input.lineItems.map((li) => li.variantId);
    const variants = await this.app.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, isActive: true },
      include: { product: true },
    });

    const foundIds = new Set(variants.map((v) => v.id));
    const missing = variantIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new AppError(`Variant(s) not found or inactive: ${missing.join(', ')}`, 400, 'VARIANTS_NOT_FOUND');
    }

    const variantMap = new Map(variants.map((v) => [v.id, v]));

    const grnNumber = await this.nextGRNNumber();

    const grn = await this.app.prisma.$transaction(async (tx) => {
      const newGRN = await tx.goodsReceiptNote.create({
        data: {
          grnNumber,
          receivedDate: new Date(input.receivedDate),
          notes: input.notes ?? null,
          createdById: userId,
        },
      });

      for (const li of input.lineItems) {
        const variant = variantMap.get(li.variantId)!;
        const receivedPieces = li.receivedBoxes * variant.product.piecesPerBox;

        await tx.gRNLineItem.create({
          data: {
            grnId: newGRN.id,
            variantId: li.variantId,
            receivedBoxes: li.receivedBoxes,
            receivedPieces,
          },
        });

        await tx.inventoryStock.upsert({
          where: { variantId: li.variantId },
          update: { totalBoxes: { increment: li.receivedBoxes } },
          create: {
            variantId: li.variantId,
            totalBoxes: li.receivedBoxes,
            reservedBoxes: 0,
          },
        });

        await tx.inventoryLedger.create({
          data: {
            variantId: li.variantId,
            movementType: PrismaMovementType.INWARD,
            boxes: li.receivedBoxes,
            pieces: receivedPieces,
            referenceType: 'GRN',
            referenceId: newGRN.id,
            notes: `GRN ${grnNumber}${li.notes ? ' — ' + li.notes : ''}`,
            createdById: userId,
          },
        });
      }

      return newGRN;
    });

    variantIds.forEach((vid) => {
      void this.app.redis.del(`stock:variant:${vid}`);
    });

    void this.app.queues.tallySync.add(
      'grn-inward',
      { grnId: grn.id, type: 'GRN_INWARD' },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    return this.getGRNById(grn.id);
  }

  async getGRNById(id: string) {
    const grn = await this.app.prisma.goodsReceiptNote.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        lineItems: {
          include: {
            variant: {
              include: {
                product: { include: { category: true } },
                inventoryStock: true,
              },
            },
          },
        },
      },
    });
    if (!grn) throw new AppError('GRN not found', 404);

    const summary = {
      totalVariants: grn.lineItems.length,
      totalBoxes: grn.lineItems.reduce((s, li) => s + li.receivedBoxes, 0),
      totalPieces: grn.lineItems.reduce((s, li) => s + li.receivedPieces, 0),
    };

    return { ...grn, summary };
  }

  async listGRNs(query: ListGRNQuery) {
    const { skip, take, page } = parsePagination(query);

    const where: Record<string, unknown> = {};
    if (query.search) {
      where.grnNumber = { contains: query.search, mode: 'insensitive' };
    }
    if (query.dateFrom || query.dateTo) {
      where.receivedDate = {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      };
    }

    const [grns, total] = await Promise.all([
      this.app.prisma.goodsReceiptNote.findMany({
        where,
        skip,
        take,
        orderBy: { receivedDate: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true } },
          _count: { select: { lineItems: true } },
          lineItems: { select: { receivedBoxes: true } },
        },
      }),
      this.app.prisma.goodsReceiptNote.count({ where }),
    ]);

    const enriched = grns.map((g) => {
      const totalBoxes = g.lineItems.reduce((s, li) => s + li.receivedBoxes, 0);
      const { lineItems: _omit, ...rest } = g;
      return {
        ...rest,
        totalBoxes,
      };
    });

    return { grns: enriched, meta: buildPaginationMeta(total, page, take) };
  }

  async generateGRNPdf(id: string): Promise<Buffer> {
    const grn = await this.getGRNById(id);

    const companyName = await this.getConfig('COMPANY_NAME');
    const companyAddress = await this.getConfig('COMPANY_ADDRESS');
    const companyPhone = await this.getConfig('COMPANY_PHONE');
    const companyGSTIN = await this.getConfig('COMPANY_GSTIN');

    const notesHtml =
      grn.notes ?
        `<div style="margin-bottom:16px;padding:10px;background:#FFF7ED;border-left:3px solid #B45309;border-radius:4px;font-size:11px;color:#92400E;"><strong>Notes:</strong> ${escapeHtml(grn.notes)}</div>`
      : '';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111827; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 3px solid #0F2044; padding-bottom: 16px; }
    .company-name { font-size: 22px; font-weight: 900; color: #0F2044; }
    .company-detail { font-size: 10px; color: #6B7280; margin-top: 2px; }
    .doc-title { font-size: 18px; font-weight: 700; color: #2563EB; text-align: right; }
    .doc-number { font-size: 13px; font-weight: 600; color: #0F2044; text-align: right; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .meta-box { border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px; }
    .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6B7280; margin-bottom: 4px; }
    .meta-value { font-weight: 600; color: #111827; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #0F2044; color: white; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 8px 10px; border-bottom: 1px solid #F3F4F6; }
    tr:nth-child(even) td { background: #F9FAFB; }
    .totals-row td { background: #EFF6FF; font-weight: 700; border-top: 2px solid #2563EB; }
    .footer { margin-top: 32px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    .sig-box { border-top: 1px solid #D1D5DB; padding-top: 8px; }
    .sig-label { font-size: 10px; color: #6B7280; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; background: #DCFCE7; color: #15803D; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${escapeHtml(companyName)}</div>
      <div class="company-detail">${escapeHtml(companyAddress)}</div>
      <div class="company-detail">Phone: ${escapeHtml(companyPhone)} | GSTIN: ${escapeHtml(companyGSTIN)}</div>
    </div>
    <div>
      <div class="doc-title">GOODS RECEIPT NOTE</div>
      <div class="doc-number">${escapeHtml(grn.grnNumber)}</div>
      <div style="margin-top:4px"><span class="badge">RECEIVED</span></div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <div class="meta-label">Received Date</div>
      <div class="meta-value">${new Date(grn.receivedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Received By</div>
      <div class="meta-value">${escapeHtml(grn.createdBy.name)}</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Total Items</div>
      <div class="meta-value">${grn.summary.totalVariants} variants</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Total Received</div>
      <div class="meta-value">${grn.summary.totalBoxes} boxes / ${grn.summary.totalPieces} pieces</div>
    </div>
  </div>

  ${notesHtml}

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>SKU</th>
        <th>Product Name</th>
        <th>Colour</th>
        <th>Dimensions</th>
        <th>Pieces/Box</th>
        <th>Boxes Received</th>
        <th>Total Pieces</th>
      </tr>
    </thead>
    <tbody>
      ${grn.lineItems.map((li, i) => {
        const sku = escapeHtml(li.variant.product.sku);
        const pname = escapeHtml(li.variant.product.name);
        const col = `${escapeHtml(li.variant.colourName)} (${escapeHtml(li.variant.colourCode)})`;
        const dims =
          [
            li.variant.lengthMm ? `${li.variant.lengthMm}mm` : '',
            li.variant.widthMm ? `${li.variant.widthMm}mm` : '',
            li.variant.thicknessMm ? `${li.variant.thicknessMm}mm` : '',
          ].filter(Boolean).join(' × ') || '—';
        return `
        <tr>
          <td>${i + 1}</td>
          <td style="font-family:monospace;font-weight:600">${sku}</td>
          <td>${pname}</td>
          <td>${col}</td>
          <td style="font-size:11px">${escapeHtml(dims)}</td>
          <td style="text-align:center">${li.variant.product.piecesPerBox}</td>
          <td style="text-align:center;font-weight:700;color:#15803D">${li.receivedBoxes}</td>
          <td style="text-align:center">${li.receivedPieces}</td>
        </tr>`;
      }).join('')}
      <tr class="totals-row">
        <td colspan="6" style="text-align:right">TOTAL:</td>
        <td style="text-align:center">${grn.summary.totalBoxes} boxes</td>
        <td style="text-align:center">${grn.summary.totalPieces} pcs</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <div class="sig-box">
      <div style="height:40px"></div>
      <div class="sig-label">Received By</div>
    </div>
    <div class="sig-box">
      <div style="height:40px"></div>
      <div class="sig-label">Checked By</div>
    </div>
    <div class="sig-box">
      <div style="height:40px"></div>
      <div class="sig-label">Authorised By</div>
    </div>
  </div>

  <div style="margin-top:24px;font-size:9px;color:#9CA3AF;text-align:center;border-top:1px solid #E5E7EB;padding-top:8px">
    Generated by SmartLoad · ${new Date().toLocaleString('en-IN')} · ${escapeHtml(grn.grnNumber)}
  </div>
</body>
</html>`;

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private async getConfig(key: string): Promise<string> {
    const cfg = await this.app.prisma.systemConfig.findUnique({ where: { key } });
    return cfg?.value ?? '';
  }
}

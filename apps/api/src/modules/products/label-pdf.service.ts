import QRCode from 'qrcode';
import type { PrismaClient } from '@prisma/client';
import { renderHtmlToPdfBuffer } from '../pod/pod-pdf.service.js';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function generateVariantLabelsPdfBuffer(prisma: PrismaClient, variantIds: string[]): Promise<Buffer> {
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, isActive: true },
    include: { product: true },
    orderBy: [{ product: { sku: 'asc' } }, { colourCode: 'asc' }],
  });
  if (variants.length === 0) throw Object.assign(new Error('No active variants found for the given IDs'), { statusCode: 400 });

  const cells: string[] = [];
  for (const v of variants) {
    const p = v.product;
    const dims = [v.lengthMm, v.widthMm, v.thicknessMm].filter((x) => x != null).join(' × ');
    const qr = await QRCode.toDataURL(v.barcodeValue, { width: 140, margin: 1, errorCorrectionLevel: 'M' });
    cells.push(`<div class="label">
      <div class="row"><strong>${esc(p.sku)}</strong></div>
      <div class="row muted">${esc(p.name)}</div>
      <div class="row">${esc(v.colourName)} (${esc(v.colourCode)})</div>
      ${dims ? `<div class="row small">${esc(dims)} mm</div>` : ''}
      <div class="qr"><img src="${qr}" alt="" /></div>
      <div class="mono small">${esc(v.barcodeValue)}</div>
    </div>`);
  }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .label { border: 1px solid #ccc; padding: 10px; page-break-inside: avoid; min-height: 220px; box-sizing: border-box; }
    .row { margin-bottom: 4px; }
    .muted { color: #444; }
    .small { font-size: 9px; color: #666; }
    .mono { font-family: monospace; word-break: break-all; }
    .qr { margin-top: 6px; text-align: center; }
    .qr img { width: 100px; height: 100px; }
  </style></head><body><div class="grid">${cells.join('')}</div></body></html>`;

  return renderHtmlToPdfBuffer(html);
}

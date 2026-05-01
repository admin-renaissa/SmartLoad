import type { PrismaClient } from '@prisma/client';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function loadPodForPdf(prisma: PrismaClient, podId: string) {
  return prisma.proofOfDelivery.findUniqueOrThrow({
    where: { id: podId },
    include: {
      lineItems: {
        include: {
          lineItem: { include: { variant: { include: { product: true } } } },
        },
      },
      session: {
        include: {
          purchaseOrder: { include: { client: true } },
          vehicle: true,
        },
      },
    },
  });
}

export function buildPodPdfHtml(
  pod: Awaited<ReturnType<typeof loadPodForPdf>>,
  opts?: { embeddedSignatureDataUrl?: string | null },
): string {
  const po = pod.session.purchaseOrder;
  const client = po.client;
  const vehicle = pod.session.vehicle;

  const rows = pod.lineItems
    .map((li) => {
      const v = li.lineItem.variant;
      const p = v.product;
      const status =
        li.discrepancyBoxes > 0 ? 'Discrepancy' : li.acknowledgedBoxes >= li.deliveredBoxes ? 'OK' : 'Partial';
      return `<tr>
        <td>${esc(p.name)}</td>
        <td>${esc(v.colourName)}</td>
        <td>${li.deliveredBoxes}</td>
        <td>${li.acknowledgedBoxes}</td>
        <td>${esc(status)}</td>
      </tr>`;
    })
    .join('');

  const sig = opts?.embeddedSignatureDataUrl
    ? `<div style="margin-top:16px"><p style="font-size:11px;color:#666">Signature</p><img src="${opts.embeddedSignatureDataUrl}" alt="" style="max-height:120px;border:1px solid #e5e7eb" /></div>`
    : pod.signatureImageUrl
      ? `<p style="font-size:11px;color:#666">Signature on file (URL)</p>`
      : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 24px; }
    h1 { color: #0F2044; font-size: 18px; margin: 0 0 8px; }
    table { width:100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
    th { background: #0F2044; color: white; font-size: 10px; text-transform: uppercase; }
    .meta { color: #555; font-size: 11px; margin-bottom: 16px; }
  </style></head><body>
    <h1>Proof of Delivery</h1>
    <div class="meta">
      PO: <strong>${esc(po.poNumber)}</strong> · Client: ${esc(client.name)}<br/>
      Vehicle: ${esc(vehicle.registrationNumber)} · Driver: ${esc(vehicle.driverName)} / ${esc(vehicle.driverPhone)}<br/>
      Receiver: ${esc(pod.receiverName || '')} · Acknowledged: ${pod.acknowledgedAt ? new Date(pod.acknowledgedAt).toISOString() : '—'}<br/>
      Status: ${esc(pod.status)}
    </div>
    <table>
      <thead><tr><th>Product</th><th>Colour</th><th>Delivered</th><th>Acknowledged</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${pod.discrepancyNotes ? `<p style="margin-top:12px;font-size:11px"><strong>Notes:</strong> ${esc(pod.discrepancyNotes)}</p>` : ''}
    ${sig}
  </body></html>`;
}

export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '16px', bottom: '16px', left: '16px', right: '16px' } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function generatePodPdfBuffer(
  prisma: PrismaClient,
  podId: string,
  embeddedSignatureDataUrl?: string | null,
): Promise<Buffer> {
  const pod = await loadPodForPdf(prisma, podId);
  const html = buildPodPdfHtml(pod, { embeddedSignatureDataUrl });
  return renderHtmlToPdfBuffer(html);
}

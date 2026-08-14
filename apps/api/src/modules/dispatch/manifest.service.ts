import type { FastifyInstance } from 'fastify';
import { SessionStatus } from '@prisma/client';
import { AppError } from '@smartload/shared';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class ManifestService {
  constructor(private readonly app: FastifyInstance) {}

  private async getConfig(key: string): Promise<string> {
    const cfg = await this.app.prisma.systemConfig.findUnique({ where: { key } });
    return cfg?.value ?? '';
  }

  private async loadSession(sessionId: string) {
    const session = await this.app.prisma.dispatchSession.findUnique({
      where: { id: sessionId },
      include: {
        purchaseOrder: {
          include: {
            client: true,
            lineItems: {
              include: {
                variant: { include: { product: { include: { category: true } } } },
              },
            },
          },
        },
        vehicle: true,
        supervisor: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
    });
    if (!session) throw new AppError('Session not found', 404);
    return session;
  }

  private formatDimensions(v: {
    lengthMm: number | null;
    widthMm: number | null;
    thicknessMm: number | null;
  }): string {
    return (
      [v.lengthMm, v.widthMm, v.thicknessMm]
        .filter((n): n is number => n != null && n !== 0)
        .map((n) => `${n}mm`)
        .join(' × ') || '—'
    );
  }

  private formatDate(d: Date | string): string {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  async generateManifestPDF(sessionId: string): Promise<Buffer> {
    const session = await this.loadSession(sessionId);

    const companyName = await this.getConfig('COMPANY_NAME');
    const companyAddress = await this.getConfig('COMPANY_ADDRESS');
    const companyPhone = await this.getConfig('COMPANY_PHONE');

    const po = session.purchaseOrder;
    const client = po.client;
    const vehicle = session.vehicle;

    const notesHtml =
      po.notes ?
        `<div style="margin-bottom:12px;padding:8px 10px;background:#FFF7ED;border-left:3px solid #B45309;border-radius:4px;font-size:10px;color:#92400E">
    <strong>Special Instructions:</strong> ${escapeHtml(po.notes)}
  </div>`
      : '';

    const partialBlock =
      session.isPartialDispatch && session.partialReason ?
        `<div style="padding:8px 10px;background:#FEF2F2;border-left:3px solid #B91C1C;border-radius:4px;font-size:10px;color:#991B1B;margin-bottom:12px">
    <strong>Partial Dispatch Reason:</strong> ${escapeHtml(session.partialReason)}
  </div>`
      : '';

    const statusClosed = session.status === SessionStatus.CLOSED;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size:11px; color:#111827; padding:20px; }

    .page-header { display:flex; justify-content:space-between; align-items:flex-start;
                   border-bottom:3px solid #0F2044; padding-bottom:12px; margin-bottom:16px; }
    .company-name { font-size:20px; font-weight:900; color:#0F2044; }
    .company-meta { font-size:9px; color:#6B7280; margin-top:2px; }
    .doc-info { text-align:right; }
    .doc-type { font-size:16px; font-weight:700; color:#2563EB; }
    .doc-session { font-family:monospace; font-size:12px; font-weight:600; color:#0F2044; }
    .doc-status { display:inline-block; margin-top:4px; padding:2px 10px; border-radius:999px;
                  font-size:9px; font-weight:700; background:${statusClosed ? '#DCFCE7' : '#FEF3C7'};
                  color:${statusClosed ? '#15803D' : '#B45309'}; }

    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px; }
    .info-box { border:1px solid #E5E7EB; border-radius:6px; padding:10px; }
    .info-label { font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#9CA3AF; margin-bottom:3px; }
    .info-value { font-weight:600; color:#111827; font-size:11px; }
    .info-sub { font-size:9px; color:#6B7280; margin-top:1px; }

    .progress-bar-wrap { background:#F3F4F6; border-radius:999px; height:10px; margin-top:4px; }
    .progress-bar-fill { height:10px; border-radius:999px; background:#15803D; }

    table { width:100%; border-collapse:collapse; margin-bottom:12px; font-size:10px; }
    th { background:#0F2044; color:white; padding:6px 8px; text-align:left;
         font-size:9px; text-transform:uppercase; letter-spacing:0.05em; }
    td { padding:6px 8px; border-bottom:1px solid #F3F4F6; vertical-align:middle; }
    tr:nth-child(even) td { background:#F9FAFB; }
    .status-complete { color:#15803D; font-weight:700; }
    .status-partial  { color:#B45309; font-weight:700; }
    .status-pending  { color:#6B7280; }
    .totals-row td { background:#EFF6FF; font-weight:700; font-size:11px;
                     border-top:2px solid #2563EB; }

    .footer-sigs { display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; margin-top:24px; padding-top:12px; border-top:1px solid #E5E7EB; }
    .sig-block { padding-top:36px; border-top:1px solid #9CA3AF; font-size:9px; color:#6B7280; }
    .page-footer { margin-top:20px; font-size:8px; color:#9CA3AF; text-align:center; border-top:1px solid #F3F4F6; padding-top:6px; }
  </style>
</head>
<body>

  <div class="page-header">
    <div>
      <div class="company-name">${escapeHtml(companyName)}</div>
      <div class="company-meta">${escapeHtml(companyAddress)} | ${escapeHtml(companyPhone)}</div>
    </div>
    <div class="doc-info">
      <div class="doc-type">LOADING MANIFEST</div>
      <div class="doc-session">${escapeHtml(session.sessionCode)}</div>
      <div><span class="doc-status">${session.status}</span></div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="info-label">Purchase Order</div>
      <div class="info-value">${escapeHtml(po.poNumber)}</div>
      <div class="info-sub">Date: ${this.formatDate(po.orderDate)}</div>
    </div>
    <div class="info-box">
      <div class="info-label">Client</div>
      <div class="info-value">${escapeHtml(client.name)}</div>
      <div class="info-sub">Code: ${escapeHtml(client.clientCode)}${client.gstin ? ` | GSTIN: ${escapeHtml(client.gstin)}` : ''}</div>
    </div>
    <div class="info-box">
      <div class="info-label">Vehicle</div>
      <div class="info-value" style="font-size:14px;letter-spacing:0.05em">${escapeHtml(vehicle.registrationNumber)}</div>
      <div class="info-sub">${escapeHtml(String(vehicle.type))} | Driver: ${escapeHtml(vehicle.driverName)} — ${escapeHtml(vehicle.driverPhone)}</div>
    </div>
    <div class="info-box">
      <div class="info-label">Loading Progress</div>
      <div class="info-value">${session.totalBoxesScanned} / ${session.totalBoxesExpected} boxes (${Math.round((session.totalBoxesScanned / Math.max(session.totalBoxesExpected, 1)) * 100)}%)</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" style="width:${Math.round((session.totalBoxesScanned / Math.max(session.totalBoxesExpected, 1)) * 100)}%"></div>
      </div>
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
        <th>Pcs/Box</th>
        <th style="text-align:right">Ordered Boxes</th>
        <th style="text-align:right">Loaded Boxes</th>
        <th style="text-align:right">Remaining</th>
        <th style="text-align:right">Ordered Pcs</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${po.lineItems
        .map((li, i) => {
          const remaining = li.orderedBoxes - li.loadedBoxes;
          const statusClass =
            li.loadedBoxes >= li.orderedBoxes ? 'status-complete' :
            li.loadedBoxes > 0 ? 'status-partial'
            : 'status-pending';
          const statusText =
            li.loadedBoxes >= li.orderedBoxes ? '✓ COMPLETE' :
            li.loadedBoxes > 0 ? '⟳ PARTIAL'
            : '○ PENDING';
          return `
        <tr>
          <td>${i + 1}</td>
          <td style="font-family:monospace;font-weight:600;font-size:9px">${escapeHtml(li.variant.product.sku)}</td>
          <td>${escapeHtml(li.variant.product.name)}</td>
          <td>${escapeHtml(li.variant.colourName)}<br><span style="font-size:9px;color:#9CA3AF">${escapeHtml(li.variant.colourCode)}</span></td>
          <td style="font-size:9px">${escapeHtml(this.formatDimensions(li.variant))}</td>
          <td style="text-align:center">${li.variant.product.piecesPerBox}</td>
          <td style="text-align:right;font-weight:600">${li.orderedBoxes}</td>
          <td style="text-align:right;font-weight:700;color:#15803D">${li.loadedBoxes}</td>
          <td style="text-align:right;color:${remaining > 0 ? '#B91C1C' : '#6B7280'};font-weight:${remaining > 0 ? '700' : '400'}">${remaining}</td>
          <td style="text-align:right">${li.orderedPieces}</td>
          <td class="${statusClass}">${statusText}</td>
        </tr>`;
        })
        .join('')}
      <tr class="totals-row">
        <td colspan="6" style="text-align:right">TOTALS:</td>
        <td style="text-align:right">${po.lineItems.reduce((s, li) => s + li.orderedBoxes, 0)}</td>
        <td style="text-align:right;color:#15803D">${po.lineItems.reduce((s, li) => s + li.loadedBoxes, 0)}</td>
        <td style="text-align:right">${po.lineItems.reduce((s, li) => s + li.orderedBoxes - li.loadedBoxes, 0)}</td>
        <td style="text-align:right">${po.lineItems.reduce((s, li) => s + li.orderedPieces, 0)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>

  ${partialBlock}

  <div class="footer-sigs">
    <div class="sig-block">Prepared By<br><strong>${escapeHtml(session.supervisor.name)}</strong></div>
    <div class="sig-block">Warehouse Checked By<br>${session.operator ? `<strong>${escapeHtml(session.operator.name)}</strong>` : '________________'}</div>
    <div class="sig-block">Dispatched By<br>________________</div>
  </div>

  <div class="page-footer">
    SmartLoad Manifest · ${escapeHtml(session.sessionCode)} · Generated: ${new Date().toLocaleString('en-IN')}
    ${session.status === SessionStatus.CLOSED && session.closedAt ? ` · Closed: ${this.formatDate(session.closedAt)}` : ''}
  </div>
</body>
</html>`;

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  async generateDeliveryChallan(sessionId: string): Promise<Buffer> {
    const session = await this.loadSession(sessionId);
    if (session.status !== SessionStatus.CLOSED) {
      throw new AppError('Delivery challan can only be generated for CLOSED sessions', 400);
    }

    const companyName = await this.getConfig('COMPANY_NAME');
    const companyGSTIN = await this.getConfig('COMPANY_GSTIN');
    const companyAddress = await this.getConfig('COMPANY_ADDRESS');
    const companyPhone = await this.getConfig('COMPANY_PHONE');
    const companyEmail = await this.getConfig('COMPANY_EMAIL');

    const po = session.purchaseOrder;
    const client = po.client;

    const addrRaw = client.shippingAddress as Record<string, unknown> | null;
    let addr: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      pincode: string;
    };
    if (
      !addrRaw ||
      typeof addrRaw.line1 !== 'string' ||
      typeof addrRaw.city !== 'string' ||
      typeof addrRaw.state !== 'string' ||
      addrRaw.pincode == null
    ) {
      throw new AppError('Client shipping address must include line1, city, state and pincode', 400);
    }
    addr = {
      line1: addrRaw.line1,
      line2: typeof addrRaw.line2 === 'string' ? addrRaw.line2 : undefined,
      city: addrRaw.city,
      state: addrRaw.state,
      pincode: String(addrRaw.pincode),
    };

    const ym = new Date().toISOString().slice(0, 7);
    const challanSeq = await this.app.redis.incr(`seq:challan:${ym}`);
    if (challanSeq === 1) await this.app.redis.expire(`seq:challan:${ym}`, 2_592_000);
    const challanNum = `DC-${new Date().getFullYear()}-${String(challanSeq).padStart(4, '0')}`;
    const challanDate = session.closedAt ?? new Date();

    const loadedLines = po.lineItems.filter((l) => l.loadedBoxes > 0);
    if (loadedLines.length === 0) {
      throw new AppError(
        'No loaded quantities recorded — delivery challan cannot be generated',
        400,
      );
    }

    const hsnMap = new Map<
      string,
      { taxableValue: number; gstPercent: number; gstAmount: number; items: string[] }
    >();
    for (const li of po.lineItems.filter((l) => l.loadedBoxes > 0)) {
      const hsn = li.variant.product.hsnCode ?? '39204990';
      const taxableValue = (li.loadedBoxes * li.ratePerBoxPaise) / 100;

      if (!hsnMap.has(hsn))
        hsnMap.set(hsn, { taxableValue: 0, gstPercent: li.gstPercent, gstAmount: 0, items: [] });
      const entry = hsnMap.get(hsn)!;
      entry.taxableValue += taxableValue;
      entry.gstAmount += (taxableValue * li.gstPercent) / 100;
      entry.items.push(li.variant.product.name);
    }

    const grandTaxable = [...hsnMap.values()].reduce((s, h) => s + h.taxableValue, 0);
    const grandGST = [...hsnMap.values()].reduce((s, h) => s + h.gstAmount, 0);
    const grandTotal = grandTaxable + grandGST;

    const supplierState = (companyAddress.match(/,\s*([^,]+),\s*India/i)?.[1] ?? '').trim();
    const consigneeState = addr.state ?? '';
    const isInterState = supplierState.toLowerCase() !== consigneeState.toLowerCase();

    const tbody = po.lineItems
      .filter((li) => li.loadedBoxes > 0)
      .map((li, i) => {
        const taxable = (li.loadedBoxes * li.ratePerBoxPaise) / 100;
        const gstAmt = (taxable * li.gstPercent) / 100;
        const total = taxable + gstAmt;
        const hsn = li.variant.product.hsnCode ?? '39204990';
        return `
        <tr>
          <td>${i + 1}</td>
          <td style="font-family:monospace">${escapeHtml(hsn)}</td>
          <td>
            ${escapeHtml(li.variant.product.name)} — ${escapeHtml(li.variant.colourName)}
            <br><span style="font-size:9px;color:#9CA3AF">${escapeHtml(this.formatDimensions(li.variant))}</span>
          </td>
          <td>BOX</td>
          <td style="text-align:right">${li.loadedBoxes}</td>
          <td style="text-align:right">${li.loadedPieces}</td>
          <td style="text-align:right">${(li.ratePerBoxPaise / 100).toFixed(2)}</td>
          <td style="text-align:right">${taxable.toFixed(2)}</td>
          <td style="text-align:center">${li.gstPercent}%</td>
          <td style="text-align:right">${gstAmt.toFixed(2)}</td>
          <td style="text-align:right;font-weight:600">${total.toFixed(2)}</td>
        </tr>`;
      })
      .join('');

    const taxRows = isInterState ?
      `
    <tr>
      <td>IGST</td>
      <td style="text-align:right">₹${grandGST.toFixed(2)}</td>
    </tr>`
    : `
    <tr>
      <td>CGST</td>
      <td style="text-align:right">₹${(grandGST / 2).toFixed(2)}</td>
    </tr>
    <tr>
      <td>SGST</td>
      <td style="text-align:right">₹${(grandGST / 2).toFixed(2)}</td>
    </tr>`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size:11px; color:#111827; padding:20px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start;
              border-bottom:2px solid #0F2044; padding-bottom:12px; margin-bottom:16px; }
    .company-name { font-size:18px; font-weight:900; color:#0F2044; }
    .company-meta { font-size:9px; color:#6B7280; margin-top:2px; line-height:1.4; }
    .doc-title { text-align:center; font-size:16px; font-weight:700; color:#0F2044;
                 margin-bottom:16px; border:1px solid #0F2044; padding:6px; }
    .two-col { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
    .box { border:1px solid #D1D5DB; border-radius:4px; padding:10px; }
    .box-title { font-size:9px; text-transform:uppercase; letter-spacing:0.05em; color:#9CA3AF;
                 border-bottom:1px solid #F3F4F6; padding-bottom:4px; margin-bottom:6px; }
    .field-row { display:flex; justify-content:space-between; margin-bottom:3px; }
    .field-label { color:#6B7280; font-size:9px; }
    .field-value { font-weight:600; color:#111827; font-size:10px; text-align:right; max-width:60%; }
    table { width:100%; border-collapse:collapse; margin-bottom:12px; font-size:10px; }
    th { background:#1F2937; color:white; padding:6px 8px; text-align:left; font-size:9px; }
    td { padding:5px 8px; border:1px solid #E5E7EB; }
    .totals-table { width:50%; margin-left:auto; }
    .totals-table td { padding:5px 10px; }
    .grand-total td { background:#0F2044; color:white; font-weight:700; font-size:12px; }
    .declaration { border:1px solid #D1D5DB; border-radius:4px; padding:8px; margin-top:12px;
                   font-size:9px; color:#6B7280; line-height:1.5; }
    .sigs { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px; }
    .sig-block { padding-top:40px; border-top:1px solid #9CA3AF; font-size:9px; color:#6B7280; text-align:center; }
    .page-footer { margin-top:12px; font-size:8px; color:#9CA3AF; text-align:center; }
  </style>
</head>
<body>

  <div class="header">
    <div>
      <div class="company-name">${escapeHtml(companyName)}</div>
      <div class="company-meta">
        ${escapeHtml(companyAddress)}<br>
        GSTIN: ${escapeHtml(companyGSTIN)} | Phone: ${escapeHtml(companyPhone)} | Email: ${escapeHtml(companyEmail)}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:12px;font-weight:700;color:#0F2044">DELIVERY CHALLAN</div>
      <div style="font-family:monospace;font-weight:700;font-size:14px;color:#2563EB">${escapeHtml(challanNum)}</div>
      <div style="font-size:10px;color:#6B7280">Date: ${this.formatDate(challanDate)}</div>
      <div style="font-size:9px;color:#6B7280;margin-top:2px">
        Supply Type: ${isInterState ? 'Inter-State' : 'Intra-State'}
      </div>
    </div>
  </div>

  <div class="two-col">
    <div class="box">
      <div class="box-title">Consignor (Supplier)</div>
      <div style="font-weight:700;margin-bottom:4px">${escapeHtml(companyName)}</div>
      <div style="color:#6B7280;font-size:9px;line-height:1.5">
        ${escapeHtml(companyAddress)}<br>
        GSTIN: <strong>${escapeHtml(companyGSTIN)}</strong>
      </div>
    </div>
    <div class="box">
      <div class="box-title">Consignee (Recipient)</div>
      <div style="font-weight:700;margin-bottom:4px">${escapeHtml(client.name)}</div>
      <div style="color:#6B7280;font-size:9px;line-height:1.5">
        ${escapeHtml(addr.line1)}${addr.line2 ? `, ${escapeHtml(addr.line2)}` : ''}<br>
        ${escapeHtml(addr.city)}, ${escapeHtml(addr.state)} — ${escapeHtml(addr.pincode)}<br>
        GSTIN: <strong>${client.gstin ? escapeHtml(client.gstin) : 'Not provided'}</strong><br>
        Phone: ${escapeHtml(client.phone)}
      </div>
    </div>
  </div>

  <div class="two-col">
    <div class="box">
      <div class="box-title">Dispatch Details</div>
      <div class="field-row">
        <span class="field-label">PO Reference</span>
        <span class="field-value" style="font-family:monospace">${escapeHtml(po.poNumber)}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Session Code</span>
        <span class="field-value" style="font-family:monospace">${escapeHtml(session.sessionCode)}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Dispatch Date</span>
        <span class="field-value">${this.formatDate(challanDate)}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Place of Supply</span>
        <span class="field-value">${escapeHtml(addr.state)}</span>
      </div>
    </div>
    <div class="box">
      <div class="box-title">Vehicle Details</div>
      <div class="field-row">
        <span class="field-label">Vehicle No.</span>
        <span class="field-value" style="font-size:13px;letter-spacing:0.05em">${escapeHtml(session.vehicle.registrationNumber)}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Vehicle Type</span>
        <span class="field-value">${escapeHtml(String(session.vehicle.type))}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Driver Name</span>
        <span class="field-value">${escapeHtml(session.vehicle.driverName)}</span>
      </div>
      <div class="field-row">
        <span class="field-label">Driver Phone</span>
        <span class="field-value">${escapeHtml(session.vehicle.driverPhone)}</span>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>HSN Code</th>
        <th>Description of Goods</th>
        <th>Unit</th>
        <th style="text-align:right">Qty (Boxes)</th>
        <th style="text-align:right">Qty (Pcs)</th>
        <th style="text-align:right">Rate/Box (₹)</th>
        <th style="text-align:right">Taxable Value (₹)</th>
        <th style="text-align:center">GST %</th>
        <th style="text-align:right">GST Amt (₹)</th>
        <th style="text-align:right">Total (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${tbody}
    </tbody>
  </table>

  <table class="totals-table">
    <tr>
      <td>Total Taxable Value</td>
      <td style="text-align:right">₹${grandTaxable.toFixed(2)}</td>
    </tr>
    ${taxRows}
    <tr class="grand-total">
      <td>GRAND TOTAL</td>
      <td style="text-align:right">₹${grandTotal.toFixed(2)}</td>
    </tr>
  </table>

  <div class="declaration">
    <strong>Declaration:</strong> We hereby declare that this challan shows the actual price of the goods described
    and that all particulars are true and correct. This challan is issued in compliance with Rule 55 of CGST Rules, 2017.
    The goods covered by this delivery challan shall be returned to the supplier within 6 months.
  </div>

  <div class="sigs">
    <div class="sig-block">
      Signature of Consignor<br>
      <strong>${escapeHtml(companyName)}</strong><br>
      GSTIN: ${escapeHtml(companyGSTIN)}
    </div>
    <div class="sig-block">
      Signature &amp; Stamp of Consignee<br>
      <strong>${escapeHtml(client.name)}</strong><br>
      GSTIN: ${client.gstin ? escapeHtml(client.gstin) : '—'}
    </div>
  </div>

  <div class="page-footer">
    This is a computer-generated delivery challan · SmartLoad · Challan No: ${escapeHtml(challanNum)} · ${this.formatDate(challanDate)}
  </div>
</body>
</html>`;

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.default.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
      });

      await this.app.prisma.dispatchSession.update({
        where: { id: sessionId },
        data: { challanPdfUrl: `challan-${challanNum}.pdf` },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}

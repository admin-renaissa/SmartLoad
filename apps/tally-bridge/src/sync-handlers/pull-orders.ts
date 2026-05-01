import { sendXML, parseTallyXml } from '../tally-client.js';

export interface TallyPurchaseOrderLine {
  orderRef?: string;
  date?: string;
  partyName?: string;
  itemName?: string;
  quantity?: number;
  unit?: string;
  amount?: number;
  voucherType?: string;
  raw: Record<string, unknown>;
}

function escapeReportXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setFullYear(from.getFullYear() - 2);
  return { from: yyyymmdd(from), to: yyyymmdd(to) };
}

function parseQtyField(raw: unknown): { quantity?: number; unit?: string } {
  if (raw == null) return {};
  const s = String(raw).trim();
  const m = s.match(/^([\d.,]+)\s*([A-Za-z].*)?$/);
  if (!m) return {};
  const qty = parseFloat(m[1].replace(/,/g, ''));
  if (Number.isNaN(qty)) return {};
  return { quantity: qty, unit: m[2]?.trim() || undefined };
}

function normalizeDate(d: unknown): string | undefined {
  if (d == null) return undefined;
  const s = String(d).trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Collect every object in the tree that looks like a Tally voucher. */
function collectVoucherObjects(node: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (node == null || depth > 40) return;
  if (Array.isArray(node)) {
    for (const n of node) collectVoucherObjects(n, out, depth + 1);
    return;
  }
  if (typeof node !== 'object') return;
  const o = node as Record<string, unknown>;

  const direct = o.VOUCHER;
  if (direct != null) {
    for (const v of asArray(direct as Record<string, unknown> | Record<string, unknown>[])) {
      if (v && typeof v === 'object') {
        out.push(v as Record<string, unknown>);
      }
    }
  }

  for (const k of Object.keys(o)) {
    if (k === 'VOUCHER') continue;
    collectVoucherObjects(o[k], out, depth + 1);
  }
}

function getInventoryEntryLists(v: Record<string, unknown>): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const key of Object.keys(v)) {
    if (!key.toUpperCase().includes('INVENTORYENTRIES')) continue;
    const val = v[key];
    for (const entry of asArray(val as Record<string, unknown> | Record<string, unknown>[])) {
      if (entry && typeof entry === 'object' && (entry as Record<string, unknown>).STOCKITEMNAME != null) {
        rows.push(entry as Record<string, unknown>);
      }
    }
  }
  const allKey = 'ALLINVENTORYENTRIES.LIST' as const;
  if (v[allKey] != null) {
    for (const entry of asArray(v[allKey] as Record<string, unknown> | Record<string, unknown>[])) {
      const row = entry as Record<string, unknown>;
      if (row.STOCKITEMNAME != null) rows.push(row);
    }
  }
  if (rows.length === 0) {
    for (const k of Object.keys(v)) {
      if (k.includes('.LIST') && /inventory|stockitem/i.test(k)) {
        for (const entry of asArray(v[k] as Record<string, unknown>)) {
          if (entry && typeof entry === 'object') rows.push(entry as Record<string, unknown>);
        }
      }
    }
  }
  return rows;
}

function pickAmount(v: Record<string, unknown>): number | undefined {
  const candidates = ['AMOUNT', 'BILLEDAMT', 'ACTUALQTY', 'VAL'];
  for (const c of candidates) {
    const n = v[c];
    if (n != null && n !== '' && !Number.isNaN(Number(n))) {
      return Number(n);
    }
  }
  return undefined;
}

function findLineErrors(node: unknown): string[] {
  const errs: string[] = [];
  const walk = (n: unknown, d = 0) => {
    if (n == null || d > 30) return;
    if (Array.isArray(n)) {
      n.forEach((x) => walk(x, d + 1));
      return;
    }
    if (typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (o.LINEERROR != null) errs.push(String(o.LINEERROR));
    if (o.CLINEERROR != null) errs.push(String(o.CLINEERROR));
    for (const v of Object.values(o)) walk(v, d + 1);
  };
  walk(node);
  return errs;
}

function filterByVoucherType(
  v: Record<string, unknown>,
  filter?: string,
): boolean {
  if (!filter) return true;
  const t = String(v.VCHTYPE || v.VOUCHERTYPENAME || v['@_VCHTYPE'] || '').toLowerCase();
  return t.includes(filter.toLowerCase());
}

function mapVoucherToLines(v: Record<string, unknown>, filter?: string): TallyPurchaseOrderLine[] {
  if (!filterByVoucherType(v, filter)) return [];

  const orderRef = String(
    v.VOUCHERNUMBER || v.VCHNUMBER || v.VCHNO || v.GUID || v.MASTERID || '',
  );
  const date = normalizeDate(v.DATE);
  const partyName = String(
    v.PARTYNAME || v.PARTYLEDGERNAME || (v as { BASICPRIORITY?: string }).BASICPRIORITY || '',
  );
  const voucherType = String(v.VCHTYPE || v.VOUCHERTYPENAME || '');

  const inv = getInventoryEntryLists(v);
  const baseRaw = { ...v } as Record<string, unknown>;
  if (inv.length === 0) {
    return [
      {
        orderRef: orderRef || undefined,
        date,
        partyName: partyName || undefined,
        itemName: undefined,
        quantity: undefined,
        unit: undefined,
        amount: pickAmount(v),
        voucherType: voucherType || undefined,
        raw: baseRaw,
      },
    ];
  }

  return inv.map((row) => {
    const { quantity, unit } = parseQtyField(row.ACTUALQTY || row.BILLEDQTY);
    const itemName = String(row.STOCKITEMNAME || row.STOCKITEM || '').trim() || undefined;
    const amount = pickAmount(row);
    return {
      orderRef: orderRef || undefined,
      date,
      partyName: partyName || undefined,
      itemName,
      quantity,
      unit,
      amount,
      voucherType: voucherType || undefined,
      raw: { voucher: baseRaw, line: row },
    };
  });
}

/**
 * Pulls purchase / order-related vouchers from Tally using the configured **report**
 * (default `Voucher Register`), parses **VOUCHER** nodes, and flattens **inventory**
 * lines when present.
 *
 * **Env**
 * - `TALLY_PO_REPORT` — Tally report name (default `Voucher Register`).
 * - `TALLY_PO_FROM` / `TALLY_PO_TO` — YYYYMMDD range (default last 2 years).
 * - `TALLY_PO_SVVOUCHERTYPENAME` — if set, sent as &lt;SVVOUCHERTYPENAME&gt; (narrows Voucher Register).
 * - `TALLY_PO_VOUCHER_TYPE_FILTER` — optional substring filter on `VCHTYPE` / `VOUCHERTYPENAME` (e.g. `Purchase`).
 */
export async function pullPurchaseOrdersFromTally(): Promise<{
  orders: TallyPurchaseOrderLine[];
  reportUsed: string;
  note: string;
  tallyErrors?: string[];
}> {
  const reportName = escapeReportXml(process.env.TALLY_PO_REPORT || 'Voucher Register');
  const { from, to } = (() => {
    if (process.env.TALLY_PO_FROM && process.env.TALLY_PO_TO) {
      return { from: process.env.TALLY_PO_FROM, to: process.env.TALLY_PO_TO };
    }
    return defaultDateRange();
  })();

  const voucherTypeName = process.env.TALLY_PO_SVVOUCHERTYPENAME;
  const staticVars = [
    '<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>',
    `<SVFROMDATE>${from}</SVFROMDATE>`,
    `<SVTODATE>${to}</SVTODATE>`,
    ...(voucherTypeName
      ? [`<SVVOUCHERTYPENAME>${escapeReportXml(voucherTypeName)}</SVVOUCHERTYPENAME>`]
      : []),
  ].join('\n        ');

  const xml = `<EXPORTDATA>
    <REQUESTDESC>
      <REPORTNAME>${reportName}</REPORTNAME>
      <STATICVARIABLES>
        ${staticVars}
      </STATICVARIABLES>
    </REQUESTDESC>
  </EXPORTDATA>`;

  const responseStr = await sendXML(xml, 'Export');
  const parsed = parseTallyXml(responseStr) as Record<string, unknown>;
  const tallyErrors = findLineErrors(parsed);
  if (tallyErrors.length > 0) {
    return {
      orders: [],
      reportUsed: process.env.TALLY_PO_REPORT || 'Voucher Register',
      note: 'Tally returned LINEERROR — check company open, report name, and date range.',
      tallyErrors,
    };
  }

  const vouchers: Record<string, unknown>[] = [];
  collectVoucherObjects(parsed, vouchers);

  const typeFilter = process.env.TALLY_PO_VOUCHER_TYPE_FILTER;
  const lines: TallyPurchaseOrderLine[] = [];
  for (const v of vouchers) {
    lines.push(...mapVoucherToLines(v, typeFilter));
  }

  const note =
    lines.length > 0
      ? `Parsed ${vouchers.length} voucher(s) → ${lines.length} line(s). From ${from} to ${to}.`
      : `No vouchers parsed. Tweak TALLY_PO_REPORT, TALLY_PO_SVVOUCHERTYPENAME, or TALLY_PO_VOUCHER_TYPE_FILTER (e.g. Purchase). Tally may use a different key layout — check logs/tally-http-*.log.`;

  return {
    orders: lines,
    reportUsed: process.env.TALLY_PO_REPORT || 'Voucher Register',
    note,
  };
}

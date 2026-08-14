import type { FastifyBaseLogger, FastifyReply } from 'fastify';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';

export const REPORT_EXPORT_MAX_ROWS = 50_000;

/** Emit a structured warning when exports hit the row cap (headers still reflect truncated set). */
export function logExportCapIfApplied(
  log: FastifyBaseLogger | undefined,
  reportId: string,
  sourceRowCount: number,
  capped: boolean,
): void {
  if (!capped || !log) return;
  log.warn(
    { reportId, sourceRowCount, maxRows: REPORT_EXPORT_MAX_ROWS },
    'Report export row cap applied; output truncated',
  );
}

export type ReportColumn = { key: string; header: string };

export function parseReportFormat(query: Record<string, unknown>): 'json' | 'excel' | 'pdf' {
  const f = String(query.format ?? 'json').toLowerCase();
  if (f === 'excel' || f === 'xlsx') return 'excel';
  if (f === 'pdf') return 'pdf';
  return 'json';
}

export function capExportRows<T>(rows: T[]): { rows: T[]; capped: boolean } {
  if (rows.length <= REPORT_EXPORT_MAX_ROWS) return { rows, capped: false };
  return { rows: rows.slice(0, REPORT_EXPORT_MAX_ROWS), capped: true };
}

function cellVal(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendReportExcel(
  reply: FastifyReply,
  filename: string,
  sheetName: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  capped: boolean,
): Promise<FastifyReply> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.min(48, Math.max(10, c.header.length + 3)),
  }));
  for (const r of rows) {
    const row: Record<string, string> = {};
    for (const c of columns) {
      row[c.key] = cellVal(r[c.key]);
    }
    ws.addRow(row);
  }
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  reply.header('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  reply.header('X-Export-Row-Count', String(rows.length));
  if (capped) reply.header('X-Export-Capped', 'true');
  return reply.send(Buffer.from(buf));
}

export async function sendReportPdf(
  reply: FastifyReply,
  filename: string,
  title: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  capped: boolean,
): Promise<FastifyReply> {
  const thead = columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join('');
  const trs = rows
    .map((r) => {
      const tds = columns.map((c) => `<td>${escapeHtml(cellVal(r[c.key]))}</td>`).join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,sans-serif;font-size:9px;margin:12px}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:3px;text-align:left;vertical-align:top}
th{background:#0F2044;color:#fff}
h1{font-size:13px}
.warn{color:#b45309;font-size:10px;margin-bottom:8px}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
${capped ? `<p class="warn">Showing first ${rows.length} rows (export cap).</p>` : `<p>Rows: ${rows.length}</p>`}
<table><thead><tr>${thead}</tr></thead><tbody>${trs}</tbody></table>
</body></html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      landscape: columns.length > 7,
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
    });
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    reply.header('X-Export-Row-Count', String(rows.length));
    if (capped) reply.header('X-Export-Capped', 'true');
    return reply.send(pdf);
  } finally {
    await browser.close();
  }
}

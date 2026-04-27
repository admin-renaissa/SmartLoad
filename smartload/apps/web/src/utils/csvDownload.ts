/**
 * Build a CSV string from an array of plain objects (nested values JSON-stringified).
 */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]!);
  const esc = (v: unknown): string => {
    if (v == null) return '""';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = keys.map((k) => `"${k.replace(/"/g, '""')}"`).join(',');
  const lines = rows.map((r) => keys.map((k) => esc(r[k])).join(','));
  return [header, ...lines].join('\n');
}

export function downloadCsvFile(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJsonRowsAsCsv(filename: string, rows: Record<string, unknown>[]): void {
  downloadCsvFile(filename, rowsToCsv(rows));
}

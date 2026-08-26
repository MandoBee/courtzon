/**
 * Shared CSV export helpers.
 *
 * Produces RFC-4180-style CSV: cells containing a comma, quote, CR or LF are
 * quoted and embedded quotes are doubled. A UTF-8 BOM is prepended so Excel
 * renders UTF-8 content correctly. Amounts are passed as strings/numbers as-is
 * (decimal precision preserved); dates should be passed as explicit
 * ISO/display strings by the caller.
 */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV string from headers + row arrays.
 * @param headers stable column names
 * @param rows arrays aligned with headers (can mix numbers, strings, null)
 * @param includeBom prepend a UTF-8 BOM (default true, for Excel)
 */
export function toCsv(headers: string[], rows: unknown[][], includeBom = true): string {
  const lines: string[] = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  const body = lines.join('\r\n');
  return includeBom ? `\uFEFF${body}` : body;
}

/** Build a stable CSV filename, e.g. settlements_2026-08-26.csv */
export function csvFilename(prefix: string, date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${prefix}_${y}-${m}-${d}.csv`;
}
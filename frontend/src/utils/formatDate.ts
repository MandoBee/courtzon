export function formatDate(dateStr: string | Date | null | undefined): string {
  if (dateStr == null) return '—';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Formats a date-only ISO string (e.g. "2026-07-15") to DD/MM/YYYY
 *  without any timezone parsing — avoids the UTC-to-local shift bug
 *  that occurs when doing `new Date("2026-07-15").toLocaleDateString()`
 *  in negative UTC-offset timezones. */
export function formatISODate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** YYYY-MM-DD in the user's local timezone (for date inputs). */
export function localTodayString(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

export function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (dateStr == null) return '—';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-GB');
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date} - ${time}`;
}

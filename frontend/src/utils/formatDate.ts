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

/**
 * True-instant formatter for a UTC ISO string (or Date) rendered in a given
 * IANA timezone. DST-safe via Intl — never a fixed offset.
 *
 * - No timeZone supplied → the browser/device local timezone (the established
 *   user-facing display contract for true instants).
 * - timeZone supplied (e.g. `user.timezone` or a branch/venue timezone) → the
 *   instant is rendered in that zone.
 *
 * Use this for UTC instants only (created_at, played_at, deadlines, ...).
 * Date-only values ("YYYY-MM-DD") must go through `formatISODate` instead so
 * they never shift a day.
 */
export function formatDateTimeLocal(
  dateStr: string | Date | null | undefined,
  timeZone?: string,
): string {
  if (dateStr == null) return '—';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return '—';
  const tzOpts = timeZone ? { timeZone } : {};
  const date = d.toLocaleDateString('en-GB', tzOpts);
  const time = d.toLocaleTimeString('en-GB', {
    ...tzOpts,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} - ${time}`;
}

/**
 * Convert a naive `datetime-local` value ("YYYY-MM-DDTHH:mm") to a UTC ISO
 * string for API submission. The single, consistent conversion point for every
 * form using `<input type="datetime-local">`.
 *
 * - No timeZone → the value is the user's browser-local wall clock (the
 *   standard datetime-local contract) → `new Date(...).toISOString()`.
 * - timeZone supplied (IANA) → interpret the wall clock in that zone,
 *   DST-aware via Intl iterative convergence (mirrors backend TimeEngine).
 *
 * Returns '' for empty input and returns the input unchanged on parse failure
 * so callers can rely on the backend's own validation.
 */
export function toUtcIsoForApi(localNaive: string, timeZone?: string): string {
  if (!localNaive) return '';
  if (!timeZone) {
    const d = new Date(localNaive);
    return isNaN(d.getTime()) ? localNaive : d.toISOString();
  }

  const [datePart, timePartRaw] = localNaive.split('T');
  const timePart = timePartRaw || '00:00';
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  if (!y || !mo || !d || isNaN(h) || isNaN(mi)) return localNaive;

  const targetUtc = Date.UTC(y, mo - 1, d, h, mi);
  const partsFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  // Iteratively converge on the UTC instant whose wall clock in `timeZone`
  // equals the given naive value (handles DST offsets without fixed values).
  let guess = targetUtc;
  for (let i = 0; i < 5; i++) {
    const p = partsFmt.formatToParts(new Date(guess));
    const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
    const localAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    const offset = localAsUtc - guess;
    if (offset === 0) break;
    guess = targetUtc - offset;
  }
  return new Date(guess).toISOString();
}

/**
 * Convert a naive `datetime-local` value ("YYYY-MM-DDTHH:mm") to a
 * MySQL-compatible UTC literal ("YYYY-MM-DD HH:mm:00") for backends that store
 * the string directly into DATETIME columns whose session timezone is UTC
 * (e.g. coupons, campaigns). Semantics are identical to `toUtcIsoForApi` —
 * this is purely a wire-format convenience so the stored value is the true
 * UTC instant instead of a mislabeled browser-local wall clock.
 */
export function toMySqlUtcForApi(localNaive: string, timeZone?: string): string {
  const iso = toUtcIsoForApi(localNaive, timeZone);
  if (!iso || iso === localNaive) return localNaive;
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}:00`;
}

/**
 * Convert a UTC ISO instant (e.g. a stored `starts_at` / `expires_at`) into a
 * browser-local `datetime-local` value ("YYYY-MM-DDTHH:mm") for pre-filling
 * `<input type="datetime-local">` edit forms. The inverse of
 * `toUtcIsoForApi(localNaive)` (no timeZone) — together they form a stable
 * round trip that never shifts by the user's offset.
 */
export function toLocalDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convert a UTC ISO instant into a `datetime-local` string
 * ("YYYY-MM-DDTHH:mm") in a GIVEN IANA timezone. This is the branch-timezone
 * counterpart of `toLocalDateTimeLocal` (which uses the browser timezone).
 *
 * Used to pre-fill / bound the matchmaking-deadline input from the slot's
 * authoritative `startAtUtc` when the branch timezone differs from the device.
 * DST-safe via Intl — never a fixed offset.
 */
export function toDateTimeLocalInTimezone(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${get('year')}-${pad(get('month'))}-${pad(get('day'))}T${pad(get('hour'))}:${pad(get('minute'))}`;
}

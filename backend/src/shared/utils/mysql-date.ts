const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Format a Date as a MySQL DATETIME/TIMESTAMP literal.
 *
 * Output is always `YYYY-MM-DD HH:mm:ss`:
 * - No milliseconds.
 * - No trailing `Z` / timezone suffix.
 * - No `T` separator.
 * - No locale dependence.
 *
 * The pool is configured with `timezone: '+00:00'` (see `database/mysql.ts`),
 * so UTC getters are used to match how mysql2 serializes Date objects for
 * TIMESTAMP/DATETIME columns.
 */
export function toMySqlDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/** Current instant formatted as a MySQL DATETIME/TIMESTAMP literal (UTC). */
export function nowMySql(): string {
  return toMySqlDateTime(new Date());
}

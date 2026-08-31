import { getPool } from '../../database/mysql.js';
import { utcToLocalDate } from '../../modules/time/utc-converter.js';

/**
 * Centralized timezone / accounting business-date resolution.
 *
 * CourtZon's canonical platform timezone is the `localization.timezone` system
 * setting (default `Africa/Cairo`, seeded by migration 019). Branch timezones
 * default to the same value. This utility is the SINGLE source of truth for
 * turning a UTC instant into the local accounting BUSINESS DATE — used by the
 * Accounting Engine (`postAccountingEvent`) so automatically generated journal
 * entries are dated in the organization's local business timezone, not the
 * server's UTC clock (which can shift the accounting date around midnight).
 *
 * UTC semantics are NEVER corrupted: the stored `recorded_at` instant remains
 * UTC; only the GL `entry_date` (a local business-date projection) is derived
 * in the configured timezone.
 */

const DEFAULT_TIMEZONE = 'Africa/Cairo';

let cachedTimezone: string | null = null;
let timezoneResolvePromise: Promise<string> | null = null;

/** Resolve the platform timezone from system_settings (cached, 5s TTL). */
export async function getPlatformTimezone(): Promise<string> {
  if (cachedTimezone) return cachedTimezone;
  if (timezoneResolvePromise) return timezoneResolvePromise;

  timezoneResolvePromise = (async () => {
    try {
      const pool = getPool();
      const [rows] = await pool.execute(
        `SELECT value FROM system_settings WHERE \`key\` = 'timezone' LIMIT 1`,
      );
      const value = (rows as any[])[0]?.value;
      if (value && typeof value === 'string' && value.trim()) {
        cachedTimezone = value.trim();
        return cachedTimezone;
      }
    } catch {
      /* fall through to default */
    }
    cachedTimezone = DEFAULT_TIMEZONE;
    return cachedTimezone;
  })();

  try {
    return await timezoneResolvePromise;
  } finally {
    setTimeout(() => { timezoneResolvePromise = null; }, 5000);
  }
}

/** Set an explicit cached timezone (e.g. injected in tests). */
export function setPlatformTimezone(timezone: string | null): void {
  cachedTimezone = timezone;
  timezoneResolvePromise = null;
}

/**
 * Resolve the local business date (YYYY-MM-DD) for a UTC instant in the given
 * timezone. When no timezone is supplied, the platform default is used. Always
 * returns a valid date string; on any resolution error it falls back to the UTC
 * date so an accounting posting is never lost due to a timezone lookup failure.
 */
export async function getLocalBusinessDate(
  instant: string | Date,
  timezone?: string | null,
): Promise<string> {
  const tz = timezone || (await getPlatformTimezone());
  const iso = instant instanceof Date ? instant.toISOString() : String(instant);
  try {
    return utcToLocalDate(iso, tz as any);
  } catch {
    return iso.slice(0, 10);
  }
}

/** Current local business date (YYYY-MM-DD) in the given/platform timezone. */
export async function getLocalToday(timezone?: string | null): Promise<string> {
  return getLocalBusinessDate(new Date(), timezone);
}
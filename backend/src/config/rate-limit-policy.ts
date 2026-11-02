/**
 * Global rate-limit policy (per client IP).
 *
 * Every SPA page load issues ~10-15 same-origin API reads, and most of them are
 * read-only reference data served under `/public/*` (countries, translations,
 * feature flags, app settings, theme, currencies, geolocation). Those reads
 * used to consume the *same* 100 req/min bucket as authenticated and sensitive
 * endpoints, so a handful of rapid page loads exhausted the budget, `/auth/me`
 * started answering 429, and the SPA - which cannot distinguish "rate limited"
 * from "no session" on a fresh page load - bounced the user to /login.
 *
 * Public reference reads therefore get their own (still bounded) bucket. The
 * authenticated/sensitive budget stays exactly as strict as before (100/min),
 * and authentication endpoints keep their stricter per-route limits
 * (login 10/min, forgot-password 5/15min, refresh 30/min, ...).
 */

/** Budget for authenticated and every non-public endpoint (unchanged). */
export const API_RATE_LIMIT_MAX = 100;

/**
 * Budget for read-only public reference data. Bounded so the endpoints remain
 * abuse-protected, but high enough that normal navigation never drains it.
 */
export const PUBLIC_REFERENCE_RATE_LIMIT_MAX = 600;

/** True for `/public` and `/public/...` (query string ignored). */
export function isPublicReferencePath(url: string): boolean {
  const path = (url || '').split('?')[0];
  return path === '/public' || path.startsWith('/public/');
}

/** Per-request ceiling selected by path class. */
export function resolveRateLimitMax(url: string): number {
  return isPublicReferencePath(url) ? PUBLIC_REFERENCE_RATE_LIMIT_MAX : API_RATE_LIMIT_MAX;
}

/**
 * Bucket key. Public reads and authenticated calls must NOT share a counter,
 * otherwise public traffic would still evict an active session.
 */
export function resolveRateLimitKey(ip: string, url: string): string {
  return `${ip}|${isPublicReferencePath(url) ? 'public' : 'api'}`;
}

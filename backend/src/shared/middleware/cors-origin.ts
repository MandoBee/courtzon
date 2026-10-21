/**
 * MB-02 — CORS origin policy.
 *
 * `@fastify/cors` asks this per request whether to attach CORS headers. A
 * DISALLOWED origin must be rejected WITHOUT raising an error: passing an Error
 * to the callback makes the framework convert the response into an HTTP 500.
 * Returning `false` merely omits the CORS headers (the browser then blocks the
 * response) while the request is still served with its real status code.
 *
 * A missing `Origin` header means the request is not a cross-origin browser
 * request (server-to-server, curl, health/monitoring probes). Those stay
 * unaffected, so they are always allowed — unchanged from the previous policy.
 *
 * The allowlist and the dev/docker-local permissiveness are the caller's
 * concern (passed in), so this function stays pure and testable.
 */
export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
  allowAll = false,
): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return allowAll;
}

/**
 * MB-04 — compose the HTTP CORS / CSP allowlist.
 *
 * Production origins and explicitly configured extras (APP_URL, CORS_ORIGINS)
 * are always included. Local development origins are included ONLY outside
 * production: this is what makes `localhost` / `127.0.0.1` un-trusted in
 * production, independently of any Docker-local flag.
 */
export interface CorsAllowlistInput {
  productionOrigins: readonly string[];
  localDevOrigins: readonly string[];
  isDev: boolean;
  appUrl?: string;
  extraOrigins?: readonly string[];
}

export function buildCorsAllowlist(input: CorsAllowlistInput): string[] {
  const origins = [...input.productionOrigins];
  if (input.isDev) origins.push(...input.localDevOrigins);
  if (input.appUrl) origins.push(input.appUrl);
  if (input.extraOrigins) origins.push(...input.extraOrigins);
  return origins;
}

/**
 * Build the CORS `origin` callback used by BOTH `@fastify/cors` (HTTP) and
 * Socket.IO. A disallowed origin is rejected with `cb(null, false)` — never
 * with an Error, which would surface as an HTTP 500 (HTTP) or a handshake
 * failure (Socket.IO).
 */
export function corsOriginCallback(
  allowedOrigins: readonly string[],
  allowAll: boolean,
): (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => void {
  return (origin, cb) => {
    cb(null, isCorsOriginAllowed(origin, allowedOrigins, allowAll));
  };
}

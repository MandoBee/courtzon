# ADR 007: Security Model

**Status:** Accepted  
**Date:** 2026-07-04  
**Authors:** CourtZon Engineering

## Context

CourtZon handles user authentication, payment processing, file uploads, and personal data. A consistent security model must protect user data, prevent common web vulnerabilities, and comply with payment industry standards.

## Decision

1. **Authentication via HttpOnly cookies with SameSite=Lax.** JWTs/session tokens are stored in HttpOnly cookies, not localStorage. This prevents XSS-based token theft. SameSite=Lax provides CSRF protection for navigation-based requests.

2. **Layered defense for API security.** CORS restricts origins to explicit whitelist in production. Helmet sets security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options). Rate limiting applies globally (100 req/min per IP in production). Brute-force protection locks accounts after 5 failed login attempts in 15 minutes (30-minute lockout).

3. **Webhook security via HMAC.** Payment webhooks require HMAC-SHA512 signature verification. The `UNIQUE` constraint on `gateway_reference` prevents replay attacks. Webhook endpoints bypass authentication (PUBLIC_PREFIXES) but are protected by cryptographic signature validation.

4. **File upload hardening.** MIME whitelist (JPEG, PNG, WebP, GIF, HEIC, HEIF, AVIF, PDF). Extension blocklist (40+ blocked: .svg, .html, .js, .php, .exe, .jar, .ps1, .py, .rb). Magic byte verification (content matches declared type). All images reprocessed through Sharp (strip EXIF, re-encode, resize max 1920x1920). SVG explicitly blocked.

5. **Secrets management via environment variables.** All secrets (API keys, database credentials, HMAC secrets) are injected via environment variables. Never committed to Git. Production-guarded with Zod validation: rejects dev defaults (`SESSION_SECRET` must not be the dev string, `PAYMENT_GATEWAY_PROVIDER` must not be `'mock'`).

6. **SQL injection prevention.** All database queries use parameterized prepared statements (`pool.execute(sql, [params])`). No string interpolation in query construction. Dynamic column names use whitelist mapping.

## Alternatives Considered

- **OAuth/OIDC (future).** Social login would require OAuth. Current email/password + phone is sufficient for the Egyptian market. Can be added later.
- **CSRF tokens (future).** Not implemented currently. HttpOnly cookies + SameSite=Lax provides reasonable protection for most CSRF vectors. Can be added if needed.
- **WAF/CDN (future).** Cloudflare or equivalent can be added in front of the application for DDoS protection and additional security filtering.

## Consequences

- **Positive:** Defense-in-depth across network (CORS), transport (HSTS), application (CSP, rate limiting, brute-force), data (parameterized queries), and filesystem (upload hardening) layers.
- **Negative:** CSRF protection relies on SameSite attribute alone (no token-based CSRF). Accepted risk for initial launch.
- **Enforcement:** SEC-01 through SEC-08 in engineering standards.

# CourtZon-V2 Security Audit

**Date:** 2026-06-24
**Scope:** Full-stack platform — Fastify backend (Node.js), React/TypeScript frontend, MySQL, Redis, Docker
**Audit Level:** Code review + architecture analysis (no live penetration testing)

---

## 1. Authentication — ✅ GOOD

### Implementation
| Aspect | Detail |
|---|---|
| Password hashing | PBKDF2-SHA512, 210,000 iterations, 32-byte salt, constant-time comparison (`timingSafeEqual`) |
| Registration | Phone + email uniqueness checks, Zod-validated input, `player` role auto-assigned |
| Login | Phone-based, `account_status` enforcement, IP + user agent + device fingerprint logged |
| Session creation | Opaque tokens (48/64 bytes), SHA256-hashed before storage |
| Device fingerprinting | `X-Device-Fingerprint` header → `user_devices` table (find-or-create) |
| Forgot password | `randomBytes(32)` reset token, 1-hour expiry, email queued via Redis |
| Logout | Session revocation by refresh token or all-devices |

### References
- `backend/src/shared/utils/password.ts` — PBKDF2 implementation
- `backend/src/modules/auth/application/auth.service.ts` — core auth logic
- `backend/src/modules/auth/presentation/auth.controller.ts` — handlers
- `backend/src/shared/utils/auth-cookies.ts` — cookie management
- `backend/src/shared/utils/token.ts` — token generation

### Findings
- **PBKDF2-210k iterations** is adequate (OWASP recommends 600k for PBKDF2-HMAC-SHA256 equivalent — SHA512 reduces risk)
- **Forgot password token stored in plaintext** in `password_reset_tokens` table — should ideally be hashed (like session tokens). Token is a `randomBytes(32)` hex string sent in the URL.
- **No account lockout notification** — user isn't alerted via email when account is locked
- **Rate-limited login** with progressive backoff via brute-force service ✅

### Recommendations
1. Hash password reset tokens before storing (same pattern as sessions)
2. Send email notification on account lockout
3. Consider adding WebAuthn/passkey support as an additional factor

---

## 2. Authorization — ✅ GOOD

### Implementation
| Aspect | Detail |
|---|---|
| RBAC | Roles (`user_roles`), permissions (`role_permissions`), scoped roles (`user_role_scopes`) |
| Middleware guards | `requireRole()`, `requirePermission()`, `eitherRoleOrPermission()`, `adminGuard` |
| Org-scoped access | `requireOrganisationAccess()`, `requireOrgManageAccess()`, `requireOrgScopedPermission()` |
| Feature flags | `requireFeatureFlag()` — registration, maintenance mode |
| Frontend gating | `<Can permission="key">` component, `useCan()` hook |
| Permission registry | `frontend/src/permissions/registry.ts` + `sync-ui-registry.js` |

### References
- `backend/src/shared/middleware/auth.middleware.ts` — role/permission guards
- `backend/src/shared/middleware/route-guard.ts` — org-scoped guards

### Findings
- **Granular, data-driven RBAC** — permissions pulled from DB per request, cached nowhere. This is correct for real-time access but means N+1 queries on every guarded route.
- **Scoped roles** per organisation — excellent for multi-tenant isolation
- **`is_active` + `expires_at`** on `user_roles` — supports temporary role assignments
- **No caching of permissions** — each request queries `user_roles` → `role_permissions` → `permissions`. Consider Redis caching with TTL.
- **Frontend permissions sync** — dual-registration ensures backend and frontend stay aligned

### Recommendations
1. Add Redis caching for permission lookups (keyed by `userId`, TTL 60s, invalidate on role change)
2. Consider adding permission introspection endpoints for client-side cache

---

## 3. JWT/Session — ⚠️ NEEDS IMPROVEMENT

### Implementation
| Aspect | Detail |
|---|---|
| Token type | Opaque session tokens (not JWT) — 48 bytes `base64url` for session, 64 bytes for refresh |
| Storage | **HttpOnly cookies** (`session_token`, `refresh_token`) — not accessible via JS |
| Secure flag | `secure: true` in production (`NODE_ENV === 'production'`) |
| SameSite | `lax` — CSRF protection via browser SameSite policy |
| Bearer fallback | `Authorization: Bearer <token>` also accepted (for API clients) |
| Token hashing | SHA256 before storing in DB — stored tokens never in plaintext |
| Session lifetime | 30 days |
| Refresh mechanism | Refresh token rotation — old session revoked, new one created |
| Logout | Revokes specific session or all sessions for user |

### References
- `backend/src/shared/utils/auth-cookies.ts` — cookie config
- `backend/src/shared/utils/token.ts` — token generation
- `backend/src/modules/auth/infrastructure/repositories/session.repository.ts`

### Findings
- **✅ HttpOnly + Secure + SameSite=Lax** — well-configured cookies
- **✅ Refresh token rotation** — old session revoked on refresh (prevents replay)
- **✅ SHA256-hashed tokens** in DB — no plaintext leakage
- **⚠️ SameSite=Lax** protects against cross-site POST but not against subdomain attacks (e.g., `evil.courtzon.com`)
- **⚠️ No absolute session expiry** — sessions last 30 days with no idle timeout. If a refresh token is stolen within the expiry window, it can be used until the 30-day mark.
- **⚠️ Bearer token in URL/Auth header** is accepted — once extracted (e.g., via proxy log), it can be replayed until expiry. No JWT means no signature verification (token is just an opaque DB lookup key).
- **❌ No session revocation on password change** — `resetPassword` does revoke all sessions ✅, but `updateProfile` does not force re-auth.
- **❌ No device notification** on new device login — user isn't alerted when a session is created from an unknown device

### Recommendations
1. Add **absolute session timeout** (e.g., 7 days max, 24h idle timeout)
2. Implement **refresh token rotation reuse detection** — if a revoked refresh token is reused, revoke all sessions for that user (NIST suggests this)
3. Send **email notification** on login from unrecognized device
4. Add **`path` and `domain` restrictions** to cookie config more explicitly
5. Consider adding **JWT** for API client use cases with short TTL (15 min) + refresh rotation

---

## 4. CORS — ✅ GOOD

### Implementation
| Aspect | Detail |
|---|---|
| Whitelist | Explicit array: `courtzon.com`, `admin.courtzon.com`, `media.courtzon.com`, localhost variants, `APP_URL`, `CORS_ORIGINS` env |
| Dynamic check | Callback validates `origin` against whitelist |
| Dev relaxation | In `isDev || isDockerLocal`, all origins accepted |
| Credentials | `credentials: true` — required for cookies |
| Allowed headers | Whitelisted: `Content-Type`, `Authorization`, `X-Device-Fingerprint`, `X-Request-Id` |
| Allowed methods | Explicit list of common HTTP verbs |

### References
- `backend/src/app.ts:152-165`

### Findings
- **✅ Explicit whitelist** — production only allows known origins
- **✅ Credentials+headers restricted** — not open
- **✅ No wildcard origin with credentials** — safe
- **⚠️ Dev/Docker mode bypasses whitelist** — acceptable for development, but `RELAX_RATE_LIMIT` env also disables HTTPS redirect and relaxes CORS, making it a triple-relaxation switch

### Recommendations
1. Split `RELAX_RATE_LIMIT` into more granular env flags (`CORS_RELAX`, `HTTPS_RELAX`, `RATE_LIMIT_RELAX`)
2. Consider adding `Vary: Origin` header for caching

---

## 5. Rate Limiting — ✅ GOOD

### Implementation
| Aspect | Detail |
|---|---|
| Global | `@fastify/rate-limit` — 100 req/min per IP (2000 in dev) |
| Brute-force | Redis-based — 5 failed login attempts → 30-min lockout |
| Key generator | `request.ip` |
| HTTP redirect | HTTPS redirect hook for production |

### References
- `backend/src/app.ts:131-146` — rate limit + HTTPS redirect
- `backend/src/modules/brute-force/application/brute-force.service.ts`

### Findings
- **✅ Global rate limit** prevents basic DoS
- **✅ Application-layer brute-force** with progressive lockout
- **✅ Redis-backed** — survives server restarts
- **⚠️ IP-based key** — NAT environments (e.g., mobile networks) may share IP, causing collateral lockout. Consider combining IP + fingerprint.
- **⚠️ Rate limit bypass in Docker** — `RELAX_RATE_LIMIT=true` disables it entirely (acceptable for internal dev but must be documented for staging)

### Recommendations
1. Consider using IP + `X-Device-Fingerprint` as composite key for login rate limiting
2. Add per-endpoint rate limit overrides (e.g., 5 req/min for `/auth/login`, 30 req/min for `/auth/me`)

---

## 6. Input Validation — ✅ GOOD

### Implementation
| Aspect | Detail |
|---|---|
| Validation library | Zod — schemas for all DTOs |
| Global error handler | `isZodError` → 400 with structured details |
| Phone validation | 11-digit regex with cleanup preprocessing |
| URL validation | Optional URL normalization with scheme enforcement |
| Password length | 6–128 chars |

### References
- `backend/src/modules/auth/presentation/auth.dto.ts` — all Zod schemas
- `backend/src/shared/validation/local-phone.ts`
- `backend/src/shared/validation/website-url.ts`
- `backend/src/shared/validation/zod-error.util.ts`

### Findings
- **✅ Comprehensive Zod schemas** on all public endpoints
- **✅ Preprocessing sanitization** — phone number digit stripping, URL normalization
- **✅ Non-zod errors handled** via `AppError` class hierarchy
- **⚠️ avatarUrl** validation (`UpdateProfileSchema`) — `z.string().max(5_000_000)` — no URL format check (e.g., could be `javascript:alert(1)`). However, this is pre-sanitized in frontend render.
- **❌ No query parameter validation** in some routes — e.g., `deleteUpload` in upload controller just does `parseInt(params.id)` without Zod schema

### Recommendations
1. Validate `avatarUrl` as actual URL format in Zod (similar to `orgWebsite`)
2. Move all route param validation (orgId, branchId, upload IDs) to Zod schemas consistently
3. Add body size limit validation beyond the 10MB fastify global limit

---

## 7. SQL Injection — ✅ GOOD

### Implementation
| Aspect | Detail |
|---|---|
| Query method | `pool.execute('SQL ? ?', [vals])` — parameterized everywhere |
| Dynamic IN clauses | Safe string interpolation with parameterized values for `IN (...)` |
| Raw queries | None found — all queries use parameterized inputs |
| ORM | None — raw SQL with parameterized prepared statements |

### References
- All repository files — every query uses `?` placeholders
- `backend/src/database/mysql.ts` — `mysql2/promise` pool

### Findings
- **✅ 100% parameterized queries** — no string concatenation for values
- **✅ mysql2** uses true prepared statements under the hood
- **⚠️ Dynamic IN clause** in `user.repository.ts:276-279` uses `sportIds.map(() => '(?, ?)')` — correctly parameterized, not injection-prone
- **⚠️ Dynamic SET clause** in `user.repository.ts:180-184` — uses whitelisted column names only (`allowed` array), values are parameterized

### Recommendations
1. Continue strict whitelist approach for dynamic column/table names
2. Consider adding SQL linting to CI (e.g., `sql-lint` or custom ESLint rules)

---

## 8. File Uploads — ✅ GOOD (with minor gaps)

### Implementation
| Aspect | Detail |
|---|---|
| MIME whitelist | `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/heic`, `image/heif`, `application/pdf` |
| Extension blocklist | `.svg`, `.html`, `.js`, `.php`, `.exe`, `.jar`, `.ps1`, etc. (40+ blocked) |
| Magic bytes | Signature verification — JPEG, PNG, WebP, GIF, HEIC, HEIF, PDF |
| SVG banned | Explicit check for SVG mime type AND file extension |
| Image processing | Sharp — converts to WebP/PNG, strips metadata (EXIF), resizes |
| Size limits | 10MB body limit (fastify), 6MB multipart limit, 20MB upload service limit |
| Path traversal | UUID-based filenames (`randomUUID().ext`) — no user-controlled paths |
| Storage isolation | S3 or local filesystem under `/uploads/` prefix |
| Auth on upload | All upload routes require `authMiddleware` |
| Org-specific guard | `requireOrganisationAccess` + custom branch/resource ownership checks |

### References
- `backend/src/app.ts:171-177` — multipart limits
- `backend/src/modules/upload/application/upload.service.ts` — validation + processing
- `backend/src/modules/upload/infrastructure/sharp-processor.ts` — image processing
- `backend/src/modules/upload/presentation/upload.routes.ts` — route guards
- `backend/src/modules/upload/infrastructure/local-storage.provider.ts`
- `backend/src/modules/upload/infrastructure/s3-storage.provider.ts`

### Findings
- **✅ Magic byte verification** — critical defense against MIME-type spoofing
- **✅ Sharp processing** eliminates embedded scripts, EXIF data, and re-encodes to safe formats
- **✅ Extension blocklist** is defensive-in-depth (redundant given mime whitelist + magic bytes)
- **✅ UUID filenames** — no path traversal via user-controlled names
- **⚠️ PDF uploads** are not processed through Sharp (only images are). A PDF with embedded JS is stored as-is. However, the magic byte check validates it's truly a PDF (`%PDF` header). Serving PDFs from `/uploads/` with `Content-Type: application/pdf` means the browser's PDF viewer handles it, reducing JS execution risk.
- **⚠️ No AV/ClamAV scanning** — uploaded files are not scanned for malware
- **⚠️ Duplicate size limits** confuses boundaries: fastify body limit (10MB), multipart limit (6MB), upload service (20MB). These should be aligned.
- **⚠️ Coach certification** inline handler in `upload.routes.ts` duplicates logic from `upload.controller.ts` — the MIME check is repeated

### Recommendations
1. Add **ClamAV** integration (async, queued via Redis — scan on upload, mark file as infected, reject or quarantine)
2. Align size limits — set multipart `fileSize` to 20MB (consistent with upload service)
3. Parse PDF for embedded JavaScript before accepting (use `pdf-parse` or similar)
4. Extract coach certification handler into the controller pattern instead of inline route handler
5. Set `Content-Disposition: attachment` for PDF downloads to prevent in-browser rendering

---

## 9. Secrets Management — ⚠️ NEEDS IMPROVEMENT

### Implementation
| Aspect | Detail |
|---|---|
| .env files | Multiple `.env` / `.env.example` at project root, `backend/`, `frontend/` |
| Docker secrets | Not used — secrets injected via `env_file` in compose |
| Zod env validation | Runtime validation with `safeParse`, exits on invalid config |
| Production checks | `SESSION_SECRET` min 32 chars, rejects dev default in production |
| Payment keys | Optional — `PAYMOB_*` keys, production rejects `mock` provider |
| S3 keys | Optional — `S3_ACCESS_KEY`, `S3_SECRET_KEY` |

### References
- `backend/src/config/env.ts` — Zod schema for all env vars
- `docker-compose.yml` — `env_file: .env` injection
- `backend/Dockerfile:25` — "never bake secrets into the image"

### Findings
- **✅ Runtime env validation** with Zod — fails fast on misconfiguration
- **✅ Dev default rejected in production** — `SESSION_SECRET` cannot be the default dev value
- **⚠️ .env files committed?** — `.env` and `.env.example` both tracked. Need to verify `.gitignore` excludes `.env` (not `.env.example`).
- **⚠️ Docker Compose uses `env_file`** — this leaks secrets into the container environment (`env` command shows them). Docker secrets (swarm or secrets mounts) would be more secure.
- **⚠️ Multiple .env locations** — `backend/.env`, `frontend/.env`, project root `.env` — conflicting values may cause confusion
- **❌ No secret rotation mechanism** — no support for periodic key rotation
- **❌ Encryption at rest not addressed** — no mention of DB encryption for sensitive columns (password_hashes are hashed but other PII like phone/email is in plaintext)

### Recommendations
1. Strip `.env` files from version control (verify `.gitignore` includes `.env` but not `.env.example`)
2. Use **Docker secrets** (`/run/secrets/`) instead of `env_file` for production
3. Add `sops` or `age` encryption for committed secrets (e.g., `.env.secret.enc`)
4. Document the complete required env vars list with security classifications
5. Consider encrypting PII columns (phone, email) at the application level or DB level

---

## 10. Docker Security — ⚠️ NEEDS IMPROVEMENT

### Implementation
| Aspect | Detail |
|---|---|
| Base images | `node:22-alpine` (backend), `nginx:1.27-alpine` (frontend), `mysql:8.0`, `redis:7-alpine` |
| Multi-stage | Builder → runner pattern for both backend and frontend |
| Non-root user | **Not set** — both containers run as `root` |
| Health checks | Backend: custom HTTP health check; MySQL: `mysqladmin ping`; Redis: `redis-cli ping` |
| Init system | `tini` as PID 1 (backend) — handles zombie reaping |
| Dependency pruning | `npm ci --omit=dev --ignore-scripts` — dev deps not in final image |
| Cache cleanup | `npm cache clean --force` |
| Read-only rootfs | Not configured |

### References
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `docker-compose.yml`

### Findings
- **❌ Containers run as root** — critical finding. Neither backend nor frontend Dockerfile uses `USER` directive. If an attacker gains code execution in the container, they have full root access.
- **✅ Multi-stage builds** — dev dependencies and build tooling excluded from production images
- **✅ tini as PID 1** — prevents zombie processes
- **✅ Alpine base** — smaller attack surface
- **⚠️ No image scanning in CI** — `trivy` is mentioned in AGENTS.md but no automated scan in pipeline
- **⚠️ No read-only root filesystem** — uploads volume is writable, but `/app` itself should be read-only
- **⚠️ Docker Compose health checks** are present but `start_period` (20s) may be insufficient for cold MySQL start
- **⚠️ No CPU/memory limits** in compose — containers can exhaust host resources

### Recommendations
1. **CRITICAL: Add `USER node`** to both Dockerfiles (alpine has `node` user by default). For nginx, use `USER nginx`.
2. Add **read-only root filesystem**: `read_only: true` in compose, mount writable tmpfs for temp dirs
3. Run `trivy` image scan in pre-commit or CI pipeline
4. Add resource limits to compose: `deploy.resources.limits.cpus/memory`
5. Set `security_opt: ["no-new-privileges:true"]` in compose

---

## 11. HTTP Headers — ✅ GOOD

### Implementation
| Aspect | Detail |
|---|---|
| CSP (Backend) | `default-src 'self'`, restricted `script-src`, `style-src` with 'unsafe-inline', `frame-ancestors 'none'` |
| CSP (Nginx) | Duplicated + extended with Paymob CDN domains |
| HSTS | `max-age=31536000`, `includeSubDomains`, `preload` |
| X-Frame-Options | `DENY` — prevents clickjacking |
| X-Content-Type-Options | `nosniff` (nginx only) |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `payment=(self)`, camera/microphone/geolocation denied |
| X-XSS-Protection | Explicitly disabled (`false`) — recommended for modern browsers |

### References
- `backend/src/app.ts:84-109` — Helmet config
- `frontend/nginx.conf` — Nginx CSP/headers
- `backend/src/app.ts:220-227` — CSP relaxed for Swagger UI

### Findings
- **✅ Comprehensive CSP** — well-balanced security vs functionality
- **✅ HSTS with preload** — strong HTTPS enforcement
- **✅ Frame-ancestors 'none'** + X-Frame-Options DENY — double protection
- **⚠️ 'unsafe-inline' for style-src** — necessary for CSS-in-JS frameworks but reduces CSP effectiveness
- **⚠️ Swagger UI CSP override** relaxes to `'unsafe-inline'` for scripts — acceptable only when docs are disabled in production
- **⚠️ Nginx CSP connect-src** uses wildcard `*` (line 23, 57, 91 of nginx.conf) — this is too permissive. Should restrict to backend API URL + Paymob endpoints.
- **⚠️ Missing `X-Content-Type-Options: nosniff`** on the backend Helmet config — only set in nginx, but backend directly serves uploads via `@fastify/static`

### Recommendations
1. Fix `connect-src` in nginx.conf — replace wildcard `*` with explicit backend API domain(s)
2. Add `X-Content-Type-Options: nosniff` to backend Helmet config (or `@fastify/static` options)
3. Consider using nonce-based CSP for inline styles instead of `'unsafe-inline'`
4. Ensure Swagger UI `/docs` is only accessible in dev/staging environments (`ENABLE_API_DOCS` already gated — good)

---

## 12. CSRF — ⚠️ NEEDS IMPROVEMENT

### Implementation
| Aspect | Detail |
|---|---|
| SameSite cookies | `SameSite=Lax` — provides basic CSRF protection for top-level navigations |
| CSRF tokens | **Not implemented** |
| Origin/Referer check | Not implemented at middleware level |
| State-changing methods | All use POST/PUT/PATCH/DELETE — not vulnerable to simple `<img>` or `<script>` CSRF |

### References
- `backend/src/shared/utils/auth-cookies.ts` — `sameSite: 'lax'`
- `backend/src/app.ts:152-165` — CORS config

### Findings
- **⚠️ SameSite=Lax** protects against cross-origin POST from external sites but NOT against subdomain-based attacks or top-level GET-based state changes
- **❌ No CSRF token** — fastify has `@fastify/csrf-protection` which is not registered
- **⚠️ CORS credentials: true** + SameSite=Lax is a reasonable posture for an API consumed by a SPA on the same domain, but any other microfrontend/subdomain sharing the root domain could make authenticated requests
- **❌ No `Origin`/`Referer` header validation** — backend does not check these headers on state-changing requests

### Recommendations
1. Register `@fastify/csrf-protection` and generate CSRF tokens, deliver via response header or `csrf_token` cookie
2. As an alternative (or complement), implement `Origin`/`Referer` header validation middleware for state-changing endpoints
3. Add `__Host-` prefix to cookies for stronger path/domain binding

---

## 13. Dependency Security — ⚠️ NEEDS IMPROVEMENT

### Implementation
| Aspect | Detail |
|---|---|
| npm ci | Used in Docker builds with `--ignore-scripts` |
| npm audit | Documented in AGENTS.md but not automated |
| lockfiles | `package-lock.json` committed ✅ |
| Dev dependencies | Excluded from production images |

### Findings
- **✅ Lockfile committed** — deterministic installs
- **✅ `--ignore-scripts`** prevents install-time code execution
- **⚠️ No automated npm audit in CI** — vulnerabilities are only checked when manually run
- **⚠️ Out-of-date dependencies** risk — `mysql:8.0` base image is EOL (ended April 2024); should be `mysql:8.4` or `9.0`
- **⚠️ `--ignore-scripts` blocks legitimate postinstall** — some packages need build scripts (e.g., `sharp` requires `node-gyp` rebuild). Verify sharp works in production.

### Recommendations
1. Add `npm audit --audit-level=high` to CI pipeline
2. Add Dependabot or Renovate for automated dependency updates
3. Add `npm outdated` check to pre-commit
4. Upgrade MySQL to `8.4` LTS or `9.0`
5. Use `snyk` or `trivy` for filesystem vulnerability scanning in CI

---

## Summary

| Category | Rating | Critical Issues |
|---|---|---|
| 1. Authentication | ✅ GOOD | None |
| 2. Authorization | ✅ GOOD | None |
| 3. JWT/Session | ⚠️ NEEDS IMPROVEMENT | No idle timeout, no refresh token reuse detection |
| 4. CORS | ✅ GOOD | None |
| 5. Rate Limiting | ✅ GOOD | None |
| 6. Input Validation | ✅ GOOD | Minor gaps in param validation |
| 7. SQL Injection | ✅ GOOD | None |
| 8. File Uploads | ✅ GOOD | PDF JS risk, no AV scanning |
| 9. Secrets Management | ⚠️ NEEDS IMPROVEMENT | Docker env_file, no secret rotation |
| 10. Docker Security | ⚠️ NEEDS IMPROVEMENT | **Root user in containers** |
| 11. HTTP Headers | ✅ GOOD | Minor CSP connect-src wildcard |
| 12. CSRF | ⚠️ NEEDS IMPROVEMENT | No CSRF tokens, no Origin validation |
| 13. Dependency Security | ⚠️ NEEDS IMPROVEMENT | No automated scanning |

### Top 5 Actionable Recommendations (by severity)

1. **CRITICAL** — Add `USER node` to `backend/Dockerfile` and `USER nginx` to `frontend/Dockerfile` to drop root privileges
2. **HIGH** — Implement refresh token reuse detection (revoke all sessions if a revoked refresh token is used)
3. **HIGH** — Add CSRF protection via `@fastify/csrf-protection` + custom Origin header validation
4. **HIGH** — Add absolute session timeout (24h idle, 7d absolute) and hash password reset tokens
5. **MEDIUM** — Fix CSP `connect-src` wildcard in nginx.conf, add ClamAV file scanning, automate dependency audit in CI

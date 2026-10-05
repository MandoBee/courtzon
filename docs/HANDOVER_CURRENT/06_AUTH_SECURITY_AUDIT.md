# 06 — AUTHENTICATION & SECURITY AUDIT

**Audit:** 2026-10-04 · Status: ✅ IMPLEMENTED · 🟡 PARTIAL · ⏳ NOT IMPLEMENTED · ❌ ISSUE · ❓ UNVERIFIED

---

## 1. Endpoints (verified in `auth.routes.ts`)

| Endpoint | Auth | Rate limit | Notes |
|---|---|---|---|
| `POST /auth/register` | public | 10/min/IP + FF `app.registration_enabled` | player path |
| `POST /auth/register-player` | public | 10/min/IP + FF `player.registration_enabled` | |
| `POST /auth/register-seller` | public | 10/min/IP + FF `seller.registration_enabled` | |
| `POST /auth/register-organization` | public | 10/min/IP + FF `organization.registration_enabled` | |
| `POST /auth/check-uniqueness` | public | 30/min/IP | phone + email check |
| `POST /auth/login` | public | 10/min/IP + brute-force (5/identifier) | creates `user_sessions` + cookies |
| `POST /auth/refresh` | cookie | 30/min/IP | rotation; frontend single-flight |
| `POST /auth/logout` | cookie | 30/min/IP | revokes session |
| `GET /auth/me` | cookie | — | user + roles + permissions |
| `PATCH /auth/profile` | cookie+perm `profile.edit` | — | |
| `PATCH /my/welcome-seen` | cookie+perm `profile.welcome-seen` | — | |
| `GET /my/player-profile` | cookie+perm `player.profile.view` | — | |
| `POST /auth/request-reactivation` | public | 10/min/IP | |
| `POST /auth/forgot-password` | public | 5/15min | |
| `POST /auth/reset-password` | public | 5/15min | |
| `POST /auth/temporary-reset/verify` | public **double-gated** | 5/15min | env flag AND DB FF; disabled in prod by default |
| `POST /auth/temporary-reset` | public **double-gated** | 3/15min | idem |

## 2. Session/token model (verified)

- HttpOnly session cookie (`session_token_hash` in `user_sessions`).
- Refresh token hash in `user_sessions.refresh_token_hash`; `/auth/refresh` rotates.
- `expires_at` / `refresh_token_expires_at`; logout revokes.
- `hashToken()` util; fingerprints device via `X-Device-Fingerprint`.
- Frontend: proactive periodic refresh (`auth.store.ts` `startProactiveRefresh`) keeps roles/permissions freshly applied to existing sessions.

## 3. Password handling

- `users.password_hash` — hashing library/scheme = **❓ UNVERIFIED** (salt rounds unknown; check `shared/utils/` hashing helper before trusting).
- Reset flows rate-limited; temporary reset = email-only (guarded off by default).

## 4. Guards / middleware (verified in `app.ts`)

- Global `preHandler: authMiddleware` on all routes EXCEPT explicit publics (auth, health, `/payments/webhook`, public feature flags, public tournaments, CMS preview paths as declared).
- Org guards: `requireOrganisationAccess`, `requireOrgManageAccess`, `requireOrgPermission` — owner-first, super-admin exception, `user_role_scopes` lookup.
- Policies: `requirePermission(['key'])`, `requireFeatureFlag(key)`.

## 5. Rate limiting / CORS / CSP (verified)

- Rate limit: global 100/min/IP (relaxed if dev or `RELAX_RATE_LIMIT=true`), per-route overrides on auth/payments.
- CORS: allowlist (courtzon.com / courtzon.cloud / localhost:5173/5174) — open in dev/docker-local.
- CSP via helmet (tight directives), Permissions-Policy for payment (Paymob domains), HSTS, frame deny, nosniff.
- CSRF: **no CSRF token mechanism found**; relies on SameSite (⚠️ **SameSite attribute not verified** headlessly). Risk acknowledged.

## 6. Input validation / injection / XSS

- Zod DTOs per route file (`*.dto.ts`) + shared `formatZodErrorDetails`.
- SQL via parameterized `pool.execute` everywhere inspected → ✅ no string interpolation seen.
- XSS: React escaping + CSP; Swagger routes relax CSP only under `/docs`.
- Upload hardening: `upload.service.ts`, `@fastify/multipart` 6MB×6 files, static `/uploads/`.

## 7. Secrets

- `.env` gitignored; `SESSION_SECRET` ≥32 enforced; `JWT_SECRET` optional (Bearers); Paymob keys present. All redacted here.
- **🚨 Production security note:** `.env` currently contains `COURTZON_MIGRATION_ENV=local` — the compose default is `local`; ensure prod sets `production` (migration guard is fail-closed regardless).
- Image `GIT_COMMIT` = `unknown` → builds are not traceable.

## 8. Webhooks

- `POST /payments/webhook` unauthenticated (gateway calls it) — HMAC intended via `handleWebhook(payload, signature)`; **exact HMAC correctness code path NOT audited line-by-line (❓)** — must be verified before real gateway use.
- Notification webhooks (HMAC-signed provider) registered; webhook tables exist.

## 9. Security weaknesses — register (see full version in 29)

| # | Weakness | Severity | Evidence |
|---|---|---|---|
| S1 | Webhook endpoint unauthenticated; HMAC verification not proven by audit | MED-HIGH | `payment.routes.ts:7`, `payment.service.ts handleWebhook` |
| S2 | `/admin` frontend gate uses hardcoded role slugs | MED | `App.tsx` ProtectedRoute/AdminRoute |
| S3 | No CSRF token found (cookie-based session) | MED | codebase search |
| S4 | `financial.reconcile` is broad (refund + sync + recover) | MED | `payment.routes.ts` |
| S5 | Temporary password reset = email-only (guarded, but weak by design) | LOW-MED | `auth.routes.ts` comments + README |
| S6 | If `RELAX_RATE_LIMIT=true` sneaks to prod → open CORS + 2000/min | HIGH (config-guard) | `app.ts` |
| S7 | Push/SMS channels "deliver" mock successes | MED (compliance) | providers + `.env.example` |
| S8 | Phone verification nominal (`is_phone_verified` auto-true; no OTP) | LOW-MED | `users` schema + auth flow |
| S9 | `gitCommit:unknown` — untraceable artifact | LOW | `/health/version` |
| S10 | Org management guard `requireOrgManageAccess` uses `org.staff.manage` perm — any staff role holder could manage org | MED | `route-guard.ts` (design intent) |

## 10. What is NOT implemented

- CSRF token (none) · phone OTP verification · 2FA (event `auth:2fa-setup` exists in notification engine but no UI/endpoint found — **⏳ not implemented**) · audit of every security endpoint (partial).

## 11. Concrete recommendations (ordered)

1. Verify webhook HMAC path + key management (P0 for real payments).
2. Add CSRF protection or SameSite=Strict on session cookies (P1).
3. Move `/admin` to permission-driven gate; remove role-list dependency (P1).
4. Split `financial.reconcile` into per-action permissions (P2).
5. Guardrail CI check forbidding `RELAX_RATE_LIMIT=true` in prod env (P1).
6. Decide OTP/2FA for player identity (P2, business decision).
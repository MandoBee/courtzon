# PHASE 3 — SECURITY HARDENING

**Date:** 2026-06-05
**Scope:** Authentication, Authorization, API Security, Infrastructure, OWASP Top 10

---

## SECURITY SCORECARD

| Category | Score | Notes |
|----------|-------|-------|
| Authentication | 6/10 | Good session management, weak password policy |
| Authorization / RBAC | 7/10 | Permission-gated routes, but granular per-module |
| Session Management | 7/10 | HttpOnly cookies, but plaintext session_token in DB |
| Password Security | 5/10 | PBKDF2-SHA512 (good), min 6 chars (bad) |
| API Security | 6/10 | Rate limiting, helmet, but no CSRF tokens |
| SQL Injection | 9/10 | Parameterized queries everywhere |
| XSS | 8/10 | CSP + helmet, but React dangerouslySetInnerHTML? |
| CSRF | 4/10 | SameSite lax only, no CSRF tokens |
| Upload Security | 8/10 | Magic byte + MIME + extension validation |
| Secrets Management | 4/10 | Root DB user, hardcoded fallback secrets |
| Multi-tenant Isolation | 6/10 | Org-scoped permissions, but owner_id checks bypassable |
| Audit Logging | 7/10 | Comprehensive audit records, silent failure risk |
| Rate Limiting | 7/10 | Global 100 req/min, brute force on login |
| **Overall** | **6.5/10** | |

---

## CRITICAL FINDINGS

### C-01: Database Root User in Production
**Severity:** Critical | **OWASP:** A05:2021 (Security Misconfiguration)
**File:** `.env`
```env
DB_USER=root
DB_PASSWORD=CourtZon2026
```

The application connects to MySQL as `root` — a superuser with no privilege restrictions. A SQL injection or server-side request forgery (SSRF) gives full database control.

**Exploitation Scenario:** Any compromised route with parameterized SQL that uses dynamic table names (which can't be parameterized) can drop tables, read all data, or create backdoor admin accounts.

**Remediation:**
1. Create a dedicated `app_user` with `SELECT, INSERT, UPDATE, DELETE` on `courtzon_v2.*` only
2. Use separate `migration_user` for schema changes
3. Apply via `backend/scripts/setup-db-users.sql`

---

### C-02: Hardcoded Session Secret Fallback
**Severity:** Critical | **OWASP:** A05:2021 (Security Misconfiguration)
**File:** `backend/src/app.ts:125`
```typescript
secret: process.env.SESSION_SECRET || 'dev-cookie-secret-change-in-production',
```

When `SESSION_SECRET` env var is not set, the secret is a hardcoded string. This means cookie signing is trivially forged.

**Exploitation Scenario:** Forge session cookies by crafting HMAC with known secret → session hijacking.

**Remediation:**
```typescript
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET is required in production');
}
secret: process.env.SESSION_SECRET,
```

---

### C-03: Plaintext Session Token in Database
**Severity:** Critical | **OWASP:** A02:2021 (Cryptographic Failures)
**File:** `backend/src/modules/auth/infrastructure/repositories/session.repository.ts:34`

The `session_token` column stores the raw token, not a hash. Refresh tokens ARE hashed (`refresh_token_hash`), but session tokens are compared directly (plaintext equality in SQL WHERE clause).

**Exploitation Scenario:** Database breach reveals all active session tokens. Attacker can use any token to impersonate any active user without needing to crack anything.

**Remediation:**
- Store `hashToken(sessionToken)` instead of raw `sessionToken`
- Add `session_token_hash` column and query on that
- Keep `session_token` only as a delivered client-side value

---

### C-04: Password Policy Too Weak
**Severity:** Critical | **OWASP:** A04:2023 (Insecure Design)
**File:** `backend/src/modules/auth/presentation/auth.dto.ts:12` and `:64`
```typescript
password: z.string().min(6).max(128),   // Registration
newPassword: z.string().min(6).max(128), // Reset
```

Minimum password length of 6 characters violates NIST SP 800-63 (recommends 8+) and OWASP ASVS (recommends 12+ for high-value apps). No complexity requirements.

**Exploitation Scenario:** Brute-force or credential stuffing against 6-character password space (56 billion possibilities for alphanumeric → 20 hours at 1M guesses/sec).

**Remediation:**
- Change `min(6)` → `min(12)` and add complexity: uppercase + lowercase + digit
- Add breached password check (Have I Been Pwned API)
- See NIST SP 800-63B guidelines

---

## HIGH FINDINGS

### H-01: Reset Password Token Leaked in Dev Mode
**Severity:** High | **OWASP:** A05:2021 (Security Misconfiguration)
**File:** `backend/src/modules/auth/application/auth.service.ts:389`
```typescript
if (isDevMode) response.token = token;
```

Developers may accidentally ship with dev mode enabled, exposing password reset tokens in API responses. Token is a 64-character hex string (256-bit) — enough to reset any user's password.

**Remediation:**
```typescript
if (isDevMode) response._debugToken = token; // Prefix with underscore to signal debug-only
```
Or better: only return via `server.log.debug()`, not in the response body.

---

### H-02: Generic Error Throws in Auth Service
**Severity:** High | **OWASP:** A06:2021 (Vulnerable & Outdated Components)
**File:** `backend/src/modules/auth/application/auth.service.ts:33,72,139,226,396,399,455,466`
```typescript
throw new Error(`Country ${input.countryId} not found or has no phone code`);
throw new Error('Invalid or used reset token');
throw new Error('User not found');
```

Generic `Error` objects bypass the `AppError` error handler and are caught by the 500 handler, potentially leaking stack traces in production.

**Exploitation Scenario:** A 500 error for "User not found" reveals user enumeration via timing or error message differences.

**Remediation:** Replace all with typed errors: `NotFoundError`, `ValidationError`, etc.

---

### H-03: No CSRF Protection
**Severity:** High | **OWASP:** A01:2021 (Broken Access Control)
**File:** `backend/src/app.ts:125-126`
```typescript
sameSite: 'lax' as const,
```

Cookies use `sameSite: 'lax'` instead of `'strict'`. No CSRF tokens are implemented. `'lax'` allows cookies on top-level GET navigations — exploitable via cross-site request forgery on state-changing GET endpoints (if any exist) or via POST from subdomains.

**Exploitation Scenario:** Attacker creates a form on evil.com that POSTs to courtzon.com/api/logout or changes email. If user has active session, SameSite=Lax allows top-level navigation.

**Remediation:**
- Change to `sameSite: 'strict'`
- Add CSRF token middleware for state-changing requests
- Implement double-submit cookie pattern

---

### H-04: Plaintext Secrets in Version Control
**Severity:** High | **OWASP:** A05:2021 (Security Misconfiguration)
**File:** `.env`

Repository contains `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, and `MYSQL_PASSWORD` in plaintext. While `.env` is typically `.gitignore`d, this file exists containing production-adjacent secrets.

**Exploitation Scenario:** Accidental commit or CI misconfiguration leaks credentials to GitHub.

**Remediation:**
- Rotate all passwords
- Use `.env.example` with placeholder values only
- Use a secrets manager (AWS Secrets Manager / HashiCorp Vault) in production
- Scan git history for leaked secrets

---

### H-05: `/auth/logout` Missing Auth Middleware
**Severity:** High | **OWASP:** A01:2021 (Broken Access Control)
**File:** `backend/src/modules/auth/presentation/auth.routes.ts:14`
```typescript
app.post('/auth/logout', { errorHandler }, logoutHandler);
```

`/auth/logout` has no `authMiddleware` preHandler. The handler accesses `(request as any).userId` which will be `undefined` when called without authentication. The logout still works by reading the refresh token from cookies, but the audit log records `actorId: undefined`.

**Remediation:** Add `authMiddleware` preHandler to `/auth/logout`.

---

### H-06: Cookie `secure` Disabled in Non-Production
**Severity:** High (when deployed without HTTPS)
**File:** `backend/src/shared/utils/auth-cookies.ts:10`
```typescript
secure: isProd,
```

Auth cookies are sent over plain HTTP when `NODE_ENV !== 'production'`. If staging/QA environments are exposed to the internet without HTTPS, session tokens are transmitted in cleartext.

**Remediation:** Always set `secure: true` when not on localhost, regardless of NODE_ENV.

---

### H-07: `/auth/me` Route Inconsistency
**Severity:** High
**File:** `backend/src/modules/auth/presentation/auth.routes.ts:15`
```typescript
app.get('/auth/me', { errorHandler }, meHandler);
```

`/auth/me` skips `authMiddleware` but manually calls `resolveSessionUserId()`. While functional, it creates an inconsistent pattern where custom routes may bypass middleware entirely.

**Remediation:** Add explicit `authMiddleware`, or move the route to a separate authenticated prefix.

---

## MEDIUM FINDINGS

### M-01: No Rate Limiting on Password Reset
**Severity:** Medium | **OWASP:** A04:2023 (Insecure Design)
**File:** `backend/src/modules/auth/presentation/auth.routes.ts:17-18`

`/auth/forgot-password` and `/auth/reset-password` have no rate limiting beyond the global 100 req/min. An attacker can brute-force reset tokens or spam email.

**Remediation:** Add `requireRateLimit` with 3 req/min on forgot-password and 10 req/min on reset-password.

---

### M-02: IP-Based Brute Force Can Be Bypassed
**Severity:** Medium
**File:** `backend/src/modules/brute-force/application/brute-force.service.ts`

The brute-force key is IP-based (`brute:login:${identifier}` where `identifier = request.ip`). An attacker behind a botnet (distributed IPs) can make 5 attempts per IP without triggering lockout.

**Remediation:** Combine IP + phone number + device fingerprint into the lockout key.

---

### M-03: Missing __Host- Cookie Prefix
**Severity:** Medium
**File:** `backend/src/shared/utils/auth-cookies.ts`

Auth cookies lack the `__Host-` prefix which would enforce:
- `path=/` (already set)
- `secure=true` (not always applied)
- No domain attribute (prevents subdomain cookie leakage)

**Remediation:** Set cookie names to `__Host-session_token` and `__Host-refresh_token`.

---

### M-04: No 2FA / MFA
**Severity:** Medium | **OWASP:** A04:2023 (Insecure Design)

No multi-factor authentication support for any role, including super_admin. A compromised super_admin password grants full system control.

**Exploitation Scenario:** Phishing attack captures super_admin credentials → attacker accesses security dashboard, changes permissions, views all data.

**Remediation:** Add TOTP-based 2FA for admin roles (super_admin, org-admin at minimum).

---

### M-05: Refresh Token Rotation Without Device Binding
**Severity:** Medium
**File:** `backend/src/modules/auth/application/auth.service.ts:340-351`

On token refresh, the old session is revoked and a new one is created. However, the new session is not bound to the same device fingerprint — an attacker who steals a refresh token can use it from any device.

**Remediation:** Verify device fingerprint matches during refresh. If mismatched, revoke all sessions and flag for security review.

---

### M-06: No Input Rate Limit on Login
**Severity:** Medium
**File:** `backend/src/modules/auth/presentation/auth.controller.ts:93-153`

The brute-force lockout is application-level, not Fastify rate-limit level. The global API rate limiter (100 req/min) is the only network-level protection.

**Remediation:** Add dedicated rate limiter on `/auth/login` (10 req/min per IP).

---

### M-07: Avatar URL Not Sanitized Against XSS
**Severity:** Medium
**File:** `backend/src/modules/auth/presentation/auth.dto.ts:52`
```typescript
avatarUrl: z.string().max(5_000_000).nullable().optional(),
```

Avatar URL accepts any string up to 5MB with no URL validation. While stored in DB and returned as JSON (minimal XSS risk in React), if rendered directly in an `<img src>` or `<a href>` tag, it's an open redirect vector.

**Remediation:** Add `.url()` validation to avatarUrl, or sanitize on output.

---

### M-08: No Rate Limiter on Brute-Force Redis Commands
**Severity:** Medium
**File:** `backend/src/modules/brute-force/application/brute-force.service.ts:19-22`

Each failed login attempt generates 2-3 Redis commands. With 100 req/min (global limit), this is fine. But with distributed brute force, Redis can be overwhelmed.

**Remediation:** Add rate limiting with sliding window to the brute-force module itself.

---

## LOW FINDINGS

### L-01: SameSite Could Be Strict
**Severity:** Low
`sameSite: 'lax'` → `sameSite: 'strict'` for all auth cookies.

### L-02: Missing `X-Content-Type-Options: nosniff`
**Severity:** Low
Already set by helmet by default. Verified.

### L-03: CSP Allows `'unsafe-inline'` for Styles
**Severity:** Low
`styleSrc: ["'self'", "'unsafe-inline'"]` — required by React/ShadCN. Acceptable trade-off.

### L-04: Password Reset Token in Email Link
**Severity:** Low
Reset token is passed as URL query parameter: `/reset-password?token=${token}` — may be logged by proxies/analytics. Acceptable for v1.

### L-05: Forgot Password Reveals Timing
**Severity:** Low
Response is uniform ("If that email is registered..."), but DB lookup timing could theoretically be used for enumeration.

### L-06: Missing Rate Limit Headers
**Severity:** Low
Fastify rate-limit sends `Retry-After` header but not `X-RateLimit-*` headers.

---

## OWASP TOP 10 MAPPING

| OWASP Category | Status | Critical Findings |
|----------------|--------|-------------------|
| A01: Broken Access Control | ⚠️ Partial | `/auth/logout` no middleware |
| A02: Cryptographic Failures | 🔴 Weak | Plaintext session_token in DB, weak password |
| A03: Injection | ✅ Good | All queries parameterized |
| A04: Insecure Design | 🔴 Weak | No 2FA, weak password policy, no CSRF |
| A05: Security Misconfiguration | 🔴 Critical | Root DB user, hardcoded secrets |
| A06: Vulnerable Components | ⚠️ Partial | Generic Error throwing |
| A07: Authentication Failures | ⚠️ Partial | No MFA, weak password |
| A08: Integrity Failures | ⚠️ Partial | No CSRF tokens |
| A09: Logging Failures | ⚠️ Partial | Silent audit-log failures |
| A10: SSRF | ✅ N/A | Not applicable to current scope |

---

## PRIVILEGE ESCALATION PATHS

### Path 1: User → Super Admin via Role Assignment
**Risk:** Medium
If a regular user can somehow assign themselves any role (e.g., via an unprotected `POST /user-roles` endpoint), they become super_admin.

**Current protection:** `POST /user-roles` uses `superAdminGuard`.
**Remaining risk:** Any bug in the guard (e.g., the `catch` block returning 500, failing open) allows escalation.

### Path 2: Cross-Organisation Data Access
**Risk:** Medium
The `requireOrganisationAccess` guard checks `owner_id` and `user_role_scopes`. If an org-scoped role is incorrectly assigned to a user for the wrong org, they can access another org's data.

**Current protection:** Scope table with explicit checks.
**Remaining risk:** Scopes are set once during role cloning — no periodic re-validation.

### Path 3: IDOR via Sequential IDs
**Risk:** Low
Most tables use auto-increment integer IDs. A user could guess `booking/12345` to access another user's booking.

**Current protection:** Public IDs (UUIDs) are exposed, but WHERE clauses filter by `user_id` via the service layer. If a route doesn't filter by `user_id`, IDOR is possible.

---

## MULTI-TENANT ISOLATION RISKS

| Risk | Level | Description |
|------|-------|-------------|
| Org scope bypass | Medium | `requireOrgScopedPermission` checks scopes once. If scope is revoked, session token remains valid until expiry. |
| Shared DB | Medium | All tenants share the same database. A SQL injection in any tenant leaks ALL data. |
| Resource ID overlap | Low | Resource IDs are global, not tenant-scoped. Separate branches have non-overlapping IDs by auto-increment. |
| File storage | Low | Uploads stored in `{entityType}/{fileCategory}/{uuid}.ext` per tenant. No cross-tenant file access. |

---

## EXPLOITATION SCENARIOS (Priority Order)

### Scenario 1: Database Compromise → Total System Takeover
1. Attacker exploits any vulnerability (SSRF, SQLi in dynamic query, dependency exploit)
2. Connection is as `root` user (C-01)
3. Attacker creates new super_admin user, reads all data, drops tables
4. **Impact:** Complete system compromise | **Prevention:** C-01 fix

### Scenario 2: Cookie Forging → Session Hijacking
1. Attacker knows `SESSION_SECRET` is the hardcoded fallback (C-02)
2. Forges valid session cookie with arbitrary userId
3. Gains access as any user, including super_admin
4. **Impact:** Full account takeover | **Prevention:** C-02 fix

### Scenario 3: DB Breach → Mass Account Takeover
1. Attacker dumps `user_sessions` table
2. All session tokens are in plaintext (C-03)
3. Uses any active session token to impersonate users
4. **Impact:** 100% account compromise | **Prevention:** C-03 fix

### Scenario 4: Weak Password → Credential Stuffing
1. Attacker obtains credential dump from a previous breach
2. Users with 6-character passwords match
3. Attacker logs in as real users
4. **Impact:** Account takeover for weak passwords | **Prevention:** C-04 fix

---

## REMEDIATION PLAN

### P0 — Immediate (24 hours)

| # | Finding | Fix | Effort |
|---|---------|-----|--------|
| 1 | C-01: Root DB user | Create `app_user` with limited grants; update .env | 1 hour |
| 2 | C-02: Hardcoded session secret | Enforce env var check in production | 15 min |
| 3 | C-04: Weak password policy | Change min 6 → min 12 + complexity | 30 min |
| 4 | H-01: Reset token leak | Remove `response.token` from dev mode | 15 min |

### P1 — High Priority (1-2 days)

| # | Finding | Fix | Effort |
|---|---------|-----|--------|
| 5 | C-03: Plaintext session token | Hash session tokens in DB + query by hash | 2 hours |
| 6 | H-02: Generic Error throws | Replace all generic `Error` with typed errors | 1 hour |
| 7 | H-03: No CSRF protection | Add CSRF middleware | 3 hours |
| 8 | H-05: Logout missing auth | Add authMiddleware to logout route | 15 min |

### P2 — Medium Priority (3-5 days)

| # | Finding | Fix | Effort |
|---|---------|-----|--------|
| 9 | H-04: Secrets in .env | Rotate creds, use .env.example, secrets manager | 1 day |
| 10 | H-06: Cookie secure flag | Always secure except localhost | 30 min |
| 11 | M-01: No forgot-password rate limit | Add rate limiters | 1 hour |
| 12 | M-03: Cookie prefix | Add `__Host-` prefix to cookie names | 30 min |

### P3 — Future (1-2 sprints)

| # | Finding | Fix | Effort |
|---|---------|-----|--------|
| 13 | M-04: No 2FA | TOTP-based 2FA for admin roles | 3 days |
| 14 | M-05: Refresh token device binding | Verify device fingerprint on refresh | 1 day |
| 15 | M-02: Distributed brute force | Multi-factor key (IP + phone + device) | 2 hours |
| 16 | Audit trailing everywhere | Audit all state-changing operations consistently | 2 days |

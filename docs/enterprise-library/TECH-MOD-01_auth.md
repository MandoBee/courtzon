---
document_id: "TECH-MOD-01"
document_name: "Auth Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 15
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Security Lead"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-20"]
  related: ["TECH-MOD-02", "TECH-MOD-10"]
---

# Auth Module (TECH-MOD-01)

**Source:** `backend/src/modules/auth/` (7 entries: domain/, application/, commands/, contracts/, infrastructure/, presentation/, __tests__/)

## 1. Purpose

Handles user registration, authentication, session management, password reset, and player profile. Four registration flows: general, player, seller, and organisation. JWT-based session tokens with device tracking and brute-force protection.

## 2. Architecture

Hexagonal (ports & adapters):

```
presentation/
  auth.routes.ts   — 17 endpoints
  auth.controller.ts   — 335 lines, request handlers
  auth.dto.ts          — Zod validation schemas
application/
  auth.service.ts      — 667 lines, singleton use-case orchestrator
domain/
  auth-aggregate.ts    — AccountStatus type, canLogin guard
  auth.errors.ts       — Domain-specific error classes
infrastructure/
  repositories/
    user.repository.ts
    session.repository.ts
    device.repository.ts
```

**Evidence:** Source files at `backend/src/modules/auth/presentation/auth.routes.ts` (17 routes), `backend/src/modules/auth/domain/auth-aggregate.ts` (AccountStatus type), `backend/src/modules/auth/application/auth.service.ts` (667 lines).

## 3. Routes (all 17)

Defined in `auth.routes.ts:7-37`:

| # | Method | Path | Auth | Feature Flag | Purpose |
|---|--------|------|------|-------------|---------|
| 1 | POST | `/auth/register` | No | `app.registration_enabled` | General registration |
| 2 | POST | `/auth/register-player` | No | `player.registration_enabled` | Player registration |
| 3 | POST | `/auth/register-seller` | No | `seller.registration_enabled` | Seller registration |
| 4 | POST | `/auth/register-organization` | No | `organization.registration_enabled` | Org registration |
| 5 | POST | `/auth/check-uniqueness` | No | — | Check email/phone uniqueness |
| 6 | POST | `/auth/login` | No | — | Login (brute-force gated) |
| 7 | POST | `/auth/refresh` | No | — | Refresh access token |
| 8 | POST | `/auth/logout` | No | — | Logout, revoke session |
| 9 | GET | `/auth/me` | No | — | Get current user |
| 10 | PATCH | `/auth/profile` | Yes | — | Update profile |
| 11 | PATCH | `/my/welcome-seen` | Yes | — | Mark welcome seen |
| 12 | GET | `/my/player-profile` | Yes | — | Get player profile |
| 13 | POST | `/auth/request-reactivation` | No | — | Request account reactivation |
| 14 | POST | `/auth/forgot-password` | No | — | Forgot password |
| 15 | POST | `/auth/reset-password` | No | — | Reset password |
| 16 | POST | `/auth/temporary-reset/verify` | No | `auth.temporary_password_reset_enabled` | Temp verify email |
| 17 | POST | `/auth/temporary-reset` | No | `auth.temporary_password_reset_enabled` | Temp password reset |

**Evidence:** Route definitions in `auth.routes.ts` lines 7-37. Rate limiting on temp routes (5/15min and 3/15min).

## 4. Permissions

Routes use `authMiddleware` (JWT verify) and feature flag guards. No granular permission checks — auth is identity-only.

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| User | `users` | `id, public_id, email, phone, password_hash, full_name, gender, birth_date, account_status` |
| Session | `sessions` | `id, user_id, token_hash, refresh_token_hash, device_info, ip, expires_at` |
| Device | `user_devices` | `id, user_id, fingerprint, device_name, last_ip` |
| Player Profile | `player_profiles` | `user_id, sport_id, skill_level, playing_hand, experience_years` |

**Evidence:** `auth-aggregate.ts:1` defines `AccountStatus = 'active' | 'suspended' | 'pending' | 'rejected'`.

## 6. Events

Emitted via `eventBusV2` (see `auth.service.ts`):
- `user:registered`
- `user:logged_in`
- `user:logged_out`
- `user:password_reset`
- `user:reactivated`

## 7. State Machine

Account status transitions (defined in `auth-aggregate.ts`):
```
pending → active (on approval)
active → suspended (by admin)
active → rejected (if reinstatement denied)
```

`canLogin(credentials)` returns `true` only when `accountStatus === 'active'`.

## 8. Audit Events

All state-changing operations record audit logs (see `auth.controller.ts`):
- `USER.REGISTER` — on any registration flow
- `USER.LOGIN` — on successful login
- `USER.LOGIN_FAILED` — on failed login (from brute-force)
- `USER.PASSWORD_RESET` — on password change
- `USER.DELETE` — on account deletion

**Evidence:** `auth.controller.ts:25-33` shows `recordAudit({ action: 'USER.REGISTER', ... })`.

## 9. Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `SESSION_ACCESS_TOKEN_EXPIRY` | `15m` | Access token TTL |
| `SESSION_REFRESH_TOKEN_EXPIRY` | `30d` | Refresh token TTL (remember me) |
| `SESSION_REFRESH_TOKEN_SESSION_EXPIRY` | `24h` | Refresh token TTL (no remember) |
| `SESSION_MAX_DEVICES` | `5` | Max concurrent sessions per user |

**Evidence:** `auth.service.ts:42-45` parses these env vars.

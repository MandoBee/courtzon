# 48 — TEST IDENTITIES CREATED

**Target:** `187.127.72.93:3307 / courtzon_v3` · **Creation executed:** 2026-10-05 ~01:5x UTC
**Mode:** controlled test-data creation via the real application API (API-first, per blueprint 47). No business transactions.

> Credential handling: the temporary administrative account provided by the owner was used ONLY for the guarded TEST_* calls, kept in memory / deleted immediately after, and is **not written anywhere** (no file, no Git, no report, no log). Owner will rotate the password/revoke the session after this process.

---

## 1. Target confirmation
187.127.72.93:3307 / courtzon_v3 · MySQL 8.0.46 · backend RUNNING healthy (DB 1ms, Redis 1ms) · migration_history 201 · cleaned state confirmed before creation (bookings/tournaments/orders/payments/ledger all 0).

## 2. Creation timestamp
2026-10-05 ~01:5x UTC (sequential API calls).

## 3. TEST_ORG
- `organisations` id **35** · name `TEST_ORG` · slug `test-org-127` · org_type_id 1 (sports-club) · country_id 1 · owner user 127 · is_active **1** · is_verified **1** (auto-approved free-plan registration).
- `organisation_subscriptions` id 35 → plan 3 (Freemium Club, 0.00) **status active**.

## 4. TEST_MAIN_BRANCH
- `branches` id **21** · name `TEST_MAIN_BRANCH` · organisation_id 35 (created via `POST /org/35/branches` with owner session).

## 5. TEST resource/court
- `resources` id **6** · name `TEST_COURT_1` · branch_id 21 · resource_type_id 2 (Padel Court) · sport_id 19 (created via `POST /org/35/resources`).

## 6. Every TEST identity (see section 7/8 for roles & scopes)

| # | user_id | full_name | email | role(s) |
|---|---|---|---|---|
| 1 | 126 | TEST_SUPERADMIN | test.superadmin01@courtzon.test | player + **super_admin** |
| 2 | 127 | TEST_ADMIN | test.admin01@courtzon.test | player + **org-admin** (cloned for org 35) |
| 3 | 128 | TEST_MANAGER | test.manager01@courtzon.test | player + **branch-mgr** |
| 4 | 129 | TEST_RECEPTIONIST | test.receptionist01@courtzon.test | player + **receptionist** |
| 5 | 130 | TEST_ACCOUNTANT | test.accountant01@courtzon.test | player + **accountant** |
| 6 | 131 | TEST_COACH | test.coach01@courtzon.test | player + **coach** (+ coach profile approved) |
| 7 | 132 | TEST_REFEREE | test.referee01@courtzon.test | player + **referee** (+ referees row approved) |
| 8 | 133 | TEST_PLAYER | test.player01@courtzon.test | player |
| 9 | 134 | TEST_PLAYER2 | test.player02@courtzon.test | player |
| 10 | 135 | TEST_SELLER (player) | test.seller01@courtzon.test | player (spare; see note in 11) |
| 11 | 136 | TEST_SELLER | test.sellerorg01@courtzon.test | player + **shop-admin** (cloned for TEST_SHOP org 36) |

(All test users share one single TEST password managed out-of-band — not recorded here.)

## 7. Role assignment
- `TEST_SUPERADMIN` (126): global `super_admin` via `POST /user-roles`.
- `TEST_ADMIN` (127): `org-admin` cloned for org 35 (auto by `register-organization`).
- `TEST_MANAGER/RECEPTIONIST/ACCOUNTANT` (128/129/130): `branch-mgr`, `receptionist`, `accountant` global roles + org scope.
- `TEST_COACH` (131): `coach` role + org scope; `coach_profiles` **approved** via admin approve.
- `TEST_REFEREE` (132): `referee` role + org scope → `referees` row auto-created (approved).
- `TEST_SELLER` (136): `shop-admin` cloned for TEST_SHOP org 36 (auto by `register-seller`).
- Verified via DB: roles per user exactly as above; no unintended global role grants (TEST users hold only player + their intended role).

## 8. Scope assignment (user_role_scopes, verified)
- org 35 scope: users 127,128,129,130,131,132 (organisation scope).
- org 36 scope: user 136.
- TEST_SUPERADMIN: global (no scope). TEST_PLAYER/PLAYER2/135: no admin scope.
- (Branch-level scope for TEST_MANAGER is not assigned — org scope covers TEST_ORG operations; can be refined later if the manager role needs branch-only isolation.)

## 9. Profile relationships (verified in DB)
- `player_profiles`: 11 rows for user_ids 126–136.
- `coach_profiles`: user 131 status **approved**.
- `referees`: user 132 status **approved**, deleted_at NULL.
- TEST_SHOP organisation id 36 (org_type 10, owner 136) + its main branch + shop-admin scope.

## 10. Wallet creation
- Each registered user got `user_wallets` auto-created (balance 0.00) — 11 wallets for 126–136. No manual balances, no transactions.

## 11. Referee creation method
Real API workflow: `POST /user-roles` with role `referee` → `rbac.service.assignRole` auto-inserted `referees (user_id, status='approved')` (verified code `rbac.service.ts:117-124` + DB row).

## 12. Coach activation method
Real API workflow: user self-created `coach profile` via `POST /coaches/profile` (sets pending) → admin `PATCH /admin/users/131/coach/approve` → `coach_profiles` status **approved** (verified).

## 13. API endpoints / workflows used
- `POST /auth/register-player` (11×), `POST /auth/register-organization` (1×), `POST /auth/register-seller` (1×, free Freemium Shop plan → auto-approved), `POST /user-roles` (6× guarded), `PATCH /admin/users/131/coach/approve` (guarded), `POST /coaches/profile`, `POST /org/35/branches`, `POST /org/35/resources`, `POST /marketplace/player/activate` (attempted → **403 FORBIDDEN** for player role; superseded by register-seller org path).
- All guarded calls performed with the temporary administrative session provided by the owner.

## 14. Records created by each operation
- register-player ×11 → users/player_profiles/wallets/player-role/session.
- register-organization → org 35 + owner + org-admin clone role + scope + subscription(plan 3, active) + upgrade request.
- register-seller → shop org 36 + main branch + shop-admin clone role + scope + subscription(plan 5, active) + upgrade request.
- user-roles → user_roles rows + user_role_scopes (+ referees row for 132).
- coaches/profile + approve → coach_profiles approved.
- branches → branch 21; resources → resource 6.
- Register-side notification side effects: **18 notification rows** (allowed identity-registration events per blueprint §12).

## 15. Pre/post fingerprints
| Group | Before | After | Delta |
|---|---|---|---|
| users | 28 | 39 | +11 TEST |
| organisations | 17 | 19 | +2 (35 TEST_ORG, 36 TEST_SHOP) |
| branches | 14 | 16 | +2 (21, +shop main branch) |
| resources (courts) | 5 | 6 | +1 TEST_COURT_1 |
| roles (global) | 24 | 24 | 0 (clones: 42→44 total org-scoped) |
| permissions | 971 | 971 | 0 |
| user_wallets | 28 | 39 | +11 |
| organisation_subscriptions | 19 | 21 | +2 (plan 3 & 5 active) |
| notifications | 0 | 18 | +18 (registration events) |
| upgrade_requests (test orgs) | 0 | 2 | +2 |

## 16. Real-data protection verification
- Real users: 28 → 28 (UNCHANGED) · Real organisations 17 (ids ≠ 35/36) UNCHANGED · Real branches 14 (≠ 21) · permissions 971 UNCHANGED · global roles 24 UNCHANGED · no real org/branch/resource/user/profile/seller modified. Only TEST-labelled rows + org clones for TEST orgs were added.

## 17. Business-data verification
bookings 0 · tournaments 0 · orders 0 · payments 0 · ledger_entries 0 · general_ledger 0 · financial_entitlements 0 · marketplace transactions 0 · academy 0 · membership subscriptions 0. **No business data created** (only the documented registration side effects: sessions, wallets, notifications, upgrade requests, org clones for TEST orgs).

## 18. Warnings
- `POST /marketplace/player/activate` returned 403 (player role lacks `marketplace.player.activate` in Production); a supported seller path (`register-seller` free shop) was used instead → **TEST_SELLER = user 136** (TEST_SHOP org). User 135 remains TEST_SELLER-named but is a plain player (spare).
- TEST_MANAGER has org scope (branch scope optional refinement).
- All TEST emails/phones use the reserved `test.*@courtzon.test` / `010000101xx` block; uniqueness confirmed (no collision with 28 real users).

## 19. Unresolved items
- None blocking. (Branch-level scope refinement for TEST_MANAGER and additional TEST courts can be added on demand.)

---

```
TEST IDENTITIES:
CREATED

TEST ORGANIZATION:
READY   (id 35, active+verified, branch 21, court 6, subscription plan 3 active, org-admin role+scope)

RBAC:
VERIFIED (roles/scopes per identity; super_admin for 126; org clones for 35/36; no unintended grants)

PROFILES:
VERIFIED (player 11×, coach 131 approved, referee 132 approved, shop-admin for 136)

ISOLATION:
VERIFIED (all TEST rows scoped/isolated; real data untouched)

REAL DATA:
UNCHANGED (users 28, orgs 17, branches 14, permissions 971, global roles 24)

BUSINESS DATA:
NOT CREATED
```

**Stopped after this report.** No tournament, bookings, orders, or payments were created. Next step (business/TEST_* testing phases) awaits human review.
# 47 — TEST IDENTITY CREATION BLUEPRINT

**Audit:** 2026-10-05 · **Target:** `187.127.72.93:3307 / courtzon_v3` (cleaned + restored; `46`: SUCCESS)
**Mode:** READ-ONLY analysis of live schema + application code. Nothing created.

---

## 1. Current Production assumptions (verified)

- Database cleaned: business tables empty; KEEP/REVIEW intact (PLAN 40/45).
- Master/reference data present: countries 8 · currencies 7 · sports 16 · sport_formats 3 · sport_rule_sets 3 · organisation_types 5 (incl. `shop`) · tournament_bracket_types 4 · tournament_age_categories 7 · player_levels 5 · payment_methods 6 · subscription_plans 7 · product_categories 118.
- State: users 28 (real operators; user id=1 = Super Admin) · organisations 17 · branches 14 · resources (courts) 5 · roles: 24 global (`super_admin`,`master-admin`,`player`,`org-admin`,`branch-mgr`,`receptionist`,`accountant`,`coach`,`referee`,`tournament-manager`,...) + per-org clones · permissions 971.
- Feature flags: `app.registration_enabled`,`player/seller/organization.registration_enabled`,`app.tournaments_enabled` = **enabled**; backend running (46).
- Registration flows (verified `auth.service.ts`): `registerPlayer` auto-creates `users` + `player_profiles` + `user_wallets` + `player` role + session. `registerSeller` additionally creates a **Shop** organisation (is_verified=FALSE, is_active=FALSE) + main branch + cloned `shop-admin` role + org scope + optional plan + upgrade request. `registerOrganization` creates organisation + branch + subscription (+ org-admin ownership).

## 2. Required TEST identities

| Identity | Role(s) | Org scope | Purpose |
|---|---|---|---|
| TEST_SUPERADMIN | super_admin (global) | none | admin flows, role/permission assignment, sysadmin screens |
| TEST_ORG | organisation (org_type e.g. `sports_club`/available type) | itself | tenant for all other TEST identities; bookings/tournaments/courts |
| TEST_ADMIN | org-admin (cloned for TEST_ORG) | TEST_ORG | org settings, plans/versions, staff, finance, tournaments mgmt |
| TEST_MANAGER | branch-mgr | TEST_ORG branch | branch-scoped bookings/ops |
| TEST_RECEPTIONIST | receptionist | TEST_ORG | cash confirmations, check-in |
| TEST_ACCOUNTANT | accountant | TEST_ORG | ledger/reports/view |
| TEST_COACH | coach | TEST_ORG (+branch) | sessions/coaching; needs `coach_profiles` approved |
| TEST_PLAYER | player (default) | none (public) | bookings, payments, tournament participant, matches |
| TEST_PLAYER2 | player | none | opponent for matches, conflicts, 2-window realtime |
| TEST_SELLER | player + player-seller (`seller_profiles`) | none/personal | marketplace product/order tests |
| TEST_REFEREE | referee | none or TEST_ORG | referee for tournament matches; needs `referees` row + availability |

## 3. Required roles/scopes

- Create TEST_ORG-cloned org roles for staff by cloning global templates (rbac `cloneRoleForOrg` + `assignRole` + `setUserRoleScope`): `org-admin`, `branch-mgr`, `receptionist`, `accountant`, (`tournament-manager` for tournament mgmt if desired), `coach`, `referee`.
- `user_role_scopes`: org scope rows `(scope_type='organisation', scope_id=TEST_ORG.id)` for org roles; `(scope_type='branch', scope_id=TEST_BRANCH.id)` for branch-mgr; resource scope only if desired.
- `TEST_SUPERADMIN`: global `super_admin` role (no scope).

## 4. Required organisation structure

`TEST_ORG`: name/slug unique (`test-org`), country (pick any of the 8), org_type (one of 5). Created by `registerOrganization` (creates org + main branch + subscription `pending` + owner org-admin) OR by admin API. Then add via admin: TEST_BRANCH(es), courts = `resources` (resource_type available), pricing (pricing_rules/peak config optional), branch financial details, membership settings if needed.

## 5. Required profiles

- `player_profiles` — auto-created by `registerPlayer` (user_id UNIQUE; needs main_sport_id preferred for tournament eligibility).
- `coach_profiles` — needs `coach_profiles` row (status=approved, is_verified=1, platform_status=active) + player_profiles.coach_status. API: admin coach toggle (activities module) — **flag: verify endpooint in execution**; fallback DB insert documented (section 8).
- `seller_profiles` — via `activatePlayerSell`/`upgradeToSeller` (marketplace.service) for player-seller (recommended for tests, avoids inactive Shop org) — **flag: org-based seller requires approval**.
- `referees` — `referees` profile row + `user_devices` n/a + availability optional. Creation API **to verify** in execution; fallback DB insert documented.

## 6. Required dependencies (per identity)

- All users require: `users` insert (public_id UUID, country_id valid, phone_number + full_phone E.164 **unique**, email **unique**, password_hash, full_name, gender, birth_date optional, language_id optional, timezone default, account_status active, is_phone_verified TRUE by convention per schema note) → plus `player_profiles`, `user_wallets` (currency derived from country default_currency), `user_roles` (player role), session (auto).
- Staff identities additionally require org-cloned role + `user_role_scopes`.
- TEST_ORG requires: organisation_types row, countries row, (payment_methods for cash/card), subscriptions_plans row only if commission/pricing tests need plan.
- Tournament test requires TEST_ORG + TEST_BRANCH + resource (court) + `sports`, `sport_formats`(match_format_id), `sport_rule_sets`(rule_set_id), `tournament_bracket_types`(bracket_type_id), ≥2 participants (TEST_PLAYER/2), referee, start_date (mandatory), price_type/entry_fee, registration opens/closes.
- Wallet: auto-created on registration (user_wallets.balance 0). No manual wallet needed.

## 7. Exact creation order (dependency-safe)

1. **Verify** master data + flags (section 1).
2. **TEST_SUPERADMIN** (so an actor exists for RBAC assignment) — create user + assign `super_admin` role.
3. **TEST_ORG** via `POST /auth/register-organization` (creates org + main branch + subscription) → then admin-adds branches/courts/pricing.
4. **TEST_ADMIN / TEST_MANAGER / TEST_RECEPTIONIST / TEST_ACCOUNTANT** — each: `registerPlayer` (bare user; player default) → admin assigns cloned org role(s) + org/branch scopes.
5. **TEST_COACH** — user + `coach` role + `coach_profiles` approved (API or documented insert).
6. **TEST_REFEREE** — user + `referee` role + `referees` row (+availability).
7. **TEST_SELLER** — user + `activatePlayerSell` (player-seller) [preferred] or `registerSeller` (Shop org requires activation for org-seller flows).
8. **TEST_PLAYER, TEST_PLAYER2** — `registerPlayer`.
9. **Optional org setup for tournaments**: active subscription/plan for commission; branch financial details; verify courts list.

This order guarantees no missing parent (org before staff; staff roles before scopes; users before profiles — the app does it atomically per flow).

## 8. API vs DB creation recommendation

| Creation | Method | Notes |
|---|---|---|
| users/player_profiles/wallets/player role | **API** (`registerPlayer`) | app-generated ids/sessions |
| organisation + branch | **API** (`registerOrganization`) | app generates public_ids |
| org role clone + assignments + scopes | **API** (admin RBAC endpoints; `rbac.repository` cloneRoleForOrg/assignRole/setUserRoleScope) | never bypass |
| seller player activation | **API** (activatePlayerSell/upgradeToSeller) | creates seller_profiles |
| court (resource) creation | **API** (admin resources) | preserves pricing hooks |
| coach_profiles approval | API (admin coach toggle) — **verify endpoint availability** | **fallback:** documented DB INSERT (`coach_profiles(user_id,status='approved',is_verified=1,platform_status='active')`) — to be executed only with approval |
| referees profile | API if exposed — **verify** | **fallback:** documented DB INSERT (`referees` + role clone) with approval |
| tournament | **API** (`POST /org/:orgId/tournaments`) | server injects organisation_id; commission derived from subscription |
| payments/ledger/entitlements/notifications | **API** only (tests) | never direct SQL |

## 9. Naming convention (validated against schema)

- `full_name`: `TEST_SUPERADMIN`, `TEST_ADMIN`, `TEST_MANAGER`, `TEST_RECEPTIONIST`, `TEST_ACCOUNTANT`, `TEST_COACH`, `TEST_PLAYER`, `TEST_PLAYER2`, `TEST_SELLER`, `TEST_REFEREE`.
- `email`: `test.<role>01@courtzon.test` (lowercase, unique).
- `phone_number` (local) + `full_phone` (E.164): use the chosen country's prefix (e.g. Egypt +20) with clearly unique pattern `0100TESTNN` isn't numeric-valid — use numeric-only reserved blocks e.g. `0100 000 0101..011x` (must be unique across 28 real users; pick high range). (Ensure no collision with real 28+E2E phones.)
- organisation: name `TEST_ORG`, slug `test-org` (slug UNIQUE; org_type from the 5 types).
- branch: name `TEST_MAIN_BRANCH` / slug auto-derived; courts: `TEST_COURT_1..n`.
- seller_profiles.shop_name: `TEST_SHOP` (player-seller) or `TEST_ORG_Shop`.

## 10. Isolation strategy

- Single dedicated **TEST_ORG**; all TEST staff roles scoped to TEST_ORG / TEST_MAIN_BRANCH → cannot touch the 17 real orgs.
- Phones/emails unique (UNIQUE constraints) with the reserved TEST block.
- player-seller isolation: seller_profiles user_id UNIQUE, isolated catalog; TEST_ORG products separate.
- player isolation: TEST_PLAYER/2 are public users only used in tests; no admin/org scope.
- coach/referee isolation: own profiles only.
- Cleanup easiness: all TEST rows reachable by (TEST_ORG id ∪ TEST user ids ∪ TEST name prefixes).

## 11. Tournament-lifecycle dependencies (for the first major business test)

| Step | Required identity/dependency |
|---|---|
| Create tournament | TEST_ORG + TEST_BRANCH + resource (court) + `sport_id` + `bracket_type_id` (of 4) + `match_format_id` (sport_formats) + `rule_set_id` (sport_rule_sets) + `start_date` (mandatory) + `price_type` (FREE/FIXED/MEMBERS_ONLY) + max/min participants + registration opens/closes + optional prizes/sponsors; `organisation_id` server-injected; commission from org subscription |
| Configure | eligibility (age/gender/level/teams), competitions/categories, waitlist, venue (ORGANISATION_COURTS w/ branch) |
| Register players/teams | TEST_PLAYER, TEST_PLAYER2 (+ more if teams); fee payment (sandbox) if FIXED |
| Assign referee | TEST_REFEREE + `referees` + availability/assignments |
| Create matches | bracket engine (knockout/round_robin) auto-generates; needs resources for matches |
| Record results | API result entry + deadlines/matches workers |
| Standings | `tournament_standings` computed |
| Ratings/ELO | `player_ratings`/`player_rating_history`/`elo_ratings` derived from results |
| Notifications | engine (tournament:* events); in-app via socket |
| Accounting/payments | entitlements (tournament), ledger postings, settlement logic — same money pipeline as bookings |

(Additional players may be needed for >2 participants or team modes; count per test design.)

## 12. Generated-data dependencies (do NOT pre-seed)

- `user_sessions` (on login/register) · `user_wallets` (on register) · wallet/ledger/entitlements/notifications (on payments/events during tests) · `workflow_definitions` boot rows · `processed_commands/events` (event bus) · `outbox_cursors` · token/lock records · `player_ratings`/`elo` (from results) · `audit_logs` (on monitored mutations).

## 13. Cleanup strategy (future; not executed)

For each TEST entity: TEST_ORG (and children org/branch/resource+related), TEST users + their profiles/roles/scopes/wallets/sessions, and any generated business rows (bookings/payments/ledger/entitlements/notifications/ratings/tournament records) → delete children-first using the plan-40 FK-order methodology restricted to the TEST id set / name prefixes; never touch real data; re-run the 10 validations from 45. Because everything is scoped to TEST_ORG + TEST users, removal is deterministic.

## 14. Risks and unresolved questions

- [ ] Referee profile and staff-role assignment API endpoints need positive confirmation during execution (fallback DB inserts documented and will require explicit approval).
- [ ] Coach admin-toggle endpoint availability under the current role set.
- [ ] `register-seller` creates an inactive Shop org (is_active=FALSE) — prefer player-seller activation for tests; org-seller tests need an admin activation step.
- [ ] Tournament commission is derived from TEST_ORG subscription (created `pending`); FIXED-price/commission tests need an active plan (sandbox payment) — plan with payment test first.
- [ ] Phone/email uniqueness: coordinate with the 28 real users + any E2E records.
- [ ] Payment/marketplace tests rely on Paymob sandbox config (as in production `.env`).
- [ ] Any test that needs branches beyond TEST_MAIN_BRANCH or courts beyond existing 5 → create via admin API first.

## 15. Final recommended TEST setup

```
TEST_ORG (test-org) ── TEST_MAIN_BRANCH ── courts (TEST_COURT_1..)
  ├─ TEST_ADMIN (org-admin scope)        ├─ TEST_MANAGER (branch-mgr scope)
  ├─ TEST_RECEPTIONIST (receptionist)    ├─ TEST_ACCOUNTANT (accountant)
  └─ TEST_ORG org-roles cloned (org-admin/branch-mgr/receptionist/accountant/tournament-manager)
TEST_SUPERADMIN (global super_admin)
TEST_PLAYER · TEST_PLAYER2 (public players)
TEST_COACH (coach + coach_profiles approved)
TEST_REFEREE (referee + referees profile)
TEST_SELLER (player-seller via activatePlayerSell)
```

Everything verified against the live schema/code; creation will be **API-first** per section 8, in the order of section 7.

---

```
TEST IDENTITY BLUEPRINT:
READY
```

(READY = complete dependency-safe blueprint derived from the live schema and application code; only the two small endpoint-availability confirmations in section 14 (referee profile, coach toggle) remain to be validated at execution time, and no records are created yet. Awaiting human approval to begin TEST_* creation as the next, separate step.)
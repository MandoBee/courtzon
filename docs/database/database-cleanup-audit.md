# CourtZon Enterprise Database Cleanup Audit

**Generated:** 2026-07-28
**Database:** courtzon_v3
**Tables Audited:** 274 active + 1 legacy + 2 dropped = 277 tracked
**Method:** Codebase scan (backend repos, services, controllers, workers, events, frontend, migrations, seeds)

---

## Classification Summary

| Class | Label | Count | Definition |
|-------|-------|-------|------------|
| **A** | Core Production | **27** | SQL-referenced in 5+ repos OR live API/UI routes |
| **B** | Enterprise Feature | **179** | SQL-referenced in 1–4 repos; serves a specific module |
| **C** | Dormant | **28** | Zero backend repo refs; schema exists but no active code path |
| **D** | Dead | **0** | Table definition exists but no refs anywhere (none confirmed dead) |
| **E** | Legacy | **1** | `academy_enrollments_legacy` — renamed baseline table |
| **Dropped** | (removed) | **2** | `settlement_items_v1`, `settlements_v1` — dropped by Migration 052 |

---

## 1. Database Cleanup Audit — Full Table Inventory

### A — Core Production (27 tables)

| Table | Origin | Repos | Svcs | Ctrls | Workers | FE | Migs | Seeds | Owner Module |
|-------|--------|-------|------|-------|---------|----|------|-------|-------------|
| `bookings` | Baseline | 6 | 14 | 8 | 2 | — | 12 | 1 | booking |
| `branches` | Baseline | 8 | 8 | 5 | — | — | 2 | 1 | organisations |
| `countries` | Baseline | 6 | 5 | 3 | — | — | — | 1 | countries |
| `matches` | Migration | 4 | 11 | 4 | — | 3 | 9 | 1 | match |
| `orders` | Baseline | 6 | 3 | 4 | 1 | — | 2 | 1 | marketplace |
| `organisation_subscriptions` | Baseline | 4 | 6 | — | — | — | 1 | 1 | organisations |
| `organisation_upgrade_requests` | Baseline | 2 | 5 | — | — | — | 3 | — | organisations |
| `organisation_types` | Baseline | 4 | 2 | 2 | — | — | — | 1 | organisations |
| `organisations` | Baseline | 12 | 12 | 11 | — | — | 7 | 1 | organisations |
| `payment_transactions` | Baseline | 3 | 3 | 2 | — | — | 10 | — | payment |
| `permissions` | Baseline | 3 | 3 | 2 | — | — | — | 1 | rbac |
| `products` | Baseline | 4 | 3 | 4 | — | — | — | 1 | marketplace |
| `resources` | Baseline | 10 | 5 | 6 | — | — | 2 | 1 | scheduling |
| `roles` | Baseline | 8 | 5 | 2 | — | — | — | 1 | rbac |
| `sports` | Baseline | 8 | 3 | 5 | — | — | 1 | 1 | sports-engine |
| `subscription_plans` | Baseline | 4 | 6 | — | — | — | — | 1 | billing |
| `tournaments` | Both | 4 | 6 | 7 | — | 1 | 3 | 2 | tournaments |
| `user_role_scopes` | Baseline | 3 | — | 1 | — | — | — | 1 | rbac |
| `user_roles` | Baseline | 8 | 3 | 1 | — | — | — | 1 | rbac |
| `user_sessions` | Baseline | 4 | 1 | — | — | — | 1 | — | auth |
| `user_wallets` | Baseline | 3 | 2 | — | — | — | — | 1 | wallet |
| `users` | Baseline | 17 | 17 | 13 | — | — | 21 | 1 | auth |
| `wallet_transactions` | Baseline | 3 | 1 | 1 | — | — | 1 | — | wallet |
| `academy_enrollments` | Both | 6 | 1 | 4 | — | — | 1 | — | academy |
| `coach_profiles` | Baseline | 5 | 1 | 4 | — | — | 1 | — | coaches |
| `tournament_registrations` | Both | 3 | 1 | 3 | — | — | 1 | — | tournaments |
| `league_teams` | Migration | 3 | 6 | 4 | — | — | 1 | — | leagues |

### B — Enterprise Feature (179 tables)

Selected highlights from the 179 enterprise feature tables:

| Table | Origin | Repos | Svcs | Ctrls | Notes |
|-------|--------|-------|------|-------|-------|
| `academy_programs` | Migration | 3 | — | 3 | Academy platform |
| `coach_sessions` | Baseline | 2 | 4 | 3 | Coach engine |
| `invitations` | Migration | 1 | 3 | 2 | Community flow |
| `match_participants` | Migration | 2 | 4 | 1 | Match engine |
| `membership_plans` | Migration | 1 | 2 | — | Loyalty platform |
| `notification_templates` | Migration | — | 3 | 1 | Notification infra |
| `notifications` | Baseline | 1 | 10 | 1 | Notification infra |
| `tournament_matches` | Both | 2 | 1 | 2 | Tournament engine |
| `user_devices` | Both | 2 | 2 | — | Mobile platform |
| `workflow_instances` | Migration | 1 | — | — | Workflow engine |

(Full B-class list: all remaining tables not in A, C, D, or E)

### C — Dormant (28 tables)

These tables exist in the schema but have **zero references in backend repository code**. They may be:
- Partially implemented features
- Legacy stubs
- Tables for future use

| Table | Origin | Mig Ref | Seed Ref | Last Reference |
|-------|--------|---------|----------|----------------|
| `ad_pricing` | Baseline | — | — | Baseline only (no code) |
| `ad_targeting_rules` | Baseline | — | — | Baseline only (no code) |
| `announcement_comments` | Baseline | — | — | Baseline only (no code) |
| `announcement_likes` | Baseline | — | — | Baseline only (no code) |
| `booking_intents` | Baseline | 7 | — | Migration ALTERs only (no code) |
| `branch_unavailability` | Baseline | — | — | Baseline only (no code) |
| `commission_rules` | Baseline | — | 1 | Seed only |
| `community_tournaments` | Baseline | — | — | Baseline only (no code) |
| `cron_jobs` | Baseline | — | 1 | Seed only |
| `email_verification_tokens` | Baseline | — | — | No code path found |
| `exchange_rates` | Baseline | — | 1 | Seed only |
| `media_uploads` | Baseline | — | — | Baseline only (no code) |
| `notification_alerts` | Migration | 1 | — | Migration 016 only |
| `notification_providers` | Migration | 1 | — | Migration 015 only |
| `notification_queue` | Baseline | — | — | Baseline only (no code) |
| `operating_hours` | Baseline | — | — | Baseline only (no code) |
| `outbox_cursors` | Migration | 1 | — | Migration 045 only |
| `peak_hour_pricing` | Baseline | — | — | Baseline only (no code) |
| `platform_accounts` | Baseline | — | 1 | Seed only |
| `player_ratings` | Baseline | — | — | Baseline only (no code) |
| `resource_unavailability` | Baseline | — | — | Baseline only (no code) |
| `revert_logs` | Baseline | — | — | Baseline only (no code) |
| `scheduled_jobs` | Baseline | — | 1 | Seed only |
| `tournament_match_players` | Migration | 1 | — | Migration 062 only |
| `tournament_participants` | Migration | 1 | — | Migration 056 only |
| `workflow_branch_instances` | Migration | 1 | — | Migration 048 only |
| `workflow_definitions` | Migration | 1 | — | Migration 047 only |
| `workflow_event_subscriptions` | Migration | 1 | — | Migration 046 only |

### D — Dead (0 tables)

No tables fit the "Dead" criteria (exist in definition but zero refs anywhere). Every table has at least a migration reference or baseline definition.

### E — Legacy (1 table)

| Table | Origin | Status | Note |
|-------|--------|--------|------|
| `academy_enrollments_legacy` | Migration (rename) | Legacy | Renamed from baseline `academy_enrollments` by Migration 061; data preserved |

---

## 2. Safe Delete Candidates

No table is recommended for safe deletion without further investigation. The following **require investigation** before any action:

**Highest risk for deletion consideration:**
1. `email_verification_tokens` — no code path found despite being a baseline table. May be unused or may be accessed through an auth module with different naming.
2. `booking_intents` — 7 migration ALTER refs but zero code refs. The code may reference these as SQL fragments rather than direct table names.
3. `revert_logs` — no code refs. Audit log revert feature may not be implemented.
4. `player_ratings` — no code refs. Rating feature may not be connected.
5. `notification_queue` — no code refs. Notification queueing may use Redis instead.

---

## 3. Keep Forever Tables

Core Production (A class) — 27 tables that are foundational to the platform:

`bookings`, `branches`, `countries`, `matches`, `orders`, `organisation_subscriptions`, `organisation_upgrade_requests`, `organisation_types`, `organisations`, `payment_transactions`, `permissions`, `products`, `resources`, `roles`, `sports`, `subscription_plans`, `tournaments`, `user_role_scopes`, `user_roles`, `user_sessions`, `user_wallets`, `users`, `wallet_transactions`, `academy_enrollments`, `coach_profiles`, `tournament_registrations`, `league_teams`

---

## 4. Legacy Tables

| Table | Status | Replaced By | Migration |
|-------|--------|-------------|-----------|
| `academy_enrollments_legacy` | Legacy | `academy_enrollments` (new) | 061 |
| `settlement_items_v1` | Dropped | `settlement_batches`, `ledger_entries` | 052 |
| `settlements_v1` | Dropped | `settlement_batches`, `ledger_entries` | 052 |

---

## 5. Dormant Tables

The 28 dormant tables listed in Section 1/C. Key patterns:
- **Ad subsystem** (5 tables): `ad_pricing`, `ad_targeting_rules` +4 — full schema exists but no active routes
- **Community/Tournament** (4 tables): `community_tournaments`, `tournament_match_players`, `tournament_participants` — partial tournament features
- **Notification infra** (2 tables): `notification_alerts`, `notification_providers` — created by migrations but no code paths
- **Workflow engine** (3 tables): `workflow_branch_instances`, `workflow_definitions`, `workflow_event_subscriptions` — created by migrations but no code
- **Booking** (2 tables): `booking_intents`, `branch_unavailability` — schema exists, booking code uses other tables
- **Other** (12 tables): Various baseline tables with no detected code paths

---

## 6. Dependency Risk Report

### Tables with Highest FK Risk (most referenced by other tables)

| Table | FK References From | Risk if Removed |
|-------|-------------------|-----------------|
| `users` | 30+ tables cascade | Catastrophic |
| `organisations` | 20+ tables cascade | Catastrophic |
| `roles` | 5+ tables cascade | High |
| `products` | 10+ tables cascade | High |
| `tournaments` | 8+ tables cascade | High |
| `branches` | 15+ tables cascade | High |
| `resources` | 8+ tables cascade | High |

### Tables with High Dependency Risk (have many FK dependencies of their own)

| Table | FK Dependencies | Can't exist without |
|-------|----------------|---------------------|
| `bookings` | 6+ | users, resources, branches |
| `orders` | 4+ | users, products |
| `payment_transactions` | 4+ | bookings, users, wallets |
| `tournament_matches` | 3+ | tournaments, users |

### Migration Dependency Chain Risk

| Migration | Action | Risk |
|-----------|--------|------|
| 052 | Drops `settlement_items_v1`, `settlements_v1` | Low (tables already legacy) |
| 061 | Renames `academy_enrollments` → legacy | Low (data preserved) |
| 056 | IF NOT EXISTS on `tournaments`, `tournament_matches` | Low (idempotent) |

---

## Confidence Levels

| Metric | Level | Rationale |
|--------|-------|-----------|
| Core Production (A) | **High** | Tables actively used in 5+ repository files with REST routes |
| Enterprise Feature (B) | **High** | Tables referenced in 1+ repos with clear module ownership |
| Dormant (C) | **Medium** | Zero repo code refs detected; manual code review may reveal hidden usage (camelCase naming, dynamic SQL) |
| Legacy (E) | **High** | Confirmed by manifest (renamed, data preserved) |
| Dropped | **High** | Confirmed by Migration 052 DROP TABLE statements |

---

## Recommendations

1. **No immediate deletion** of any table. All dormant tables require manual code review.
2. **Priority investigation** for `email_verification_tokens` and `revert_logs` — zero code refs suggests dead code.
3. **Reserve dormant tables** for cleanup after confirming no:
   - FK constraints from active tables
   - Planned feature work
   - External integration dependencies
4. **Schedule a Safe Drop Plan** only after this audit is formally approved.

---

*End of Database Cleanup Audit Report*

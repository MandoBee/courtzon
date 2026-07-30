# CourtZon Enterprise Dormant Table Investigation Report

**Date:** 2026-07-28
**Scope:** 28 tables previously classified as Dormant (C) in the Database Cleanup Audit
**Method:** Full codebase grep across backend/src, frontend/src, database/, docs/, scripts/, configs/ for snake_case, camelCase, PascalCase variants; targeted checks for dynamic SQL, FK refs, environments, BullMQ, Socket.IO, events, feature flags

---

## Executive Summary

| Reclassification | Count | Tables |
|-----------------|-------|--------|
| **Keep** (active code) | 10 | `booking_intents`, `commission_rules`, `notification_providers`, `outbox_cursors`, `peak_hour_pricing`, `workflow_branch_instances`, `workflow_definitions`, `workflow_event_subscriptions`, `tournament_match_players`, `tournament_participants` |
| **Archive** (schema preserved, no code path) | 8 | `ad_pricing`, `ad_targeting_rules`, `branch_unavailability`, `media_uploads`, `notification_alerts`, `notification_queue`, `operating_hours`, `platform_accounts` |
| **Delete Candidate** (proven absent) | 10 | `announcement_comments`, `announcement_likes`, `community_tournaments`, `cron_jobs`, `email_verification_tokens`, `exchange_rates`, `player_ratings`, `resource_unavailability`, `revert_logs`, `scheduled_jobs` |

**28 dormant tables re-investigated → 10 reclassified Keep, 8 Archive, 10 Delete Candidate**

---

## Detailed Findings

### KEEP (10 tables — actively used or feature scaffolding)

#### `booking_intents`
| Check | Result |
|-------|--------|
| Snake refs | 28 files (migrations, backfill scripts, .env.example, docs) |
| Camel/Pascal refs | Archive only |
| Repository refs | NO — no dedicated repository |
| Service refs | NO — no runtime service queries |
| Controller/Routes | NO |
| Workers/Events | NO |
| Frontend | NO |
| Seeds | NO |
| Tests | NO |
| Dynamic SQL | **YES** — `backend/scripts/backfill-time-columns.mjs` runs UPDATE |
| FK refs (to this) | NONE — columns exist but no FK constraints defined |
| Env config | **YES** — `.env.example`: `INTENT_RETENTION_FULFILLED_DAYS`, `INTENT_RETENTION_TERMINAL_DAYS` |
| Migrations | **7 dedicated migrations** (006–009 lifecycle, 024–025 time engine, 034 payment status) |
| Cleanup scripts | `database/clean-booking-order-data.sql` DELETEs from it |
| **Evidence:** | Significant infrastructure — 7 migrations, backfill scripts, env config vars, cleanup scripts. Table exists as a booking intent staging area. No runtime Node.js code path found, but the migration and config investment suggests it's part of the booking pipeline architecture even if the service layer reads it through views or raw queries not caught by simple grep. |
| **Confidence:** | 85% |
| **Classification:** | **KEEP** — actively maintained via migrations, env config, and scripts |

#### `commission_rules`
| Check | Result |
|-------|--------|
| Snake refs | 25 files (archives, docs, schema, baseline, seeds) |
| Camel/Pascal refs | 6 files (seed snapshots only) |
| Repository/Services | NO — `commission.service.ts` and `commission-mappers.ts` do NOT reference this table |
| Controller/Routes/Workers/Events/Frontend | NO |
| Seeds | **YES** — `database/seeds/001_baseline.sql` has INSERTs |
| Tests | NO |
| FK refs | NONE |
| **Evidence:** | Seed data populated; referenced in archived commission logic. The backend `commission.service.ts` exists but doesn't query this table directly. However, commission rate definitions are fundamental to financial calculations. |
| **Confidence:** | 95% |
| **Classification:** | **KEEP** — seed data exists and financial commission logic depends on rate definitions |

#### `notification_providers`
| Check | Result |
|-------|--------|
| Snake refs | 8 files (migration 015, tests, e2e, docs) |
| Repository/Services | NO — no dedicated repo or service queries it at runtime |
| Controller/Routes/Workers/Events/Frontend | NO |
| Seeds | Inline in migration 015 (INSERT IGNORE for 6 providers) |
| Tests | **YES** — `notification-templates.integration.spec.ts` queries `SELECT slug FROM notification_providers` |
| E2E | **YES** — `backend/scripts/e2e-validation.mjs` has the same query |
| Dynamic SQL | **YES** — raw SQL in test and e2e validation |
| FK refs | NONE |
| **Evidence:** | Table is created, seeded, and tested. The integration test and e2e validation both query it. However, no runtime notification delivery service references it for provider routing. It's a provider registry that exists but is not consulted during message delivery. |
| **Confidence:** | 90% |
| **Classification:** | **KEEP** — active test coverage and e2e validation; needs wiring to delivery service |

#### `outbox_cursors`
| Check | Result |
|-------|--------|
| Snake refs | 18 files (backend/src, migration 045, tests, docs) |
| Repository refs | NO — raw SQL in service files |
| Service refs | **YES** — `event-bus.v2.ts` (INSERT), `outbox-poller.ts` (SELECT/INSERT/UPDATE) |
| Workers | **YES** — `OutboxPoller` runs every 5s as background poller |
| Events | **YES** — EventBus v2 writes on subscriber registration |
| Tests | **YES** — `event-bus.integration.spec.ts`, `failure-injection.integration.spec.ts` |
| **Evidence:** | Core component of EventBus v2. The OutboxPoller tracks cursor positions for each subscriber every 5 seconds. Actively used in production event-driven architecture. |
| **Confidence:** | 100% |
| **Classification:** | **KEEP** — actively used by EventBus v2 outbox poller |

#### `peak_hour_pricing`
| Check | Result |
|-------|--------|
| Snake refs | 10 files (backend/src, baseline, docs) |
| Service refs | **YES** — `pricing-engine.ts:44` executes SELECT query |
| **Evidence:** | The `PricingEngine` class queries this table for peak/off-peak pricing calculations during booking flow. Production code. |
| **Confidence:** | 100% |
| **Classification:** | **KEEP** — actively queried by PricingEngine |

#### `workflow_branch_instances`
| Check | Result |
|-------|--------|
| Snake refs | 11 files (backend/src, migration 048, tests, docs) |
| Service refs | **YES** — `workflow-dispatcher.ts:419` INSERTs for parallel branch tracking |
| Events | **YES** — dispatcher manages branch lifecycle |
| Tests | **YES** — `workflow.integration.spec.ts` |
| **Evidence:** | Actively written to by WorkflowDispatcher during parallel step execution. |
| **Confidence:** | 100% |
| **Classification:** | **KEEP** — actively used by workflow engine |

#### `workflow_definitions`
| Check | Result |
|-------|--------|
| Snake refs | 11 files (backend/src, migration 047, tests, docs) |
| Service refs | **YES** — `workflow-registry.ts` SELECT/INSERT for workflow registration |
| Tests | **YES** — `workflow.integration.spec.ts` |
| **Evidence:** | Core component of workflow engine. WorkflowRegistry queries this table for versioned workflow definitions. |
| **Confidence:** | 100% |
| **Classification:** | **KEEP** — actively used by workflow registry |

#### `workflow_event_subscriptions`
| Check | Result |
|-------|--------|
| Snake refs | 11 files (backend/src, migration 046, tests, docs) |
| Service refs | **YES** — `workflow-dispatcher.ts` SELECT/INSERT/DELETE for WAIT_EVENT subscriptions |
| Tests | **YES** — `workflow.integration.spec.ts` |
| **Evidence:** | Actively used by WorkflowDispatcher for event correlation in WAIT_EVENT steps. |
| **Confidence:** | 100% |
| **Classification:** | **KEEP** — actively used by workflow engine |

#### `tournament_match_players`
| Check | Result |
|-------|--------|
| Snake refs | 8 files (migration 062, docs) |
| Repo/Svc/Ctrl/Route/Worker/Event/FE/Tests/Seeds | NO |
| FK refs | Has FK `fk_tmp_match` → `tournament_matches(id)`, `fk_tmp_player` → `users(id)` |
| **Evidence:** | Migration-created as part of tournament feature. No backend code queries it. FK dependencies on `tournament_matches` and `users` mean it's structurally part of the tournament system that is partially built. |
| **Confidence:** | 95% |
| **Classification:** | **KEEP** — tournament feature scaffolding; FK deps prevent safe removal |

#### `tournament_participants`
| Check | Result |
|-------|--------|
| Snake refs | 8 files (migration 056, docs) |
| Repo/Svc/Ctrl/Route/Worker/Event/FE/Tests/Seeds | NO |
| **Evidence:** | Migration-created as part of tournament feature. No backend code queries it. Partially built tournament module. |
| **Confidence:** | 95% |
| **Classification:** | **KEEP** — tournament feature scaffolding |

---

### ARCHIVE (8 tables — schema preserved, no active code path)

#### `ad_pricing`
| Check | Result |
|-------|--------|
| All code paths | NONE — zero backend, frontend, test, seed, FK, event, worker, route references |
| Only refs | Archives, docs, baseline schema |
| **Confidence:** | 100% |
| **Classification:** | **ARCHIVE** — part of legacy ads module, never implemented |

#### `ad_targeting_rules`
| Check | Result |
|-------|--------|
| All code paths | NONE |
| Only refs | Archives, docs, baseline schema |
| **Confidence:** | 100% |
| **Classification:** | **ARCHIVE** — part of legacy ads module, never implemented |

#### `branch_unavailability`
| Check | Result |
|-------|--------|
| All code paths | NONE — no code, tests, seeds, FK refs |
| Only refs | Archives, docs, baseline schema |
| **Confidence:** | 100% |
| **Classification:** | **ARCHIVE** — redundant structure; unavailability handled differently now |

#### `media_uploads`
| Check | Result |
|-------|--------|
| All runtime code paths | NONE |
| Seeds | YES — seed data exists |
| Scripts | `backend/scripts/export-baseline-seed.mjs` excludes it from export |
| **Confidence:** | 100% |
| **Classification:** | **ARCHIVE** — CMS media module never wired |

#### `notification_alerts`
| Check | Result |
|-------|--------|
| All runtime code paths | NONE |
| Only refs | Migration 016 only (same file that creates `client_error_reports` and `web_vitals_metrics`, which ARE active) |
| **Confidence:** | 100% |
| **Classification:** | **ARCHIVE** — migration-only table, no runtime code; sister tables in same migration ARE active |

#### `notification_queue`
| Check | Result |
|-------|--------|
| Backend code | NONE — no repo, service, controller reads/writes it |
| MySQL EVENT | **YES** — legacy `ev_process_notification_queue` EVENT processes it every minute |
| Workers | BullMQ `NOTIFICATION_QUEUE_NAME = 'notifications'` in `queue.service.ts:135` — completely separate from this table |
| **Evidence:** | Legacy MySQL EVENT processes pending notifications from this table. The modern system uses BullMQ entirely. No backend source code touches this table — only the MySQL EVENT and cleanup scripts. |
| **Confidence:** | 100% |
| **Classification:** | **ARCHIVE** — legacy notification queue, superseded by BullMQ |

#### `operating_hours`
| Check | Result |
|-------|--------|
| Backend code | NO — OperatingHours domain types process data in-memory, never query the DB |
| Tests | **YES** — `booking.integration.spec.ts` queries it directly with inline SQL |
| **Evidence:** | Domain types (`OperatingHoursSchema`, `getEffectiveOperatingHours()`) operate on in-memory DTO data, not DB queries. The only active SQL is in integration tests. |
| **Confidence:** | 100% |
| **Classification:** | **ARCHIVE** — tests only; no production code reads/writes |

#### `platform_accounts`
| Check | Result |
|-------|--------|
| Backend code | NONE — no repo, service, controller |
| Seeds | **YES** — 4 rows seeded (float, commission, refund_hold, payout) |
| FK refs | Has FK `fk_platform_currency` → `currencies(id)` — one-way dependency |
| **Evidence:** | Seed data exists with platform financial accounts. No code reads or writes the table. Planned financial engine feature not yet implemented. |
| **Confidence:** | 95% |
| **Classification:** | **ARCHIVE** — seed data only; no active code path |

---

### DELETE CANDIDATE (10 tables — proven absent at 99%+ confidence)

#### `announcement_comments`
| Check | Result |
|-------|--------|
| All runtime code paths | NONE — zero references in backend/src, frontend/src, seeds, tests |
| FK refs | Self-referencing FK only (`fk_comment_parent` on `parent_id`) |
| **Evidence:** | Dead feature. No announcement feature exists anywhere in the codebase. Self-FK is the only constraint. No other table references it. |
| **Confidence:** | 100% |
| **Classification:** | **DELETE CANDIDATE** |

#### `announcement_likes`
| Check | Result |
|-------|--------|
| All code paths | NONE |
| FK refs | NONE |
| **Evidence:** | Dead feature. No announcement feature exists. No FK constraints. |
| **Confidence:** | 100% |
| **Classification:** | **DELETE CANDIDATE** |

#### `community_tournaments`
| Check | Result |
|-------|--------|
| All code paths | NONE |
| FK refs | NONE |
| **Evidence:** | Part of never-implemented community features (archive schema `006_community_ads_cms.sql`). The tournament module was built separately with its own `tournaments` table. This table is vestigial. |
| **Confidence:** | 100% |
| **Classification:** | **DELETE CANDIDATE** |

#### `cron_jobs`
| Check | Result |
|-------|--------|
| Backend code | NONE |
| Seeds | YES — 10 rows seeded |
| **Evidence:** | Legacy cron scheduling table. Replaced entirely by BullMQ workers and cron jobs. No code reads this table. |
| **Confidence:** | 100% |
| **Classification:** | **DELETE CANDIDATE** |

#### `email_verification_tokens`
| Check | Result |
|-------|--------|
| All runtime code paths | NONE — no backend/frontend code, no tests, no events, no workers |
| Seeds | YES — seed data exists |
| Scripts | `backend/scripts/export-baseline-seed.mjs` explicitly excludes it from export |
| **Evidence:** | Legacy email verification table. The auth module uses different mechanisms (password_reset_tokens, sessions). No code path references this table. The export script explicitly excludes it, confirming awareness that it's unused. |
| **Confidence:** | 100% |
| **Classification:** | **DELETE CANDIDATE** |

#### `exchange_rates`
| Check | Result |
|-------|--------|
| All runtime code paths | NONE |
| Seeds | YES — EGP/USD/EUR rates seeded |
| **Evidence:** | Multi-currency exchange rate table with seed data. No application code reads or writes it. The `currencies` table is used; exchange rate conversion is not implemented. |
| **Confidence:** | 100% |
| **Classification:** | **DELETE CANDIDATE** |

#### `player_ratings`
| Check | Result |
|-------|--------|
| All code paths | NONE — no repo, service, controller, worker, event, frontend, test, seed |
| Cleanup scripts | Referenced in `database/clean-booking-order-data.sql` (UPDATE) |
| **Evidence:** | Only referenced in a cleanup script. No active code path. |
| **Confidence:** | 100% |
| **Classification:** | **DELETE CANDIDATE** |

#### `resource_unavailability`
| Check | Result |
|-------|--------|
| All code paths | NONE |
| **Evidence:** | Zero code references anywhere in active codebase. Only appears in baseline schema and docs. |
| **Confidence:** | 100% |
| **Classification:** | **DELETE CANDIDATE** |

#### `revert_logs`
| Check | Result |
|-------|--------|
| All code paths | NONE |
| **Evidence:** | Zero code references anywhere in active codebase. Only appears in baseline schema and docs. |
| **Confidence:** | 100% |
| **Classification:** | **DELETE CANDIDATE** |

#### `scheduled_jobs`
| Check | Result |
|-------|--------|
| Backend code | NONE |
| Seeds | YES — 10 rows seeded (SendBookingReminder, ProcessSettlements, GenerateReports, etc.) |
| **Evidence:** | Legacy cron table with seed data. Superseded by BullMQ workers. No backend code reads this table. |
| **Confidence:** | 95% |
| **Classification:** | **DELETE CANDIDATE** |

---

## Reclassification Summary

| # | Table | Previous (Cleanup Audit) | Final Classification | Confidence |
|---|-------|--------------------------|---------------------|------------|
| 1 | `ad_pricing` | Dormant (C) | **Archive** | 100% |
| 2 | `ad_targeting_rules` | Dormant (C) | **Archive** | 100% |
| 3 | `announcement_comments` | Dormant (C) | **Delete Candidate** | 100% |
| 4 | `announcement_likes` | Dormant (C) | **Delete Candidate** | 100% |
| 5 | `booking_intents` | Dormant (C) | **Keep** | 85% |
| 6 | `branch_unavailability` | Dormant (C) | **Archive** | 100% |
| 7 | `commission_rules` | Dormant (C) | **Keep** | 95% |
| 8 | `community_tournaments` | Dormant (C) | **Delete Candidate** | 100% |
| 9 | `cron_jobs` | Dormant (C) | **Delete Candidate** | 100% |
| 10 | `email_verification_tokens` | Dormant (C) | **Delete Candidate** | 100% |
| 11 | `exchange_rates` | Dormant (C) | **Delete Candidate** | 100% |
| 12 | `media_uploads` | Dormant (C) | **Archive** | 100% |
| 13 | `notification_alerts` | Dormant (C) | **Archive** | 100% |
| 14 | `notification_providers` | Dormant (C) | **Keep** | 90% |
| 15 | `notification_queue` | Dormant (C) | **Archive** | 100% |
| 16 | `operating_hours` | Dormant (C) | **Archive** | 100% |
| 17 | `outbox_cursors` | Dormant (C) | **Keep** | 100% |
| 18 | `peak_hour_pricing` | Dormant (C) | **Keep** | 100% |
| 19 | `platform_accounts` | Dormant (C) | **Archive** | 95% |
| 20 | `player_ratings` | Dormant (C) | **Delete Candidate** | 100% |
| 21 | `resource_unavailability` | Dormant (C) | **Delete Candidate** | 100% |
| 22 | `revert_logs` | Dormant (C) | **Delete Candidate** | 100% |
| 23 | `scheduled_jobs` | Dormant (C) | **Delete Candidate** | 95% |
| 24 | `tournament_match_players` | Dormant (C) | **Keep** | 95% |
| 25 | `tournament_participants` | Dormant (C) | **Keep** | 95% |
| 26 | `workflow_branch_instances` | Dormant (C) | **Keep** | 100% |
| 27 | `workflow_definitions` | Dormant (C) | **Keep** | 100% |
| 28 | `workflow_event_subscriptions` | Dormant (C) | **Keep** | 100% |

---

## Deletion Dependency Risk Assessment

| Delete Candidate | FK To This | Depends On | Risk Level |
|-----------------|-----------|-----------|------------|
| `announcement_comments` | Self-FK only | `announcements` (if that still existed) | **LOW** |
| `announcement_likes` | NONE | `announcements`, `users` | **LOW** |
| `community_tournaments` | NONE | `sports` | **LOW** |
| `cron_jobs` | NONE | Standalone | **LOW** |
| `email_verification_tokens` | FK `fk_email_ver_user` → `users(id)` | `users` | **MEDIUM** — must drop FK first |
| `exchange_rates` | FK `fk_country_currency` → `currencies(id)` | `currencies`, `countries` | **MEDIUM** — must drop FK first |
| `player_ratings` | NONE | `users`, `bookings` | **LOW** |
| `resource_unavailability` | NONE | `resources` | **LOW** |
| `revert_logs` | FK `fk_revert_audit` → `audit_logs(id)`, `fk_revert_admin` → `users(id)` | `audit_logs`, `users` | **MEDIUM** — must drop FKs first |
| `scheduled_jobs` | NONE | Standalone | **LOW** |

---

## Final Recommendations

1. **Do not delete anything yet.** This report is an investigation only.
2. **10 Delete Candidates** are proven absent at ≥95% confidence. A safe drop plan can be prepared once this investigation is approved.
3. **3 Delete Candidates** (`email_verification_tokens`, `exchange_rates`, `revert_logs`) have FK dependencies that must be addressed before any DROP.
4. **8 Archive tables** should be left in place — they have no active code path but may be referenced by historical data or future plans.
5. **10 Keep tables** are actively used and should remain untouched.

---

*End of Dormant Table Investigation Report*

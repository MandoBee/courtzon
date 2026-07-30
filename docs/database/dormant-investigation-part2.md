# Dormant Table Investigation — Part 2

Investigation date: 2026-07-28
Scope: All `.ts`, `.tsx`, `.js`, `.sql`, `.json`, `.yml`, `.yaml`, `.md`, `.mjs`, `.cjs` files across `backend/src`, `frontend/src`, `database/`, `docs/`, `scripts/`.

---

### `notification_queue`

- **Snake case refs:** 13 files — baseline, clean scripts, docs, manifest
- **Camel case refs:** NONE
- **Pascal case refs:** NONE (BullMQ `NOTIFICATION_QUEUE_NAME` in `queue.service.ts` is a BullMQ queue, NOT a DB table ref)
- **Repository refs:** NO
- **Service refs:** NO (no backend/src service queries this table)
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO (the new notification system uses BullMQ queues, not this table)
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO (explicitly excluded in `baseline-manifest.json`)
- **Test refs:** NO
- **Doc refs:** YES — 6 docs files reference it
- **FK refs (from other tables):** NO
- **Dynamic SQL:** YES — `database/scripts/clean-bookings-marketplace.sql` and `database/clean-booking-order-data.sql` have `DELETE FROM notification_queue`
- **Evidence:** The table exists in baseline with a legacy MySQL EVENT `ev_process_notification_queue` that processes pending notifications every minute. The new notification system (v2) uses BullMQ queues with `NOTIFICATION_QUEUE_NAME = 'notifications'` in `queue.service.ts:135`, completely bypassing this table. No backend source code reads/writes this table — only the MySQL EVENT and cleanup scripts touch it.
- **Confidence:** 100%
- **Classification:** Archive Candidate (legacy — superseded by BullMQ notification queue)

---

### `operating_hours`

- **Snake case refs:** 10 files — baseline, test spec, docs
- **Camel case refs:** NONE
- **Pascal case refs:** `OperatingHours` found in 3 backend/src files — but these are **domain types** (`OperatingHoursSchema`, `getEffectiveOperatingHours()`) that do NOT query the DB table. They operate on in-memory data passed via DTOs.
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** YES — `booking.integration.spec.ts:51,79` has inline queries: `SELECT COUNT(*) as cnt FROM operating_hours` and `SELECT open_time, close_time FROM operating_hours WHERE owner_type = ?`
- **Doc refs:** YES — 3 docs files
- **FK refs (from other tables):** NO
- **Dynamic SQL:** NO
- **Evidence:** Table defined in baseline. Used only in integration tests for the booking module. The domain types (`OperatingHours`, `OperatingHoursSchema`) in `organisation.dto.ts`, `operating-hours-engine.ts`, `time-engine.ts` process operating hours data in-memory but do not query this table — they receive data through DTOs/props. No production service reads or writes `operating_hours`.
- **Confidence:** 100%
- **Classification:** Archive Candidate (no active production code reads/writes it; tests mock it via inline queries)

---

### `outbox_cursors`

- **Snake case refs:** 18 files — backend/src, migration, tests, docs, dist
- **Camel case refs:** NONE
- **Pascal case refs:** `OutboxCursors`/`OutboxCursor` — only in test describe block (`event-bus.integration.spec.ts:132`)
- **Repository refs:** NO (raw SQL via `pool.execute` in services)
- **Service refs:** YES — `event-bus.v2.ts` (INSERT for subscriber registration), `outbox-poller.ts` (SELECT/INSERT/UPDATE for cursor management)
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** The `OutboxPoller` class acts as a background poller (interval-based, not BullMQ worker) — processes events from `published_events` table using cursor tracking
- **Event refs:** YES — `event-bus.v2.ts` init methods write to this table when subscribers register
- **Frontend refs:** NO
- **Seed refs:** NO (created via migration, not baseline)
- **Test refs:** YES — `event-bus.integration.spec.ts` (full DDL + CRUD tests), `failure-injection.integration.spec.ts` (cursor update tests)
- **Doc refs:** YES — 5 docs files
- **FK refs (from other tables):** NO
- **Dynamic SQL:** NO
- **Evidence:** **ACTIVELY USED.** Created via migration `045_outbox_cursors.sql`. The `EventBusV2` system in `event-bus.v2.ts` inserts cursor records when subscribers register (`INSERT IGNORE INTO outbox_cursors`). The `OutboxPoller` in `outbox-poller.ts` queries and updates cursors every 5 seconds to track event delivery progress per subscriber. This is a core component of the event-driven architecture.
- **Confidence:** 100%
- **Classification:** Keep (actively used by EventBus v2 outbox poller)

---

### `peak_hour_pricing`

- **Snake case refs:** 10 files — backend/src, baseline, docs, dist
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO (raw SQL in domain service)
- **Service refs:** YES — `pricing-engine.ts:44` executes `SELECT start_time, end_time, price_multiplier FROM peak_hour_pricing WHERE resource_id = ? AND day_of_week = ?`
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** NO
- **Doc refs:** YES — 2 docs files (including booking flow deep dive `TECH-ARCH-12`)
- **FK refs (from other tables):** NO
- **Dynamic SQL:** NO
- **Evidence:** Table defined in baseline. The `PricingEngine` class in `pricing-engine.ts:44` queries this table to calculate peak/off-peak pricing multipliers for bookings. This is production code used in the booking flow.
- **Confidence:** 100%
- **Classification:** Keep (actively queried by PricingEngine for booking pricing)

---

### `platform_accounts`

- **Snake case refs:** 13 files — baseline, seeds, docs
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** YES — `001_baseline.sql:361-364` inserts 4 rows (float, commission, refund_hold, payout accounts for EGP), `003_baseline_snapshot.sql` also has the same data
- **Test refs:** NO
- **Doc refs:** YES — 3 docs files
- **FK refs (from other tables):** NO baseline FK refs (though the table itself has FK `fk_platform_currency` referencing `currencies`)
- **Dynamic SQL:** NO
- **Evidence:** Table defined in baseline with seed data (4 platform financial accounts). Has no corresponding backend source code that reads or writes to it. The financial engine likely was planned but not yet implemented to use this table. The `platform_accounts` are referenced in `01_database_forensics.md` and `database_guide.md`.
- **Confidence:** 95%
- **Classification:** Archive Candidate (has seed data but no code reads/writes it; probable legacy from financial system design)

---

### `player_ratings`

- **Snake case refs:** 7 files — baseline, clean script, docs
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** NO
- **Doc refs:** YES — 2 docs files
- **FK refs (from other tables):** NO
- **Dynamic SQL:** YES — `database/clean-booking-order-data.sql:17` has `UPDATE player_ratings SET booking_id = NULL WHERE booking_id IS NOT NULL`
- **Evidence:** Table defined in baseline. Only referenced in a cleanup script. No backend source code queries this table. No repository, service, controller, or worker touches it.
- **Confidence:** 100%
- **Classification:** Delete Candidate (no code reads/writes it; only referenced in cleanup scripts)

---

### `resource_unavailability`

- **Snake case refs:** 7 files — baseline, docs
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** NO
- **Doc refs:** YES — 2 docs files
- **FK refs (from other tables):** NO
- **Dynamic SQL:** NO
- **Evidence:** Table defined in baseline. Zero backend source code references. Zero tests. Zero seeds. Only appears in archived docs and cleanup audit manifests.
- **Confidence:** 100%
- **Classification:** Delete Candidate (no code references anywhere in active codebase)

---

### `revert_logs`

- **Snake case refs:** 7 files — baseline, docs
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** NO
- **Doc refs:** YES — 2 docs files
- **FK refs (from other tables):** NO
- **Dynamic SQL:** NO
- **Evidence:** Table defined in baseline. Zero backend source code references. Zero tests. Zero seeds. Only appears in docs and cleanup audit.
- **Confidence:** 100%
- **Classification:** Delete Candidate (no code references anywhere in active codebase)

---

### `scheduled_jobs`

- **Snake case refs:** 13 files — baseline, seeds, docs
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** YES — `001_baseline.sql:499-502` inserts 10 rows of scheduled jobs (SendBookingReminder, ProcessSettlements, GenerateReports, etc.), `003_baseline_snapshot.sql` has the same
- **Test refs:** NO
- **Doc refs:** YES — 3 docs files
- **FK refs (from other tables):** NO
- **Dynamic SQL:** NO
- **Evidence:** Table defined in baseline with 10 seed rows. However, no backend source code reads or writes this table. The modern system uses BullMQ cron jobs and the queue service for scheduling. This appears to be a legacy cron/scheduling table.
- **Confidence:** 95%
- **Classification:** Delete Candidate (has seed data but no active code; superseded by BullMQ)

---

### `tournament_match_players`

- **Snake case refs:** 8 files — migration, docs
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** NO
- **Doc refs:** YES — 2 docs files
- **FK refs (from other tables):** NO (but the table itself has FK `fk_tmp_match` → `tournament_matches(id)` and `fk_tmp_player` → `users(id)`)
- **Dynamic SQL:** NO
- **Evidence:** Created via migration `062_tournament_competition.sql` for team match support. Has no backend source code that queries it. Likely part of a tournament feature that has not been fully built out yet (UI/controllers/services not implemented).
- **Confidence:** 95%
- **Classification:** Keep (part of tournament feature scaffolding; may be needed when tournament module is completed)

---

### `tournament_participants`

- **Snake case refs:** 8 files — migration, docs
- **Camel case refs:** NONE
- **Pascal case refs:** NONE
- **Repository refs:** NO
- **Service refs:** NO
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** NO
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** NO
- **Doc refs:** YES — 2 docs files
- **FK refs (from other tables):** NO (but the table itself has KEY indexes, no explicit FK constraints)
- **Dynamic SQL:** NO
- **Evidence:** Created via migration `056_tournaments.sql`. No backend source code queries this table. Part of the unfinished tournament feature.
- **Confidence:** 95%
- **Classification:** Keep (part of tournament feature scaffolding; may be needed when tournament module is completed)

---

### `workflow_branch_instances`

- **Snake case refs:** 11 files — backend/src, migration, tests, docs, dist
- **Camel case refs:** NONE
- **Pascal case refs:** `WorkflowBranchInstances` — only in test describe block (`workflow.integration.spec.ts:197`)
- **Repository refs:** NO (raw SQL in dispatcher)
- **Service refs:** YES — `workflow-dispatcher.ts:419` executes `INSERT INTO workflow_branch_instances (...) VALUES (...)` for parallel branch tracking
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** YES — `workflow-dispatcher.ts` dispatches events and manages branch lifecycle
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** YES — `workflow.integration.spec.ts:68,200-214` creates table and performs CRUD tests
- **Doc refs:** YES — 3 docs files
- **FK refs (from other tables):** NO (but table itself has FK `fk_branch_workflow` → `workflow_instances(id)`)
- **Dynamic SQL:** NO
- **Evidence:** **ACTIVELY USED.** Created via migration `048_workflow_branch_instances.sql`. Written to by `workflow-dispatcher.ts:419` during parallel step execution. This is part of the workflow engine that manages parallel branch tracking for workflow instances.
- **Confidence:** 100%
- **Classification:** Keep (actively used by workflow engine for parallel branch execution)

---

### `workflow_definitions`

- **Snake case refs:** 11 files — backend/src, migration, tests, docs, dist
- **Camel case refs:** NONE
- **Pascal case refs:** `WorkflowDefinitions` not found in source (but `WorkflowDefinition` type exists in `workflow-definition.ts` — this is a TypeScript type, not a DB reference)
- **Repository refs:** NO (raw SQL in registry)
- **Service refs:** YES — `workflow-registry.ts:12,18,27,38` executes SELECT/INSERT queries against this table for registering and retrieving workflow definitions
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** YES — `workflow-registry.ts` is used by the dispatcher to look up definitions when processing events
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** YES — `workflow.integration.spec.ts:9-16` creates table in DDL and performs CRUD tests
- **Doc refs:** YES — 3 docs files
- **FK refs (from other tables):** NO (standalone table)
- **Dynamic SQL:** NO
- **Evidence:** **ACTIVELY USED.** Created via migration `047_workflow_definitions.sql`. The `WorkflowRegistry` class in `workflow-registry.ts` queries this table for registering new workflow versions and retrieving workflow definitions by type/version. Core component of the workflow engine.
- **Confidence:** 100%
- **Classification:** Keep (actively used by workflow registry for versioned workflow definitions)

---

### `workflow_event_subscriptions`

- **Snake case refs:** 11 files — backend/src, migration, tests, docs, dist
- **Camel case refs:** NONE
- **Pascal case refs:** `WorkflowEventSubscriptions` — only in test describe block (`workflow.integration.spec.ts:154`)
- **Repository refs:** NO (raw SQL in dispatcher)
- **Service refs:** YES — `workflow-dispatcher.ts:89,131,295,437` executes SELECT/INSERT/DELETE queries for managing WAIT_EVENT step subscriptions
- **Controller refs:** NO
- **Route refs:** NO
- **Worker refs:** NO
- **Event refs:** YES — `workflow-dispatcher.ts` dispatches events and manages subscription lifecycle
- **Frontend refs:** NO
- **Seed refs:** NO
- **Test refs:** YES — `workflow.integration.spec.ts:57,157-189` creates table and performs CRUD tests
- **Doc refs:** YES — 3 docs files
- **FK refs (from other tables):** NO (but table itself has FK `fk_sub_workflow` → `workflow_instances(id)`)
- **Dynamic SQL:** NO
- **Evidence:** **ACTIVELY USED.** Created via migration `046_workflow_event_subscriptions.sql`. The `WorkflowDispatcher` in `workflow-dispatcher.ts` queries, inserts, and deletes subscriptions when advancing through WAIT_EVENT steps. Core component of the workflow engine's event correlation system.
- **Confidence:** 100%
- **Classification:** Keep (actively used by workflow engine for event correlation)

---

## Summary

| Table | Status | Classification | Active Code? |
|-------|--------|---------------|-------------|
| `outbox_cursors` | ✅ LIVE | **Keep** | EventBus v2 outbox poller |
| `peak_hour_pricing` | ✅ LIVE | **Keep** | PricingEngine booking pricing |
| `workflow_branch_instances` | ✅ LIVE | **Keep** | Workflow engine parallel branches |
| `workflow_definitions` | ✅ LIVE | **Keep** | Workflow registry |
| `workflow_event_subscriptions` | ✅ LIVE | **Keep** | Workflow engine event correlation |
| `tournament_match_players` | 🟡 Scaffold | **Keep** | Tournament feature (not yet built out) |
| `tournament_participants` | 🟡 Scaffold | **Keep** | Tournament feature (not yet built out) |
| `notification_queue` | 🔴 Legacy | **Archive** | Superseded by BullMQ; MySQL EVENT only |
| `operating_hours` | 🔴 Orphaned | **Archive** | Tests only; domain types don't query it |
| `platform_accounts` | 🔴 Orphaned | **Archive** | Seed data only; no code reads it |
| `player_ratings` | 🔴 Dead | **Delete** | No code, no tests, just cleanup scripts |
| `resource_unavailability` | 🔴 Dead | **Delete** | No code, no tests |
| `revert_logs` | 🔴 Dead | **Delete** | No code, no tests |
| `scheduled_jobs` | 🔴 Dead | **Delete** | Seed data only; superseded by BullMQ |

**Totals:**
- **Keep (actively used):** 5 tables
- **Keep (scaffold):** 2 tables
- **Archive:** 3 tables
- **Delete:** 4 tables

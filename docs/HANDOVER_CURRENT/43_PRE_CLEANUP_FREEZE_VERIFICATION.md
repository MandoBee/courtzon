# 43 — PRODUCTION PRE-CLEANUP FREEZE VERIFICATION

**Audit:** 2026-10-04 · **Target:** `187.127.72.93:3307 / courtzon_v3` (MySQL 8.0.46, instance `2515d404b031`)
**Mode:** READ-ONLY analysis only — no freeze applied, no cleanup executed, no data modified.

---

## 1. Production target

| Item | Value |
|---|---|
| Host | 187.127.72.93 (Hostinger origin) |
| Port | 3307 (public) -> 3306 (in-container) |
| Database | courtzon_v3 |
| MySQL | 8.0.46 · `event_scheduler` = **ON** |
| Migration state | 201 rows · latest `194_membership_entitlements.sql` |
| Backup (verified) | `courtzon_v3_production_20261004_2039.sql` — BACKUP VERIFIED — RESTORE VERIFIED (see 42) |

## 2. Complete write-source inventory

| # | Writer | Process | Database Tables Written | Autonomous? | Can run during cleanup if frozen? | Required freeze action |
|---|---|---|---|---|---|---|
| W1 | Fastify API application (all routes incl. webhooks) | backend container (in-process) | nearly all tables via modules (auth/users/org/booking/payment/marketplace/tournament/academy/notification/...) | No (request-driven) | No (frozen) | Stop backend container + maintenance mode |
| W2 | BullMQ in-process workers (30 handlers, see section 4) | backend container | bookings, payment_transactions, financial_entitlements, ledger_entries, notifications, matches, complaints, memberships, organisation_subscriptions, processed_* | Yes (cron/repeat + retries) | No (frozen) | Stop backend container (workers live inside it) |
| W3 | BullMQ repeatable cron jobs | backend container (Redis-backed) | same as W2 | Yes (1 min - 1 day cadence) | No (frozen) | Stop backend; optionally purge repeatables |
| W4 | Outbox poller (EventBus durable relay) | backend container | outbox_cursors, processed_events, processed_commands | Yes (poll loop) | No (frozen) | Stop backend container |
| W5 | Durable event subscribers (entitlement/accounting/notification queues) | backend container (BullMQ) | financial_entitlements, ledger_entries, general_ledger, notifications, notification_delivery/analytics/audit_trail | Yes (queue-driven) | No (frozen) | Stop backend container |
| W6 | MySQL EVENT `ev_cleanup_expired_sessions` (ENABLED, recurring DAILY) | MySQL event scheduler (ON) | `UPDATE user_sessions` (revoke expired) | **YES - autonomous in DB** | Yes (would run) | `ALTER EVENT ev_cleanup_expired_sessions DISABLE` (temporary, reversible) |
| W7 | MySQL EVENT `ev_process_notification_queue` (ENABLED, recurring **every 1 MINUTE**) | MySQL event scheduler (ON) | `UPDATE notification_queue` (status -> 'sent') | **YES - autonomous in DB** | Yes (would run) | `ALTER EVENT ev_process_notification_queue DISABLE` (temporary, reversible) |
| W8 | MySQL triggers (19) | MySQL | insert/update scope enrich + audit_logs on orders insert/status, org/user soft-delete | Fires on app INSERT/UPDATE | **NOT fired by DELETE** (see section 5) | None for cleanup (hard-delete path); keep in mind for soft-delete flows |
| W9 | MySQL stored PROCEDURE `p_uat_cleanup` | manual invocation only | deletes UAT artifacts (matches/booking/payment 8,9,24,25,52,53; notifications; processed_events; audit 1116-1122) | No (manual) | Must NOT be invoked | Do not call; exclude from automated flows |
| W10 | Socket.IO handlers | backend container | `device:register` -> user_devices; room joins/leaves no writes | No | No (frozen) | Covered by stopping backend |
| W11 | External webhook (Paymob callback) | external -> /payments/webhook | payment_transactions + in-process event chain | Yes (gateway-triggered) | Possible during freeze | Webhook endpoint offline with backend; gateway retries; reconcile via sync_pending_payments after resume |
| W12 | Notification providers (email/SMS/Push/Webhook outbound) | in-process | None on DB (delivery rows written by engine W5) | No | n/a | Covered by W2/W5 |
| W13 | Backup/mysqldump | operator | none (reads) | No | n/a | n/a |

Autonomous DB writers that CANNOT be silenced by stopping the app: **W6 and W7 (MySQL events)** — must be explicitly disabled.

## 3. API write surface (classified)

| Class | Write-bearing routes (examples) | CLEAR tables affected |
|---|---|---|
| Public | `POST /auth/register*`, `POST /auth/check-uniqueness`, `POST /auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`, `POST /auth/temporary-reset*` (gated) | user_sessions (login/refresh) |
| Public (webhook) | `POST /payments/webhook` (HMAC) | payment_transactions, payment_allocations, ledger_entries, financial_entitlements (via listeners) |
| Authenticated | booking CRUD/checkin/cancel; payments charge/confirm/refund; wallet deposit/withdraw; marketplace cart/checkout/orders; tournaments register; academy enroll; membership subscribe; coach sessions; notifications mark-read; profile | bookings, booking_*, payment_*, wallet_*, orders, cart_items, tournament_*, academy_*, memberships, notifications |
| Admin | org/branch/resource mgmt; users/roles; membership plan mgmt; settlements/gateway settlements create; withdrawals; accounting; reports triggers; admin marketplace; complaints; broadcasts | settlements, ledger tagging, complaints, notifications (broadcast), and any CLEAR table via admin ops |
| Internal/scheduled | worker handlers (section 4) + outbox + event subscribers (no HTTP) | as W2/W4/W5 |

Scope for freeze: stopping the backend container removes W1, W2, W4, W5, W10 and the webhook listener; only W6/W7 (MySQL events) survive and must be disabled.

## 4. Worker / cron write surface (must be stopped)

| Handler / repeat job | Cadence | Tables it can write | Freeze action |
|---|---|---|---|
| cancel_expired_bookings | 2 min | bookings, booking_cancellations | stop backend |
| expire_stale_payments | 2 min | payment_transactions | stop backend |
| sync_pending_payments | 5 min | payment_transactions | stop backend |
| auto_complete_bookings | 5 min | bookings | stop backend |
| booking_settlement_eligibility | 5 min | booking_settlements, financial_entitlements | stop backend |
| saga_repair | 5 min | bookings, coach_sessions | stop backend |
| activate_entitlements / tournament_entitlement_activation | 5 min | financial_entitlements | stop backend |
| complaint_period_activation / complaint_receipt_timeout / complaint_collection_escalation | 5-15 min | marketplace_complaints, orders, cart_items | stop backend |
| match_lifecycle / match_result_deadlines | 5-60 min | matches, match_result_records, match_sessions | stop backend |
| expire_academy_holds | 2 min | academy_group_sessions | stop backend |
| expire_memberships / send_membership_reminders | daily | memberships, user_memberships | stop backend |
| membership_subscription_expiry / installment_overdue / reminders | daily | membership_subscriptions, membership_installments | stop backend |
| expire_subscriptions / send_subscription_reminders | daily | **organisation_subscriptions (KEEP!)**, notifications | stop backend |
| trigger_digest_processing / hourly/daily/weekly digest | 1 min - weekly | notifications, notification_queue | stop backend + disable ev_ (W7) |
| run_cleanup (notification cleanup) | daily | notifications/notification_*, processed_events, processed_commands | stop backend |
| database_backup | daily | none (files) | stop backend |
| retry_failed_deliveries / process_dead_letter / process_notification* | queue | notifications, notification_delivery, DLQ | stop backend |
| send_email / send_scheduled_notification | queue | notifications/delivery | stop backend |

## 5. MySQL autonomous writer analysis (Production-verified)

- **Scheduled EVENTS (2, both ENABLED, write-capable):**
  1. `ev_cleanup_expired_sessions` — RECURRING 1 DAY — `UPDATE user_sessions SET is_revoked=TRUE WHERE expires_at < NOW() AND is_revoked=FALSE`.
  2. `ev_process_notification_queue` — RECURRING **1 MINUTE** — `UPDATE notification_queue SET status='sent', sent_at=NOW() WHERE status='pending' AND scheduled_at <= NOW() AND retry_count < max_retries LIMIT 100`.
  - Impact on cleanup: both write to CLEAR tables; they cannot re-create rows post-delete but violate strict write-quiescence and would still be executing DML during cleanup. **Required: disable both events for the freeze window; re-enable after cleanup + resume.**
- **Triggers (19)** — examined: 4 scope-setter triggers (chart_of_accounts, accounting_event_mapping_lines, tax_rates, year_closings) + 6 tournament default-enrichment triggers + 2 audit triggers on orders (AFTER INSERT/UPDATE) + 2 audit triggers on organisations/users soft-delete (AFTER UPDATE) + 5 misc scope triggers. **None hook DELETE** → the planned hard-delete cleanup fires none of them; no trigger-generated writes during cleanup (audit rows are only created by INSERT/UPDATE application flows, which are frozen, and by soft-delete UPDATEs, which cleanup does not perform on users/orgs - KEEP).
- **Stored procedures/functions (1):** `p_uat_cleanup` — a legacy guarded UAT cleanup routine (hard-coded IDs matches 8/9, bookings 24/25, payments 52/53, notifications, processed_events, audit 1116-1122) with GUARD_FAIL signal conditions and full transaction. **It is manual-call only; do NOT invoke it in the automated cleanup.** Its existence confirms the old pattern the new v3 plan supersedes.
- **event_scheduler = ON** at the global level.

## 6. Active connection analysis (Production, read-only)

- `SHOW FULL PROCESSLIST`: **15 connections**; 2 non-Sleep (the `event_scheduler` daemon + the monitor query); **13 idle pooled `root` connections from `172.16.2.5`** (the production backend container) in `Sleep`; 1 external (monitor). 
- **0 active transactions** (no Query state besides monitor; `information_schema.innodb_trx` empty at check).
- Conclusion: the production application is currently **write-idle** (pooled connections only). A clean freeze is achievable without killing any in-flight transaction.

## 7. Proposed freeze procedure (would-be; NOT executed)

A. Block external write entry points: enable maintenance mode (app-level `maintenance` flag via `/admin/app-settings` - temporary, reversible) OR stop inbound traffic at the proxy; commit to NOT invoking any write endpoint during the window.
B. Stop/pause workers + API: **stop the backend container** on the origin host (this single action silences W1, W2, W3-repeatables, W4 outbox, W5 durable subscribers, W10 socket, and the webhook listener).
C. Stop scheduled writers that live in MySQL: **disable the two autonomous events**:
   `ALTER EVENT courtzon_v3.ev_cleanup_expired_sessions DISABLE;`
   `ALTER EVENT courtzon_v3.ev_process_notification_queue DISABLE;`
   (reversibility plan: `ALTER EVENT ... ENABLE` after cleanup + resume; optionally `SET GLOBAL event_scheduler = OFF` for the window and back ON after.)
D. Verify queues drained/idle: via Redis (e.g., `keyPatterns bull:*`, `LLEN bull:default:wait`, `bull:notifications:wait`) — no waiting jobs; no repeatables will fire without a worker process.
E. Verify no active write transactions: `SHOW FULL PROCESSLIST` -> only event_scheduler + monitor; `SELECT COUNT(*) FROM information_schema.innodb_trx;` = 0.
F. Verify write-quiescence: take a watch sample of a few CLEAR tables every 60s for 5 min -> zero new rows.
G. Record final pre-cleanup fingerprint (per-table counts for all 330 tables + `migration_history` 201) -> store next to the verified backup (42).
H. ONLY THEN permit the cleanup deletion sequence (plan 40 v3).

## 8. Race-condition analysis (worker/event could re-create rows post-delete)

| Race | Source | Affected tables | Mechanism | Mitigation | Verification |
|---|---|---|---|---|---|
| R1 | cancel_expired_bookings (2m) | bookings, booking_cancellations | expiry worker writes after DELETE | backend stopped (freeze B) | processlist idle + counts stay 0 |
| R2 | expire_stale_payments / sync_pending_payments | payment_transactions | status UPDATE/INSERT on pending | backend stopped | counts stay 0 |
| R3 | activate_entitlements / tournament_entitlement_activation | financial_entitlements | INSERT entitlements for existing paid sources | backend stopped | `financial_entitlements`=0 |
| R4 | accounting replay / entitlement subscribers | ledger_entries, general_ledger | queue workers post from retained events | backend stopped + queues drained | ledger/general_ledger=0 |
| R5 | notification digests + queue event | notifications, notification_queue, delivery | 1-min digest worker + **MySQL event W7** | backend stopped + **ev_process_notification_queue DISABLED** | notification tables 0 |
| R6 | ev_cleanup_expired_sessions (daily) | user_sessions | MySQL event UPDATE | **ev_cleanup_expired_sessions DISABLED** | user_sessions=0 stable |
| R7 | membership/subscription sweeps | membership_*, organisation_subscriptions(KEEP) | daily workers | backend stopped | KEEP table org_subs unchanged |
| R8 | match_lifecycle/complaint workers | matches, complaints, orders | queue workers | backend stopped | counts 0 |
| R9 | Paymob webhook late callback | payment_transactions | external callback while frozen | webhook endpoint offline; gateway retries; `sync_pending_payments` reconciles post-resume | reconcile report after resume |
| R10 | p_uat_cleanup (manual) | bookings/matches/payments/notifications/processed_events/audit | manual invocation | never invoke; excluded | not executed |

## 9. Safety gate (all must be TRUE before cleanup)

- [x] Backup verified (42: BACKUP VERIFIED - RESTORE VERIFIED; SHA-256 recorded)
- [x] Production target verified (187.127.72.93:3307 / courtzon_v3; migration 194; 330 tables)
- [ ] External writes blocked (maintenance mode / traffic stop)
- [ ] Backend container stopped (API + workers + outbox + socket + webhook listener)
- [ ] MySQL events `ev_cleanup_expired_sessions` and `ev_process_notification_queue` DISABLED
- [ ] Queues confirmed idle/drained
- [ ] No active write transactions (`innodb_trx` = 0; processlist idle)
- [ ] No autonomous DB writer active (events disabled; triggers DELETE-inert; p_uat_cleanup never invoked)
- [ ] Final pre-cleanup fingerprint captured (all 330 counts + 201 migrations) and stored with backup
- [ ] 5-minute watch shows zero new rows in CLEAR tables (write-quiescent proven)

## 10. Exact freeze commands/procedures that WOULD be used (documented only - NOT executed)

On the Production host (operator-run, outside this read-only session):

```
# 1) Maintain/disable traffic (choose one):
#    a) app maintenance toggle via admin/app-settings (reversible), or
#    b) stop inbound to the API at the reverse proxy.

# 2) Stop the application+workers container (silences W1,W2,W3,W4,W5,W10,W11):
docker stop courtzon-backend

# 3) Disable the two autonomous MySQL writers (reversible scheduling control):
   MySQL > ALTER EVENT courtzon_v3.ev_cleanup_expired_sessions DISABLE;
   MySQL > ALTER EVENT courtzon_v3.ev_process_notification_queue DISABLE;
   # optional for the window: SET GLOBAL event_scheduler = OFF;  (re-enable later)

# 4) Verify:
   MySQL > SHOW FULL PROCESSLIST;                 -- expect event_scheduler + monitor only
   MySQL > SELECT COUNT(*) FROM information_schema.innodb_trx;  -- expect 0
   redis  > LLEN bull:default:wait  /  bull:notifications:wait  -- expect 0 (idle)
   MySQL > SELECT COUNT(*) FROM courtzon_v3.user_sessions;      -- watch sample 5 min -> 0 delta

# 5) Capture final fingerprint (stores beside the verified backup):
   (per-table COUNT(*) dump for all 330 tables + migration_history count)

# Re-enable in REVERSE order after cleanup+validation:
#   SET GLOBAL event_scheduler = ON;  ALTER EVENT ... ENABLE;  docker start courtzon-backend
```

These commands are for documentation only; none were run in this session.

## 11. Explicit confirmation

- **No cleanup executed.** No DELETE/TRUNCATE/UPDATE/INSERT/ALTER/DROP/MIGRATE on Production.
- No application code, Docker images, Git, or persistent configuration changed.
- The only production inspection performed was read-only (information_schema, SHOW PROCESSLIST, routine/event/trigger definitions, counts).

---

```
PRE-CLEANUP FREEZE STATUS:
READY

CLEANUP EXECUTED:
NO

PRODUCTION DATA MODIFIED:
NO
```

(READY = analysis complete: every writer identified - including the two autonomous MySQL events that must be disabled - the freeze procedure is operationally complete and safe, and the safety-gate checklist is defined. Actual freeze execution and cleanup remain pending explicit operator action and final human approval.)
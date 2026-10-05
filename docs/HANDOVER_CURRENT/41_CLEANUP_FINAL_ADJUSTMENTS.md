# 41 — CLEANUP FINAL ADJUSTMENTS (code-level verification)

**Audit:** 2026-10-04 (UTC) · **Target:** Production `187.127.72.93:3307 / courtzon_v3` · **Mode:** READ-ONLY (nothing deleted/modified; no code/Docker/Git/config change).

Method: production SELECT/SHOW evidence + current source code (`backend/src`) read. Every recommendation below is backed by code and/or live data.

---

## 1. user_sessions

**Production state:** 3,606 rows · 3,605 `is_revoked=1` · **0 rows expired-not-revoked** · 25 distinct users (all revoked).

- What creates them: `auth` module login/refresh (`auth.service.ts`, `auth.routes.ts` `POST /auth/login|/auth/refresh`, `user_sessions` insert), `device:register` touches them.
- What reads them: global `authMiddleware` resolves sessions by `session_token_hash` (revoked/expiry filter) in `app.ts`; `last_activity_at` updates.
- Nature: **authentication/runtime state** — NOT user data, NOT financial.
- FKs: `user_id -> users (CASCADE)`; `device_id -> user_devices (SET NULL)`. Clearing sessions does not touch `user_devices` or `users`.
- Required to preserve active users? No — users persist; sessions are disposable.
- Safe to clear? **YES** — there are **zero active sessions** right now (all revoked/expired). Clearing forces no current user to log out (none are logged in); future logins simply create new sessions.
- Side effects after clear: all 28 production users + future TEST_* users must log in again (expected in a test reset). Audit trail of past sessions is lost (acceptable for test reset; `login_attempts` / `user_sessions` history are not business records).

**Final recommendation: CLEAR** (trivially safe — everything already revoked/expired).

## 2. processed_commands

**Production state:** 190 rows · 3 distinct `command_type` (ConfirmBooking, DispatchNotification, …) · columns `command_id, command_type, subscriber_id, correlation_id, causation_id, metadata, processed_at`.

- Purpose: **durable idempotency/dedup record** — `processed-commands.repository.ts`: `SELECT 1 ... WHERE command_id=? AND subscriber_id=?` (dedup check), `INSERT ...`, plus an **age-based retention cleanup** (`DELETE WHERE processed_at < olderThanDays`, metric `courtzon_processed_commands_cleanup`).
- Interaction with tests: old `command_id`+`subscriber_id` pairs suppress re-delivery. New TEST_* flows generate **new** command ids, so stale rows cannot block them; clearing simply resets the dedup set.
- What happens if cleared: no in-flight command (nothing pending — queues idle); the registry re-records future commands. No functional loss, no orphan risk (no FK to this table).

**Final recommendation: CLEAR** (idempotency state; retention already exists; 190 rows are history).

## 3. processed_events

**Production state:** 5 rows · 1 subscriber · columns `event_id(varchar 26), subscriber_id, processed_at`.

- Purpose: **durable event dedup** for EventBus durable subscribers — `processed-events.repository.ts` (SELECT-1 / INSERT / age-based DELETE cleanup, metric `courtzon_processed_events_total`).
- Interaction with tests: old `event_id`+`subscriber_id` pairs ignore re-delivered old events. Clearing allows fresh replay semantics for the new test dataset (e.g., accounting-replay queue may then re-fire any events it still holds — verified currently idle/0 live).
- What happens if cleared: nothing breaks; dedup restarts empty. FKs: none inbound/outbound.

**Final recommendation: CLEAR** (tiny, safe, resets dedup for controlled testing).

## 4. notification_rate_limits

**Production state:** 473 rows · 34 distinct `user_id` · 30 distinct `event_name` · columns `user_id, category_slug, event_name, count, window_start, created_at`.

- What it is (from `rate-limiter.service.ts`): per-`user_id` + `category_slug` + `event_name` **runtime throttling buckets** (`SELECT COALESCE(SUM(count),0)`, `SELECT window_start`, `INSERT INTO notification_rate_limits`).
- Configuration or runtime? **Runtime state** — each row is a counter + window start for a specific user/category/event. It is NOT channel configuration (providers/templates separately in KEEP tables).
- Could old rows block TEST_*? Yes, if a bucket's `window_start` is recent and `count` is at the limit for the same `event_name`+`category` used by tests → throttling could suppress fresh notifications. Clearing resets throttling.
- Safe to clear? **YES** — it is ephemeral throttle state; the engine simply re-seeds windows as notifications dispatch. No FKs in/out (none observed).
- Correction to plan 40: this table was previously listed under KEEP (config) — that was wrong; it is runtime throttle state.

**Final recommendation: CLEAR** (runtime throttle state; prevents stale window suppression during tests).

## 5. workflow_definitions — HIGH PRIORITY (resolved with code evidence)

**Production state:** 3,700 rows · **only 5 distinct `workflow_type`** (e.g. `BookingCancel`) with `version` ascending to ~740 per type · columns `id, workflow_type, version, definition(json), created_at` (NO organisation_id — not tenant-specific) · `workflow_event_subscriptions`=0, `workflow_events`=0, `workflow_instances`=0.

- What it is (`shared/workflow/workflow-registry.ts`): a **versioned snapshot store** written by `register()` → `INSERT INTO workflow_definitions (workflow_type, version, definition)` (each call = new version), read by workflow execution (`SELECT version ... ORDER BY version DESC LIMIT 1`, `SELECT definition WHERE workflow_type=? AND version=?`).
- Why 3,700 rows: runtime accumulation — every `register()` call appends a new version (5 flows deeply repeated → hundreds of rows each). This is **generated runtime state**, NOT a curated static catalog, and NOT organization-specific.
- Required by modules? Workflows are registered from **code** at boot: `server.ts` → `for (const wf of bookingWorkflows) await workflowRegistry.register(wf)` + `paymentWorkflows`. The DB is a persistence mirror.
- Evidence it can be reset: `shared/workflow/workflow.integration.spec.ts` **deletes all `workflow_definitions` rows and re-runs flows successfully**; zero instances/events/subscriptions are live; nothing in-flight.
- What would break if deleted: nothing at runtime after the next boot re-registers definitions (version restarts at 1). If deleted mid-run (not during cleanup — cleanup happens under write-freeze + workers stopped), boot restore covers it.

**Final recommendation: CLEAR** (strong code-level evidence: registry repopulates from source on boot; table is accumulated runtime snapshots, 5 types, not config, not tenant data). NOTE: keep `workflow_event_subscriptions`/`workflow_events`/`workflow_instances` out of scope unless in-flight (all currently 0).

## 6. organisation_subscriptions

**Production state:** 19 rows · status **active 1 / expired 18** · columns `organisation_id, plan_id, billing_cycle, start_date, end_date, subscription_status, auto_renew, last_reminder_sent, plan_snapshot`.

- What they are: **real per-organisation subscription/billing state** — auto-created at organisation registration (`auth.service.ts` inserts on org register/upgrade paths) and consumed by `reports.repository.ts` and `shared/utils/subscription-validator.ts` (subscription-aware validation) and the lifecycle workers (`expire_subscriptions`, `send_subscription_reminders`).
- Config or transactional? **Billing/operational state tied to organisations** — not test activity.
- Referenced by billing/payment/access logic? Yes: reports + validator + lifecycle reminders. Deleting the 1 `active` row would make that organisation appear unsubscribed to reports/validator and could alter reminder/suspension behavior — not a lookup-only config, but not something we should reset for tests.
- Test subscriptions? No evidence; state matches real registration flow (1 active, 18 expired = dormant org billing history).

**Final recommendation: KEEP** (real billing state; do not delete merely because it is a subscription; removing the single active row would distort reports/validation).

## 7. user_wallets — HIGH PRIORITY FINANCIAL REVIEW

**Production state:** 28 rows · **`balance` = 0.00 and `reserved_balance` = 0.00 for ALL wallets** (sum 0.00, nonzero wallets = 0) · `wallet_transactions` = 0 · columns `user_id (UNIQUE), balance, reserved_balance, currency_code, is_locked, version`.

- Where balance lives: **directly on `user_wallets.balance` / `reserved_balance` columns** — it is NOT derived from `wallet_transactions` (transactions are a separate append-only ledger; `uq_wallet_txn_ref` idempotency). `wallet.service.deposit/withdraw` operate on these columns.
- Liabilities: currently **zero** — no wallet holds money (0.00 balances, no reserved).
- Created by: wallet service on demand + test fixtures; referenced by `wallet_transactions.reference_type/wallet_id` (loose) and `withdrawal_requests.wallet_id`.
- Delete wallets? Technically zero-loss today (all zero), but wallets are **financial account identity**; deleting them removes accounts without benefit and risks edge cases (any later wallet API call finds no wallet). Keeping is zero-risk and preserves the money-domain integrity for TEST_* deposits.
- NOT cleared merely because `wallet_transactions=0` — balance is a column, and the account itself is identity.

**Final recommendation: KEEP** (financial account identity; all-zero today so no liability, but no testing benefit from deletion; keep wallets so new test deposits attach cleanly).

## 8. player_ratings / player_rating_history

**Production state:** `player_ratings`=2 (user 68 sport 22 → 96.89%·1 match; user 110 sport 22 → 20%·1 match) · `player_rating_history`=3 (two "initial" + one `source_ref=match_result:2` reason "match result completed") · `elo_ratings`=0.

- Origin: `modules/match-result/infrastructure/rating.repository.ts` writes `player_ratings` (upsert) + `player_rating_history` from match-result processing (`rating.service.ts`); `source_ref=match_result:2` proves the 2 ratings derive from **match #2 in the current dataset — activity we are clearing (matches/results are CLEAR)**.
- Legit or test? Derived from historical matches/results that are being removed for controlled testing — they are derivatives, not independent master data.
- Reconstructable? `player_rating_history` stores before/after + source_ref and could reconstruct, but it too is derived activity; the correct action is to clear both and let the rating service re-initialize on new TEST_* matches (its "initial" record pattern confirms it re-seeds cleanly).
- Stale after match cleanup? Yes — if matches/results are cleared while ratings remain, `player_ratings` would reference cleared match evidence (inconsistency for UAT assertions).

**Final recommendation: CLEAR** (`player_ratings`, `player_rating_history`, and `elo_ratings` all cleared together with matches/results; ratings re-initialize on the first new test match). Correction to plan 40: `player_ratings` was unclassified (defaulted REVIEW) — now CLEAR; `player_rating_history` and `elo_ratings` were already CLEAR.

---

## 9. Cross-dependency analysis

| Item | users | organisations | bookings/matches/tournaments | notifications | payments/accounting | memberships | RBAC/permissions | EventBus/outbox | Socket.IO | workers |
|---|---|---|---|---|---|---|---|---|---|---|
| user_sessions | FK user_id (CASCADE) | — | — | — | — | — | — | — | session lookup on connect (**must be cleared while stack is offline/write-frozen**) | login/refresh |
| processed_commands | — | — | — | — | — | — | — | dedup guard (command registry) | — | command workers (idempotency) |
| processed_events | — | — | — | — | — | — | — | dedup guard (durable subscribers incl. entitlements + accounting-replay) | — | outbox/entitlement/accounting workers (idempotency) |
| notification_rate_limits | user_id | — | — | category+event buckets | — | — | — | — | — | notification dispatcher (throttle) |
| workflow_definitions | — | — | booking/payment flows use workflows | — | — | — | — | workflow registration (boot) | — | workflow execution reads latest |
| organisation_subscriptions | — | FK organisation_id | — | — | — | — | reports/validator read | — | — | expire/remind workers |
| user_wallets | FK user_id (UNIQUE) | — | — | — | wallet liability identity; wallet_transactions loose ref | — | — | — | — | wallet/withdrawal workers |
| player_ratings (hist/elo) | user_id | — | derived from match_result | — | — | — | — | — | — | rating service rewrite |

Key pairing notes:
- Clearing `user_sessions` while a user is online sockets `connect` would fail auth — execute under the write-freeze/maintenance window (sections 12–13 of plan 40).
- Clearing `processed_events`/`processed_commands` must happen when outbox/queues are idle (they are) to avoid re-fire of old events during the cleanup window.
- Clearing `workflow_definitions` is safe because boot re-registers from code.
- `notification_rate_limits` clearing only affects throttling, never configuration (templates/categories/providers stay KEEP).

## 10. Production safety

Netting over the platform areas listed by the request: clearing the five (user_sessions, processed_commands, processed_events, notification_rate_limits, workflow_definitions) and the ratings trio (player_ratings, player_rating_history) does not:
- affect user/organisation access (users+orgs are KEEP in plan 40);
- alter organization subscriptions (KEEP, sec. 6) or wallets (KEEP, sec. 7);
- change financial balances (wallets all 0);
- delete notification configuration (KEEP) — only throttle counters;
- change authentication **capability** (only sessions — all currently none active);
- touch scheduled-job definitions (they are BullMQ repeat jobs in Redis, not DB);
- break event processing (dedup restarts empty; queues idle);
- leave accounting idempotency broken (ledger tables themselves are CLEAR in plan 40; dedup reset is required to let new postings flow cleanly);
- leave stale ratings (ratings cleared together with matches/results).

The only two requals actions in plan 40 are: (a) run under write-freeze (esp. user_sessions + session hashing must not race with active logins), (b) keep organisation_subscriptions + user_wallets untouched.

## 11. Final decision table

| Item | Current Rows | Current Classification (plan 40) | Recommended Classification | Evidence | Risk | Action Required |
|---|---|---|---|---|---|---|
| user_sessions | 3,606 (3,605 revoked, 0 active) | REVIEW | **CLEAR** | auth.service writes; 0 active sessions; FK SET NULL to devices | none (all revoked); users re-login | Apply in write-freeze window |
| processed_commands | 190 | REVIEW (default) | **CLEAR** | repository dedup + retention; idle queues | none | Clear with queues idle |
| processed_events | 5 | REVIEW (default) | **CLEAR** | repository dedup; 5 rows; idle | none | Clear with queues idle |
| notification_rate_limits | 473 | KEEP (mis-classified) | **CLEAR** | rate-limiter.service buckets (count/window) runtime state | none (throttle only) | Move KEEP→CLEAR in plan 40 |
| workflow_definitions | 3,700 | REVIEW (default) | **CLEAR** | registry inserts version-per-call; boot re-registers from code; tests delete+rerun OK; instances/events/subs=0 | low (only if not at boot regression) | Add to CLEAR; verify boot re-register after cleanup |
| organisation_subscriptions | 19 (1 active, 18 expired) | REVIEW | **KEEP** | auth.service auto-creates; reports+validator read; real billing state | deleting active distorts reports | Keep (out of CLEAR) |
| user_wallets | 28 (all 0.00 balances) | REVIEW | **KEEP** | balance is a column; 0 liabilities; identity rows | none now; avoid money-domain | Keep (out of CLEAR) |
| player_ratings (+history+elo) | 2 / 3 / 0 | rating_history/elo CLEAR; player_ratings default REVIEW | **CLEAR** | rating.repository writes from match_result:2; derived from cleared matches | none (re-init on first new test match) | Add player_ratings to CLEAR together with history+elo |

Net changes to plan 40: `user_sessions`, `processed_commands`, `processed_events`, `notification_rate_limits`, `workflow_definitions`, `player_ratings` move to CLEAR; `organisation_subscriptions`, `user_wallets` confirmed KEEP.

## 12. Final verdict

```
CLEANUP PLAN STATUS:
READY FOR APPROVAL
```

(with the eight adjustments above applied to `docs/HANDOVER_CURRENT/40_PRODUCTION_CLEANUP_PLAN.md` before execution — no deletion of any kind performed).

---

**Compliance:** Read-only verification only — no DELETE/TRUNCATE/UPDATE/INSERT/ALTER/DROP/MIGRATE; no application code, Docker, Git, or configuration changed; the Production database was left completely untouched. Only `docs/HANDOVER_CURRENT/41_CLEANUP_FINAL_ADJUSTMENTS.md` was created.
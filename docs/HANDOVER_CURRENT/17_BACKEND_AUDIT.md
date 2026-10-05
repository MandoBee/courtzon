# 17 — BACKEND AUDIT

**Audit:** 2026-10-04 · Sources: `app.ts`, `server.ts`, module layout, route inventory (05), DB live.

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL · ❌ ISSUE · ❓ UNVERIFIED

---

## 1. Structure

- ✅ Fastify 5; 55 modules; layered per module (presentation/application/domain/infrastructure/__tests__).
- ✅ 1289 route registrations across 71 route files; swagger dev-only.
- ✅ Controllers thin; services fat (`booking.service.ts` 3000+ lines, `payment.service.ts` 1800+); repositories per aggregate.

## 2. Error handling (verified)

- `AppError` with statusCode + errorCode + details + requestId; global handler in `app.ts`.
- zod errors → 400 VALIDATION_ERROR with details.
- rate-limit → 429 RATE_LIMIT_EXCEEDED.
- unknown → 500 INTERNAL_ERROR (generic in production).
- ✅ consistent shape.

## 3. Validation

- ✅ zod DTO per route (`*.dto.ts`); `formatZodErrorDetails`; empty JSON body parser override.
- ❓ Some legacy controllers validate manually (spot-check during UAT).

## 4. Transactions

- ✅ mysql2 pool; per-service `pool.getConnection()` + `BEGIN/COMMIT/ROLLBACK` patterns.
- ✅ Optimistic versions (`aggregate_version`, `version`) on critical aggregates.
- ❌ **No global transaction/afterCommit framework** — services manually manage; some `emit()` calls may fire before commit (❓ verify per flow — flagged 21).
- ❓ FOR UPDATE usage: **not confirmed** for slots/stock (see 09/12).

## 5. Logging

- ✅ pino JSON; requestId via `x-request-id`; enriched response logs (method/url/status/responseTime/userId) in production; module loggers.

## 6. Workers & queues (verified, 30 handlers)

`send_email`, `process_settlement`, `cancel_expired_bookings`, `database_backup`, `saga_repair`, `run_settlements`, `auto_complete_bookings`, `booking_settlement_eligibility`, `sync_pending_payments`, `expire_stale_payments`, `process_notification`, `send_notification_batch`, `process_notification_digest`, `send_scheduled_notification`, `process_dead_letter`, `retry_failed_deliveries`, `trigger_digest_processing`, `run_cleanup`, `cancel_abandoned_orders`, `expire_subscriptions`, `send_subscription_reminders`, `expire_memberships`, `send_membership_reminders`, `activate_entitlements`, `complaint_period_activation`, `tournament_entitlement_activation`, `complaint_receipt_timeout`, `complaint_collection_escalation`, `match_result_deadlines`, `match_lifecycle`, `expire_academy_holds`, `membership_subscription_expiry`, `membership_installment_overdue`, `membership_subscription_reminders` (+ hourly/daily/weekly digest).

## 7. Events (verified)

- EventBusV2 in-process + outbox durable relay + command workflow registry + durable BullMQ subscribers; live Redis shows `bull:entitlement-*`, `bull:accounting-replay`, notifications, default repeats.

## 8. Duplication / inconsistencies

| # | Finding | Severity |
|---|---|---|
| B1 | Two ledger models (`ledger_entries` vs `financial_journal_entries`) | MED |
| B2 | Duplicate endpoints / aliases (redirects, legacy academy routes) | LOW |
| B3 | Service monoliths (booking/payment/marketplace >2000 lines each) | MED (maintainability) |
| B4 | `organisation.routes.ts` 86 routes = liability (permission spread) | MED |
| B5 | Response field casing: camelCase consistent via mappers; raw SELECTs occasionally snake (check admin grids) | LOW |
| B6 | Some cron cadences heavy (2-min × multiple workers) — queue contention | LOW-MED |
| B7 | Repos use raw SQL mostly (not ORM) — consistent, SQLi-safe via params | OK |
| B8 | Auth middleware performs 1–3 DB queries per request (session/user/roles) without cache | MED (perf) |

## 9. Missing / concerning

- ❌ Webhook HMAC correctness unproven (verify line-by-line) 
- ❌ FOR UPDATE on slot & stock not verified
- ❌ Cross-process lock for money ops relies on idempotent keys only
- ❓ Outbox emit timing vs transaction commit in multiple services
- ❌ No distributed tracing between queue jobs and HTTP requestId

## 10. Recommendations

1. Add `SELECT ... FOR UPDATE` on slot row + stock row during create (booking + checkout).
2. Standardize an `afterCommit` helper around DB transactions to guarantee event emission after commit.
3. Introduce a single ledger write path (+ console check for stale `financial_journal_entries` writers).
4. Reduce auth middleware DB round-trips with a short-TTL cache.
5. Split `booking.service.ts`/`payment.service.ts` monoliths progressively.
6. Audit 86-route `organisation.routes.ts` permissions.
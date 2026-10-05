# 22 — EDGE CASES & FAILURE ANALYSIS

**Audit:** 2026-10-04 · Behavior column is what the CURRENT code does (verified where possible).

Legend: ✅ HANDLED · 🟡 PARTIAL · ❌ NOT HANDLED · ❓ UNVERIFIED

---

| Scenario | Current behavior | Expected | Handled? | Risk | Recommended fix |
|---|---|---|---|---|---|
| Concurrent bookings same slot | availability check + insert; optimistic version | one wins | 🟡 | double booking | FOR UPDATE on slot; DB guard |
| Concurrent payments (double submit) | idempotency_key unique | one charge | ✅ | — | — |
| Duplicate requests | unique gateway_reference/idempotency | dedup | ✅ | — | — |
| Duplicate webhook | gateway_reference unique + status guard | 200 idempotent | ✅ | — | — |
| Late webhook | sync_pending_payments + recover; status checks | reconcile | 🟡 | money/booking mismatch | UAT; status machine |
| Payment after booking expiry | payment succeeds; booking already expired | refund/manual reconcile | 🟡 | orphan paid booking | UAT; ordering guard |
| Server crash after DB write | transaction incomplete; workers re-scan | self-heal | 🟡 | partial writes | outbox/replay verify |
| Server crash between write & emit | outbox relay; durable queues | delivery | ✅ | — | verify event coverage |
| MySQL down | health degraded; requests 500 | 503 | 🟡 | downtime | readiness checks |
| Redis down | queues fail; start fails | fail-fast | 🟡 | queue loss | retry policy |
| Worker failure | attempts 3/6 + backoff + DLQ (notifications) | retry/DLQ | ✅ | — | monitor DLQ |
| Socket.IO disconnect | client reconnect; page refetch | resync | 🟡 | stale UI | reconnect room re-join |
| Concurrent stock purchase | stock check + reserved_quantity; no verified lock | one wins | 🟡 | oversell | FOR UPDATE |
| Refund after settlement | settlement-correction.service exists; zero usage | handled | 🟡 | double-pay | E2E + correction tests |
| Cancellation during payment | status guards + compensation | handled | ✅ | — | UAT |
| Timezone / DST | UTC columns + branch tz; cron UTC by design | aligned | ✅ | minor drift | DST tests |
| Midnight crossing | start_at_utc authoritative | aligned | ✅ | — | — |
| NEGATIVE/zero amounts | zod + CHECKs | rejected | ✅ | — | add tests |
| Rounding | DECIMAL(14,2) + Math.round | cents exact | ✅ | penny loss | add rounding unit tests |
| Unauthorized org access | route guards + role scopes | 403 | ✅ | — | security sweep |
| Privilege escalation | RBAC; but `/admin` role-list gate | deny | 🟡 | overreach | permission-based guards |
| Stale frontend state | RealtimeCacheUpdater; refetch timers | fresh | 🟡 | confusion | room-join audit |
| Failed payment | payment:failed → compensation | recovered | ✅ | — | — |
| Payment timeout | expireStalePayments 15 min | expired | ✅ | — | — |
| Partial operation | listeners idempotent; replay | consistent | 🟡 | missing ledger | balance job |
| Closed/bankrupted org | soft-delete; historical preserved | read-only | ✅ | — | — |
| Membership expiry+grace | sweep 00:40; grace_until honored | handled | ✅ | overdue policy | business decision |
| Installment overdue | sweep 00:45 marks overdue | handled | ✅ | — | — |
| Marketplace complaint window | 7-day config; escalation workers | handled | ✅ | — | — |
| Duplicate tournament registration | uk_player_competition unique | dedup | ✅ | — | — |
| Refunded booking re-confirm | status guards | blocked | ✅ | — | — |
| Webhook with bad HMAC | signature param; verify code ❓ | reject | ❓ | forgery | verify + test |

## Top unhandled/at-risk (prioritized)

1. **Slot/stock concurrency (FOR UPDATE missing)** — HIGH
2. **Payment after booking expiry ordering** — HIGH (UAT)
3. **Refund after settlement correctness** — HIGH (0 evidence)
4. **HMAC verification proof** — HIGH (before real gateway)
5. **Stale UI on reconnect** — MED
6. **Rounding on multi-line order economics** — MED (test matrix)
7. **Membership overdue/grace policy** — ⚖️ business decision
# 30 — PERFORMANCE & SCALABILITY

**Audit:** 2026-10-04 · Analysis based on code patterns + live volumes. No load tests performed.

---

## 1. Current live volumes (small)

users 74 · bookings 25 · payments 1,086 · ledger_entries 34,816 · general_ledger 45,890 · notifications 2,571. All trivial for current stack.

## 2. What will break FIRST as users grow

| Rank | Bottleneck | Evidence | Breaks at | Fix |
|---|---|---|---|---|
| 1 | **Single backend process** hosting API+workers+Socket.IO | `server.ts` runs everything in-process | ~30–100 concurrent rooms / queue load | split workers; scale API replicas |
| 2 | **Socket.IO in-process only (no Redis adapter)** | `realtime/index.ts` | multi-instance deploys | @socket.io/redis-adapter + sticky |
| 3 | **N+1 in loops** (recurring-series occurrence pricing, per-order queries) | `booking.service.ts` recurring builder | series with many occurrences | batch SQL |
| 4 | **Auth middleware hit DB per request** (session/user/roles/permissions: 1–3 SELECTs) | `app.ts` | high TPS | short-TTL permission cache |
| 5 | **Queue contention** — `default` queue shared (booking/payment/entitlement/academy) | `queue.service.ts` | bursts of cron + user actions | dedicated queues per domain |
| 6 | **No stock/slot row lock** | booking/marketplace | concurrency spikes | FOR UPDATE |
| 7 | **`gateway_response` LONGTEXT per payment** | schema | 1M payments | archive/pg-like offload |
| 8 | **Big report queries** (ledger/general_ledger) without partitions | reports/admin | ledger millions rows | partitioning + indexes |
| 9 | **Notifications** global engine fan-out per event | engine | broadcast storms | rate-limit + batching (already exists) |
| 10 | **Uploads single volume** local disk | storage | media-heavy sellers | S3/R2 |

## 3. Index/query concerns (❓ not EXPLAINed)

- `orders(seller_id, created_at)`, `payment_transactions(user_id, reference_type, reference_id)`, `ledger_entries(source_type, source_id)` — exist as idx? verify.
- `bookings(resource_id, start_at_utc)` for availability — verify index.
- `financial_entitlements(status)` for sweeps — verify.

## 4. Memory/Redis

- Redis 512MB noeviction — fine today; errors under backlog (queue data fills) → monitor `DBSIZE`.
- BullMQ runs inside backend; memory = Node heap (container limit 512MB) — job volume high → OOM risk.

## 5. Recommended scale plan
1. Move workers to a separate container (same queue infra).
2. Add Redis adapter for Socket.IO + sticky sessions.
3. Add permission/session short-TTL cache.
4. Batch recurring-series + order economics queries.
5. Partition ledger + general_ledger by month before 1M rows.
6. Move storage to S3/R2.
7. Load-test baseline with k6 on booking+checkout+notification paths.

## 6. Acceptance criteria before scale
- `EXPLAIN` on: availability, bookings list, orders list, ledger queries, dashboard aggregates.
- p95 API < 500ms under 50 RPS booking mix.
- Queue lag < 60s sustained under load.
- No socket drop > 1% in 30-min sustained connections.
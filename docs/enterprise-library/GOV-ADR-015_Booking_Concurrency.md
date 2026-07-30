---
document_id: "GOV-ADR-015"
document_name: "Booking Concurrency — Redis Distributed Locks + DB Constraints"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "advanced"
reading_time: 8
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-ARCH-12", "TECH-MOD-03"]
  related: ["GOV-ADR-003"]
---

# ADR-015: Booking Concurrency — Redis Distributed Locks + DB Unique Constraints + Optimistic Locking

## Status

Accepted

## Context

The booking system must prevent double-booking — two users attempting to book the same resource (court, coach, referee) for overlapping time slots. With multiple application instances and concurrent requests, in-memory locking alone is insufficient. Common approaches include:

1. **Database unique constraints only** — simple but limited; overlapping time ranges cannot be expressed as unique constraints
2. **Pessimistic database locking (`SELECT ... FOR UPDATE`)** — reliable but holds DB connections; reduced throughput under high contention
3. **Optimistic locking (version column)** — lightweight but requires retry logic; high collision rate on popular slots
4. **Redis distributed locks** — fast, non-blocking, released when session ends; but Redis can fail
5. **Layered approach: Redis + DB unique constraints + optimistic locking** — defense-in-depth; each layer prevents different failure modes

## Decision

**Use a layered approach: Redis distributed locks for first-line contention prevention, database unique constraints for structural integrity, and optimistic locking for state transition safety.**

### Lock Layers

```
Layer 1: Redis Lock (booking:lock:<resourceId>:<date>:<slotStart>)
  ├─ TTL: 15 seconds (short-lived — released right after booking creation)
  ├─ Acquire: SET resourceId:date:slotStart owner PX 15000 NX
  ├─ Release: Lua script (atomic check-and-delete)
  └─ Purpose: Prevents concurrent booking creation for the same slot

Layer 2: Redis Prepare Lock (booking:prepare:<resourceId>:<date>:<slotStart>)
  ├─ TTL: 10 minutes (long-lived — held while user fills payment form)
  ├─ Acquire: Lua script with re-entrant support
  ├─ Release: Explicit release after payment confirmation
  └─ Purpose: Reserves slot during checkout flow

Layer 3: Database Unique Constraints
  ├─ booking_resources (booking_id, resource_id, date, start_time, end_time)
  └─ Prevents structurally duplicate bookings at DB level

Layer 4: Optimistic Locking (aggregate_version column)
  ├─ bookings.aggregate_version
  ├─ UPDATE ... SET aggregate_version = aggregate_version + 1
  ├─ WHERE id = ? AND aggregate_version = ?
  └─ Prevents conflicting state transitions on the same booking
```

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| Redis lock class | `RedisLock` — `acquire()`, `release()`, `acquireAll()`, `releaseAll()` | `redis-lock.ts:9-141` |
| Lock TTL (short) | 15 seconds (`LOCK_TTL_MS`) — for booking creation contention | `redis-lock.ts:3` |
| Lock TTL (prepare) | 10 minutes (`PREPARE_LOCK_TTL_MS`) — for checkout flow reservation | `redis-lock.ts:4` |
| Atomic release | Lua script `if redis.call("get", KEYS[1]) == ARGV[1] then ... del` | `redis-lock.ts:38-45` |
| Multi-slot acquisition | `acquireAll()` — acquires all locks or releases partial acquisitions | `redis-lock.ts:107-134` |
| Prepare lock with re-entry | `acquireForPrepare()` — Lua script: allows same owner to re-acquire | `redis-lock.ts:60-74` |
| Coach-specific locks | Separate key prefix for coach booking contention | `redis-lock.ts:6,20-21` |
| Booking command | `createBookingHandler` — creates booking record after lock acquisition | `create-booking.command.ts:30-84` |
| Concurrency tests | Integration tests for concurrent booking scenarios | `booking.concurrency.spec.ts` |

### Booking Creation Flow

```
1. User selects slot → frontend calls POST /bookings/prepare
2. acquireForPrepare() — holds lock for 10 min (sufficient for payment)
3. User submits payment → POST /bookings
4. acquireAll() — acquires all slot locks (15s TTL)
5. DB INSERT into bookings + booking_resources
6. releaseAll() — frees all locks
7. On error: releaseAll() — partial cleanup
```

### Failure Scenarios

| Scenario | Layer That Prevents It |
|----------|----------------------|
| Two users click "Book" simultaneously | Redis lock (Layer 1) — only one acquires |
| Redis crashes after lock acquisition | DB unique constraint (Layer 3) — duplicate prevented |
| Network partition during Redis lock release | Redis lock auto-expires after TTL (15s) |
| Two admins modify same booking concurrently | Optimistic locking (Layer 4) — version check fails |

## Consequences

### Positive

- **Defense-in-depth**: Four independent layers prevent double-booking under any failure scenario
- **Performance**: Redis locks are fast (memory-only, ~1ms) — no DB contention for the common case
- **Prepare flow**: Long-lived prepare lock enables payment flow without losing the slot
- **Coach booking**: Separate lock prefix for coach-specific slot contention
- **Atomic release**: Lua script prevents accidental release of another owner's lock

### Negative

- **Redis dependency**: If Redis is down, booking creation is blocked (fail-open considered but rejected — double-booking risk outweighs availability)
- **Lock management complexity**: Must carefully acquire/release in correct order; stale locks auto-expire but waste time
- **TTL tuning**: 15s short lock may expire under heavy load; 10min prepare lock holds slot for long periods
- **Testing complexity**: Concurrency tests require simulating race conditions across multiple processes

## Evidence

- `redis-lock.ts:1-143` — full `RedisLock` implementation with prepare, multi-acquire, release
- `create-booking.command.ts:30-84` — booking creation command after lock acquisition
- `booking.concurrency.spec.ts` — concurrency integration tests
- `booking-constants.ts` — lock-related configuration constants

## Related Decisions

- GOV-ADR-003 (Event Composable Architecture): Booking events emitted after successful creation

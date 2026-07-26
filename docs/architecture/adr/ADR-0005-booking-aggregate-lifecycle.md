# ADR-0005: Booking Aggregate Lifecycle

## Status

Accepted

## Context

Bookings are the core aggregate in CourtZon. They progress through a well-defined state machine:

```
pending → pending_payment → confirmed → completed
                                     ↘ cancelled
          ↘ expired
```

Each state transition must:
- Be atomic (no partial updates)
- Use optimistic concurrency control (version field)
- Emit domain events for downstream consumers (notifications, match creation, financial journal entries)
- Be idempotent (replaying the same transition should not create duplicate side effects)

The team needed a consistent pattern for all booking state transitions.

## Decision

Implement the **Booking Aggregate** with the following patterns:

**1. State machine in `booking-aggregate.ts`**

A pure function `planTransition(fromStatus, toStatus, currentVersion)` validates whether a transition is allowed and returns the new version. Rejected transitions throw (e.g., `confirmed → confirmed` is rejected).

**2. Versioned persistence via `persistTransition`**

```sql
UPDATE bookings SET booking_status = ?, aggregate_version = aggregate_version + 1
WHERE id = ? AND aggregate_version = ?
```

The `WHERE aggregate_version = ?` clause provides optimistic locking. If another process modified the booking concurrently, the update affects zero rows and a version conflict error is thrown.

**3. Command pattern for state changes**

Each state transition is a command:

- `ConfirmBooking` — `pending → confirmed`
- `CancelBooking` — `pending|confirmed → cancelled`
- `CompleteBooking` — `confirmed → completed`
- `ExpireBooking` — `pending|pending_payment → expired`

Commands are executed through the `CommandPipeline` which provides:
- Idempotency checking via `processed_commands` table
- Transaction management via `withTransaction()`
- Domain event emission

**4. Domain events emitted on each transition**

- `booking:created` — booking was created (in any status)
- `booking:confirmed` — payment was successful
- `booking:cancelled` — booking was cancelled
- `booking:completed` — booking was completed
- `booking:expired` — payment timeout

## Consequences

**Benefits:**
- Clear, documented state machine prevents illegal transitions
- Optimistic concurrency prevents race conditions without locks
- Command pipeline provides idempotency — important for webhook retries
- Domain events enable decoupled side effects (match creation, notifications, financial journal)
- The pattern is easy to extend with new states or transitions

**Trade-offs:**
- Optimistic concurrency means the last writer wins — the first writer's transaction is not retried automatically
- Version conflicts must be handled at the application layer (retry or report error)
- The state machine is currently defined in a single file; as more states are added, it may need to be extracted

**Alternatives rejected:**
- *Pessimistic locking (SELECT FOR UPDATE)*: Would serialize all booking updates, causing throughput bottlenecks for popular time slots
- *Event Sourcing*: Overkill for booking state — we don't need the full event history for business operations; the current version field provides sufficient audit capability
- *Database-only state machine (CHECK constraints, triggers)*: Business logic in the database is harder to test and version

**Future considerations:**
- A `booking:no-show` and `booking:check-in` state may be needed for attendance tracking
- The `pending_payment` state has a TTL (3 minutes) enforced by the `cancel_expired_bookings` cron job — this TTL should be configurable per venue
- Consider adding a `booking:rescheduled` transition for date/time changes

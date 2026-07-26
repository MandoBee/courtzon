# ADR-0003: EventBus V2

## Status

Accepted

## Context

CourtZon needed a publish-subscribe mechanism for:

- **Domain events** — emitted when aggregates change state (e.g., `booking:confirmed`, `payment:succeeded`)
- **Integration events** — consumed by other bounded contexts (e.g., booking module emits `payment:failed-event`, match module listens)
- **Realtime events** — broadcast to connected clients via Socket.IO

The first version of the EventBus (`eventBus`) was a typed wrapper that handled events synchronously. It became a bottleneck as the platform grew because:

- No support for deferred dispatch after a database transaction committed
- No queue-based subscriber mechanism for reliable delivery to external consumers
- No outbox pattern — if a transaction committed but the event dispatch failed, the event was lost
- No way to distinguish transactional events (must wait for commit) from UI events (should dispatch immediately)
- In-memory handlers were called unconditionally within the same synchronous flow, making it impossible to defer side effects

## Decision

Build **EventBus V2** (`eventBusV2`) with three key mechanisms:

**1. Transaction-aware dispatch using AsyncLocalStorage**

Events emitted inside a `withTransaction()` callback are deferred via `onAfterCommit()` hooks. The hooks are flushed only after the transaction commits. Events emitted outside any transaction dispatch their in-memory handlers immediately.

```typescript
if (isInTransaction()) {
  onAfterCommit(() => { /* dispatch handlers */ });
} else {
  // dispatch in-memory handlers immediately
  for (const handler of handlers) handler(payload);
}
```

**2. Outbox pattern**

Every `emit()` call writes to the `published_events` table (the outbox). This provides an audit trail and enables reliable delivery to queue subscribers through the `OutboxPoller` (not yet started in production).

**3. Two subscriber types**

- **In-memory handlers** (`eventBusV2.on()`) — for realtime socket publishing and notification engine dispatch. These fire synchronously (or via deferred hooks after commit).
- **Queue subscribers** (`eventBusV2.subscribe()`) — for reliable delivery to external consumers via BullMQ queues. These always go through `onAfterCommit()` for transactional consistency.

## Consequences

**Benefits:**
- Transactional consistency: events are only dispatched after their originating transaction commits
- Immediate dispatch for non-transactional events eliminates the silent-event-loss problem
- Clear separation between transactional domain events and UI/realtime events
- Outbox table provides an audit trail and recovery mechanism

**Trade-offs:**
- `onAfterCommit()` is a global mutable array — hooks from different call sites accumulate; this requires careful management
- The `isInTransaction()` check uses `AsyncLocalStorage`, which has a small runtime cost
- Queue subscribers are not yet used in production (the outbox poller is also not started) — the infrastructure exists but hasn't been activated

**Alternatives rejected:**
- *Event Sourcing with EventStoreDB*: Too much infrastructure for the current scale; the outbox pattern in MySQL provides sufficient reliability
- *Message broker (RabbitMQ, Kafka)*: Adds operational complexity; BullMQ + the outbox table provides adequate delivery guarantees
- *Always-deferred dispatch*: Causes silent event loss for events emitted without transaction context (the previous broken behavior)
- *Always-immediate dispatch*: Risk of handlers reading uncommitted data

**Future considerations:**
- The `OutboxPoller` should be started in production to provide a safety net for any events whose hooks are never flushed
- Queue subscribers should be added for external integrations (email, SMS, push notifications)
- The `published_events` outbox table could be consumed by analytics or audit pipelines
- Consider replacing the global `afterCommitHooks` array with a scoped mechanism to prevent hook leakage between unrelated transactions

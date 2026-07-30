---
document_id: "TECH-ARCH-04"
document_name: "Event Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["architect", "developer"]
difficulty: "advanced"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  governs: ["TECH-ARCH-04"]
  references: ["TECH-ARCH-01", "TECH-ARCH-03"]
  related: ["VOLUME-15", "VOLUME-04"]
---

# CourtZon Event Architecture

## 1. EventBusV2 Implementation

The EventBus v2 (`backend/src/shared/event-bus/event-bus.v2.ts`) is a **durable, cursor-based event bus** that provides:

- **Durable event store** via `published_events` table
- **Cursor-based subscriber tracking** via `outbox_cursors` table
- **Queue-based dispatch** via BullMQ (default + notifications queues)
- **In-memory handlers** for notification engine (no durability needed)
- **Transactional emission** — events inserted within the caller's DB transaction

```
         ┌─────────────────────────────────────────────────────────┐
         │                     Event Flow                            │
         │                                                          │
         │  Domain Service                                          │
         │    │                                                     │
         │    ▼                                                     │
         │  eventBusV2.emit('booking:confirmed', payload, ctx)       │
         │    │                                                     │
         │    ├─→ published_events INSERT (in transaction)          │
         │    │                                                     │
         │    └─→ onAfterCommit ──→ BullMQ enqueue                  │
         │              │                 │                         │
         │              │           ┌─────┴──────┐                  │
         │              │           │  default    │ notifications   │
         │              │           │  queue      │ queue           │
         │              │           └─────┬──────┘                  │
         │              │                 │                         │
         │              │           Worker processes                │
         │              │           (deduplicate via jobId)         │
         │              │                                           │
         │              └─→ In-memory handlers (notification engine)│
         └─────────────────────────────────────────────────────────┘
```

**Evidence:** `event-bus.v2.ts:80-176` implements the full `emit()` flow including transaction-aware dispatch with `isInTransaction()` and `onAfterCommit()`.

## 2. Event Store (published_events)

Every emitted event is stored durably:

```sql
CREATE TABLE published_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL UNIQUE,    -- UUID v4
  event_name VARCHAR(255) NOT NULL,        -- e.g. 'booking:confirmed'
  aggregate_type VARCHAR(100) NOT NULL,    -- e.g. 'booking'
  aggregate_id VARCHAR(64) NOT NULL,       -- e.g. '42'
  aggregate_version INT NOT NULL,
  correlation_id VARCHAR(64),
  causation_id VARCHAR(64),
  payload JSON NOT NULL,
  metadata JSON,
  occurred_at DATETIME(3) NOT NULL,
  schema_version INT DEFAULT 1
);
```

**Evidence:** `event-bus.v2.ts:100-112` inserts into `publishedEventsRepository`. Deduplication via `ER_DUP_ENTRY` catch at line 114.

## 3. Cursor-Based Subscribers (outbox_cursors)

Subscribers track their progress via cursor columns in `outbox_cursors`:

```sql
CREATE TABLE outbox_cursors (
  subscriber_id VARCHAR(255) PRIMARY KEY,
  last_event_id BIGINT NOT NULL DEFAULT 0,
  last_processed_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
);
```

**Evidence:** `event-bus.v2.ts:54-78` implements `initCursorLatest()` and `initCursorAt()` for cursor initialization. Each subscriber registers with `startingCursor: 'latest'` or a specific event ID.

## 4. Subscriber Registration

```typescript
// Full subscriber registration with cursor tracking
eventBusV2.subscribe({
  eventName: 'booking:confirmed',
  subscriberId: 'booking-confirmed.email',
  queueName: 'notifications',
  options: {
    startingCursor: 'latest',    // Resume from latest event
    attempts: 6,
    backoffDelay: 2000,
  },
});
```

**Evidence:** `event-bus.v2.ts:39-52` implements `subscribe()` with cursor initialization and logging.

## 5. Queue Dispatch via BullMQ

Events are enqueued to BullMQ for async processing:

```typescript
// event-bus.v2.ts:127-139
await queueService.addToQueue(sub.queueName, envelope, {
  jobId: `${envelope.eventId}:${sub.queueName}`,  // Deduplication
  attempts: sub.options?.attempts ?? 6,
  backoffDelay: sub.options?.backoffDelay ?? 2000,
});
```

The `queueService` manages two queues:
- **default** — general background jobs (settlements, backups, expiry)
- **notifications** — notification delivery (email, SMS, push, in-app)

**Evidence:** `backend/src/infrastructure/queue/queue.service.ts:134-136` defines `DEFAULT_QUEUE_NAME = 'default'` and `NOTIFICATION_QUEUE_NAME = 'notifications'`. Lines 187-198 implement `add()` with automatic queue routing based on job type.

## 6. In-Memory Handlers

For latency-sensitive notification processing:

```typescript
// event-bus.v2.ts:178-182
on(eventName: string, handler: (data: any) => void): void {
  const existing = this.inMemoryHandlers.get(eventName) || [];
  existing.push(handler);
  this.inMemoryHandlers.set(eventName, existing);
}
```

**Evidence:** In-memory handlers fire synchronously (or via `onAfterCommit` if in transaction) at lines 141-148 and 150-156.

## 7. Event Catalog (80+ Events)

Events follow the naming convention `{domain}:{action}`:

| Domain | Events |
|--------|--------|
| `booking` | `booking:created`, `booking:confirmed`, `booking:cancelled`, `booking:completed`, `booking:expired` |
| `payment` | `payment:received`, `payment:failed`, `payment:refunded`, `payment:settled` |
| `user` | `user:registered`, `user:verified`, `user:password-changed`, `user:deactivated` |
| `organisation` | `organisation:created`, `organisation:verified`, `organisation:deactivated` |
| `tournament` | `tournament:published`, `tournament:registration-opened`, `tournament:started`, `tournament:completed` |
| `marketplace` | `order:placed`, `order:confirmed`, `order:shipped`, `order:delivered`, `order:cancelled` |
| `notification` | `notification:sent`, `notification:delivered`, `notification:failed`, `notification:opened` |
| `wallet` | `wallet:credited`, `wallet:debited`, `wallet:withdrawal-initiated`, `wallet:withdrawal-completed` |
| `academy` | `academy:enrollment-created`, `academy:enrollment-confirmed`, `academy:session-completed` |
| `settlement` | `settlement:processed`, `settlement:paid`, `settlement:failed` |

**Evidence:** Events are emitted throughout the codebase via `eventBusV2.emit(eventName, payload, context)` calls in service files.

## 8. Metrics & Monitoring

```typescript
// event-bus.v2.ts:14-33
const emitTotal = new client.Counter({ name: 'courtzon_eventbus_emit_total', labelNames: ['event_name'] });
const enqueueTotal = new client.Counter({ name: 'courtzon_eventbus_enqueue_total', labelNames: ['queue'] });
const enqueueFailedTotal = new client.Counter({ name: 'courtzon_eventbus_enqueue_failed_total', labelNames: ['queue'] });
```

**Evidence:** Prometheus counters track emit, enqueue, and failure rates per event name and queue.

## 9. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-ARCH-01 | System Architecture (context) |
| TECH-ARCH-03 | Domain Model (domain events) |
| VOLUME-15 | Notifications (event-driven notification engine) |

## 10. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

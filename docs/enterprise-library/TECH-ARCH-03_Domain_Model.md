---
document_id: "TECH-ARCH-03"
document_name: "Domain Model"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["architect", "developer"]
difficulty: "advanced"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Architect"
documentation_owner: "Technical Writing"
reviewer: "Lead Developer"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  governs: ["TECH-ARCH-03"]
  references: ["TECH-ARCH-02", "TECH-ARCH-04"]
  related: ["VOLUME-03", "VOLUME-11"]
---

# CourtZon Domain Model

## 1. Domain-Driven Design Approach

CourtZon applies tactical Domain-Driven Design patterns within the hexagonal architecture. Each module's `domain/` folder contains the pure business logic with zero infrastructure dependencies.

```
┌──────────────────────────────────────────────────────────────┐
│                     DDD LAYERS IN MODULE                       │
│                                                              │
│  domain/        Pure TypeScript — no imports from mysql,     │
│                 fastify, ioredis, or any framework           │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Aggregate Root  │  Value Objects   │  Domain Events  │   │
│  │  e.g. Booking    │  e.g. Money,     │  e.g. Booking   │   │
│  │  Aggregates      │  Address,         │  Confirmed      │   │
│  │                  │  Slot             │                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  State Machines  │  Domain Services  │  Specifications │   │
│  │  (lifecycle.ts)  │  e.g. Pricing     │  e.g. Slot      │   │
│  │                  │  Engine           │  Generator       │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## 2. Global Identity

The system uses a **Global Identity** approach:
- Every aggregate root has a `id: number` (auto-increment primary key)
- Human-readable identifiers use UUIDs stored as `uuid: string` columns
- Version tracking via `aggregate_version: number` for optimistic concurrency

```typescript
// Every aggregate type follows this pattern:
interface AggregateRoot {
  id: number;
  uuid: string;         // generated via generateUUID()
  aggregate_version: number;  // optimistic locking
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;    // soft delete
}
```

**Evidence:** `backend/src/modules/booking/domain/booking-aggregate.ts` defines the Booking aggregate. `booking.repository.ts:11-15` implements `AggregateVersionConflict` for optimistic locking.

## 3. Aggregate Roots

### Booking Aggregate
```
Booking
├── id: number (PK)
├── uuid: string
├── user_id: number (FK → users)
├── resource_id: number (FK → resources)
├── organisation_id: number (FK → organisations)
├── branch_id: number (FK → branches)
├── booking_type: string (single | recurring | academy | tournament)
├── booking_status: string (pending | confirmed | in_progress | completed | cancelled)
├── payment_status: string (unpaid | paid | refunded)
├── aggregate_version: number
├── booking_slots[]   →   1:N relationship
├── booking_payments[]  →   1:N relationship
└── booking_notes text
```

**Evidence:** `booking.repository.ts:31-40` shows the create method with all booking fields. The booking module has ~1,500 lines across application, domain, infrastructure, and presentation layers.

### Tournament Aggregate
```
Tournament
├── id: number (PK)
├── status: TournamentStatus (draft → published → registration_open → registration_closed → running → completed → cancelled → archived)
├── registration_deadline: Date
├── participants[]
├── matches[]
├── bracket_structure: JSON
└── aggregate_version: number
```

**Evidence:** `backend/src/modules/tournaments/domain/lifecycle.ts:5-14` defines the tournament state machine with allowed transitions.

### League Aggregate
```
League
├── id: number (PK)
├── status: string
├── season: string
├── teams[]
├── fixtures[]
├── standings: JSON
└── aggregate_version: number
```

**Evidence:** `backend/src/modules/leagues/domain/lifecycle.ts` defines the league state machine.

### Order Aggregate (Marketplace)
```
Order
├── id: number (PK)
├── user_id: number (FK → users)
├── organisation_id: number (FK → organisations)
├── order_status: string (pending → confirmed → shipped → delivered → cancelled)
├── payment_status: string
├── total_amount: number
├── order_items[]
├── shipping_address_id: number
└── aggregate_version: number
```

### Employee Aggregate
```
Employee (via HR module)
├── id: number (PK)
├── user_id: number (FK → users)
├── organisation_id: number (FK → organisations)
├── position: string
├── salary: number
├── employment_status: string
└── aggregate_version: number
```

## 4. Value Objects

Value objects are implemented as TypeScript types or simple classes:

```typescript
// Money value object
type Money = { amount: number; currency: string };

// Slot value object
type Slot = { resourceId: number; date: string; startTime: string; endTime: string };

// Address value object
type Address = { line1: string; line2?: string; city: string; province: string; postalCode: string; country: string };
```

**Evidence:** `booking-constants.ts` defines constant value objects for booking types, statuses, and categories. `booking.types.ts` (or equivalent in domain/) defines all domain-specific types.

## 5. Domain Events

Domain events are emitted via EventBusV2 after aggregate state changes:

```typescript
// booking.service.ts emits events after state transitions
await eventBusV2.emit('booking:confirmed', {
  bookingId: booking.id,
  userId: booking.userId,
  resourceId: booking.resourceId,
  amount: booking.totalAmount,
}, {
  aggregateType: 'booking',
  aggregateId: String(booking.id),
  aggregateVersion: booking.aggregate_version,
});
```

**Evidence:** `backend/src/shared/event-bus/event-bus.v2.ts:80-85` defines the `emit()` method. Events include `aggregateType`, `aggregateId`, `aggregateVersion` for correlation.

## 6. State Machines (lifecycle.ts)

Three modules have explicit state machine implementations in `domain/lifecycle.ts`:

### Tournament Lifecycle
```typescript
// backend/src/modules/tournaments/domain/lifecycle.ts:5-14
const TOURNAMENT_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ['published'],
  published: ['registration_open'],
  registration_open: ['registration_closed'],
  registration_closed: ['running'],
  running: ['completed', 'cancelled'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};
```

### League Lifecycle
```typescript
// backend/src/modules/leagues/domain/lifecycle.ts
// Defines league status transitions
```

### Academy Lifecycle
```typescript
// backend/src/modules/academy/domain/lifecycle.ts
// Defines academy program status transitions
```

All lifecycle files export `validateTransition()` and `getAllowedTransitions()` functions that throw `ConflictError` with domain-specific error codes for invalid transitions.

**Evidence:** `tournaments/domain/lifecycle.ts:24-33` implements `validateTournamentTransition()` which throws `ConflictError` with `ErrorCodes.TOURNAMENT_INVALID_TRANSITION`.

## 7. Aggregate Version Optimistic Locking

```typescript
// backend/src/modules/booking/infrastructure/repositories/booking.repository.ts:11-15
export class AggregateVersionConflict extends ConflictError {
  constructor(bookingId: number, expectedVersion: number, actualVersion: number) {
    super(`Booking ${bookingId} version conflict: expected ${expectedVersion}, actual ${actualVersion}`);
  }
}
```

**Evidence:** The booking repository checks `aggregate_version` on every write operation and throws `AggregateVersionConflict` if the version doesn't match. The metric `aggregateVersionConflictsTotal` tracks conflicts.

## 8. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-ARCH-02 | Module Architecture (hexagonal pattern context) |
| TECH-ARCH-04 | Event Architecture (domain events) |
| VOLUME-03 | Business Domains |
| VOLUME-11 | Entity Lifecycles |

## 9. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

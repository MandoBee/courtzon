---
document_id: "TECH-MOD-03"
document_name: "Booking Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 25
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-19", "TECH-MOD-09"]
  related: ["TECH-MOD-07", "TECH-MOD-10"]
---

# Booking Module (TECH-MOD-03)

**Source:** `backend/src/modules/booking/` (6 entries, 7 domain files, 1 application service, 1 infrastructure repo, 1 Redis lock, 3 presentation files, __tests__/)

**File count:** 7 domain/ + 1 application/ + 3 presentation/ + 2 infrastructure/ + 3 __tests__/ = ~16 files. Largest module.

## 1. Purpose

Court & resource booking lifecycle management. Supports multi-slot booking, matchmaking (finding partners for open slots), check-in, cancellation with fee, and payment integration. 18 routes, 100% permission-gated.

## 2. Architecture

```
domain/
  booking-aggregate.ts    — State machine (9 statuses)
  booking-constants.ts    — Cancellable statuses
  pricing-engine.ts       — Domain pricing logic
  slot-generator.ts       — Time slot generation
  version-contract.spec.ts — Version contract tests
application/
  booking.service.ts      — Use-case orchestrator
infrastructure/
  repositories/
    booking.repository.ts
  redis/
    redis-lock.ts         — Distributed Redis locks
commands/
  cancel-booking.command.ts
  prepare-booking.command.ts
presentation/
  booking.routes.ts       — 18 endpoints
  booking.controller.ts   — Request handlers
  booking.dto.ts          — Zod schemas
```

**Evidence:** Source at `backend/src/modules/booking/domain/booking-aggregate.ts` (63 lines) defines state machine.

## 3. Routes (18)

Defined in `booking.routes.ts:8-28`:

| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 1 | POST | `/bookings` | `bookings.create` | Create booking |
| 2 | POST | `/bookings/prepare` | `bookings.create` | Prepare (hold slot) |
| 3 | DELETE | `/bookings/prepare/:prepareId` | `bookings.create` | Cancel prepare |
| 4 | GET | `/bookings` | `bookings.view` | List user bookings |
| 5 | GET | `/bookings/:id` | `bookings.view` | Get booking detail |
| 6 | POST | `/bookings/:id/cancel` | `bookings.cancel` | Cancel booking |
| 7 | POST | `/bookings/:id/check-in` | `bookings.check-in` | Check in |
| 8 | PATCH | `/bookings/:id/status` | `admin.bookings.update-status`, `org.bookings.manage` | Admin status update |
| 9 | PATCH | `/bookings/:id/payment` | `admin.bookings.update-status`, `org.bookings.manage` | Admin payment update |
| 10 | GET | `/resources/:resourceId/slots` | `bookings.view` | Get resource slots |
| 11 | GET | `/organisations/:orgId/bookings` | `bookings.view` | Org-scoped bookings |
| 12 | GET | `/admin/bookings` | `bookings.view` | All bookings (admin) |
| 13 | POST | `/bookings/:id/matchmaking` | `bookings.matchmaking` | Start matchmaking |
| 14 | GET | `/bookings/:id/matchmaking/candidates` | `bookings.matchmaking` | Get candidates |
| 15 | POST | `/bookings/:id/apply` | `bookings.matchmaking` | Apply to join |
| 16 | DELETE | `/booking-invitations/:invitationId` | `bookings.matchmaking` | Cancel application |
| 17 | POST | `/booking-invitations/:invitationId/respond` | `bookings.matchmaking` | Respond to applicant |
| 18 | GET | `/bookings/:id/applicants` | `bookings.view` | List applicants |

## 4. Permissions

All 18 routes are permission-gated via `requirePermission([...])`:
- `bookings.create`, `bookings.view`, `bookings.cancel`, `bookings.check-in`
- `bookings.matchmaking` — matchmaking operations
- `admin.bookings.update-status`, `org.bookings.manage` — admin/org management

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Booking | `bookings` | `id, user_id, resource_id, branch_id, booking_date, start_time, end_time, booking_status, payment_status, total_amount, aggregate_version, expires_at` |
| Booking Slot | `booking_slots` | `id, booking_id, resource_id, date, start_time, end_time` |
| Booking Invitation | `booking_invitations` | `id, booking_id, from_user_id, to_user_id, status` |
| Booking Applicant | `booking_applicants` | `id, booking_id, user_id, status` |

## 6. Events

Emitted via event bus:
- `booking:created` — On booking creation
- `booking:cancelled` — On cancellation (includes reason)
- `booking:checked_in` — On check-in
- `booking:matchmaking_started` — Matchmaking initiated
- `booking:applicant_applied` — Player applied to join
- `booking:applicant_responded` — Host responded

## 7. State Machine

Booking lifecycle defined in `booking-aggregate.ts:6-16`:

```
                ┌─────────────────────────────────┐
                │           pending                │
                │    (or pending_payment)          │
                └──────┬────────────┬─────────────┘
                       │            │
                ┌──────▼──┐  ┌─────▼──────┐
                │confirmed│  │ cancelled  │
                └──┬──┬───┘  │ expired    │
                   │  │      └────────────┘
           ┌───────▼──▼────────┐
           │   checked_in      │
           └───────┬───────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
   completed              no_show
                    cancelled_with_fee
```

**Terminal states:** `cancelled`, `expired`, `completed`, `no_show`, `cancelled_with_fee`

**Evidence:** `booking-aggregate.ts:6-16` defines `ALLOWED_TRANSITIONS`. `booking-aggregate.ts:42-44` defines `isTerminal()`. `booking-constants.ts:1-6` defines `CANCELLABLE_BOOKING_STATUSES = ['pending', 'pending_payment', 'confirmed', 'checked_in']`.

## 8. Optimistic Concurrency

`aggregate_version` field on bookings enables optimistic locking. `planTransition()` in `booking-aggregate.ts:46-49` increments version. `version-contract.spec.ts` tests version integrity.

## 9. Audit Events

- `BOOKING.CREATE` — Booking created
- `BOOKING.CANCEL` — Booking cancelled
- `BOOKING.REFUND` — Refund processed
- `BOOKING.STATUS_CHANGE` — Status updated by admin

**Evidence:** `audit-log.types.ts` lines 27-30 define these audit types.

## 10. Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `BOOKING_EXPIRY_MINUTES` | `15` | Pending booking expiration |
| `BOOKING_MAX_FUTURE_DAYS` | `30` | Max advance booking |

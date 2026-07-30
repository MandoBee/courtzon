---
document_id: "TECH-ARCH-12"
document_name: "Booking Flow Deep Dive"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 30
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-MOD-03", "TECH-ARCH-02", "TECH-ARCH-04"]
  related: ["TECH-MOD-09", "TECH-MOD-10", "TECH-MOD-17", "TECH-MOD-19"]
---

# Booking Flow Deep Dive (TECH-ARCH-12)

## 1. Overview

The Booking flow is CourtZon's most complex transactional operation. It spans 7+ modules (booking, payment, wallet, financial, scheduling, match, notifications) and uses distributed locking, optimistic concurrency, event-driven state machines, and background workers.

**Source files referenced:**
- `backend/src/modules/booking/application/booking.service.ts` (~1500 lines, main orchestrator)
- `backend/src/modules/booking/infrastructure/repositories/booking.repository.ts` (~646 lines, data access)
- `backend/src/modules/booking/domain/booking-aggregate.ts` (state machine)
- `backend/src/modules/booking/domain/pricing-engine.ts` (pricing)
- `backend/src/modules/booking/domain/slot-generator.ts` (slot generation)
- `backend/src/modules/booking/infrastructure/redis/redis-lock.ts` (distributed locking)
- `backend/src/modules/booking/infrastructure/booking-workflow.ts` (workflow defs)
- `backend/src/modules/booking/infrastructure/booking-expiry.worker.ts` (expiry worker)
- `backend/src/modules/booking/infrastructure/booking-auto-complete.worker.ts` (auto-complete worker)
- `backend/src/modules/booking/commands/create-booking.command.ts` (command handler)
- `backend/src/modules/booking/commands/confirm-booking.command.ts` (command handler)
- `backend/src/modules/booking/commands/cancel-booking.command.ts` (command handler)
- `backend/src/modules/booking/commands/complete-booking.command.ts` (command handler)
- `backend/src/modules/booking/commands/expire-booking.command.ts` (command handler)

## 2. Complete Booking Lifecycle

```
┌─────────────┐
│ User selects │
│ date/time   │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ GET /resources/:id  │──→ Load resource details (opening/closing hours, pricing)
│ /slots?date=        │──→ SlotGenerator creates time slots; SlotResolver marks available/booked
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────┐
│ POST /bookings          │──→ Entry: createBooking() in booking.service.ts
│ (with paymentMethod)    │
└──────────┬──────────────┘
           │
           ▼
┌──────────────────────────────┐
│ 1. Load branch & timezone    │──→ `SELECT FROM branches WHERE id = ?`
│ 2. Compute UTC timestamps    │──→ TimeEngine.localToUtc(bookingDate, startTime, branchTz)
│ 3. Compute business date     │──→ TimeEngine.getBusinessDate(startAtUtc, ...)
│ 4. Generate individual slots │──→ splitTimeRange(startTime, endTime, slotDuration)
│ 5. Validate slot alignment   │──→ Error if gaps or misalignment
│ 6. Calculate pricing         │──→ pricingEngine.calculatePrice(resourceId, startTime, endTime)
│    - Standard rate           │──→ hourly_price from resources table
│    - Peak surcharge          │──→ peak_hour_pricing table (day_of_week, time range, multiplier)
│ 7. Calculate commission      │──→ commissionService.calculate(branchId, 'booking', total)
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ 8. Acquire Redis Locks       │──→ redisLock.acquireAll(slots, lockOwner)
│    - Lock key format:         │──→ `booking:lock:{resourceId}:{date}:{slotStart}`
│    - Lock TTL: 15 seconds     │──→ LOCK_TTL_MS = 15000
│    - Per-slot locking         │──→ Atomic SET NX PX per slot
│    - Auto-release on failure  │──→ If any slot fails, release all acquired
│    - Timeout: 5 seconds       │──→ abort if cannot acquire all within 5s
└──────────┬───────────────────┘
           │
           ▼
┌───────────────────────────────────────┐
│ 9. Payment handling (3 paths)         │
├───────────────────────────────────────┤
│ Path A: wallet payment                │
│   - Lock wallet balance               │──→ walletRepository.lockAndGetBalance()
│   - Check balance ≥ total             │
│   - Status: confirmed + paid          │
│   - Deduct wallet + create txn        │──→ walletRepository.updateBalance()
│                                       │──→ transactionService.createBookingPayment()
├───────────────────────────────────────┤
│ Path B: cash/COD payment              │
│   - Status: confirmed + pending       │──→ bookingStatus='confirmed', paymentStatus='pending'
│   - Create COD journal entries        │──→ INSERT into transactions + transaction_entries
├───────────────────────────────────────┤
│ Path C: card/online gateway           │
│   - Status: pending_payment           │──→ bookingStatus='pending_payment', expires_at=+3min
│   - Create gateway session            │──→ paymentService.charge()
│   - Gateway failure → auto-cancel     │──→ executeBookingCommand('CancelBooking', ...)
│   - Return paymentUrl + clientSecret  │
└──────────┬────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│ 10. Database transaction (ALL paths) │──→ conn.beginTransaction()
│     a. Check slot availability       │──→ bookingRepository.checkSlotAvailability() WITHIN txn
│     b. INSERT into bookings           │──→ bookingRepository.create() — version=1
│     c. INSERT booking_slots rows     │──→ per individual slot, is_available=FALSE
│     d. Insert participants (if any)   │──→ booking_participants table
│     e. Wallet debit (if wallet)      │──→ walletRepository.updateBalance()
│     f. COD journal entries (if COD)  │──→ transaction + transaction_entries
│     g. COMMIT                        │
└──────────┬───────────────────────────┘
           │
           ▼
┌───────────────────────────────────────┐
│ 11. Emit events                       │
│     - booking:created                 │──→ eventBusV2.emit('booking:created', {...})
│     - booking:confirmed (if instant)  │──→ eventBusV2.emit('booking:confirmed', {...})
│     - Schedule reminder               │──→ scheduleBookingReminder(bookingId, userId, startDate)
├───────────────────────────────────────┤
│ 12. Release Redis locks               │──→ redisLock.releaseAll(slots, lockOwner) [finally block]
└───────────────────────────────────────┘
```

**Source:** `booking.service.ts:76-394` — the `createBooking()` method implements this entire flow.

## 3. Slot Availability Resolution

The `getResourceSlots` method (`booking.service.ts:850-920`) resolves slot availability:

1. **Generate theoretical slots** — `SlotGenerator.generate()` creates 30/60-min slots from operating hours
2. **Query existing bookings** — `bookingRepository.findBookingsByBusinessDate()` fetches all non-cancelled bookings
3. **TimeEngine resolution** — `TimeEngine.resolveSlots()` crosses generated slots against existing bookings to mark each as `available` or `booked`
4. **Return with status** — Each slot returned with `status`, `startAtUtc`, `endAtUtc`, `businessDate`, `utcOffsetMinutes`, `dstOverlap`

## 4. Redis Lock Implementation

Two lock TTLs exist:

| Lock Type | TTL | Purpose | Method |
|-----------|-----|---------|--------|
| Booking Lock | 15s | Short-duration lock during booking creation | `redisLock.acquire()` |
| Prepare Lock | 10min | Long-duration lock during payment gateway flow | `redisLock.acquireForPrepare()` |

The lock key format is `booking:lock:{resourceId}:{date}:{slotStart}`.

Locks use Lua scripts for safe release (owner check before delete):
```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
```

**Source:** `redis-lock.ts:36-46`

## 5. Payment Processing

### Wallet Payment Flow

```
booking.service.ts:245-253
├── walletRepository.findByUserId(userId)      → get wallet ID
├── walletRepository.lockAndGetBalance(walletId, conn)  → pessimistic lock
├── if balance ≥ totalAmount:
│   ├── bookingStatus = 'confirmed'
│   ├── paymentStatus = 'paid'
│   └── walletRepository.updateBalance(walletId, newBalance, version, conn)
└── transactionService.createBookingPayment()   → create transaction entry
```

### Gateway Payment Flow

```
booking.service.ts:166-237
├── bookingStatus = 'pending_payment', expires_at = NOW + 3 min
├── INSERT booking (within transaction)
├── COMMIT
├── paymentService.charge(userId, { referenceType: 'booking', amount, ... })
├── if !gwResult.success:
│   └── executeBookingCommand('CancelBooking', ...)  → auto-cancel
└── emit booking:created event
```

**Evidence:** `booking.service.ts:76-394` defines all three payment paths with inline logic.

## 6. Confirmation and Event Emission

When a booking is confirmed (either immediately or via webhook):

```typescript
// booking.service.ts:372-381
eventBusV2.emit('booking:confirmed', { bookingId, userId, bookingType });
scheduleBookingReminder(bookingId, userId, startDate);
```

The `confirm-booking.command.ts` executes the state transition via the command pipeline:
```
validate → planTransition(pending→confirmed, version+1) → persistTransition → events → booking:confirmed
```

**Source:** `confirm-booking.command.ts:27-80`

## 7. Matchmaking — Public Match Creation

When a booking is created with `bookingType: 'public_match'`:

1. The `CreateBookingSchema` accepts an optional `matchmaking` object in `booking.dto.ts:3-11`
2. If matchmaking is provided, `booking.service.ts:600-899` stores criteria via `bookingRepository.createMatchmakingRequest()`
3. The booking appears in `GET /matches` for discovery by other players
4. Socket events are emitted: `booking:matchmaking_started`, `booking:applicant_applied`, `booking:applicant_responded`
5. Real-time updates via `socketService.on('match.available', invalidate)` in MatchListPage

**Evidence:** `booking.routes.ts:21-27` defines matchmaking routes. `MatchListPage.tsx:87-97` subscribes to socket events.

## 8. Check-In

```
booking.service.ts:922-925
└── bookingRepository.persistTransition(id, 'checked_in')
    └── UPDATE bookings SET booking_status = 'checked_in', version = version + 1 WHERE id = ?
    └── Checks aggregate_version for optimistic concurrency
```

**Transition:** `confirmed → checked_in` (per `booking-aggregate.ts:9`)

## 9. Completion

### Manual Completion
```
booking.service.ts:932-946
├── Payment type check: COD → settle COD wallet + complete
├── Non-COD → just complete
└── executeBookingCommand('CompleteBooking', ...)
```

### Auto-Completion (Background Worker)
```
booking-auto-complete.worker.ts:25-45
├── SELECT id FROM bookings WHERE booking_status = 'confirmed' AND start_time < NOW()
├── For each: executeBookingCommand('CompleteBooking', ...)
└── Updates booking_status to 'completed'
```

## 10. Lifecycle Transitions Summary

| Transition | Triggered By | Command | Event | Worker |
|-----------|-------------|---------|-------|--------|
| → pending | createBooking() | CreateBooking | booking:created | — |
| → pending_payment | createBooking() (gateway) | CreateBooking | booking:created | ExpiryWorker (3-min TTL) |
| → confirmed | wallet payment / gateway webhook / admin | ConfirmBooking | booking:confirmed | — |
| → cancelled | User/admin cancel | CancelBooking | booking:cancelled | — |
| → expired | ExpiryWorker | ExpireBooking | — | ExpiryWorker (every 5 min) |
| → checked_in | User check-in | — | booking:checked_in | — |
| → completed | AutoCompleteWorker / admin | CompleteBooking | booking:completed | AutoCompleteWorker (every 10 min) |
| → no_show | Admin (no-show) | CancelBooking | booking:cancelled | — |

## 11. Optimistic Concurrency

The `version` (alias `aggregate_version`) field on `bookings` table enables optimistic locking:

1. Every `persistTransition()` call includes `WHERE aggregate_version = ?` in the UPDATE
2. If another process modified the row concurrently, `affectedRows === 0` triggers `AggregateVersionConflict`
3. The metric `aggregate_version_conflicts_total` tracks conflict rate
4. `planTransition()` in `booking-aggregate.ts:46-49` increments the version

**Source:** `booking.repository.ts:57-79`, `booking-aggregate.ts:46-49`

## 12. Prepare Flow (Gateway Booking)

The prepare flow is an alternative creation path for gateway payments:

```
POST /bookings/prepare
├── Redis locks acquired (10-min TTL)
├── Slot availability checked
├── Payment gateway intention created
├── Prepare data stored in Redis: `booking:prepare:{prepareId}` (10-min TTL)
└── Returns prepareId + clientSecret

POST /bookings (with prepareId)
├── Load prepare data from Redis
├── Start DB transaction
├── Clean up orphaned terminal bookings for same slot
├── Create booking (pending_payment)
├── Populate booking_slots
├── Emit booking:created event
└── Release Redis locks
```

**Source:** `booking.service.ts:400-527` (prepare) and `541-650` (_createFromPrepare)

## 13. Cancellation with Fee

```
booking.service.ts:975-1014
├── _calculateCancellationFee(booking) → { feeAmount, refundAmount }
│   └── Reads cancellation_policy_snapshot JSON
├── If COD:
│   ├── refunded → _refundCODWallet()
│   ├── partially_refunded → partial refund
│   └── penalty → _recordCODWalletTransaction('penalty')
├── If paid (gateway):
│   └── refundAmount > 0 → _processGatewayRefund()
└── Emit booking:cancelled event
```

**CANCELLABLE_BOOKING_STATUSES:** `['pending', 'pending_payment', 'confirmed', 'checked_in']`

**Source:** `booking-constants.ts:1-6`, `booking.service.ts:927-1018`

## 14. Key Configuration

| Config | Default | Location | Purpose |
|--------|---------|----------|---------|
| `BOOKING_EXPIRY_MINUTES` | 15 | env | Pending booking TTL |
| `BOOKING_MAX_FUTURE_DAYS` | 30 | env | Max advance booking window |
| `LOCK_TTL_MS` | 15000 | `redis-lock.ts:3` | Booking lock duration |
| `PREPARE_LOCK_TTL_MS` | 600000 | `redis-lock.ts:4` | Prepare lock duration (10 min) |
| Gateway expires_at | 3 min | `booking.service.ts:175` | Pending payment booking TTL |
| `BOOKING_V2_CREATE` | off | `isFeatureEnabled()` | Feature flag for v2 create |
| `BOOKING_V2_CONFIRM` | off | `isFeatureEnabled()` | Feature flag for v2 confirm |
| `BOOKING_V2_CANCEL` | off | `isFeatureEnabled()` | Feature flag for v2 cancel |
| `BOOKING_V2_COMPLETE` | off | `isFeatureEnabled()` | Feature flag for v2 complete |

**Source:** `booking.service.ts:77`, `928`, `957`, `933` for feature flags; `redis-lock.ts:3-4` for lock TTLs.

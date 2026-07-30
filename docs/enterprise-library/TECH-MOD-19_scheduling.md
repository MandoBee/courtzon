---
document_id: "TECH-MOD-19"
document_name: "Scheduling Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-03"]
  related: ["TECH-MOD-04", "TECH-MOD-05", "TECH-MOD-26"]
---

# Scheduling Module (TECH-MOD-19)

**Source:** `backend/src/modules/scheduling/` (8 entries: domain/, application/, commands/, providers/, presentation/, __tests__/, scheduling-engine.ts, types.ts)

## 1. Purpose

Unified scheduling engine with 5-phase pipeline: getAvailableSlots → crossValidate → price → rank. Orchestrates court + coach + referee availability across providers. Uses Redis distributed locks for booking concurrency. SAGA compensation pattern on failure.

## 2. Architecture

```
scheduling-engine.ts     — Core engine with 5-phase pipeline (206 lines)
types.ts                 — All type definitions (71 lines)
providers/
  court.provider.ts      — Court availability provider
  coach.provider.ts      — Coach availability provider
  referee.provider.ts    — Referee availability provider
application/
  scheduling-booking.service.ts  — 274 lines, booking orchestration with SAGA
domain/
  (domain types)
presentation/
  scheduling.routes.ts   — 3 endpoints (11 lines)
  scheduling.controller.ts
  scheduling.dto.ts
```

**Evidence:** `scheduling-engine.ts` (206 lines), `types.ts` (71 lines), `court.provider.ts` (100 lines), `scheduling-booking.service.ts` (274 lines).

## 3. Routes (3)

Defined in `scheduling.routes.ts:8-11`:

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | POST | `/scheduling/search` | Search for available coach sessions |
| 2 | GET | `/scheduling/coaches/:coachId/availability` | Get coach availability |
| 3 | POST | `/scheduling/book` | Book a coach session |

## 4. Engine Pipeline

`SchedulingEngine.search()` in `scheduling-engine.ts:12-39` implements 5 phases:

```
Phase 1: getAvailableSlots(request, providers)
  → For each provider, check availability, get time slots, filter by duration
  → Compute cartesian product of all provider slot combinations

Phase 2: crossValidate(combinations, constraints)
  → Apply cross-constraints (sport_match, location_match)
  → Filter out invalid combinations

Phase 3: price(combinations, request, pricingFn)
  → Call pricing function for each resource slot
  → Sum total price for each combination

Phase 4: rank(candidates)
  → Calculate score for each candidate (100 base - penalties)
  → Sort by score descending

Phase 5: return ranked candidates
```

**Evidence:** `scheduling-engine.ts:41-64` (getAvailableSlots), `:67-87` (crossValidate), `:116-153` (price), `:155-176` (rank).

## 5. Providers

Three provider implementations implement `ResourceProvider` interface (`types.ts:24-33`):

| Provider | File | resourceType | Data Source |
|----------|------|-------------|-------------|
| `CourtProvider` | `court.provider.ts` | `'court'` | `resources` + `bookings` tables + `TimeEngine` |
| `CoachProvider` | `coach.provider.ts` | `'coach'` | `coach_sessions` + user availability |
| `RefereeProvider` | `referee.provider.ts` | `'referee'` | Referee schedule |

Each provider implements:
- `getAvailableSlots(date, dayOfWeek)` → `TimeSlot[]`
- `hasConflict(startTime, endTime, date)` → `boolean`
- `getCapabilities()` → `ResourceCapabilities`
- `getLocation()` → `LocationInfo | null`
- `isAvailable()` → `boolean`

## 6. Redis Distributed Locks

Used in `scheduling-booking.service.ts:74-78`:

```
const coachLocked = await redisLock.acquireCoach(coachId, date, startTime, lockOwner);
if (!coachLocked) throw ConflictError('Coach already being booked');
```

Lock TTL: `COACH_LOCK_TTL_MS = 15000` (15 seconds)
Lock is ALWAYS released in `finally` block (`scheduling-booking.service.ts:170-172`).

**Evidence:** `scheduling-booking.service.ts:20` defines lock TTL, `:74-78` acquires lock, `:170-172` releases.

## 7. SAGA Compensation Pattern

When coach session creation or linking fails after the court booking is committed, `compensateBooking()` (`scheduling-booking.service.ts:181-253`) performs:

1. Cancel the booking via `commandPipeline` (CancelBooking command)
2. If paid, refund the wallet balance
3. Create a refund transaction record
4. Log for manual intervention if refund fails

**Evidence:** `scheduling-booking.service.ts:129-153` shows compensation triggered on failure. Full implementation at `:181-253`.

## 8. Types

Key types defined in `types.ts`:
- `ResourceProvider` — Interface for all providers
- `ResourceCapabilities` — Sports, certifications, rates
- `ResourceSlot` — A specific time slot for a specific resource
- `CrossConstraint` — `sport_match` | `location_match`
- `ActivityConfig` — Required resources and constraints
- `BookingRequest` — Search parameters
- `BookingCandidate` — Ranked result with pricing

## 9. Events

- `scheduling:search_completed` — Search results returned
- `scheduling:booking_created` — Coach session booked
- `scheduling:booking_compensated` — Compensation triggered

## 10. Audit Events

All booking operations record audit logs via `recordAudit()`.

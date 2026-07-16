# ADR-004: Universal Scheduling Architecture

## Status
Accepted — July 2026

## Context
The old system had scheduling logic scattered across modules: CoachBookingController, CourtBookingController, PrivateMatchController, BookingIntentService. Each duplicated resource discovery, conflict detection, and pricing logic. Adding a new activity type required copy-pasting an entire controller.

## Decision
We adopt a **Universal Scheduling Architecture** where any activity type (coach session, private match, tournament, equipment rental) is solved by the same engine. The engine is resource-based, not activity-based.

### Core Principle
Every activity is defined as a combination of required resources plus cross-constraints:

```typescript
const COACH_SESSION_CONFIG: ActivityConfig = {
  activityType: 'coach_session',
  requiredResources: [
    { resourceType: 'coach' },
    { resourceType: 'court' },
  ],
  crossConstraints: [
    { type: 'sport_match', from: 'coach', to: 'court' },
    { type: 'location_match', from: 'coach', to: 'court' },
  ],
};
```

Adding a new activity type (e.g., private match) requires only a new `ActivityConfig` object:

```typescript
const PRIVATE_MATCH_CONFIG: ActivityConfig = {
  activityType: 'private_match',
  requiredResources: [
    { resourceType: 'court' },
  ],
  crossConstraints: [],  // No coach needed
};
```

### Two Entry Points
The system supports two user-facing flows that both call the same engine:
1. **Court First** — User selects a court → Engine finds available coaches
2. **Coach First** — User selects a coach → Engine finds available courts

The entry point determines which providers are passed to the engine. The engine's search logic is identical regardless of entry point.

### Atomic Reservation
When a user selects a candidate, all required resources are reserved atomically:
1. Redis distributed lock on all slot keys
2. DB transaction with court booking + coach session creation
3. Wallet deduction (if applicable)
4. Event emission (`booking:created`, `booking:confirmed`)
5. Booking reminder scheduling

If any step fails, all locks are released and no partial booking is created.

## Consequences
- **+** One engine handles all activity types — no per-activity duplication
- **+** New activity types require only a config object + optional new provider
- **+** Two entry points (court-first, coach-first) share 95% of code
- **+** Cross-validation is generic (sport_match, location_match work for any resource pair)
- **-** Activity configs must be maintained manually — no auto-discovery
- **-** Simple activities (e.g., court-only booking) still go through the engine (slight overhead)
- **-** Complex activities with many resource types may have large cartesian products (mitigated by cross-validation filtering)

## Architecture Diagram
```
User selects coach or court
       ↓
Controller discovers providers
       ↓
SchedulingEngine.search()
  ├── getAvailableSlots()  (per provider)
  ├── cartesianProduct()   (all combos)
  ├── crossValidate()      (sport_match, location_match)
  ├── price()              (caller-provided pricingFn)
  └── rank()               (score: cheaper = higher)
       ↓
Candidates returned to frontend
       ↓
User selects a candidate
       ↓
SchedulingBookingService.bookSession()
  ├── Validate coach + court
  ├── Check coach availability
  ├── bookingService.createBooking() (atomic: lock → book → pay → emit)
  └── activitiesRepository.createCoachSession()
```

## Follow-Up
- Coach session is the first activity type implemented
- Private match (court-only) is next
- Tournament scheduling will reuse the same engine with additional constraints
- Equipment rental and referee assignment will add new resource providers

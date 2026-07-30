---
document_id: "GOV-ADR-017"
document_name: "Scheduling Engine — Provider-Based Search"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "advanced"
reading_time: 6
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-MOD-19", "TECH-MOD-03"]
  related: ["GOV-ADR-003"]
---

# ADR-017: Scheduling Engine — Provider-Based Search

## Status

Accepted

## Context

The platform must support searching for available time slots across heterogeneous resource types: courts, coaches, referees. Each resource type has different availability patterns, capability profiles, and pricing models. The search must produce combined candidates that satisfy cross-constraints (e.g., coach and court at the same branch, both available for the same sport). Common approaches include:

1. **Monolithic search service** — single SQL query with JOINs; simple but rigid; adding a new resource type requires schema changes
2. **Provider-based scheduling engine** — each resource type implements a `ResourceProvider` interface; the engine combines results using cartesian product and cross-validation
3. **Graph-based scheduling** — resources as nodes, constraints as edges; flexible but computationally expensive

## Decision

**Use a provider-based scheduling engine.** Each resource type (Coach, Court, Referee) implements the `ResourceProvider` interface. The `SchedulingEngine` searches across all providers, generates candidate combinations via cartesian product, validates cross-constraints, applies pricing, and ranks results.

### Architecture

```
SchedulingEngine.search(request, providers, config, pricingFn)
  │
  ├─ 1. getAvailableSlots()
  │     └─ For each provider: getAvailableSlots(date, dayOfWeek) → TimeSlot[]
  │     └─ Filter by duration: slot >= request.durationMinutes
  │     └─ Cartesian product: all combinations of qualified slots
  │
  ├─ 2. crossValidate()
  │     └─ For each combination: validate against cross-constraints
  │     └─ E.g., sport_match (court sport === coach sport), location_match (same branch)
  │
  ├─ 3. price()
  │     └─ For each valid combination: call pricingFn for each resource
  │     └─ Total price = sum of all resource prices
  │
  └─ 4. rank()
        └─ Score each candidate (price, rating, distance)
        └─ Sort descending by score
```

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| Engine class | `SchedulingEngine` — `search()`, `getAvailableSlots()`, `crossValidate()`, `price()`, `rank()` | `scheduling-engine.ts:11-206` |
| Provider interface | `ResourceProvider` — `resourceType`, `entityId`, `getAvailableSlots()`, `hasConflict()`, `getCapabilities()`, `getLocation()`, `isAvailable()` | `types.ts:24-33` |
| Coach provider | Implements `ResourceProvider` for coach availability | `providers/coach.provider.ts` |
| Court provider | Implements `ResourceProvider` for court/resource availability | `providers/court.provider.ts` |
| Referee provider | Implements `ResourceProvider` for referee availability | `providers/referee.provider.ts` |
| Cross-constraints | `CrossConstraint` — `sport_match`, `location_match` | `types.ts:44-46` |
| Booking candidate | `BookingCandidate` — contains resources, totalPrice, score | `types.ts:62-71` |
| Group session booking | `SchedulingBookingService` — uses engine to find and book | `scheduling-booking.service.ts` |

### ResourceProvider Interface

```typescript
interface ResourceProvider {
  readonly resourceType: string;  // 'court' | 'coach' | 'referee'
  readonly entityId: number;

  getAvailableSlots(date: string, dayOfWeek: number): Promise<TimeSlot[]>;
  hasConflict(startTime: string, endTime: string, date: string): Promise<boolean>;
  getCapabilities(): Promise<ResourceCapabilities>;  // sportIds, hourlyRate, etc.
  getLocation(): Promise<LocationInfo | null>;        // branchId, orgId
  isAvailable(): Promise<boolean>;
}
```

**Evidence:** `types.ts:24-33` — the `ResourceProvider` interface.

### Search Example (Coach + Court)

```
Request: tennis coaching, 60 min, 2025-06-15
Providers: [CoachProvider(coachId=5), CourtProvider(courtId=12)]

1. CoachProvider.getAvailableSlots() → ["09:00-10:00", "10:00-11:00", ...]
2. CourtProvider.getAvailableSlots() → ["09:00-10:00", "11:00-12:00", ...]
3. Cartesian product → [coach@09:00 + court@09:00, coach@09:00 + court@11:00, ...]
4. crossValidate → sport_match: coach.tennis === court.tennis ✓
                   location_match: coach.branch === court.branch ✓
5. Price: coach.hourlyRate($50) + court.hourlyRate($30) = $80
6. Rank: score = 100 - price_factor - rating_factor
```

## Consequences

### Positive

- **Heterogeneous search**: Uniform search across courts, coaches, referees, and future resource types
- **Provider isolation**: Each resource type is independently developed and tested
- **Extensible**: New resource type = new provider implementation; no engine changes
- **Cross-constraint validation**: Sport and location matching prevents invalid combinations
- **Pricing abstraction**: `pricingFn` is injected — pricing strategy can change independently

### Negative

- **Cartesian explosion**: Number of combinations = product of available slots across providers; high for popular time slots
- **Performance**: All providers queried sequentially (`for...of`); parallel execution would improve latency
- **No caching**: Each search re-queries all providers; caching of slot availability would reduce load

## Evidence

- `scheduling-engine.ts:1-206` — full engine implementation
- `types.ts:1-71` — `ResourceProvider`, `BookingCandidate`, `CrossConstraint`, `TimeSlot` types
- `providers/coach.provider.ts`, `court.provider.ts`, `referee.provider.ts` — provider implementations
- `scheduling-booking.service.ts` — uses engine for group session booking
- `scheduling.controller.ts` — REST endpoints exposing scheduling search

## Related Decisions

- GOV-ADR-003 (Event Composable Architecture): Booking events emitted from scheduled sessions

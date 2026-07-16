# ADR-001: ResourceProvider Plugin Pattern

## Status
Accepted — July 2026

## Context
The old coach booking system had the Scheduling Engine deeply coupled to Coach and Court entities. Adding a new resource type (e.g., equipment rental, referee) would require modifying core engine logic with `if (type == 'new_resource')` branches, violating the Open/Closed Principle and creating a maintenance burden.

## Decision
We adopt a **Provider Plugin Pattern** where each resource type is implemented as a `ResourceProvider` implementation. The Scheduling Engine depends only on the `ResourceProvider` interface, never on concrete types.

```typescript
interface ResourceProvider {
  readonly resourceType: string;
  readonly entityId: number;
  getAvailableSlots(date: string, dayOfWeek: number): Promise<TimeSlot[]>;
  hasConflict(startTime: string, endTime: string, date: string): Promise<boolean>;
  getCapabilities(): Promise<ResourceCapabilities>;
  getLocation(): Promise<LocationInfo | null>;
  isAvailable(): Promise<boolean>;
}
```

**Concrete providers:**
- `CoachProvider` — wraps `activitiesRepository` (coach profiles, availability, sport mapping)
- `CourtProvider` — wraps `resourceRepository` + `bookingRepository` + `TimeEngine` (court availability, conflict detection, slot generation)

**Each provider is a thin adapter** — it owns zero business logic. It translates between the domain model (tables) and the engine interface. New resource types are added by writing a new provider file, not by modifying the engine.

## Consequences
- **+** New resource types (equipment, referees, rooms) require only a new provider file and route registration
- **+** Each provider is independently testable with mock providers
- **+** Engine stays small (~190 lines) and focused on orchestration
- **-** Providers must be registered explicitly by the controller/discovery layer — no auto-discovery
- **-** Overhead of one new file per resource type (acceptable — ~60-100 lines each)

## Alternatives Considered
1. **Strategy pattern with runtime registration** — Rejected: adds unnecessary indirection; static imports are clearer
2. **Single provider with type-specific branches** — Rejected: violates Open/Closed, creates a God Provider
3. **Inheritance hierarchy (BaseProvider → CoachProvider)** — Rejected: composition is more flexible; providers don't share logic

## Follow-Up
- `CoachProvider` is implemented in `providers/coach.provider.ts`
- `CourtProvider` is implemented in `providers/court.provider.ts`
- Future providers: `EquipmentProvider`, `RefereeProvider`, `RoomProvider`

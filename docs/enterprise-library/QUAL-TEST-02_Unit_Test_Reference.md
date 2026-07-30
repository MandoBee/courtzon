---
document_id: "QUAL-TEST-02"
document_name: "Unit Test Reference"
family: "QUAL-TEST"
document_type: "TEST"
status: "Draft"
version: "0.1"
audience: ["qa", "developer"]
difficulty: "intermediate"
reading_time: 15
business_owner: "QA Manager"
technical_owner: "Lead Developer"
documentation_owner: "QA"
reviewer: "Architect"
approver: "QA Director"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-DEV-09", "QUAL-TEST-03"]
  related: ["TECH-MOD-01", "TECH-MOD-50"]
---

# Unit Test Reference (QUAL-TEST-02)

## Test Patterns

### Service Tests

Service tests verify business logic in isolation. Dependencies (repositories, external services) are mocked.

```typescript
// Pattern
describe('ActivitiesService', () => {
  let service: typeof activitiesService;
  // Mock repository methods
  beforeEach(() => { /* setup mocks */ });
  afterEach(() => { /* restore mocks */ });

  describe('createTournament', () => {
    it('creates a tournament with commission rate', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### Domain Tests

Domain tests verify state machines and business rules without any infrastructure dependency.

```typescript
// Pattern — pure function test
describe('ActivityStateMachine', () => {
  it('allows transition from scheduled to in_progress', () => {
    expect(() => assertValidActivityTransition('scheduled', 'in_progress')).not.toThrow();
  });

  it('rejects transition from completed to in_progress', () => {
    expect(() => assertValidActivityTransition('completed', 'in_progress'))
      .toThrow('Illegal activity state transition');
  });
});
```

### Controller Tests

Controller tests validate request handling, parameter parsing, and response formatting. Route handlers are tested with mocked services.

```typescript
// Pattern
describe('ActivitiesController', () => {
  it('returns 200 with tournament list', async () => {
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
    // mock request, call handler
    expect(reply.code).toHaveBeenCalledWith(200);
  });

  it('returns 404 for non-existent tournament', async () => {
    // mock service to throw NotFoundError
    expect(reply.code).toHaveBeenCalledWith(404);
  });
});
```

### Repository Tests

Repository tests validate SQL queries against a real database (or in-memory SQLite for faster feedback).

```typescript
// Pattern — uses integration setup for DB
describe('ActivitiesRepository', () => {
  setupIntegrationTest();

  it('finds tournament by ID', async () => {
    const tournament = await activitiesRepository.findTournamentById(1);
    expect(tournament).not.toBeNull();
    expect(tournament?.name).toBeDefined();
  });
});
```

## Mocking Strategy

| Dependency | Mocking Approach | Library |
|-----------|-----------------|---------|
| Database | Testcontainers (real DB) or `mysql2/promise` mock | `testcontainers`, `vi.mock` |
| Redis | Testcontainers (real Redis) | `testcontainers` |
| Event Bus | `eventBusV2.emit` mock | `vi.spyOn` |
| External APIs | `vi.mock` with mock responses | Vitest |
| File System | In-memory or temp directory | Node.js `fs/promises` |
| TimeEngine | `FakeClock` injection | `TimeEngine.setClock()` |
| Pricing Engine | Mock return values | `vi.spyOn` |
| Commission Service | Mock return values | `vi.spyOn` |

## Test Fixtures

Located in `backend/src/tests/fixtures/` and `__tests__` directories:

- **User fixtures:** Pre-registered users with roles
- **Organisation fixtures:** Org with branches, resources, operating hours
- **Booking fixtures:** Confirmed/cancelled/checked-in bookings
- **Tournament fixtures:** Tournaments with brackets and registrations
- **Time fixtures:** Fixed timezone instants, business dates

## Coverage Requirements

| Module Type | Required Coverage | Critical Paths |
|-------------|-----------------|----------------|
| Domain aggregates | 100% | State transitions, validation |
| Application services | ≥ 80% | Create/update/delete flows |
| Controllers | ≥ 70% | Status codes, error handling |
| Repositories | ≥ 60% | Query correctness |
| Shared utilities | ≥ 90% | Edge cases |

## Naming Convention

Test files are colocated with source code in `__tests__/` directories:

- `src/modules/booking/__tests__/booking.service.spec.ts`
- `src/modules/auth/__tests__/auth-aggregate.spec.ts`
- `src/modules/time/__tests__/time-engine.spec.ts`

---
document_id: "TECH-DEV-09"
document_name: "Testing Standards"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer"]
difficulty: "intermediate"
reading_time: 15
depends_on: ["TECH-DEV-01"]
related: ["TECH-DEV-01", "TECH-DEV-03", "TECH-DEV-08"]
---

# CourtZon Testing Standards

## 1. Purpose

Define mandatory testing requirements, patterns, and coverage thresholds for all CourtZon code.

## 2. Test Types

| Type | Extension | Framework | Location |
|------|-----------|-----------|----------|
| Unit test | `.spec.ts` | Vitest (backend & frontend) | Alongside module in `__tests__/` |
| Integration test | `.integration.spec.ts` | Vitest + Testcontainers | Same `__tests__/` directory |
| E2E test | `.spec.ts` (e2e/) | Playwright | `e2e/` (project root) |

**Evidence:** `backend/src/modules/auth/__tests__/auth.service.spec.ts` (unit) and `auth.integration.spec.ts` (integration).

## 3. Naming Conventions

```typescript
// Unit test — tests a single module
// booking.service.spec.ts
describe('BookingService', () => {
  describe('create', () => {
    it('should create a booking with valid input', async () => { ... });
    it('should throw ConflictError when slot is already booked', async () => { ... });
    it('should throw ValidationError when date is in the past', async () => { ... });
  });
});

// Integration test — tests through HTTP
// auth.integration.spec.ts
describe('Auth API', () => {
  describe('POST /auth/login', () => {
    it('should return 200 and token for valid credentials', async () => { ... });
    it('should return 401 for invalid password', async () => { ... });
  });
});
```

## 4. What Must Be Tested

### 4.1 Services (Application Layer)

Every public method must have unit tests:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { bookingService } from './booking.service.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { ConflictError } from '../../../shared/errors/app-error.js';

vi.mock('../infrastructure/repositories/booking.repository.js');

describe('BookingService', () => {
  describe('create', () => {
    it('should return created booking', async () => {
      vi.mocked(bookingRepository.create).mockResolvedValue(mockBooking);
      const result = await bookingService.create(validInput, 1);
      expect(result).toEqual(mockBooking);
      expect(bookingRepository.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 1 }));
    });

    it('should throw ConflictError when slot is taken', async () => {
      vi.mocked(bookingRepository.findOverlapping).mockResolvedValue([existingBooking]);
      await expect(bookingService.create(validInput, 1)).rejects.toThrow(ConflictError);
    });
  });
});
```

### 4.2 Controllers

Test request parsing, validation, response format, and error mapping:

```typescript
describe('createBookingHandler', () => {
  it('should return 201 with booking data', async () => { ... });
  it('should return 400 when body is invalid', async () => { ... });
  it('should return 404 when resource not found', async () => { ... });
});
```

### 4.3 Repositories

Test actual SQL queries (integration tests):

```typescript
describe('BookingRepository', () => {
  it('should insert a booking and return with id', async () => {
    const result = await bookingRepository.create(testBooking);
    expect(result.id).toBeGreaterThan(0);
    expect(result.status).toBe('pending');
  });

  it('should return null for non-existent id', async () => {
    const result = await bookingRepository.findById(99999);
    expect(result).toBeNull();
  });
});
```

### 4.4 Domain Logic

Test state transitions, validation rules, and invariants:

```typescript
describe('BookingLifecycle', () => {
  it('should transition from pending to confirmed', () => { ... });
  it('should not transition from cancelled to confirmed', () => { ... });
  it('should allow cancellation only before 24h from start', () => { ... });
});
```

### 4.5 Frontend Components

Test rendering, user interactions, data fetching states:

```typescript
describe('BookingListPage', () => {
  it('should show loading state initially', () => { ... });
  it('should render booking list on success', () => { ... });
  it('should show empty state when no bookings', () => { ... });
  it('should show error state on API failure', () => { ... });
});
```

## 5. Coverage Thresholds

| Metric | Backend | Frontend |
|--------|---------|----------|
| Lines | ≥ 80% | ≥ 70% |
| Branches | ≥ 75% | ≥ 65% |
| Functions | ≥ 85% | ≥ 75% |
| Statements | ≥ 80% | ≥ 70% |

Configured in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 85,
        statements: 80,
      },
    },
  },
});
```

**Evidence:** `backend/vitest.config.ts` defines coverage thresholds.

## 6. Integration Test Setup

Backend integration tests use Testcontainers for MySQL + Redis:

```typescript
import { setupIntegrationTest, teardownIntegrationTest } from '../../tests/helpers/integration-setup.js';

beforeAll(async () => {
  await setupIntegrationTest();  // starts MySQL + Redis containers, runs schema
});

afterAll(async () => {
  await teardownIntegrationTest();  // stops containers
});

beforeEach(async () => {
  await clearDatabase();  // truncates all tables
});
```

**Evidence:** `backend/src/tests/helpers/integration-setup.ts` provides `setupIntegrationTest()` and `teardownIntegrationTest()`.

## 7. Test Isolation

- Unit tests must **never** hit the database, network, or filesystem
- Mock all external dependencies with `vi.mock()`
- Integration tests must clean up after themselves (truncate or transaction rollback)
- E2E tests must use a dedicated test database

## 8. Running Tests

```bash
# Backend unit tests
npm test                    # excludes integration tests

# Backend integration tests
npm run test:int            # uses Testcontainers

# Frontend unit tests
cd frontend && npm test

# E2E tests (project root)
npm run test:e2e
```

## 9. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-01 | Coding Standards — TypeScript (test code style) |
| TECH-DEV-03 | Folder Structure Standard (test file placement) |
| TECH-DEV-08 | Code Review Standards (reviewer checks test coverage) |

## 10. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

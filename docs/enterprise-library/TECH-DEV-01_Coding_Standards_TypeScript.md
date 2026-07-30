---
document_id: "TECH-DEV-01"
document_name: "Coding Standards — TypeScript"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer"]
difficulty: "intermediate"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Senior Developer"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  governs: ["TECH-DEV-01"]
  references: ["TECH-ARCH-01", "TECH-ARCH-02"]
  related: ["TECH-DEV-02", "TECH-DEV-03", "TECH-DEV-04"]
---
```

# CourtZon Coding Standards — TypeScript

## 1. Purpose

Define the mandatory TypeScript coding standards for all backend and shared code in CourtZon. These standards ensure consistency, maintainability, and readability across the entire codebase.

## 2. Scope

All TypeScript files in `backend/src/` and `packages/`. Does not apply to JavaScript configuration files (`vite.config.ts`, `tailwind.config.js`, etc.).

## 3. General Principles

### 3.1 Strict Mode Required
All TypeScript code must compile with `strict: true` in `tsconfig.json`. No exceptions.

**Evidence:** `backend/tsconfig.json` has `"strict": true`

### 3.2 No Implicit Any
All function parameters and return types must be explicitly typed. `noImplicitAny` is enforced at the compiler level.

```typescript
// BAD
function getBooking(id) { ... }

// GOOD
function getBooking(id: number): Promise<BookingAttributes | null> { ... }
```

### 3.3 Null vs Undefined
Use `null` for intentional absence of value. Use `undefined` for uninitialized values only.

```typescript
// GOOD — intentional absence
function findById(id: number): Promise<BookingAttributes | null>

// GOOD — optional parameter
function create(data: Partial<BookingAttributes>, userId?: number): Promise<BookingAttributes>
```

## 4. Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Classes | PascalCase | `class BookingService` |
| Interfaces | PascalCase | `interface BookingAttributes` |
| Types | PascalCase | `type BookingStatus = 'confirmed' \| 'cancelled'` |
| Functions | camelCase | `async function createBooking()` |
| Variables | camelCase | `const bookingId: number` |
| Constants | UPPER_SNAKE_CASE | `const MAX_RETRIES = 3` |
| Files | kebab-case | `booking.service.ts` |
| Test files | `.spec.ts` or `.test.ts` | `booking.service.spec.ts` |
| Enums | PascalCase | `enum BookingStatus` |
| Enum members | PascalCase | `BookingStatus.Confirmed` |

## 5. File Organization

Every file follows this exact order:

```typescript
// 1. Import statements (grouped)
import { getPool } from '../../../database/mysql.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import type { BookingAttributes } from '../domain/booking.types.js';

// 2. Type definitions (if needed at module level)
type RowData = import('mysql2').RowDataPacket[];

// 3. Class or exported functions
export class BookingService {
  // Properties first
  private pool = getPool();
  
  // Public methods
  async create(data: CreateBookingInput): Promise<BookingAttributes> { ... }
  
  // Private methods
  private async validateSlot(slotId: number): Promise<boolean> { ... }
}

// 4. Singleton instance
export const bookingService = new BookingService();
```

## 6. Import Order

Imports must be grouped in this exact order with blank lines between groups:

```typescript
// 1. External dependencies
import Fastify from 'fastify';
import { z } from 'zod';

// 2. Internal shared utilities
import { getPool } from '../../../database/mysql.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';

// 3. Same-module imports
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import type { BookingAttributes } from '../domain/booking.types.js';
```

## 7. Async/Await

Use `async/await` instead of raw Promises. Avoid `.then()` and `.catch()` chains.

```typescript
// BAD
function getBooking(id: number): Promise<BookingAttributes> {
  return pool.execute('SELECT * FROM bookings WHERE id = ?', [id])
    .then(([rows]) => rows[0])
    .catch(() => null);
}

// GOOD
async function getBooking(id: number): Promise<BookingAttributes | null> {
  const [rows] = await pool.execute<RowData>('SELECT * FROM bookings WHERE id = ?', [id]);
  return rows.length ? rows[0] as BookingAttributes : null;
}
```

## 8. Error Handling

All business errors must use the AppError hierarchy from `shared/errors/app-error.ts`:

```typescript
import { NotFoundError, ConflictError, ValidationError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

// Throw typed errors
throw new NotFoundError('Booking', ErrorCodes.BOOKING_NOT_FOUND);
throw new ConflictError('Slot already booked', ErrorCodes.BOOKING_SLOT_UNAVAILABLE);
throw new ValidationError('Invalid date range', ErrorCodes.VALIDATION_INVALID_DATE);
```

**Never throw raw `Error` or `new Error()` in business logic.**

**Evidence:** `backend/src/shared/errors/app-error.ts` defines the complete error hierarchy.

## 9. Database Queries

All database access uses `getPool()` from `database/mysql.ts`:

```typescript
import { getPool } from '../../../database/mysql.js';
type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

const pool = getPool();

// SELECT queries — use pool.query
const [rows] = await pool.query<RowData>('SELECT * FROM bookings WHERE user_id = ?', [userId]);

// INSERT/UPDATE/DELETE — use pool.execute
const [result] = await pool.execute<ResultSet>(
  'INSERT INTO bookings (user_id, resource_id, booking_date) VALUES (?, ?, ?)',
  [userId, resourceId, date],
);
```

## 10. Controller Pattern

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { bookingService } from '../application/booking.service.js';
import { CreateBookingSchema } from './booking.dto.js';
import { recordAudit } from '../../audit-log/index.js';

function getUserId(request: FastifyRequest): number { return (request as any).userId; }

export async function createBookingHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = getUserId(request);
  const body = CreateBookingSchema.parse(request.body);  // Zod validates
  const booking = await bookingService.create(body, userId);
  recordAudit({
    actorId: userId,
    action: 'BOOKING.CREATE',
    entityType: 'booking',
    entityId: booking.id!,
    afterState: { resourceId: body.resourceId, date: body.bookingDate },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] as string | undefined,
  });
  return reply.status(201).send(booking);
}
```

## 11. Route Pattern

```typescript
import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './booking.controller.js';

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.get('/bookings', { preHandler: [requirePermission(['bookings.view'])] }, ctrl.getUserBookingsHandler);
  app.post('/bookings', { preHandler: [requirePermission(['bookings.create'])] }, ctrl.createBookingHandler);
}
```

## 12. Validation

All request validation uses Zod schemas in dedicated DTO files:

```typescript
// booking.dto.ts
export const CreateBookingSchema = z.object({
  resourceId: z.number().int().positive(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).optional(),
});
```

## 13. Module Structure

Every module follows hexagonal architecture:

```
module-name/
├── index.ts                    # Barrel exports
├── __tests__/                  # Unit tests
├── domain/                     # Business logic, types
│   ├── module-name.types.ts    # Interfaces
│   └── lifecycle.ts            # State machines
├── application/                # Services
│   └── module-name.service.ts  # Business logic
├── infrastructure/             # I/O
│   └── repositories/
│       └── module-name.repository.ts
└── presentation/              # HTTP
    ├── module-name.routes.ts
    ├── module-name.controller.ts
    └── module-name.dto.ts
```

## 14. Audit Logging

Every mutation handler must call `recordAudit()` after the mutation succeeds.

```typescript
recordAudit({
  actorId: userId,                                // Who
  action: 'BOOKING.CREATE',                        // What
  entityType: 'booking',                            // What entity
  entityId: booking.id!,                            // Which record
  beforeState: null,                                // Previous state
  afterState: { status: 'pending' },                // New state
  reason: 'Booking created by player',              // Why
  ipAddress: request.ip,                            // Where
  userAgent: request.headers['user-agent'] as string | undefined,
});
```

## 15. RBAC

Every route must have a `requirePermission` guard. Permission keys follow the pattern `{module}.{action}` or `{module}.{entity}.{action}`.

## 16. Localization

All user-facing strings must use `t('translation.key')`. Never hardcode display text in components.

```typescript
// BAD
<h1>Booking Details</h1>

// GOOD
<h1>{t('booking.details.title')}</h1>
```

## 17. Linting

Run `npx eslint` before every commit. The ESLint configuration extends the base TypeScript recommended ruleset.

**Evidence:** `backend/.eslintrc.json` defines the ruleset.

## 18. TypeScript Configuration

All modules compile under the root `backend/tsconfig.json`. Key settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": false,
    "moduleResolution": "node16",
    "module": "node16",
    "target": "ES2022",
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

## 19. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-02 | Coding Standards — React (extends this document for frontend) |
| TECH-DEV-03 | Folder Structure Standard |
| TECH-DEV-04 | Naming Conventions |
| TECH-ARCH-01 | System Architecture (context for module structure) |
| TECH-ARCH-02 | Module Architecture (pattern this enforces) |

## 20. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

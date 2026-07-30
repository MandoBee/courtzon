---
document_id: "TECH-ARCH-02"
document_name: "Module Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  governs: ["TECH-ARCH-02"]
  references: ["TECH-ARCH-01", "TECH-DEV-03"]
  related: ["TECH-DEV-01", "VOLUME-04"]
---

# CourtZon Module Architecture

## 1. Hexagonal Architecture Pattern

Every backend module follows the **hexagonal (ports & adapters) architecture** with four layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                         │
│  routes.ts → controller.ts → dto.ts                          │
│  (HTTP adapters — Fastify request/response handling)          │
├─────────────────────────────────────────────────────────────┤
│                    APPLICATION LAYER                          │
│  module-name.service.ts                                      │
│  (Use cases, business workflow orchestration)                 │
├─────────────────────────────────────────────────────────────┤
│                    DOMAIN LAYER                               │
│  module-name.types.ts / lifecycle.ts / aggregate.ts          │
│  (Pure business logic, state machines, type definitions)     │
├─────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE LAYER                       │
│  repositories/module-name.repository.ts                      │
│  (I/O adapters — SQL queries, external API calls, Redis)     │
└─────────────────────────────────────────────────────────────┘
```

**Evidence:** Every module among the 53+ follows this structure. Example: `backend/src/modules/booking/` has 7 files across all 4 layers.

## 2. Directory Structure

```
modules/{module-name}/
├── index.ts                          # Barrel exports
├── __tests__/                        # Unit tests (.spec.ts)
├── domain/                           # Business logic layer
│   ├── {module-name}.types.ts        # TypeScript interfaces & types
│   ├── lifecycle.ts                  # State machine (when applicable)
│   ├── {module-name}-aggregate.ts    # Aggregate root (DDD)
│   ├── {module-name}-constants.ts    # Enum-like constants
│   └── pricing-engine.ts / slot-generator.ts  # Domain services
├── application/                      # Use-case layer
│   └── {module-name}.service.ts      # Singleton service
├── infrastructure/                   # I/O adapters
│   ├── repositories/
│   │   └── {module-name}.repository.ts   # SQL queries via mysql2
│   └── redis/                        # Redis adapters (when needed)
│       └── redis-lock.ts             # Distributed locking
└── presentation/                     # HTTP layer
    ├── {module-name}.routes.ts       # Route definitions (Fastify)
    ├── {module-name}.controller.ts   # Request handlers
    └── {module-name}.dto.ts          # Zod validation schemas
```

**Evidence:** `backend/src/modules/booking/` contains exactly this structure: `domain/` (7 files), `application/` (1 service), `infrastructure/repositories/` (1 repo), `infrastructure/redis/` (1 lock), `presentation/` (3 files), `__tests__/`.

## 3. Singleton Service Pattern

Every module exports a **singleton instance** of its service:

```typescript
// backend/src/modules/booking/application/booking.service.ts
export class BookingService {
  private pool = getPool();

  async create(data: CreateBookingInput, userId: number): Promise<BookingAttributes> {
    // Business logic
  }
}

export const bookingService = new BookingService();
```

**Evidence:** All 53+ modules follow this singleton pattern. Services are instantiated at module load time and imported by controllers. Example: `booking.service.ts:1500` lines implements full booking lifecycle management.

## 4. Repository Pattern

Repositories abstract database access using mysql2/promise with `getPool()`:

```typescript
// backend/src/modules/booking/infrastructure/repositories/booking.repository.ts:17-25
export class BookingRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  private resolve(conn?: mysql.PoolConnection): Executor {
    return conn ?? this.pool;
  }

  async create(data: { ... }, conn?: mysql.PoolConnection): Promise<number> {
    const db = this.resolve(conn);
    const [result] = await db.execute<ResultSetHeader>(
      'INSERT INTO bookings (...) VALUES (...)',
      [values],
    );
    return result.insertId;
  }
}
```

**Evidence:** `booking.repository.ts:646` implements CRUD, aggregate version checks, and transaction support. The `resolve()` method allows repositories to participate in caller transactions.

## 5. Connection Pool Handling

All database access uses the shared connection pool:

```typescript
// backend/src/database/mysql.ts:1-28
import mysql from 'mysql2/promise';

let pool: mysql.Pool;

export function createPool(overrides?: { ... }): mysql.Pool {
  pool = mysql.createPool({
    host: overrides?.host || env.DB_HOST,
    port: overrides?.port || Number(env.DB_PORT),
    user: overrides?.user || env.DB_USER,
    password: overrides?.password || env.DB_PASSWORD,
    database: overrides?.database || env.DB_NAME,
    connectionLimit: 10,
    charset: 'utf8mb4',
    timezone: '+00:00',
  });
  return pool;
}

export function getPool(): mysql.Pool {
  if (!pool) return createPool();
  return pool;
}
```

**Evidence:** `backend/src/database/mysql.ts` implements the pool singleton. `app.ts:200` calls `createPool()` on startup.

## 6. Route Registration Pattern

Routes follow a standard Fastify plugin pattern:

```typescript
// backend/src/modules/booking/presentation/booking.routes.ts
import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './booking.controller.js';

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.get('/bookings', { preHandler: [requirePermission(['bookings.view'])] }, ctrl.getUserBookingsHandler);
  app.post('/bookings', { preHandler: [requirePermission(['bookings.create'])] }, ctrl.createBookingHandler);
  app.put('/bookings/:id', { preHandler: [requirePermission(['bookings.edit'])] }, ctrl.updateBookingHandler);
  app.delete('/bookings/:id', { preHandler: [requirePermission(['bookings.delete'])] }, ctrl.cancelBookingHandler);
}
```

**Evidence:** `app.ts:480-541` registers routes for all 53+ modules. Each route handler is protected by `authMiddleware` (global) and `requirePermission` (per-route).

## 7. Module Inventory

The system has 53+ modules organized by domain:

| Domain | Modules |
|--------|---------|
| Core Platform | auth, rbac, organisations, admin, app-settings |
| Bookings | booking, scheduling, resources, amenities |
| Marketplace | marketplace, payment, settlement, pricing, coupon, inventory |
| Financial | financial, ledger, accounting, wallet, banks |
| Sports | tournaments, leagues, academy, match, sports-engine |
| People | users, hr, crm, coaches, referees, player-experience |
| Communication | notifications, community, support |
| Content | cms, translations, design-tokens, appearance |
| Infrastructure | upload, audit-log, security, integration, mobile, geo |
| Analytics | reports, bi, countries, provinces, cities, currencies, languages |

**Evidence:** Each module listed in `app.ts:480-541` corresponds to a directory in `backend/src/modules/`.

## 8. Command Pipeline Pattern

Some modules use a command pipeline for structured write operations:

```typescript
// backend/src/modules/booking/application/booking.service.ts:38-44
const result = await commandPipeline.execute(command, {
  validate: async () => handler.validate(command),
  execute: async (cmd, conn) => handler.execute(cmd, conn),
  events: (cmd, res) => handler.events!(cmd, res),
});
```

**Evidence:** `booking.service.ts:30-45` defines `executeBookingCommand()` which routes through `create-booking.command.ts`, `confirm-booking.command.ts`, `cancel-booking.command.ts`, `complete-booking.command.ts`.

## 9. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-ARCH-01 | System Architecture (context for modules) |
| TECH-DEV-01 | Coding Standards TypeScript (enforces this pattern) |
| TECH-DEV-03 | Folder Structure Standard |
| VOLUME-04 | Modules Reference (complete module list) |

## 10. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

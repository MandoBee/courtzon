---
document_id: "TECH-DEV-03"
document_name: "Folder Structure Standard"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer"]
difficulty: "intermediate"
reading_time: 15
depends_on: ["TECH-DEV-01"]
related: ["TECH-DEV-01", "TECH-DEV-04", "TECH-ARCH-02"]
---

# CourtZon Folder Structure Standard

## 1. Purpose

Define the mandatory folder structure for backend and frontend projects in CourtZon. A consistent structure ensures discoverability, modularity, and separation of concerns.

## 2. Scope

All new modules created in `backend/src/modules/` and `frontend/src/`.

## 3. Backend Module Layout (Hexagonal Architecture)

Every backend module must follow hexagonal (ports-and-adapters) architecture:

```
backend/src/modules/{module-name}/
├── index.ts                           # Barrel exports
├── __tests__/                         # Unit tests
│   └── {module-name}.service.spec.ts
├── domain/                            # Business logic, types
│   ├── {module-name}.types.ts         # Interfaces & types
│   └── lifecycle.ts                   # State machine
├── application/                       # Application services
│   └── {module-name}.service.ts       # Business logic
├── infrastructure/                    # I/O adapters
│   └── repositories/
│       └── {module-name}.repository.ts
└── presentation/                      # HTTP layer
    ├── {module-name}.routes.ts
    ├── {module-name}.controller.ts
    └── {module-name}.dto.ts
```

**Evidence:** `backend/src/modules/booking/` follows this pattern. See `booking/index.ts`, `booking/domain/`, `booking/application/`, `booking/infrastructure/`, `booking/presentation/`.

### 3.1 Barrel Exports

Every module's `index.ts` must re-export only what external modules need:

```typescript
// modules/booking/index.ts
export { bookingService } from './application/booking.service.js';
export type { BookingAttributes, CreateBookingInput } from './domain/booking.types.js';
export { bookingRoutes } from './presentation/booking.routes.js';
```

### 3.2 Domain Layer

Contains pure business logic with no I/O dependencies:

```typescript
// domain/booking.types.ts
export interface BookingAttributes {
  id?: number;
  userId: number;
  resourceId: number;
  bookingDate: string;  // YYYY-MM-DD
  startTime: string;    // HH:mm
  endTime: string;      // HH:mm
  status: BookingStatus;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
```

### 3.3 Application Layer

Services orchestrate domain logic via repositories:

```typescript
// application/booking.service.ts
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import type { BookingAttributes, CreateBookingInput } from '../domain/booking.types.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

export class BookingService {
  async create(data: CreateBookingInput, userId: number): Promise<BookingAttributes> {
    // … business logic …
  }
  async findById(id: number): Promise<BookingAttributes | null> {
    return bookingRepository.findById(id);
  }
}
export const bookingService = new BookingService();
```

### 3.4 Infrastructure Layer

Repositories handle database access:

```typescript
// infrastructure/repositories/booking.repository.ts
import { getPool } from '../../../../database/mysql.js';
import type { BookingAttributes } from '../../domain/booking.types.js';

type RowData = import('mysql2').RowDataPacket[];

export class BookingRepository {
  private pool = getPool();
  async findById(id: number): Promise<BookingAttributes | null> {
    const [rows] = await this.pool.execute<RowData>('SELECT * FROM bookings WHERE id = ?', [id]);
    return rows.length ? (rows[0] as BookingAttributes) : null;
  }
}
export const bookingRepository = new BookingRepository();
```

### 3.5 Presentation Layer

Routes, controllers, and DTOs:

```typescript
// presentation/booking.routes.ts
import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './booking.controller.js';

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.get('/bookings', { preHandler: [requirePermission(['bookings.view'])] }, ctrl.getUserBookingsHandler);
  app.post('/bookings', { preHandler: [requirePermission(['bookings.create'])] }, ctrl.createBookingHandler);
}
```

## 4. Shared Code Structure

```
backend/src/
├── shared/
│   ├── errors/
│   │   ├── app-error.ts              # Error hierarchy
│   │   └── error-codes.ts            # ErrorCodes enum
│   ├── middleware/
│   │   └── auth.middleware.ts        # Auth + permission guards
│   └── utils/
│       ├── pagination.ts             # Pagination helpers
│       └── date.ts                   # Date utilities
├── database/
│   ├── mysql.ts                      # Connection pool
│   └── migrations/
│       └── NNN_description.sql
├── scripts/
│   ├── migrate.js
│   ├── seed.js
│   ├── sync-ui-registry.js
│   └── sync-role-permissions.mjs
└── app.ts                            # Fastify entry point
```

## 5. Frontend Page Organization

```
frontend/src/
├── components/                       # Shared UI components
│   ├── ui/
│   │   ├── Toast.tsx
│   │   ├── Modal.tsx
│   │   └── SkeletonRow.tsx
│   └── layout/
│       ├── Navbar.tsx
│       ├── BottomNav.tsx
│       └── Sidebar.tsx
├── pages/                            # Page components (one per route)
│   ├── booking/
│   │   ├── BookingListPage.tsx
│   │   ├── BookingDetailPage.tsx
│   │   └── __tests__/
│   │       └── BookingListPage.spec.tsx
│   ├── admin/
│   │   └── users/
│   │       ├── UserListPage.tsx
│   │       └── UserEditPage.tsx
│   └── auth/
│       ├── LoginPage.tsx
│       └── RegisterPage.tsx
├── hooks/                            # Custom hooks
│   ├── useCan.ts
│   └── useToast.ts
├── services/
│   └── api.ts                        # Axios/fetch wrapper
├── permissions/
│   ├── Can.tsx                        # Permission-gating component
│   ├── registry.ts                   # Permission key registry
│   └── store.ts                      # Role permission state
├── i18n/                             # Translation files
│   └── en/
│       └── booking.json
├── App.tsx                           # Route definitions
└── main.tsx                          # Entry point
```

## 6. Test File Placement

| Test Type | Location | Pattern |
|-----------|----------|---------|
| Backend unit tests | `modules/{name}/__tests__/` | `{file}.spec.ts` |
| Backend integration tests | `modules/{name}/__tests__/` | `{file}.integration.spec.ts` |
| Frontend component tests | `pages/{page}/__tests__/` | `{Page}.spec.tsx` |
| Frontend hook tests | `hooks/__tests__/` | `{hook}.spec.ts` |
| E2E tests | `e2e/` (project root) | `{feature}.spec.ts` |

**Evidence:** `backend/src/modules/auth/__tests__/` contains `auth.service.spec.ts` and `auth.integration.spec.ts`.

## 7. Root-Level Directory Structure

```
CourtZon-V2/
├── backend/               # Node.js Fastify backend
│   ├── src/
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── frontend/              # React Vite frontend
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── database/              # SQL scripts
│   ├── baseline/
│   ├── migrations/
│   └── seeds/
├── docker-compose.yml
├── docs/                  # Documentation
├── scripts/               # Build/CI scripts
├── monitoring/            # Prometheus/Grafana config
└── archive/               # Historical artifacts
```

## 8. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-01 | Coding Standards — TypeScript (enforces module patterns) |
| TECH-DEV-04 | Naming Conventions (file naming rules) |
| TECH-ARCH-02 | Module Architecture (hexagonal pattern context) |
| TECH-DEV-09 | Testing Standards (test file placement) |

## 9. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

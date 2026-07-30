# CourtZon Enterprise Platform — Volume 02: Architecture

## 1. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                    │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Player  │ │  Admin   │ │   Org    │ │ Coach / Referee  │ │
│  │  App    │ │  Panel   │ │  Portal  │ │     Apps         │ │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘ │
│       │           │            │                 │           │
│       └───────────┴────────────┴─────────────────┘           │
│                        │ HTTP/WS                             │
└────────────────────────┼─────────────────────────────────────┘
                         │
┌────────────────────────┼─────────────────────────────────────┐
│               BACKEND (Fastify + TypeScript)                   │
│                         │                                      │
│  ┌──────────────────────┴──────────────────────────────┐      │
│  │              API Gateway / Auth Middleware            │      │
│  │          (authMiddleware + requirePermission)          │      │
│  └──────────────────────┬──────────────────────────────┘      │
│                         │                                      │
│  ┌──────────────────────┴──────────────────────────────┐      │
│  │                   53 Modules                          │      │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │      │
│  │  │Auth  │ │Booking│ │Mktpl.│ │Finance│ │ CRM  │ ...  │      │
│  │  │RBAC  │ │Acad. │ │Inv.  │ │Acctg. │ │ HR   │      │      │
│  │  │Org.  │ │Tourn.│ │Paymt │ │BI     │ │Sports│      │      │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘      │      │
│  └──────────────────────┬──────────────────────────────┘      │
│                         │                                      │
│  ┌──────────────────────┴──────────────────────────────┐      │
│  │          Shared Infrastructure                        │      │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌───────────┐    │      │
│  │  │EventBus│ │Queue   │ │Redis   │ │Health     │    │      │
│  │  │        │ │(BullMQ)│ │Cache   │ │Metrics    │    │      │
│  │  └────────┘ └────────┘ └────────┘ └───────────┘    │      │
│  └──────────────────────┬──────────────────────────────┘      │
└─────────────────────────┼─────────────────────────────────────┘
                          │
┌─────────────────────────┼─────────────────────────────────────┐
│              DATA LAYER                                         │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐  │
│  │   MySQL 8     │  │    Redis 7    │  │   File Storage    │  │
│  │   (Primary)   │  │  (Cache/Queue)│  │   (Uploads)       │  │
│  └───────────────┘  └───────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Module Architecture (per module)

Every backend module follows hexagonal architecture:

```
module-name/
├── index.ts                    # Barrel exports
├── __tests__/                  # Unit tests
├── domain/                     # Business logic, types
│   ├── module-name.types.ts    # TypeScript interfaces
│   └── lifecycle.ts            # State machine (when applicable)
├── application/                # Use-cases
│   └── module-name.service.ts  # Singleton service
├── infrastructure/             # I/O adapters
│   └── repositories/
│       └── module-name.repository.ts  # SQL queries
└── presentation/               # HTTP layer
    ├── module-name.routes.ts   # Route definitions
    ├── module-name.controller.ts      # Request handlers
    └── module-name.dto.ts      # Zod validation schemas
```

**Evidence:** All 53 modules follow this structure. Example: `modules/booking/` has 41 files in this exact layout.

## 3. Request Lifecycle

```
HTTP Request
  → nginx (reverse proxy /api → backend:3000)
    → Rate Limiter (100 req/min per IP)
      → authMiddleware (session cookie or Bearer token)
        → requirePermission (RBAC check)
          → Zod validation (DTO)
            → Controller handler
              → Service method
                → Repository (SQL via mysql2)
                  → Response (standardized JSON)
```

**Evidence:** `backend/src/shared/middleware/auth.middleware.ts` implements the auth chain. `backend/src/app.ts` registers rate limiting, CORS, and security headers.

## 4. Event-Driven Architecture

The EventBus v2 (`backend/src/shared/event-bus/event-bus.v2.ts`) provides:
- **Durable event store** via `published_events` table
- **Cursor-based subscriber tracking** via `outbox_cursors` table
- **Queue-based dispatch** via BullMQ (default + notifications queues)
- **In-memory handlers** for notification engine

**Flow:**
```
Domain Service
  → eventBusV2.emit('domain.event', payload, context)
    → published_events INSERT (transactional)
      → onAfterCommit → BullMQ enqueue
        → Subscriber processes → downstream action
```

**Evidence:** `server.ts:90-120` registers event bus and subscribers. `booking.service.ts` emits `booking:confirmed`, consumed by notification engine.

## 5. Database Architecture

- **Primary Database:** MySQL 8 with InnoDB engine
- **Connection Pool:** mysql2/promise with `getPool()` singleton
- **Migration Strategy:** Sequential SQL files (`database/migrations/001_*.sql` → `073_*.sql`)
- **Single Baseline:** `database/baseline/001_courtzon_v3.sql` (3,586 lines, 162 tables)
- **Seeds:** `database/seeds/001_baseline.sql` (reference data), `002_academy_programs.sql`, `003_player_demo.sql`, `004_chart_of_accounts.sql`

**Evidence:** `database/mysql.ts` implements connection pool. `app.ts:59` creates the pool on startup.

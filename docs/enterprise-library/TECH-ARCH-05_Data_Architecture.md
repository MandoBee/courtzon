---
document_id: "TECH-ARCH-05"
document_name: "Data Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["architect", "developer", "dba"]
difficulty: "advanced"
reading_time: 25
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "DBA"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  governs: ["TECH-ARCH-05"]
  references: ["TECH-ARCH-01", "TECH-DEV-10"]
  related: ["VOLUME-10"]
---

# CourtZon Data Architecture

## 1. Database Overview

- **Engine:** MySQL 8.0 with InnoDB
- **Tables:** 162 across the entire schema
- **Charset:** utf8mb4 with utf8mb4_unicode_ci collation
- **Connection Pool:** 10 connections via mysql2/promise
- **Timezone:** UTC (+00:00)
- **Baseline:** `database/baseline/001_courtzon_v3.sql` (3,586 lines)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MySQL 8.0 — 162 Tables                            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Core / Identity                               │   │
│  │  users │ user_sessions │ user_roles │ roles │ permissions     │   │
│  │  role_permissions │ user_role_scopes │ organisations          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Booking Domain                                │   │
│  │  bookings │ booking_slots │ booking_payments │ resources     │   │
│  │  resource_categories │ branches │ amenities                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Marketplace Domain                            │   │
│  │  products │ product_categories │ orders │ order_items        │   │
│  │  inventory │ brands │ tags │ coupons                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Financial Domain                              │   │
│  │  wallets │ wallet_transactions │ payments │ settlements      │   │
│  │  commissions │ ledger_entries │ chart_of_accounts            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Sports Domain                                 │   │
│  │  tournaments │ tournament_participants │ leagues │ matches   │   │
│  │  academy_programs │ academy_enrollments │ coaches            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Communication Domain                          │   │
│  │  notifications │ notification_templates │ notification_logs  │   │
│  │  notification_broadcasts │ communication_preferences         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Infrastructure                                │   │
│  │  published_events │ outbox_cursors │ audit_logs              │   │
│  │  api_keys │ webhooks │ client_error_reports │ uploads        │   │
│  │  web_vitals_metrics │ feature_flags │ app_settings           │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Evidence:** `backend/src/database/mysql.ts:10-18` shows the connection pool configuration with `connectionLimit: 10`, `charset: 'utf8mb4'`, and `timezone: '+00:00'`.

## 2. Connection Pooling

```typescript
// backend/src/database/mysql.ts:7-21
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

Pool is initialized once at startup: `app.ts:200` calls `createPool()`.

## 3. Migration Strategy

Migrations use sequential SQL files with a tracking table:

```
database/
├── baseline/
│   └── 001_courtzon_v3.sql          # Single authoritative baseline (162 tables)
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_add_booking_slots.sql
│   └── ...                           # Sequential, never modified after creation
├── seeds/
│   ├── 001_baseline.sql              # Reference data (countries, permissions, etc.)
│   ├── 002_academy_programs.sql
│   ├── 003_player_demo.sql
│   └── 004_chart_of_accounts.sql
└── Dockerfile                        # Custom MySQL image with baseline import
```

**Evidence:** `AGENTS.md` documents the migration strategy. `backend/scripts/migrate.js` applies pending migrations. The `--status` flag shows pending migrations.

## 4. Key Entity Relationships

### Users → Bookings → Payments
```
users (1) ──→ bookings (N) ──→ booking_payments (N)
  │                                │
  │                                └─→ payments (1)
  │
  └─→ user_sessions (N)
  └─→ user_roles (N) ──→ roles (N) ──→ role_permissions (N) ──→ permissions (N)
```

### Organisations → Branches → Resources
```
organisations (1) ──→ branches (N) ──→ resources (N) ──→ booking_slots (N)
  │                      │
  │                      └─→ amenities (N)
  │
  └─→ organisation_types (1)
  └─→ user_role_scopes (N) ──→ user_roles (N)
```

### Marketplace
```
products (1) ──→ product_categories (N)
  │                │
  │                └─→ categories (N)
  │
  └─→ order_items (N) ──→ orders (N) ──→ users (1)
  │
  └─→ inventory (N)
```

## 5. Transaction Support

Repositories accept an optional `conn` parameter for transaction participation:

```typescript
// booking.repository.ts:24-26
private resolve(conn?: mysql.PoolConnection): Executor {
  return conn ?? this.pool;
}

// Usage in service:
const conn = await getPool().getConnection();
await conn.beginTransaction();
try {
  await bookingRepo.create(data, conn);
  await paymentRepo.create(paymentData, conn);
  await conn.commit();
} catch (err) {
  await conn.rollback();
  throw err;
} finally {
  conn.release();
}
```

**Evidence:** `booking.repository.ts:24-26` implements the `resolve()` pattern for shared transaction connections.

## 6. Event Store Tables

Two key infrastructure tables for the event-driven architecture:

- **published_events** — Durable event store (all emitted events)
- **outbox_cursors** — Per-subscriber cursor for replay/resume

These enable reliable at-least-once event delivery.

**Evidence:** `event-bus.v2.ts:54-78` manages cursor initialization and tracking for all subscribers.

## 7. Soft Deletes

All major entity tables use soft deletes via `deleted_at` column:

```sql
deleted_at DATETIME(3) DEFAULT NULL,
INDEX idx_deleted_at (deleted_at)
```

**Evidence:** Every repository query includes `AND deleted_at IS NULL` unless explicitly querying deleted records.

## 8. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-ARCH-01 | System Architecture (context) |
| TECH-DEV-10 | Migration Standards |
| VOLUME-10 | Database (pending volume) |

## 9. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

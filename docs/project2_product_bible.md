# CourtZon Product Bible v1.0

**Date:** 30 July 2026
**Commit:** c5fec03
**Classification:** Internal Engineering Reference — Not for External Distribution

---

## Part I: Foundation

### Vision
The operating system for sports facilities in Egypt and the MENA region.

### Mission
Connect players, coaches, and facilities through a unified platform that manages bookings, payments, tournaments, memberships, and marketplace commerce.

### Core Principles
1. **Domain-Driven Design** — Business logic lives in domain aggregates with state machines
2. **Event-Driven Architecture** — eventBusV2 for decoupled communication between modules
3. **Defense in Depth** — Multi-layer concurrency protection (Redis locks → DB constraints → aggregate versioning)
4. **Tenant Isolation** — Org-scoped RBAC with no cross-org data leakage
5. **Financial Integrity** — Optimistic versioning + FOR UPDATE locks + double-entry accounting

---

## Part II: Architecture

### Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Backend | Fastify + TypeScript |
| Database | MySQL 8 (Percona) |
| Cache | Redis 7 |
| Queue | BullMQ (Redis-backed) |
| Services | Docker Compose |
| Monitoring | Prometheus + Grafana |
| Payment | Paymob |
| Auth | Opaque session tokens (PBKDF2-SHA512) |

### Module Architecture
```
module/
├── presentation/   # Routes, Controllers, DTOs (Zod schemas)
├── application/    # Services, Use Cases
├── domain/         # Aggregates, Entities, Value Objects, State Machines
├── infrastructure/ # Repositories, Workers, Providers
├── commands/       # V2 Command Pipeline handlers
└── __tests__/     # Vitest tests
```

### 53 Modules
Core: auth, booking, payment, wallet, marketplace, tournament, membership, organisations, notification
Sports: academy, league, coach, referee, match, scheduling, sports-engine
Enterprise: admin, rbac, hr, crm, finance, accounting, reports, settlements, approvals
Infrastructure: upload, translation, audit-log, app-settings, feature-flags
Reference: countries, provinces, cities, languages, currencies, amenities, banks, pricing
Experience: player-experience, community, realtime, support, cms, activities, sidebar-layout
Platform: security, integration, mobile, time, design-tokens, reference-data, bi

---

## Part III: ADR Index

| ID | Title | Decision |
|----|-------|----------|
| ADR-001 | Global Identity | Opaque session tokens, no JWT |
| ADR-002 | Domain Ownership | Each module owns its data and schema |
| ADR-003 | Event Composable Architecture | eventBusV2 for inter-module communication |
| ADR-004 | Ledger-Based Transactions | Double-entry accounting for all financial operations |
| ADR-005 | Finance Owns Financial Truth | Finance module is the source of truth for all transactions |
| ADR-007 | Single Order Aggregate | Marketplace orders as single aggregate |
| ADR-008 | Academy State Machine | Enrollment lifecycle with state machine |
| ADR-009 | Tournament Format Strategy | Strategy pattern for bracket generation |
| ADR-010 | CRM Read Model Pattern | CQRS-like read models for CRM |
| ADR-013 | Payment Gateway Abstraction | Interface pattern for multi-gateway support |
| ADR-014 | Notification Multi-Channel | Provider pattern for email, SMS, push, in-app |
| ADR-015 | Booking Concurrency | Redis locks + DB constraints + aggregate versioning |
| ADR-016 | Organization Scoped RBAC | Org-level permission scoping |
| ADR-017 | Scheduling Engine | Configurable scheduling for multi-sport |
| ADR-021 | Standings Persistence | Recalculated standings stored in DB |
| ADR-025 | Migration Strategy | Baseline + sequential migrations with tracking table |

See `docs/enterprise-library/GOV-ADR-*.md` for full ADR texts.

---

## Part IV: State Machines

### Booking States
```
pending → confirmed → checked_in → completed
       ↘ cancelled
       ↘ expired
               → no_show
confirmed → cancelled_with_fee
```

### Payment States
```
pending → paid → refunded
       → failed
       → cancelled
       → expired
```

### Tournament Match States
```
scheduled → in_progress → completed → (result confirmed)
         → walkover
         → cancelled
```

### Membership States
```
active → frozen → active (resumed)
      → cancelled
      → expired
```

### Match States
```
open → full → in_progress → completed
    → closed              → cancelled
                         → void
```

---

## Part V: Coding Standards

### TypeScript
- Strict mode enabled
- Explicit return types on public APIs
- `import type` for type-only imports
- No `any` — use `unknown` + type guards
- Zod schemas for all DTOs

### Naming
- Files: `kebab-case`
- Classes: `PascalCase`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase`
- Folders: `kebab-case`

### File Organization
- One export per file (default)
- Controllers: plain functions
- Services: classes
- Repositories: plain objects with methods
- Routes: async functions registering Fastify routes

### API Standards
- RESTful paths: `/{resource}`, `/{resource}/:id`, `/{resource}/:id/{action}`
- Request validation via Zod schemas in DTOs
- Response format: `{ data, meta? }` for collections, `{ ... }` for single resources
- Error format: `{ error, code, message, meta, details? }`

### Database Standards
- Baseline + sequential migrations
- `CREATE TABLE IF NOT EXISTS` for idempotency
- `ALTER TABLE` with `IF NOT EXISTS` via information_schema checks
- Primary key: auto-increment `id`
- Audit columns: `created_at`, `updated_at`, `deleted_at` (soft delete)
- All tables InnoDB, utf8mb4

---

## Part VI: How to Build a New Module

1. `mkdir -p modules/{name}/{presentation,application,domain,infrastructure/repositories}`
2. Create DTO (Zod schemas) in `presentation/`
3. Create Controller in `presentation/`
4. Create Routes in `presentation/`
5. Create Service in `application/`
6. Create Domain types/aggregate in `domain/` (if business rules exist)
7. Create Repository in `infrastructure/repositories/`
8. Register route in `app.ts`
9. Register permission keys in `frontend/src/permissions/registry.ts`
10. Run `node backend/scripts/sync-ui-registry.js`
11. Add role patterns to `backend/scripts/role-permission-templates.mjs`
12. Run `node backend/scripts/sync-role-permissions.mjs`
13. Create migration in `database/migrations/`
14. Add tests in `__tests__/`

---

## Part VII: Common Pitfalls

1. **SQL in controllers** — Always use repositories
2. **Missing permission guards** — Every route must have `requirePermission`
3. **Skipping audit logging** — Every state mutation needs `recordAudit()`
4. **Hardcoded tenant access** — Use `requireOrganisationAccess` for org-scoped routes
5. **No idempotency** — Payment webhooks, refunds, and state transitions must be idempotent
6. **Forgetting event emission** — State changes must emit events for other modules to react

---

## Part VIII: Glossary

| Term | Definition |
|------|------------|
| Aggregate | Domain object with lifecycle and state machine |
| Aggregate Version | Optimistic concurrency counter |
| Baseline | Authoritative database schema (single SQL file) |
| eventBusV2 | Event-driven communication bus |
| FOR UPDATE | MySQL row-level lock |
| RBAC | Role-Based Access Control |
| Org Scope | Tenant isolation boundary |
| Paymob | Egyptian payment gateway |
| BullMQ | Redis-backed job queue |
| ADR | Architecture Decision Record |

---

## Part IX: Document Index

| Document | Location |
|----------|----------|
| Production Acceptance Audit | `docs/PRODUCTION_ACCEPTANCE_AUDIT.md` |
| RC Validation Report | `docs/RC_VALIDATION_REPORT.md` |
| Final Certification | `docs/FINAL_CERTIFICATION.md` |
| EAC Report | `docs/EAC_FINAL_REPORT.md` |
| Enterprise Library | `docs/enterprise-library/` (130+ documents) |
| Security Architecture | `docs/enterprise-library/TECH-ARCH-07_Security_Architecture.md` |
| Deployment Guide | `docs/enterprise-library/OPS-DEPLOY-01_Deployment_Guide.md` |
| Monitoring Guide | `docs/enterprise-library/OPS-MON-01_Monitoring_Guide.md` |
| Backup & Restore | `docs/enterprise-library/OPS-RUN-01_Backup_Restore.md` |
| EEP Reports | `docs/eep/` (10 phase reports) |
| Refactoring Reports | `docs/refactoring/` (5 phase reports) |

---

*This Product Bible is a living document. Update it when architectural decisions change, new modules are added, or standards evolve.*

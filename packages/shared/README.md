# @courtzon/shared — Contract Layer

## Purpose

`@courtzon/shared` is the **single source of truth** for all cross-application data contracts used by the CourtZon platform (Backend, Frontend, Realtime, Workers, and future services).

It defines the **public language** spoken between applications — no business logic, no runtime code, no framework dependencies.

## Folder Structure

```
packages/shared/src/
├── index.ts              # Barrel — re-exports all public contracts
├── api/                  # API response/error/pagination contracts
│   ├── api-response.ts
│   ├── api-error.ts
│   ├── pagination.ts
│   └── index.ts
├── auth/                 # Authentication and authorization contracts
│   ├── auth-user.ts
│   ├── permissions.ts
│   ├── session.ts
│   └── index.ts
├── bookings/             # Booking domain contracts
│   ├── booking.dto.ts
│   ├── booking-status.ts
│   └── index.ts
├── common/               # Shared value objects and utility types
│   ├── money.ts
│   ├── date-range.ts
│   ├── entity-id.ts
│   ├── audit-metadata.ts
│   └── index.ts
└── notifications/        # Notification system contracts
    ├── notification-action.ts
    ├── notification.dto.ts
    ├── notification-event.ts
    └── index.ts
```

## Allowed Contents

This package MAY contain **only**:

- **DTOs** — Data Transfer Objects
- **Interfaces** — TypeScript interfaces
- **Enums** / `as const` objects
- **Type aliases** — `type X = ...`
- **Readonly constants** — `export const FOO = [...] as const`
- **Utility types** — `type DeepPartial<T> = ...`
- **Validation schemas** — if framework-independent (plain objects, no Zod dependency)

## Forbidden Contents

This package MUST NEVER contain:

| Category | Examples |
|----------|----------|
| Business logic | Validators, transformers, constructors with side effects |
| Services | Domain, application, or infrastructure services |
| Repositories | Database access, ORM code |
| Database models | Prisma schema types, SQL queries |
| Framework code | React components, Fastify routes, Express middleware |
| HTTP clients | Axios, fetch wrappers, API clients |
| Socket implementation | Socket.IO listeners, WebSocket handlers |
| Environment config | `process.env` access, config objects |
| Logging | Pino, console.log, logger instances |
| Dependency injection | Container, decorators, injection tokens |
| Hooks | React hooks, custom hooks |
| UI components | React components, JSX |
| Node-specific APIs | `fs`, `path`, `crypto`, `http` |

## Import Rules

### ✅ Correct

```typescript
// Import through the barrel (recommended)
import { NotificationAction } from '@courtzon/shared'
import type { NotificationDto } from '@courtzon/shared'

// Import through module sub-path
import { NotificationAction } from '@courtzon/shared/notifications'
```

### ❌ Incorrect

```typescript
// Direct internal file access — DO NOT USE
import { NotificationAction } from '@courtzon/shared/src/notifications/notification-action'
```

All public contracts must be exported through `packages/shared/src/index.ts`. Consumers must import only from `@courtzon/shared` or `@courtzon/shared/<module>`.

## When to Add a Contract Here

A new type belongs in `@courtzon/shared` only if it satisfies **all** of:

- [ ] Used by at least **two** applications (e.g., backend + frontend)
- [ ] **Framework-independent** — no React, Fastify, Prisma, etc.
- [ ] **Stable** — unlikely to change frequently
- [ ] **Represents data only** — DTO, enum, interface, type

If the type is used by only one application, keep it local to that application's codebase.

## Backward Compatibility

Breaking changes to shared contracts **require**:

1. A **version bump** in `packages/shared/package.json`
2. **Migration notes** in the commit message
3. **Updating all consumers** in the same commit/PR

Rules:

- **Additive changes** (new optional fields, new types) are always safe.
- **Removing fields** is breaking — create a new version or deprecate first.
- **Renaming** is breaking — use `@deprecated` JSDoc tag with the replacement name.

## Validation

Before committing changes to `@courtzon/shared`:

```bash
# Verify no framework imports were introduced
grep -r "from 'react\|from 'fastify\|from 'express\|from 'prisma" packages/shared/src/
# Expected: no output

# Verify no imports from backend/frontend
grep -r "from '\.\./backend\|from '\.\./frontend" packages/shared/src/
# Expected: no output

# TypeScript check
cd packages/shared && tsc --noEmit
```

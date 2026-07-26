# Architecture Enforcement

## Purpose

CourtZon uses automated validation to enforce architectural rules before code is merged. This document describes every automated rule, why it exists, and how violations are resolved.

## How it works

The architecture validation suite lives in `scripts/architecture/` and runs as part of CI before Docker builds.

**Build order:**

```
TypeScript compilation
    ↓
Unit / Integration tests
    ↓
Architecture validation
    ↓
Docker build
```

## Running validation locally

```bash
# Run all validators
node scripts/architecture/validate-all.js

# Run individual validators
node scripts/architecture/validate-shared-contracts.js
node scripts/architecture/validate-layering.js
node scripts/architecture/validate-eventbus.js
node scripts/architecture/validate-notification-architecture.js
node scripts/architecture/validate-import-boundaries.js
```

## Validator Reference

### 1. Shared Contracts (`validate-shared-contracts.js`)

**Rules:**
- No framework imports in `@courtzon/shared` (React, Fastify, Prisma, Socket.IO, etc.)
- No imports from `backend/` or `frontend/` in shared code
- No Node.js runtime imports in shared code (`fs`, `path`, `crypto`, `http`, etc.)
- No runtime code (class implementations, function bodies) in shared code
- Package must have zero dependencies
- Must export through barrel `index.ts`

**Why:** The shared contracts package must remain framework-agnostic and dependency-free so it can be consumed by any application without pulling in unwanted transitive dependencies.

**How to fix:** Move runtime code out of `@courtzon/shared` and into the consuming application. Use only type imports. Avoid importing framework packages.

### 2. Layer Architecture (`validate-layering.js`)

**Rules:**

| From | To | Allowed? |
|------|----|----------|
| `domain/` | `application/` | ❌ Error |
| `domain/` | `infrastructure/` | ⚠ Warning (prefer interface) |
| `domain/` | `presentation/` | ❌ Error |
| `infrastructure/` | `presentation/` | ❌ Error |
| `shared/` | `backend/` or `frontend/` | ❌ Error |
| Frontend | Backend code | ❌ Error |
| Frontend | Node.js builtins | ❌ Error (except vite config) |

**Why:** Clean layering prevents circular dependencies and keeps each layer focused on its concerns. Domain code should have zero dependencies on infrastructure. Infrastructure code should not depend on presentation details.

**Common violations:**
- `domain/` importing from `infrastructure/` → Extract the needed type into a domain interface
- Frontend importing backend code → Use the `@courtzon/shared` package instead
- Frontend importing Node.js builtins → This is usually a mistake; use browser APIs

### 3. EventBus Architecture (`validate-eventbus.js`)

**Rules:**
- No direct Socket.IO emits outside the `realtime/` module
- Domain events must use `eventBusV2.emit()`, not the legacy `eventBus.emit()`
- Notification engine must subscribe via `eventBusV2.on()`

**Why:** The EventBus is the single channel for cross-module communication. Direct Socket.IO calls from business modules bypass the event system, making events non-auditable and non-replayable.

**How to fix:** Replace direct socket emits with `eventBusV2.emit()` and subscribe in the realtime module or notification engine.

### 4. Notification Architecture (`validate-notification-architecture.js`)

**Rules:**
- Every notification must include `action.route` or `action:` in its data
- The frontend must not contain routing maps (`SCREEN_MAP`, `ROUTE_MAP`, `routeFromEntityType`)
- The frontend must read `action.route` directly for navigation

**Why:** The backend is the single source of truth for notification navigation. Frontend routing maps require dual changes and duplicate knowledge.

**How to fix:** Ensure every `dispatchToUser()` call includes a valid destination route. Move any remaining frontend routing maps to accept `action.route` directly.

### 5. Module Import Boundaries (`validate-import-boundaries.js`)

**Rules:**

| Module | May Import From |
|--------|----------------|
| `booking/` | `payment`, `financial`, `organisations`, `notifications`, `time` |
| `payment/` | `financial`, `notifications`, `booking` |
| `marketplace/` | `payment`, `financial`, `notifications` |
| `match/` | `booking`, `notifications`, `time` |
| `notifications/` | `booking`, `payment`, `marketplace`, `time` |
| `wallet/` | `payment`, `financial`, `notifications` |
| `scheduling/` | `booking`, `notifications`, `time` |
| `auth/` | `notifications` |
| `organisations/` | `booking`, `notifications`, `financial` |

Modules not listed have no import restrictions.

**Why:** Enforcing dependency direction between bounded contexts prevents circular module dependencies and keeps the module dependency graph acyclic.

**How to fix:** If module A imports module B and this is not in the allowed list, either:
1. Add the dependency to the allowed list if it's architecturally valid
2. Refactor the code to communicate through events instead of direct imports
3. Extract the shared concern into a new shared module

## CI Integration

Architecture validation is a required CI step. A merge will be blocked if any architecture rule is violated.

```yaml
# Example CI step (GitHub Actions)
- name: Architecture Validation
  run: node scripts/architecture/validate-all.js

- name: Architecture Health
  run: node scripts/architecture/metrics.js
- name: Upload Health Report
  uses: actions/upload-artifact@v4
  with:
    name: architecture-health
    path: artifacts/architecture-health.json
```

Recommended CI order:

```
TypeScript compilation
    ↓
Unit / Integration tests
    ↓
Architecture validation (fails on violations)
    ↓
Architecture metrics (informational only)
    ↓
Docker build
```

## Health Score

After architecture validation, the metrics script produces a health score (0–100) that aggregates all metrics. See [health.md](health.md) for the full reference.

**Current health score: 89/100**

The health score is **informational only**—it never blocks the build. It should be reviewed every release to detect trends.

## Adding a new validator

1. Create a new file in `scripts/architecture/validate-<name>.js`
2. Export an async `validate()` function that returns a `Validator` instance
3. Register the validator in `scripts/architecture/validate-all.js`
4. Add documentation for the new rules in this file
5. Verify all existing rules still pass

## Severity levels

| Level | Meaning | CI action |
|-------|---------|-----------|
| **Error** | Rule violation — must be fixed | Blocks the build |
| **Warning** | Rule violation — should be fixed | Logged, does not block |
| **Pass** | Rule satisfied | Silent |

## Exceptions

No exceptions are allowed for error-level rules. Warning-level rules may have pre-existing violations that are tracked but not immediately blocking. New code must not introduce new warnings.

# ADR-0001: Shared Contracts Package (@courtzon/shared)

## Status

Accepted

## Context

CourtZon is a multi-application platform with a TypeScript backend (Fastify/Node.js), a React frontend (Vite), realtime workers (Socket.IO), and queue-based background jobs (BullMQ). Each application previously defined its own types and DTOs independently, leading to:

- Duplicated interface definitions between backend and frontend
- Drift between API contracts and their consumers
- Inconsistent naming for the same concepts (e.g., `NotificationAction` defined separately)
- No single source of truth for cross-application data shapes

The team needed a mechanism to share contracts without coupling compile-time dependencies or introducing a full monorepo build pipeline.

## Decision

Create a lightweight **workspace package** (`@courtzon/shared`) under `packages/shared/` that contains only:

- TypeScript interfaces and type aliases
- DTOs (Data Transfer Objects)
- Enums and `as const` constants
- Readonly configuration objects

**Governance rules:**

- Zero runtime dependencies
- Zero framework imports (no React, Fastify, Prisma, Socket.IO)
- Zero business logic
- All exports through a barrel `index.ts`
- Consumers import only from `@courtzon/shared` or `@courtzon/shared/<module>`

**Resolution:**

- Backend: `file:../packages/shared` dependency in `package.json`, copied into Docker image at `/packages/`
- Frontend: `resolve.alias` in `vite.config.ts` + `paths` in `tsconfig.app.json`
- Both: npm workspace via root `package.json`

## Consequences

**Benefits:**
- Single source of truth for all cross-application contracts
- Type safety across the entire API surface
- No more manual synchronization between frontend and backend types
- Framework independence means the shared package can be consumed by future services (mobile apps, serverless functions, etc.)
- CI validation catches violations (framework imports, cross-app dependencies)

**Trade-offs:**
- Added complexity: workspace configuration, path aliases, Dockerfile updates
- TypeScript `paths` configuration can be fragile (TypeScript 6.x deprecated `baseUrl`)
- Both applications must use compatible TypeScript versions

**Alternatives rejected:**
- *gRPC/protobuf*: Too heavy for a two-application platform; would add a code generation step
- *GraphQL*: Would require replacing the REST API layer; shared type benefits are smaller than the migration cost
- *Copy-paste shared types*: Led to drift and bugs; this ADR exists precisely to eliminate that pattern
- *Full monorepo (Nx/Turborepo)*: Overkill for the current scale; workspace packages provide sufficient isolation
- *Published npm package*: Adds a publish step and versioning overhead for types that change frequently during development

**Future considerations:**
- As the platform grows, individual contracts may be extracted into more granular sub-path exports (`@courtzon/shared/bookings`, `@courtzon/shared/payments`)
- Validation schemas (Zod) that are framework-independent could live here, but Zod itself must be a peer dependency, not a direct dependency
- The `packages/shared/src/types.ts` backward-compat re-export should be removed once all consumers are migrated to the barrel exports

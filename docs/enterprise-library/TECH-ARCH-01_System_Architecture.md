---
document_id: "TECH-ARCH-01"
document_name: "System Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["architect", "developer", "devops"]
difficulty: "advanced"
reading_time: 25
business_owner: "Engineering Manager"
technical_owner: "Architect"
documentation_owner: "Technical Writing"
reviewer: "Lead Developer"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  governs: ["TECH-ARCH-01"]
  references: ["TECH-ARCH-02", "TECH-ARCH-05", "TECH-ARCH-08"]
  related: ["VOLUME-02", "TECH-DEV-03"]
---

# CourtZon System Architecture

## 1. System Diagram

```
                          ┌─────────────────────────────────────────────────────────────────────┐
                          │                        FRONTEND (React 19 + Vite)                      │
                          │  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐  │
                          │  │   Player App     │ │   Admin Panel    │ │   Org Portal         │  │
                          │  │  (consumer SPA)  │ │  (admin SPA)     │ │  (org management)   │  │
                          │  └────────┬─────────┘ └────────┬─────────┘ └──────────┬───────────┘  │
                          │           │                     │                      │               │
                          │           └─────────────────────┴──────────────────────┘               │
                          │                              │ HTTP/WS                                  │
                          └──────────────────────────────┼───────────────────────────────────────────┘
                                                          │ :80 / :443
                          ┌──────────────────────────────┼───────────────────────────────────────────┐
                          │                      NGINX (Reverse Proxy)                                 │
                          │  ┌──────────────────────────────────────────────────────────────────────┐ │
                          │  │  Security headers | Gzip | SPA fallback | /api/ → backend:3000      │ │
                          │  │  WebSocket proxy /socket.io/ → backend:3000                          │ │
                          │  └──────────────────────────────────────────────────────────────────────┘ │
                          │                              │ :3000                                      │
                          │  ┌────────────────────────────┴───────────────────────────────────────┐  │
                          │  │                    BACKEND (Fastify 5 + TypeScript 6)                │  │
                          │  │                                                                      │  │
                          │  │  ┌────────────────────────────────────────────────────────────────┐ │  │
                          │  │  │                     Middleware Pipeline                         │ │  │
                          │  │  │  Helmet → Rate Limiter → Maintenance → Auth → Route Guard     │ │  │
                          │  │  └────────────────────────────────────────────────────────────────┘ │  │
                          │  │                              │                                      │  │
                          │  │  ┌────────────────────────────┴──────────────────────────────────┐ │  │
                          │  │  │                        53 Modules                              │ │  │
                          │  │  │  ┌────────┐┌────────┐┌────────┐┌────────┐┌────────┐┌──────┐ │ │  │
                          │  │  │  │ Auth   ││Booking ││Marketpl││Financial││CRM    ││ HR   │...│ │  │
                          │  │  │  │ RBAC   ││ Academy││Payment ││Settle. ││Org    ││Sports│ │ │  │  │
                          │  │  │  └────────┘└────────┘└────────┘└────────┘└────────┘└──────┘ │ │  │
                          │  │  └──────────────────────────────────────────────────────────────┘ │  │
                          │  │                              │                                      │  │
                          │  │  ┌────────────────────────────┴──────────────────────────────────┐ │  │
                          │  │  │                   Shared Infrastructure                        │ │  │
                          │  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │ │  │
                          │  │  │  │ EventBus │ │ BullMQ   │ │ ioredis  │ │ Health / Metrics │ │ │  │
                          │  │  │  │   v2     │ │ Queue    │ │ Cache    │ │ Prometheus       │ │ │  │
                          │  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │ │  │
                          │  │  └──────────────────────────────────────────────────────────────┘ │  │
                          │  └──────────────────────────────────────────────────────────────────┘  │
                          └─────────────────────────────────────────────────────────────────────────┘
                                                                      │
                          ┌────────────────────────────────────────────┼─────────────────────────────┐
                          │                    DATA LAYER               │                              │
                          │  ┌────────────────────┐ ┌────────────────┐ ┌──────────────────────────┐ │
                          │  │     MySQL 8.0      │ │    Redis 7     │ │       File Storage       │ │
                          │  │  162 tables (InnoDB)│ │ Cache / Queue  │ │  Uploads via multipart   │ │
                          │  │  Connection pool=10 │ │   maxmemory    │ │  S3-compatible (via AWS) │ │
                          │  │  utf8mb4 / InnoDB   │ │   512mb        │ │                          │ │
                          │  └────────────────────┘ └────────────────┘ └──────────────────────────┘ │
                          └─────────────────────────────────────────────────────────────────────────┘
```

## 2. Request Lifecycle

```
Client Request
  → nginx (:80/:443) — reverse proxy
    → Security headers (CSP, HSTS, X-Frame-Options)
      → /api/ proxy pass to backend:3000
        → Helmet middleware (security headers)
          → Rate Limiter (@fastify/rate-limit, 100 req/min/IP)
            → Maintenance middleware (check app_settings maintenance_mode)
              → authMiddleware (session cookie or Bearer token)
                → requirePermission (RBAC check via user_role_scopes)
                  → Route-specific middleware (e.g. requireApprovedOrg)
                    → Zod validation (DTO schema parse)
                      → Controller handler
                        → Service method (business logic)
                          → Repository (SQL via mysql2/promise getPool())
                            → Event emission (eventBusV2.emit)
                              → Standardized JSON response
                                → Audit log (recordAudit)
```

**Evidence:** `backend/src/app.ts:104-115` creates the Fastify instance with logger, request ID, and trust proxy. Lines 117-142 register Helmet with CSP. Lines 175-179 register rate limiting. Line 347 applies `authMiddleware` as a global preHandler hook. Line 349 applies maintenance middleware. Lines 550-595 implement the centralized error handler.

## 3. Module Registration Pattern

Every module registers routes in `app.ts` via `app.register(moduleRoutes)`:

```typescript
// backend/src/app.ts:480-541
app.register(authRoutes, { requireFeatureFlag });
app.register(organisationRoutes);
app.register(bookingRoutes);
app.register(marketplaceRoutes, { requireFeatureFlag });
// ... 50+ additional module registrations
app.register(apiGatewayRoutes);
app.register(mobileRoutes);
```

**Evidence:** `backend/src/app.ts:480-541` registers routes for 53+ modules. Each registration is a standard Fastify plugin pattern.

## 4. Middleware Pipeline

The middleware stack is applied in strict order:

| Order | Middleware | File | Effect |
|-------|-----------|------|--------|
| 1 | Helmet (CSP) | `app.ts:117-142` | Security headers on every request |
| 2 | Rate Limiter | `app.ts:175-179` | 100 req/min/IP (2000 in dev) |
| 3 | Maintenance | `app.ts:343,349` | Blocks when maintenance mode on |
| 4 | authMiddleware | `app.ts:347` | Resolves user from session, 401 if invalid |
| 5 | Route-specific | route files | requirePermission, requireRole, apiKeyAuth |
| 6 | DTO validation | controller | Zod schema validation |
| 7 | Error Handler | `app.ts:550-595` | Catches AppError, ZodError, 429, 500 |

**Evidence:** `backend/src/shared/middleware/auth.middleware.ts:106-126` implements `authMiddleware` with public prefix bypass (lines 93-104). Helmet CSP directives at `app.ts:118-131`. Rate limit configuration at `app.ts:175-179`.

## 5. Container Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Docker Compose Stack                         │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │   nginx   │  │  Backend   │  │   MySQL    │  │      Redis       │ │
│  │ (frontend)│  │ (Fastify)  │  │   (8.0)    │  │     (7-alpine)   │ │
│  │  :80/5173 │  │   :3000    │  │  :3306/3307│  │    :6379         │ │
│  └───────────┘  └───────────┘  └───────────┘  └──────────────────┘ │
│  ┌──────────────────┐  ┌───────────┐                                │
│  │   Prometheus     │  │  Grafana  │  (optional monitoring profile)  │
│  │     :9090        │  │   :3001   │                                │
│  └──────────────────┘  └───────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
```

**Evidence:** `docker-compose.yml` defines all 6 services. Frontend runs nginx serving the React SPA. Backend runs the compiled Fastify application. MySQL and Redis are dedicated containers with health checks and resource limits.

## 6. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Fastify 5 | High performance, schema-based serialization, plugin ecosystem |
| Language | TypeScript 6 (strict) | Type safety across 53 modules |
| Database | MySQL 8 + InnoDB | ACID compliance, utf8mb4, mature ecosystem |
| Cache/Queue | Redis 7 + BullMQ | Single data structure server for both caching and job queues |
| Frontend | React 19 + Vite | Modern tooling, HMR for rapid development |
| Deployment | Docker Compose | Self-contained stack, consistent across dev/staging/production |
| Auth | Session cookies + HttpOnly | Secure, prevents XSS token theft |
| API Gateway | nginx reverse proxy | Industry standard, battle-tested, low overhead |

## 7. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-ARCH-02 | Module Architecture (detailed module structure) |
| TECH-ARCH-05 | Data Architecture (database design) |
| TECH-ARCH-08 | Deployment Architecture (Docker/nginx details) |
| TECH-DEV-03 | Folder Structure Standard |
| VOLUME-02 | Architecture (business-level architecture view) |

## 8. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

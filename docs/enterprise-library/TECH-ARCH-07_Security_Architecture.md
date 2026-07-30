---
document_id: "TECH-ARCH-07"
document_name: "Security Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["architect", "developer", "security"]
difficulty: "advanced"
reading_time: 25
business_owner: "CISO"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Security Engineer"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  governs: ["TECH-ARCH-07"]
  references: ["TECH-ARCH-01", "TECH-DEV-14"]
  related: ["VOLUME-08", "VOLUME-19"]
---

# CourtZon Security Architecture

## 1. Authentication

CourtZon uses **session-based authentication** with HttpOnly cookies as the primary mechanism:

```
┌──────────┐                    ┌──────────┐                    ┌──────────┐
│  Client  │                    │  Backend  │                    │  MySQL   │
└────┬─────┘                    └────┬──────┘                    └────┬─────┘
     │  POST /auth/login             │                               │
     │  { email, password }          │                               │
     │ ──────────────────────────────→                               │
     │                               │  Verify credentials           │
     │                               │  ─────────────────────────────→
     │                               │  ←── user_id, roles ─────────
     │                               │                               │
     │                               │  Create user_sessions row     │
     │                               │  ─────────────────────────────→
     │                               │                               │
     │  ← Set-Cookie: session_token  │                               │
     │     HttpOnly; Secure; SameSite│                               │
     │                               │                               │
     │  GET /api/resource            │                               │
     │  Cookie: session_token=xxx    │                               │
     │ ──────────────────────────────→                               │
     │                               │  SELECT FROM user_sessions    │
     │                               │  WHERE token_hash = SHA256(x) │
     │                               │  ─────────────────────────────→
     │                               │  ←── user_id ────────────────
     │                               │                               │
     │  ← 200 OK                    │                               │
     │     (request.userId set)     │                               │
```

**Evidence:** `backend/src/shared/middleware/auth.middleware.ts:106-126` implements `authMiddleware` with session token resolution via `resolveSessionUserId()`. `app.ts:205-218` initializes the auth deps with session lookup against `user_sessions` table with SHA-256 hashed tokens.

### Bearer Token Alternative

```typescript
// auth.middleware.ts supports Authorization: Bearer header as fallback
// The auth middleware also checks for Bearer tokens in the Authorization header
```

**Evidence:** `api-key-auth.ts:24-28` shows Bearer token support as fallback for API gateway integration.

## 2. Authorization (RBAC)

The authorization system uses three layers:

### Layer 1: requirePermission Middleware

```typescript
// backend/src/shared/middleware/auth.middleware.ts:37-50
export function requirePermission(permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
    const hasPermission = await getDeps().checkPermission(userId, permissions);
    if (!hasPermission) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Insufficient permissions' });
    }
  };
}
```

### Layer 2: requireRole Middleware

```typescript
// backend/src/shared/middleware/auth.middleware.ts:22-35
export function requireRole(roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request as any).userId;
    if (!userId) return reply.status(401).send({});
    const hasRole = await getDeps().checkRole(userId, roles);
    if (!hasRole) return reply.status(403).send({});
  };
}
```

### Layer 3: eitherRoleOrPermission (compound)

```typescript
// auth.middleware.ts:53-66
export function eitherRoleOrPermission(roles: string[], permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const deps = getDeps();
    if (await deps.checkRole(userId, roles)) return;
    if (await deps.checkPermission(userId, permissions)) return;
    return reply.status(403).send({});
  };
}

export const adminGuard = eitherRoleOrPermission(['super_admin', 'super-admin'], ['platform.admin']);
```

### Database Schema

```
permissions (id, permission_key, module_slug, element_type, element_label, is_ui_element)
role_permissions (role_id, permission_id)
roles (id, name, slug, is_system)
user_roles (id, user_id, role_id, is_active, expires_at)
user_role_scopes (id, user_role_id, scope_type, scope_id)  -- Organisation-level scoping
```

**Evidence:** `app.ts:220-264` implements `checkRole`, `checkPermission`, and `checkOrgApproved` with SQL joins across `user_roles`, `role_permissions`, `permissions`, and `user_role_scopes`. The `adminGuard` constant at line 69 ensures platform-level admin access.

## 3. Permission Key Convention

Permissions follow the pattern `{module}.{entity}.{action}`:

| Pattern | Example |
|---------|---------|
| Page access | `users.view` |
| CRUD actions | `users.create`, `users.edit`, `users.delete` |
| Field-level | `users.edit.first-name`, `users.edit.email` |
| Tab access | `users.view-bookings`, `users.view-orders` |
| Admin actions | `platform.admin`, `integration.api-keys.manage` |

**Evidence:** `frontend/src/permissions/registry.ts:12-40` defines the complete registry of 200+ UI permissions. `backend/scripts/sync-ui-registry.js` syncs these to the `permissions` table.

## 4. Rate Limiting

```typescript
// app.ts:175-179
await app.register(rateLimit, {
  max: relaxRateLimit ? 2000 : 100,
  timeWindow: '1 minute',
  keyGenerator: (request) => request.ip,
});
```

- **Default:** 100 requests/minute per IP
- **Development/Docker:** 2000 requests/minute
- **Auth-specific:** Login endpoints have additional rate limiting via brute-force protection module

**Evidence:** `backend/src/app.ts:173-179`. Auth-specific rate limiting at `backend/src/modules/brute-force/application/brute-force.service.ts`.

## 5. Security Monitoring

### Failed Login Tracking
Brute-force protection module tracks failed login attempts and applies escalating delays:

```typescript
// brute-force.service.ts
// Tracks failed attempts per IP + email combination
// Applies delays: 1s → 5s → 30s → 5min → 30min
// Resets after successful login or timeout
```

**Evidence:** `backend/src/modules/brute-force/application/brute-force.service.ts` implements rate limiting specific to authentication endpoints.

### Session Tracking
All sessions are tracked in `user_sessions` table with:
- `session_token_hash` (SHA-256)
- `user_id`
- `ip_address`
- `user_agent`
- `created_at`, `expires_at`
- `is_revoked` flag

**Evidence:** `app.ts:212-216` queries `user_sessions` with `is_revoked = FALSE AND expires_at > NOW()`.

## 6. Upload Security

```typescript
// app.ts:351-357
await app.register(multipart, {
  limits: {
    fileSize: 6 * 1024 * 1024,    // 6MB per file
    files: 6,                       // Max 6 files per request
    fieldSize: 64 * 1024,           // 64KB field size
  },
});
```

**Evidence:** `backend/src/modules/upload/application/upload.service.ts` handles file validation and security. CSP in `app.ts:123` restricts `imgSrc` to `'self'`, `data:`, `https:`.

## 7. Security Headers

```typescript
// app.ts:117-142 — Helmet configuration
await app.register(helmet, {
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "blob:"],
    imgSrc: ["'self'", "data:", "https:"],
    fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
    connectSrc: ["'self'", ...ALLOWED_ORIGINS, "https://*.checkout.paymob.com"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    upgradeInsecureRequests: [],
  }},
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  xFrameOptions: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
```

**Evidence:** Frontend nginx also includes `/etc/nginx/security-headers.conf` as seen in `frontend/nginx.conf:28`.

## 8. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-ARCH-01 | System Architecture (context) |
| TECH-DEV-14 | Security Coding Standards |
| VOLUME-08 | Permissions Reference |

## 9. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

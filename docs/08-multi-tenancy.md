# MULTI-TENANCY DESIGN

## Strategy: Database-per-Tenant (True Multi-Tenancy)

**Current State**: Row-level RBAC scoping via `organization_id` foreign keys (single database).
**Target State**: Each organization gets its own database, with a shared routing layer.

## Architecture

```
┌─────────────────────────────────────────────┐
│              Router Service                  │
│  Reads subdomain → looks up tenant DB name   │
│  Returns tenant-specific connection pool     │
└─────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
   courtzon_1    courtzon_2    courtzon_N
   (Org A)       (Org B)       (Org N)
```

## Tenant Identification
- **Subdomain**: `{org-slug}.courtzon.com`
- **Header**: `X-Tenant-ID` for API requests
- **JWT Claim**: `tenant_id` embedded in auth token
- **Super Admin**: Uses a special `*` tenant scope or a separate admin DB

## Shared Database (Global)
Stores cross-tenant data:
- `users` (global identity, login credentials)
- `roles`, `permissions` (global permission registry)
- `sports`, `languages`, `countries`, `currencies` (reference data)
- `subscription_plans` (product catalog)
- `tenant_registry` (maps subdomain → database name)

## Tenant Database (Per Org)
Each tenant DB stores:
- All organization-specific data (branches, resources, bookings, etc.)
- RBAC scopes limited to that tenant
- Financial data (wallets, transactions, settlements)
- Marketplace, tournaments, academies within that org

## Migration Path
1. **Phase 1** (current): Single DB with row-level RBAC — works for MVP
2. **Phase 2**: Extract global/shared tables into `courtzon_global` DB
3. **Phase 3**: Per-org databases with router middleware
4. **Phase 4**: Automated tenant provisioning (new org → new DB created via migration)

## Router Implementation
```typescript
// Middleware
async function tenantResolver(request, reply) {
  const subdomain = request.hostname.split('.')[0];
  const tenant = await tenantCache.get(subdomain);
  request.tenantDb = getPool(tenant.database_name);
}
```

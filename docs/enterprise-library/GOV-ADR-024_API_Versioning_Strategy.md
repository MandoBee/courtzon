---
document_id: "GOV-ADR-024"
document_name: "API Versioning Strategy — URL Prefix + API Key Authentication"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer", "product-manager"]
difficulty: "beginner"
reading_time: 5
business_owner: "CTO"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-DEV-11", "TECH-MOD-27"]
  related: []
---

# ADR-024: API Versioning Strategy — URL Prefix + API Key Authentication

## Status

Accepted

## Context

External integrations (third-party apps, mobile apps, partner systems) consume the CourtZon API. As the platform evolves, breaking changes to the API response format, authentication, or endpoint structure will be necessary. A versioning strategy must support backward-compatible evolution without breaking existing clients. Common approaches include:

1. **No versioning** — simplest; but any breaking change breaks all clients
2. **URL prefix versioning (`/api/v1/`)** — explicit, easy for clients to manage; supports parallel versions
3. **Header-based versioning (`Accept: application/vnd.courtzon.v1+json`)** — clean URL; but harder for clients to discover and debug
4. **Query parameter versioning (`?v=1`)** — simple; but pollutes query string; easy to forget

## Decision

**Use URL prefix versioning (`/api/v1/`) with API key authentication for external integrations.** All public endpoints are served under `/api/v1/`. API keys are used for client identification and authentication alongside standard session auth.

### Architecture

```
External Client
  → GET /api/v1/bookings
  → Headers: Authorization: Bearer <session-token>
           X-API-Key: <api-key>  (for machine-to-machine)

Internal Modules
  → All internal routes use their own path (e.g., /hr/payroll-runs)
  → Internal routes are NOT prefixed with /api/v1/
```

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| URL prefix | `/api/v1/` for all external-facing endpoints | `integration.routes.ts:10-25` |
| API key auth | `apiKeyAuth` middleware for machine-to-machine endpoints | `integration.routes.ts:18-25` |
| API key management | `POST /api/v1/api-keys` — create/revoke keys | `integration.routes.ts:10-12` |
| Session auth | Standard `Authorization: Bearer <token>` for user-facing API calls | `auth.middleware.ts` |
| Public routes | `/public/`, `/health`, `/payments/webhook`, `/auth/*` — no auth required | `auth.middleware.ts:93-104` |
| Version policy | `docs/api-versioning-policy.md` — defines when to bump major version | `docs/api-versioning-policy.md` |

### Exposed API v1 Endpoints

| Endpoint | Description | Authentication |
|----------|-------------|----------------|
| `GET /api/v1/bookings` | List bookings | API key |
| `GET /api/v1/bookings/:id` | Get booking detail | API key |
| `GET /api/v1/organisations` | List organisations | API key |
| `GET /api/v1/tournaments` | List tournaments | API key |
| `GET /api/v1/tournaments/:id` | Get tournament detail | API key |
| `GET /api/v1/academy/programs` | List academy programs | API key |
| `GET /api/v1/marketplace/products` | List marketplace products | API key |
| `GET /api/v1/leagues` | List leagues | API key |

**Evidence:** `integration.routes.ts:10-25` — all v1 endpoint registrations.

### When to Bump Major Version

| Change | Major Version Bump Required |
|--------|----------------------------|
| Remove field from response | Yes |
| Rename field in response | Yes |
| Change field type | Yes |
| Change authentication method | Yes |
| Change permission model | Yes |
| Add new field to response | No |
| Add new endpoint | No |
| Add new optional parameter | No |

**Source:** `docs/api-versioning-policy.md`

## Consequences

### Positive

- **Explicit versioning**: Clients know exactly which version they're using from the URL
- **Coexistence**: API v1 and v2 can run side by side during migration period
- **API key auth**: Machine-to-machine clients don't need user sessions; keys can be independently revoked
- **Simple discovery**: Version is visible in the URL — no need for special headers
- **Internal isolation**: Internal module routes are NOT versioned, allowing faster internal evolution

### Negative

- **URL pollution**: All external endpoints have `/api/v1/` prefix
- **Version proliferation risk**: Multiple parallel versions can become maintenance burden (mitigated by deprecation policy)
- **Limited to read-only**: Current v1 endpoints are GET-only; POST/PUT endpoints planned for v1.1
- **No version negotiation**: Clients must explicitly know the version URL; no content negotiation

## Evidence

- `integration.routes.ts:10-25` — API v1 endpoints with API key auth middleware
- `auth.middleware.ts:93-104` — public route prefixes (excluded from versioning)
- `docs/api-versioning-policy.md` — full versioning policy document

## Related Decisions

- TECH-DEV-11 (API Design Standards): API design conventions

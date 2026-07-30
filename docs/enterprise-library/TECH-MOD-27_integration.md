---
document_id: "TECH-MOD-27"
document_name: "Integration Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-ARCH-06"]
  related: ["TECH-MOD-01"]
---

# Integration Module (TECH-MOD-27)

**Source:** `backend/src/modules/integration/` (5 files: index.ts, middleware/, infrastructure/, presentation/)

## 1. Purpose

API key management and external API gateway. Creates API keys with one-time display, lists active keys, revokes keys. Provides `/api/v1/` gateway endpoints authenticated via SHA-256 hashed API keys. Supports dual auth (X-API-Key header or session Bearer token).

## 2. Architecture

```
middleware/
  api-key-auth.ts        — SHA-256 hash verification middleware
presentation/
  integration.routes.ts  — 11 routes (3 key mgmt + 8 gateway)
  integration.controller.ts
infrastructure/
  repositories/
    api-key.repository.ts
index.ts                 — Re-exports apiGatewayRoutes
```

**Evidence:** `integration.routes.ts:6-26`, `api-key-auth.ts:5-31`.

## 3. API Key Auth Middleware

`api-key-auth.ts:5-31`:
1. Reads `X-API-Key` header
2. Computes `SHA-256` hash of the provided key
3. Looks up key hash in `api_keys` table
4. On match: sets `userId`, `apiKeyId`, `apiKeyScopes`, `authType = 'api_key'`
5. On miss: checks for Bearer token fallback
6. Neither: returns 401

**Evidence:** `api-key-auth.ts:5-31`.

## 4. Routes (11)

**API Key Management** (`integration.routes.ts:10-12`):
| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 1 | POST | `/api/v1/api-keys` | `integration.api-keys.manage` | Create (one-time display) |
| 2 | GET | `/api/v1/api-keys` | `integration.api-keys.view` | List keys |
| 3 | DELETE | `/api/v1/api-keys/:id` | `integration.api-keys.manage` | Revoke key |

**Public API Gateway** (`integration.routes.ts:18-25`, uses `apiKeyAuth` middleware):
| # | Method | Path | Purpose |
|---|--------|------|---------|
| 4 | GET | `/api/v1/bookings` | List bookings via API |
| 5 | GET | `/api/v1/bookings/:id` | Get booking via API |
| 6 | GET | `/api/v1/organisations` | List organisations via API |
| 7 | GET | `/api/v1/tournaments` | List tournaments via API |
| 8 | GET | `/api/v1/tournaments/:id` | Get tournament via API |
| 9 | GET | `/api/v1/academy/programs` | List academy programs via API |
| 10 | GET | `/api/v1/marketplace/products` | List products via API |
| 11 | GET | `/api/v1/leagues` | List leagues via API |

## 5. Permissions

- `integration.api-keys.manage` — Create/revoke API keys
- `integration.api-keys.view` — View API keys
- Gateway routes use `apiKeyAuth` middleware (API key OR session auth)

## 6. Security

- Keys stored as SHA-256 hashes (never plaintext)
- One-time display on creation only
- `updateLastUsed()` tracked on each API call
- Revocation is soft (deactivates key)
- Fallback to Bearer token auth for non-API-key clients

# API STANDARDS & CONVENTIONS

## General Rules
- **Base URL**: `/api/v1/`
- **Protocol**: HTTPS only (production)
- **Format**: JSON request/response
- **Auth**: Bearer token in `Authorization` header
- **Content-Type**: `application/json`

## Response Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 100
  },
  "error": null
}
```

Error response:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [
      { "field": "email", "message": "Required" }
    ]
  }
}
```

## HTTP Status Codes
| Code | Usage |
|---|---|
| 200 | Success (GET, PUT, PATCH) |
| 201 | Created (POST) |
| 204 | No Content (DELETE) |
| 400 | Validation Error |
| 401 | Unauthenticated |
| 403 | Forbidden (wrong role/scope) |
| 404 | Not Found |
| 409 | Conflict (duplicate slot, etc.) |
| 422 | Business Rule Violation |
| 429 | Rate Limited |
| 500 | Internal Server Error |

## Naming Conventions
- **URLs**: `kebab-case`, plural nouns: `/api/v1/organizations/{id}/branches`
- **Query Params**: `snake_case`: `?per_page=20&sort_by=created_at`
- **Request/Response Fields**: `snake_case`
- **Versioning**: URL path prefix (`/api/v1/`)

## Pagination
- `?page=1&per_page=20` (default 20, max 100)
- Response includes `meta.page`, `meta.per_page`, `meta.total`
- Cursor-based pagination for real-time feeds: `?cursor={id}&limit=20`

## Validation (Zod)
- All request bodies validated with Zod schemas (DTO layer)
- Error messages localized (en/ar via i18n)
- Strict mode: unknown fields rejected

## Rate Limiting
- Authenticated: 100 req/min
- Unauthenticated: 20 req/min
- WebSocket connections: 10 concurrent per user

## Endpoint Structure
```
GET    /api/v1/{resource}          → List (paginated)
POST   /api/v1/{resource}          → Create
GET    /api/v1/{resource}/:id      → Read
PUT    /api/v1/{resource}/:id      → Full update
PATCH  /api/v1/{resource}/:id      → Partial update
DELETE /api/v1/{resource}/:id      → Soft delete
```

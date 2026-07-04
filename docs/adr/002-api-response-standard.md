# ADR 002: API Response Standard

**Status:** Accepted  
**Date:** 2026-07-04  
**Authors:** CourtZon Engineering

## Context

The backend currently uses 8+ different response envelope patterns across modules: wrapped `{ data: ... }`, raw objects, `{ message: "..." }`, `{ success: true }`, `{ id: ... }`, and various error shapes. This inconsistency forces the frontend to handle each endpoint individually and creates maintenance overhead.

## Decision

All API endpoints must follow a consistent envelope pattern:

**List endpoints (GET collections):**
```json
{
  "data": [ ... ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

**Single-entity endpoints (GET by ID):**
```json
{
  "data": { "id": 1, "name": "..." }
}
```

**Mutation responses (POST, PUT, PATCH):**
```json
{
  "data": { "id": 42, "name": "..." }
}
```

**Error responses:**
```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "details": []  // optional, for Zod validation errors
}
```

Error codes use `UPPER_SNAKE_CASE`: `NOT_FOUND`, `VALIDATION_ERROR`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_ERROR`, `AUTHENTICATION_ERROR`, `RATE_LIMIT_EXCEEDED`.

## Alternatives Considered

- **JSON:API spec (rejected).** Too verbose for this project size. Adds `type`, `id`, `attributes`, `relationships` wrapping that most frontend code doesn't need.
- **Keep current inconsistency (rejected).** Each module doing its own thing creates bugs when new developers expect one pattern and get another.
- **GraphQL (rejected).** Would require significant rearchitecture. REST is sufficient for current complexity.

## Consequences

- **Positive:** Frontend can use a single `unwrapResponse()` helper. New developers have clear expectations. Error handling is uniform.
- **Negative:** Existing endpoints need migration. Not a breaking change — add wrapper to responses gradually.
- **Action:** New endpoints must follow this standard (enforced by API-01 through API-04 in engineering standards). Existing endpoints will be migrated incrementally.

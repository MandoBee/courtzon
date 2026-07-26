# CourtZon Backend Response & Error Framework

## Purpose

This document defines the standard response contract for every CourtZon backend API. It unifies error handling, localization, audit, and observability into a single framework that all modules **must** follow.

**Status:** Proposed — pending approval before implementation.
**Compatibility:** 100% backward compatible with existing APIs.

---

## PART 1 — Standard Response Contract

### 1.1 Success Response

```json
{
  "data": { ... },
  "meta": {
    "requestId": "req_a1b2c3d4",
    "timestamp": "2026-07-26T12:00:00Z",
    "code": "BOOKING_CREATED"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | any | Yes | The response payload. Can be an object, array, or primitive. |
| `meta.requestId` | string | Yes | Correlation ID from the request. Maps to Fastify `reqId`. |
| `meta.timestamp` | string | Yes | ISO 8601 UTC timestamp of the response. |
| `meta.code` | string | No | Success code for operations that benefit from explicit confirmation (see Part 3). |

### 1.2 Error Response

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Validation failed",
  "code": "VALIDATION_REQUIRED",
  "meta": {
    "requestId": "req_a1b2c3d4",
    "timestamp": "2026-07-26T12:00:00Z",
    "traceId": "trace_x1y2z3"
  },
  "details": [
    {
      "field": "phoneNumber",
      "code": "VALIDATION_REQUIRED",
      "message": "Phone number is required"
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `error` | string | Yes | Machine-readable error category. Always UPPER_SNAKE_CASE. |
| `message` | string | Yes | Human-readable English fallback. For developer clarity and backward compatibility. |
| `code` | string | Yes | Specific error code (see Part 2). Maps to CLP translation key. |
| `meta.requestId` | string | Yes | Correlation ID from the request. |
| `meta.timestamp` | string | Yes | ISO 8601 UTC timestamp. |
| `meta.traceId` | string | No | Distributed tracing ID for payment/sync flows. |
| `details` | array | No | Array of `ResponseErrorDetail` objects for validation errors or multiple error causes. |

### 1.3 Error Detail Item

```json
{
  "field": "email",
  "code": "VALIDATION_INVALID_FORMAT",
  "message": "Email address is not valid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `field` | string | No | The input field that caused the error (for validation errors). |
| `code` | string | Yes | Specific error code for this detail item. |
| `message` | string | Yes | English fallback message. |

### 1.4 Paginated Response

```json
{
  "data": [ ... ],
  "meta": {
    "requestId": "req_a1b2c3d4",
    "timestamp": "2026-07-26T12:00:00Z",
    "code": "BOOKINGS_LISTED"
  },
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pagination.total` | number | Total records matching the query. |
| `pagination.page` | number | Current page number (1-indexed). |
| `pagination.limit` | number | Records per page. |
| `pagination.totalPages` | number | Total pages available. |

---

## PART 2 — Error Code Standard

### 2.1 Taxonomy

Error codes follow the pattern: `{MODULE}_{CATEGORY}_{SPECIFIC}`

```
MODULE       = 3-20 uppercase letters identifying the domain module
CATEGORY     = Error category (VALIDATION, NOT_FOUND, CONFLICT, REQUIRED, etc.)
SPECIFIC     = Specific error name
```

### 2.2 Module Prefixes

| Prefix | Module | Examples |
|--------|--------|----------|
| `AUTH_` | Authentication | `AUTH_INVALID_CREDENTIALS`, `AUTH_SESSION_EXPIRED` |
| `USER_` | User management | `USER_NOT_FOUND`, `USER_EMAIL_EXISTS` |
| `BOOKING_` | Bookings | `BOOKING_NOT_FOUND`, `BOOKING_SLOT_UNAVAILABLE` |
| `PAYMENT_` | Payments | `PAYMENT_FAILED`, `PAYMENT_INVALID_SIGNATURE` |
| `WALLET_` | Wallet | `WALLET_INSUFFICIENT_BALANCE`, `WALLET_LOCKED` |
| `MATCH_` | Matches | `MATCH_NOT_FOUND`, `MATCH_ALREADY_JOINED` |
| `COURT_` | Courts/resources | `COURT_NOT_FOUND`, `COURT_UNAVAILABLE` |
| `TOURNAMENT_` | Tournaments | `TOURNAMENT_FULL`, `TOURNAMENT_CLOSED` |
| `ACADEMY_` | Academies | `ACADEMY_ALREADY_ENROLLED`, `ACADEMY_NOT_FOUND` |
| `COACH_` | Coaches | `COACH_NOT_FOUND`, `COACH_UNAVAILABLE` |
| `ORGANISATION_` | Organisations | `ORGANISATION_NOT_FOUND`, `ORGANISATION_SUSPENDED` |
| `MEMBERSHIP_` | Memberships | `MEMBERSHIP_EXPIRED`, `MEMBERSHIP_PLAN_NOT_FOUND` |
| `NOTIFICATION_` | Notifications | `NOTIFICATION_NOT_FOUND`, `NOTIFICATION_FAILED` |
| `MARKETPLACE_` | Marketplace | `MARKETPLACE_ORDER_NOT_FOUND`, `MARKETPLACE_OUT_OF_STOCK` |
| `COMMUNITY_` | Community | `COMMUNITY_CANNOT_FRIEND_SELF`, `COMMUNITY_NOT_PARTICIPANT` |
| `UPLOAD_` | Uploads | `UPLOAD_INVALID_TYPE`, `UPLOAD_TOO_LARGE` |
| `RBAC_` | Roles/Permissions | `RBAC_FORBIDDEN`, `RBAC_ROLE_NOT_FOUND` |
| `VALIDATION_` | General validation | `VALIDATION_REQUIRED`, `VALIDATION_INVALID_FORMAT` |
| `SYSTEM_` | System/infrastructure | `SYSTEM_INTERNAL_ERROR`, `SYSTEM_SERVICE_UNAVAILABLE` |

### 2.3 Category Suffixes

| Suffix | Meaning | When to use |
|--------|---------|-------------|
| `_NOT_FOUND` | Entity not found | Entity does not exist |
| `_ALREADY_EXISTS` | Duplicate | Entity already exists |
| `_REQUIRED` | Missing required field | Input validation |
| `_INVALID_FORMAT` | Wrong format | Input validation |
| `_INVALID_CREDENTIALS` | Auth failed | Login failure |
| `_SESSION_EXPIRED` | Session expired | Token/session expired |
| `_FORBIDDEN` | Not authorized | Permission denied |
| `_UNAVAILABLE` | Not available | Resource busy or not available |
| `_INSUFFICIENT_*` | Insufficient resource | Balance, stock, capacity |
| `_CONFLICT` | State conflict | Illegal state transition |
| `_FAILED` | Operation failed | External service failure |
| `_TIMEOUT` | Operation timed out | External service timeout |
| `_INTERNAL_ERROR` | Unexpected error | Catch-all for unknown errors |

### 2.4 Error Code Definitions

Error codes are defined as constants in a single source of truth:

```typescript
// backend/src/shared/errors/error-codes.ts (conceptual — no code)

export const ErrorCodes = {
  // ── Authentication ──
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_ACCOUNT_NOT_ACTIVE: 'AUTH_ACCOUNT_NOT_ACTIVE',
  AUTH_EMAIL_ALREADY_REGISTERED: 'AUTH_EMAIL_ALREADY_REGISTERED',
  AUTH_PHONE_ALREADY_REGISTERED: 'AUTH_PHONE_ALREADY_REGISTERED',
  AUTH_INVALID_RESET_TOKEN: 'AUTH_INVALID_RESET_TOKEN',
  AUTH_RESET_TOKEN_EXPIRED: 'AUTH_RESET_TOKEN_EXPIRED',

  // ── Bookings ──
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  BOOKING_SLOT_UNAVAILABLE: 'BOOKING_SLOT_UNAVAILABLE',
  BOOKING_ALREADY_CANCELLED: 'BOOKING_ALREADY_CANCELLED',
  BOOKING_CANCELLATION_WINDOW_PASSED: 'BOOKING_CANCELLATION_WINDOW_PASSED',
  BOOKING_INVALID_TRANSITION: 'BOOKING_INVALID_TRANSITION',
  BOOKING_SLOT_MISALIGNED: 'BOOKING_SLOT_MISALIGNED',

  // ── Payment ──
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_INVALID_SIGNATURE: 'PAYMENT_INVALID_SIGNATURE',
  PAYMENT_GATEWAY_REJECTED: 'PAYMENT_GATEWAY_REJECTED',
  PAYMENT_TRANSACTION_NOT_FOUND: 'PAYMENT_TRANSACTION_NOT_FOUND',

  // ── Wallet ──
  WALLET_INSUFFICIENT_BALANCE: 'WALLET_INSUFFICIENT_BALANCE',
  WALLET_LOCKED: 'WALLET_LOCKED',
  WALLET_CONCURRENT_UPDATE: 'WALLET_CONCURRENT_UPDATE',

  // ── General ──
  VALIDATION_REQUIRED: 'VALIDATION_REQUIRED',
  VALIDATION_INVALID_FORMAT: 'VALIDATION_INVALID_FORMAT',
  VALIDATION_INVALID_VALUE: 'VALIDATION_INVALID_VALUE',
  VALIDATION_MIN_LENGTH: 'VALIDATION_MIN_LENGTH',
  VALIDATION_MAX_LENGTH: 'VALIDATION_MAX_LENGTH',
  VALIDATION_PHONE_FORMAT: 'VALIDATION_PHONE_FORMAT',

  RBAC_FORBIDDEN: 'RBAC_FORBIDDEN',
  RBAC_AUTHENTICATION_REQUIRED: 'RBAC_AUTHENTICATION_REQUIRED',

  SYSTEM_INTERNAL_ERROR: 'SYSTEM_INTERNAL_ERROR',
  SYSTEM_SERVICE_UNAVAILABLE: 'SYSTEM_SERVICE_UNAVAILABLE',
  SYSTEM_DATABASE_ERROR: 'SYSTEM_DATABASE_ERROR',
} as const;
```

Each error code maps to a CLP translation key:

```typescript
// Mapping (conceptual)
errorCodeToTranslationKey: {
  'BOOKING_NOT_FOUND': 'error.booking.not_found',
  'PAYMENT_FAILED': 'error.payment.failed',
  'WALLET_INSUFFICIENT_BALANCE': 'error.wallet.insufficient_balance',
  // ...
}
```

---

## PART 3 — Success Codes

### 3.1 When to Use

Success codes are OPTIONAL. They should be used when the client needs to know **which specific operation completed**, not just that the request succeeded.

| Use success code | Don't use success code |
|-----------------|----------------------|
| `POST /bookings` → `BOOKING_CREATED` | `GET /bookings` — client already knows they're listing |
| `POST /payments/confirm` → `PAYMENT_CONFIRMED` | `PUT /users/profile` — "updated" is obvious |
| `POST /auth/login` → `AUTH_LOGIN_SUCCESS` | `DELETE /bookings/123` — 204 No Content is self-explanatory |

### 3.2 Success Code Format

Same format as error codes: `{MODULE}_{PAST_TENSE_ACTION}`

```typescript
export const SuccessCodes = {
  AUTH_LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  AUTH_REGISTER_SUCCESS: 'AUTH_REGISTER_SUCCESS',
  AUTH_LOGOUT_SUCCESS: 'AUTH_LOGOUT_SUCCESS',
  BOOKING_CREATED: 'BOOKING_CREATED',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_COMPLETED: 'BOOKING_COMPLETED',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  PAYMENT_REFUNDED: 'PAYMENT_REFUNDED',
  WALLET_DEPOSITED: 'WALLET_DEPOSITED',
  WALLET_WITHDRAWN: 'WALLET_WITHDRAWN',
  USER_UPDATED: 'USER_UPDATED',
  USER_REGISTERED: 'USER_REGISTERED',
  NOTIFICATION_SENT: 'NOTIFICATION_SENT',
  NOTIFICATION_READ: 'NOTIFICATION_READ',
  MATCH_CREATED: 'MATCH_CREATED',
  ORGANISATION_CREATED: 'ORGANISATION_CREATED',
} as const;
```

### 3.3 CLP Mapping

Success codes also map to CLP keys for frontend success messages:

```typescript
successCodeToTranslationKey: {
  'BOOKING_CREATED': 'success.booking.created',
  'BOOKING_CONFIRMED': 'success.booking.confirmed',
  'BOOKING_CANCELLED': 'success.booking.cancelled',
  'PAYMENT_COMPLETED': 'success.payment.completed',
  // ...
}
```

---

## PART 4 — Localization Integration

### 4.1 Code → Key Mapping

Every error code and success code maps to exactly one CLP translation key:

```
Error Code:     BOOKING_NOT_FOUND
CLP Key:        error.booking.not_found
English:        "Booking not found"
Arabic:         "الحجز غير موجود"

Success Code:   BOOKING_CREATED
CLP Key:        success.booking.created
English:        "Booking created successfully"
Arabic:         "تم إنشاء الحجز بنجاح"
```

### 4.2 Key Naming Convention

```
error.{module}.{specific}
success.{module}.{specific}
```

| Key Pattern | Example |
|-------------|---------|
| `error.{module}.{snake_case}` | `error.booking.not_found` |
| `error.{module}.{snake_case}.detail` | `error.booking.slot_unavailable.detail` |
| `success.{module}.{past_action}` | `success.booking.created` |

### 4.3 Resolution Flow

```
Backend determines:    BOOKING_NOT_FOUND
                           │
                           ▼
Response includes:     { error: "VALIDATION_ERROR", code: "BOOKING_NOT_FOUND", message: "Booking not found" }
                           │
                           ▼
Frontend receives response
                           │
                           ├──► Check for code field
                           │       │
                           │       ▼
                           │   t('error.booking.not_found')  →  Arabic: "الحجز غير موجود"
                           │
                           └──► Fallback to message field (English, always present)
```

### 4.4 Rules

| Rule | Statement |
|------|-----------|
| **L1** | Every error code MUST have a corresponding CLP translation key. |
| **L2** | The `message` field in the API response MUST always contain English text as a fallback. |
| **L3** | The frontend MUST prefer `code` → CLP key resolution over the `message` field. |
| **L4** | If the CLP key does not exist for the current locale, the frontend falls back to English via the `message` field. |
| **L5** | Business logic code MUST NOT construct user-facing English strings. It MUST throw error codes. |
| **L6** | Error codes with variables (e.g., `"Booking {id} not found"`) MUST pass variables in the error metadata, not in the code itself. |

---

## PART 5 — HTTP Status Mapping

### 5.1 Official Mapping

| Business Outcome | HTTP Status | Error Code Example |
|-----------------|-------------|-------------------|
| Success | 200 OK | — |
| Created | 201 Created | `BOOKING_CREATED` |
| Accepted (async) | 202 Accepted | `PAYMENT_PENDING` |
| No Content | 204 No Content | — |
| Validation failure | 400 Bad Request | `VALIDATION_REQUIRED` |
| Authentication required | 401 Unauthorized | `AUTH_SESSION_EXPIRED` |
| Authorization denied | 403 Forbidden | `RBAC_FORBIDDEN` |
| Not found | 404 Not Found | `BOOKING_NOT_FOUND` |
| Conflict | 409 Conflict | `BOOKING_ALREADY_CANCELLED` |
| Gone / Expired | 410 Gone | `AUTH_RESET_TOKEN_EXPIRED` |
| Rate limited | 429 Too Many Requests | `SYSTEM_RATE_LIMITED` |
| External provider error | 502 Bad Gateway | `PAYMENT_GATEWAY_ERROR` |
| Service unavailable | 503 Service Unavailable | `SYSTEM_SERVICE_UNAVAILABLE` |
| Unexpected error | 500 Internal Server Error | `SYSTEM_INTERNAL_ERROR` |

### 5.2 Rules

| Rule | Statement |
|------|-----------|
| **H1** | 400 is for CLIENT errors (validation, bad input). NOT for business logic failures. |
| **H2** | 409 is for BUSINESS logic failures (conflict, duplicate, illegal state). |
| **H3** | 403 is for AUTHORIZATION failures (authenticated but not permitted). |
| **H4** | 401 is for AUTHENTICATION failures (not authenticated, session expired). |
| **H5** | 5xx is for INFRASTRUCTURE failures (database, external service, unexpected error). |

---

## PART 6 — Severity & Categories

### 6.1 Severity Levels

| Severity | API Usage | Log Level | Example |
|----------|-----------|-----------|---------|
| `info` | Normal operation | `log.info` | Validation error, not found |
| `success` | Successful operation | `log.info` | Booking created, payment confirmed |
| `warning` | Non-critical issue | `log.warn` | Rate limit approaching, retry attempt |
| `error` | Operation failed | `log.error` | Payment declined, external provider error |
| `critical` | System issue | `log.fatal` | Database connection lost, unhandled exception |

### 6.2 Categories

| Category | HTTP Range | Error Code Prefix | Description |
|----------|------------|-------------------|-------------|
| `validation` | 400 | `VALIDATION_*` | Input data does not meet requirements |
| `business` | 409 | `BOOKING_*`, `PAYMENT_*`, etc. | Business rule violation |
| `security` | 401/403 | `AUTH_*`, `RBAC_*` | Authentication or authorization failure |
| `infrastructure` | 500/502/503 | `SYSTEM_*` | Database, queue, or external service failure |
| `external` | 502/504 | `PAYMENT_GATEWAY_*` | External provider error or timeout |
| `unexpected` | 500 | `SYSTEM_INTERNAL_ERROR` | Unhandled exception, catch-all |

---

## PART 7 — Exception Strategy

### 7.1 Exception Hierarchy

```
AppError (base)
├── ValidationError       → 400 + VALIDATION_*
├── AuthenticationError   → 401 + AUTH_*
├── ForbiddenError        → 403 + RBAC_*
├── NotFoundError         → 404 + *_NOT_FOUND
├── ConflictError         → 409 + *_CONFLICT / *_ALREADY_EXISTS
├── RateLimitError        → 429 + SYSTEM_RATE_LIMITED
├── ExternalProviderError → 502 + PAYMENT_GATEWAY_*
└── InfrastructureError   → 503 + SYSTEM_*
```

### 7.2 Domain Exceptions

Thrown by domain logic. Represent business rule violations.

```typescript
// Conceptual — no code
throw new ConflictError({
  code: 'BOOKING_SLOT_UNAVAILABLE',
  message: 'One or more slots are no longer available',  // English fallback
  details: [{ field: 'startTime', code: 'BOOKING_SLOT_UNAVAILABLE' }]
});
```

**Translation:** Domain exceptions carry an error code. The `message` is a developer-friendly English fallback. The frontend resolves via `t('error.booking.slot_unavailable')`.

### 7.3 Application Exceptions

Thrown by application services. Represent orchestration failures.

```typescript
// Conceptual — no code
throw new InfrastructureError({
  code: 'PAYMENT_GATEWAY_ERROR',
  message: 'Payment gateway is not responding',
  traceId: traceId,  // For correlating with external service logs
});
```

**Translation:** Same mechanism. Error code → CLP key.

### 7.4 Infrastructure Exceptions

Thrown by infrastructure layer (database, queue, external HTTP calls). Must NOT leak internal details to the client.

```typescript
// Conceptual — no code
try {
  await db.query(...);
} catch (err) {
  // Log the full error internally
  log.error({ err, traceId }, 'Database query failed');
  // Return a generic error to the client
  throw new InfrastructureError({
    code: 'SYSTEM_DATABASE_ERROR',
    message: 'A database error occurred',
  });
}
```

**Rule:** Infrastructure errors must NEVER expose internal details (SQL, stack traces, connection strings) to the API response.

### 7.5 Global Error Handler

The existing `app.setErrorHandler` at `app.ts:508-546` handles the conversion:

```
AppError         → Extract code, message, statusCode, details → Standard error response
ZodError         → Convert to VALIDATION_* error with detail items
RateLimitError   → SYSTEM_RATE_LIMITED
Unknown error    → SYSTEM_INTERNAL_ERROR (log full error, return generic message)
```

---

## PART 8 — Audit & Traceability

### 8.1 Traceability Fields

| Field | Source | Purpose |
|-------|--------|---------|
| `meta.requestId` | Fastify `reqId` (generated per request) | Correlate all logs for a single HTTP request. Already exists. |
| `meta.traceId` | Application-generated (payment flows) | Correlate across multiple services or async operations. Used in payment flows. |
| `request.userId` | Auth middleware → `request.userId` | Identify the actor. Already exists. |
| `audit log` | `recordAudit()` function | Long-term audit trail. Already exists. |

### 8.2 Integration Points

```
HTTP Request arrives
    │
    ├── Fastify assigns reqId (already exists)
    │
    ├── Auth middleware sets request.userId (already exists)
    │
    ├── Controller calls service
    │   └── Service may generate traceId for multi-step operations
    │
    ├── Service returns result or throws AppError
    │   ├── AppError includes: code, message, details
    │   └── recordAudit() captures state changes (already exists)
    │
    └── Error handler formats response
        ├── Includes: meta.requestId, meta.traceId (if present)
        └── Logs via app.log.error(error) (already exists)
```

### 8.3 Audit Logging for Errors

| Operation | Audit Requirement |
|-----------|-------------------|
| Validation error | Not audited (client error, no state change) |
| Business rule violation | Not audited (client error, no state change) |
| Authentication failure | SHOULD be audited (security event) |
| Authorization failure | SHOULD be audited (security event) |
| Success state change | MUST be audited via existing `recordAudit()` |
| Infrastructure error | MUST be logged internally |
| Unexpected error | MUST be logged with full stack trace |

---

## PART 9 — Backward Compatibility

### 9.1 Incremental Migration

The framework is designed for incremental adoption without breaking existing clients:

| Migration Step | Old Response | New Response | Compatible? |
|---------------|-------------|-------------|-------------|
| 1. Add `code` field to success responses | No `code` field | `code: "BOOKING_CREATED"` | ✅ Yes (additive) |
| 2. Add `meta` block to all responses | No `meta` field | `meta: { requestId, timestamp }` | ✅ Yes (additive) |
| 3. Add `code` field to error responses | No `code` field | `code: "BOOKING_NOT_FOUND"` | ✅ Yes (additive) |
| 4. Populate `message` from code + CLP | Hardcoded English | CLP-resolved English | ✅ Yes (same text) |
| 5. Frontend switches to `code`-based resolution | Uses `message` field | Uses `code` → CLP key | ✅ Gradual adoption |

### 9.2 Compatibility Guarantees

| Guarantee | Statement |
|-----------|-----------|
| **G1** | The `message` field will ALWAYS contain English text. Existing frontends that read `message` will continue to work. |
| **G2** | The `error` field will retain the same values (`VALIDATION_ERROR`, `AUTHENTICATION_ERROR`, etc.). Existing error-handling code will continue to work. |
| **G3** | The `code` field is ADDITIVE. Old clients that ignore unknown fields will see no difference. |
| **G4** | The `meta` block is ADDITIVE. Old clients that ignore unknown fields will see no difference. |
| **G5** | No existing endpoint will change its HTTP status code. |

### 9.3 Migration Path

```
Phase 1 (additive, no behavior change):
  - Define error codes registry
  - Add code field to AppError class
  - Update error response formatter to include code
  - All existing hardcoded messages remain

Phase 2 (incremental module migration):
  - One module at a time: replace throw new Error('msg') with throw new ConflictError({ code, message })
  - Add CLP keys for each module's error codes
  - Run sync-translation-keys to add new keys

Phase 3 (frontend adoption):
  - Frontend reads code field → resolves via t()
  - Falls back to message field for old responses without code
```

---

## PART 10 — Final Recommendation

### 10.1 The Official Standard

| Aspect | Standard |
|--------|----------|
| Success format | `{ data, meta: { requestId, timestamp, code? } }` |
| Error format | `{ error, message, code, meta: { requestId, timestamp, traceId? }, details? }` |
| Error code format | `{MODULE}_{CATEGORY}_{SPECIFIC}` (UPPER_SNAKE_CASE) |
| Success code format | `{MODULE}_{PAST_ACTION}` (UPPER_SNAKE_CASE) |
| Error code → CLP key | `error.{module}.{snake_case}` |
| Success code → CLP key | `success.{module}.{snake_case}` |
| HTTP → 4xx | Client errors (validation, auth, authz, not found, conflict) |
| HTTP → 5xx | Infrastructure errors (database, external, unexpected) |
| English fallback | Always present in `message` field |
| Audit | Via existing `recordAudit()` for state changes |
| Traceability | `requestId` (Fastify) + `traceId` (application) |

### 10.2 Files That Would Change

| File | Change |
|------|--------|
| `backend/src/shared/errors/app-error.ts` | Add `code` field to AppError and all subclasses |
| `backend/src/shared/errors/error-codes.ts` | **NEW** — single source of truth for all error codes |
| `backend/src/app.ts` | Update global error handler to include `code` and `meta` in response |
| Per-module service files | Replace `throw new Error('msg')` with typed AppErrors with codes |
| `frontend/src/i18n/translation-keys.registry.ts` | Add `error.*` and `success.*` keys for all modules |
| `frontend/src/i18n/index.ts` | Add `t()`-based error message resolution helper |
| Frontend API client | Read `code` field, resolve via `t()`, fallback to `message` |

### 10.3 Principles

| Principle | Statement |
|-----------|-----------|
| **P1** | Every user-facing error has an error code. No hardcoded English in business logic. |
| **P2** | The CLP is the single source of truth for all user-facing text, including errors. |
| **P3** | The `message` field is an English fallback. Never the primary text for localized UIs. |
| **P4** | Error codes are stable. They do not change when the English text changes. |
| **P5** | Infrastructure errors never leak internal details. |
| **P6** | The framework is additive. Existing APIs and clients continue to work unchanged. |
| **P7** | Migration is incremental, module by module, not a big-bang rewrite. |

### 10.4 Prerequisite for Communication Center

The backend error framework is a prerequisite for Communication Center implementation because:

1. The CLP (Content & Localization Platform) requires ALL user-facing text to be translatable
2. Backend errors ARE user-facing text
3. Without error codes, notification templates cannot reference standardized error keys
4. The framework IS the missing backend i18n system identified in the implementation readiness review

**Estimated effort:** 3-4 days for the core framework, then 1-2 days per module for migration.

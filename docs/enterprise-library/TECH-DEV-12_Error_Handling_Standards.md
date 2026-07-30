---
document_id: "TECH-DEV-12"
document_name: "Error Handling Standards"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer"]
difficulty: "intermediate"
reading_time: 12
depends_on: ["TECH-DEV-01"]
related: ["TECH-DEV-01", "TECH-DEV-11", "TECH-DEV-13", "TECH-DEV-14"]
---

# CourtZon Error Handling Standards

## 1. Purpose

Define mandatory error handling patterns for all CourtZon backend code, including the AppError hierarchy, error codes, and translation key mappings.

## 2. AppError Hierarchy

All business errors must use the typed error hierarchy from `shared/errors/app-error.ts`:

```
AppError (base)
├── NotFoundError        — Resource does not exist
├── ConflictError        — Business rule violation
├── ValidationError      — Input validation failure
├── ForbiddenError       — Insufficient permissions
├── UnauthorizedError    — Missing authentication
└── RateLimitError       — Rate limit exceeded
```

**Evidence:** `backend/src/shared/errors/app-error.ts` defines the complete hierarchy.

```typescript
// backend/src/shared/errors/app-error.ts
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, code: string, details?: Record<string, unknown>) {
    super(`${entity} not found`, 404, code, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, 409, code, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message, 400, code, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code: string, details?: Record<string, unknown>) {
    super(message, 403, code, details);
  }
}
```

## 3. When to Use Each Error Type

| Error Type | HTTP Status | When to Throw |
|------------|-------------|---------------|
| `NotFoundError` | 404 | Resource by ID not found, entity missing |
| `ConflictError` | 409 | Duplicate entry, slot already booked, overlapping schedule |
| `ValidationError` | 400 | Zod parse failure, business rule violation on input |
| `ForbiddenError` | 403 | Insufficient role/permission for action |
| `UnauthorizedError` | 401 | Missing/invalid token |
| `RateLimitError` | 429 | Too many requests |

```typescript
// Example: Not Found
async function findById(id: number): Promise<BookingAttributes> {
  const booking = await bookingRepository.findById(id);
  if (!booking) {
    throw new NotFoundError('Booking', ErrorCodes.BOOKING_NOT_FOUND, { bookingId: id });
  }
  return booking;
}

// Example: Conflict
async function create(input: CreateBookingInput): Promise<BookingAttributes> {
  const existing = await bookingRepository.findOverlapping(input.resourceId, input.startTime, input.endTime);
  if (existing) {
    throw new ConflictError('Slot already booked', ErrorCodes.BOOKING_SLOT_UNAVAILABLE);
  }
  return bookingRepository.create(input);
}

// Example: Validation
if (new Date(input.bookingDate) < new Date()) {
  throw new ValidationError('Booking date cannot be in the past', ErrorCodes.VALIDATION_INVALID_DATE);
}

// Example: Forbidden
if (!canEdit) {
  throw new ForbiddenError('You can only cancel your own bookings', ErrorCodes.BOOKING_CANCEL_FORBIDDEN);
}
```

## 4. ErrorCodes Enum

All error codes are defined in `backend/src/shared/errors/error-codes.ts`:

```typescript
export const ErrorCodes = {
  // Auth
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',

  // Booking
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  BOOKING_SLOT_UNAVAILABLE: 'BOOKING_SLOT_UNAVAILABLE',
  BOOKING_CANCEL_FORBIDDEN: 'BOOKING_CANCEL_FORBIDDEN',
  BOOKING_CANCEL_TOO_LATE: 'BOOKING_CANCEL_TOO_LATE',
  BOOKING_INVALID_STATUS: 'BOOKING_INVALID_STATUS',

  // User
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_EMAIL_EXISTS: 'USER_EMAIL_EXISTS',

  // Organisation
  ORG_NOT_FOUND: 'ORG_NOT_FOUND',
  ORG_MEMBER_EXISTS: 'ORG_MEMBER_EXISTS',

  // Payment
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_REFUND_FAILED: 'PAYMENT_REFUND_FAILED',

  // Validation
  VALIDATION_INVALID_DATE: 'VALIDATION_INVALID_DATE',
  VALIDATION_INVALID_INPUT: 'VALIDATION_INVALID_INPUT',
  VALIDATION_MISSING_FIELD: 'VALIDATION_MISSING_FIELD',

  // General
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};
```

**Evidence:** `backend/src/shared/errors/error-codes.ts` contains the complete enum.

## 5. Translation Key Mapping

Every error code must have a corresponding translation key in `frontend/src/i18n/en/errors.json`:

```json
{
  "errors": {
    "BOOKING_NOT_FOUND": "Booking not found. It may have been deleted.",
    "BOOKING_SLOT_UNAVAILABLE": "This time slot is already booked. Please choose another.",
    "BOOKING_CANCEL_FORBIDDEN": "You can only cancel your own bookings.",
    "BOOKING_CANCEL_TOO_LATE": "Bookings can only be cancelled up to 24 hours before start time.",
    "AUTH_INVALID_CREDENTIALS": "Invalid email or password.",
    "AUTH_TOKEN_EXPIRED": "Session expired. Please log in again.",
    "VALIDATION_INVALID_DATE": "The provided date is invalid.",
    "INTERNAL_ERROR": "Something went wrong. Please try again."
  }
}
```

## 6. Global Error Handler

All errors are caught and formatted by a global handler in `app.ts`:

```typescript
// backend/src/app.ts
app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        details: error.details,
      },
    });
  }

  // Unexpected errors
  request.log.error(error, 'Unhandled error');
  return reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      statusCode: 500,
    },
  });
});
```

## 7. Prohibited Patterns

```typescript
// BAD — throwing raw Error
throw new Error('Booking not found');

// BAD — throwing string
throw 'Booking not found';

// BAD — catching and swallowing
try { ... } catch { /* do nothing */ }

// BAD — catching and returning null without logging
try { ... } catch { return null; }

// BAD — exposing internal details in production
throw new Error('Database connection failed on host 192.168.1.1:3306');

// GOOD
throw new NotFoundError('Booking', ErrorCodes.BOOKING_NOT_FOUND, { bookingId: id });
```

## 8. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-01 | Coding Standards — TypeScript (error handling patterns) |
| TECH-DEV-11 | API Design Standards (error response format) |
| TECH-DEV-13 | Logging Standards (error logging expectations) |
| TECH-DEV-14 | Security Coding Standards (sanitizing error messages) |

## 9. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

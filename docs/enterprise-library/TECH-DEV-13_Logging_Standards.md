---
document_id: "TECH-DEV-13"
document_name: "Logging Standards"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer"]
difficulty: "intermediate"
reading_time: 10
depends_on: ["TECH-DEV-01"]
related: ["TECH-DEV-08", "TECH-DEV-12", "TECH-DEV-14"]
---

# CourtZon Logging Standards

## 1. Purpose

Define mandatory logging practices for all CourtZon backend code. Structured logging with Pino provides observability, debugging capability, and audit trails.

## 2. Logger Configuration

CourtZon uses **Pino** as the logging framework. The logger is configured in `backend/src/app.ts`:

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
  redact: {
    paths: ['req.headers.authorization', 'req.body.password', 'req.body.token', 'body.cardNumber'],
    censor: '[REDACTED]',
  },
});
```

**Evidence:** `backend/src/app.ts` initializes Pino with redaction rules for sensitive fields.

## 3. Log Levels

| Level | When to Use | Example |
|-------|-------------|---------|
| `error` | Unhandled errors, business rule failures, external service failures | `logger.error(err, 'Failed to process payment')` |
| `warn` | Degraded behavior, deprecated API usage, rate limit warnings | `logger.warn({ userId, limit }, 'Rate limit approaching')` |
| `info` | Key business events, request lifecycle, successful mutations | `logger.info({ bookingId }, 'Booking created')` |
| `debug` | Development-only details, query traces, variable dumps | `logger.debug({ query, params }, 'Executing query')` |
| `trace` | (Reserved for extreme detail — not used in application code) | |

## 4. Structured Logging Format

All logs must use **structured key-value pairs**, not string interpolation:

```typescript
// GOOD — structured
logger.info({ bookingId: 42, userId: 7, action: 'BOOKING.CREATE' }, 'Booking created');

// BAD — string interpolation
logger.info(`Booking ${bookingId} created by user ${userId}`);
```

### 4.1 Standard Fields

Every log entry should include these fields when applicable:

| Field | Type | When Required |
|-------|------|---------------|
| `bookingId` / `userId` / `entityId` | number | When referencing a record |
| `action` | string | For audit-significant events |
| `duration` | number (ms) | For performance-sensitive paths |
| `error` | Error object | For `logger.error` calls |
| `ip` | string | For auth-related events |
| `traceId` | string | For distributed tracing (future) |

## 5. What to Log at Each Level

### 5.1 `logger.error()`

- Unhandled exceptions caught by global error handler
- External service failures (payment gateway down, email send failure)
- Database connection failures
- Business rule violations that should never happen (assertions)
- Authentication failures (with IP, but NOT password)

```typescript
try {
  await paymentService.charge(amount, token);
} catch (err) {
  logger.error({ err, amount, userId: user.id }, 'Payment charge failed');
  throw new PaymentError('Payment processing failed', ErrorCodes.PAYMENT_FAILED);
}
```

### 5.2 `logger.warn()`

- Deprecated API endpoint accessed
- Rate limit approaching threshold
- Suspicious activity (multiple failed logins)
- Resource constraints (low disk, high memory)

```typescript
if (failedLoginCount > 3) {
  logger.warn({ userId: user.id, ip: request.ip, count: failedLoginCount }, 'Multiple failed logins detected');
}
```

### 5.3 `logger.info()`

- CRUD operations: booking created, user registered, payment completed
- Auth events: login, logout, password reset requested
- Background job results: notification sent, report generated
- Application startup: server listening, DB connected

```typescript
logger.info({ bookingId: result.id, userId, resourceId }, 'Booking created');
```

### 5.4 `logger.debug()`

- SQL queries and parameters (development only)
- Request/response payloads (development only)
- Function entry/exit points for complex logic
- Cache hit/miss decisions

```typescript
logger.debug({ query: 'SELECT * FROM bookings WHERE id = ?', params: [id] }, 'Executing query');
```

## 6. What NOT to Log

**Never log the following under any circumstance:**

| Category | Examples |
|----------|----------|
| Passwords | `password`, `passwordHash`, `pin` |
| Secrets | `apiKey`, `secret`, `token`, `jwt`, `sessionToken` |
| PII | `email`, `phone`, `fullName`, `address`, `creditCard`, `ssn`, `dob` |
| Raw request bodies | Could contain any of the above |

Pino redaction handles this automatically (see `backend/src/app.ts`), but developers must also apply common sense:

```typescript
// BAD — logging sensitive data
logger.info({ email: user.email, token }, 'User logged in');

// GOOD — logging safe identifiers
logger.info({ userId: user.id }, 'User logged in');
```

## 7. Request Logging

The global request logger (Fastify's built-in Pino) automatically logs:

```typescript
// Automatically logged by Fastify
{
  "level": 30,
  "time": 1690000000000,
  "pid": 1234,
  "hostname": "server-1",
  "reqId": "req-1",
  "req": {
    "method": "POST",
    "url": "/api/bookings",
    "hostname": "localhost:3000",
    "remoteAddress": "::1"
  },
  "res": {
    "statusCode": 201
  },
  "responseTime": 42
}
```

## 8. Audit Logging (Separate from Application Logs)

Audit logs are stored in the database via `recordAudit()`, NOT in application logs:

```typescript
recordAudit({
  actorId: userId,
  action: 'BOOKING.CREATE',
  entityType: 'booking',
  entityId: booking.id!,
  beforeState: null,
  afterState: { status: 'pending', resourceId: body.resourceId },
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'] as string | undefined,
});
```

**Rationale:** Application logs (Pino) are for operations debugging. Audit logs (DB) are for compliance and history. They serve different purposes and must be kept separate.

## 9. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-01 | Coding Standards — TypeScript (audit logging patterns) |
| TECH-DEV-08 | Code Review Standards (reviewer checks for logged secrets) |
| TECH-DEV-12 | Error Handling Standards (error logging in handlers) |
| TECH-DEV-14 | Security Coding Standards (secrets management, PII rules) |

## 10. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

---
document_id: "TECH-DEV-14"
document_name: "Security Coding Standards"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer"]
difficulty: "intermediate"
reading_time: 15
depends_on: ["TECH-DEV-01", "TECH-DEV-12"]
related: ["TECH-DEV-01", "TECH-DEV-08", "TECH-DEV-12", "TECH-DEV-13"]
---

# CourtZon Security Coding Standards

## 1. Purpose

Define mandatory security coding practices for all CourtZon code to prevent common vulnerabilities: SQL injection, XSS, CSRF, broken authentication, and data exposure.

## 2. Input Validation (Zod)

All external input must be validated with Zod schemas. Never trust `request.body`, `request.query`, or `request.params` directly.

```typescript
// presentation/booking.dto.ts
export const CreateBookingSchema = z.object({
  resourceId: z.number().int().positive(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).optional(),
});

export type CreateBookingDto = z.infer<typeof CreateBookingSchema>;
```

```typescript
// In controller
const body = CreateBookingSchema.parse(request.body);  // Throws ZodError on invalid input
```

**Evidence:** All backend controllers use Zod schemas from DTO files. See `backend/src/modules/booking/presentation/booking.dto.ts`.

## 3. SQL Injection Prevention

**All queries must use parameterized queries. Never concatenate user input into SQL strings.**

```typescript
import { getPool } from '../../database/mysql.js';

const pool = getPool();

// GOOD — parameterized query
const [rows] = await pool.execute<RowData>(
  'SELECT * FROM bookings WHERE user_id = ? AND status = ?',
  [userId, status],
);

// BAD — string concatenation (SQL injection risk)
const [rows] = await pool.execute(`SELECT * FROM bookings WHERE user_id = ${userId}`);
```

**Evidence:** Every repository in `backend/src/modules/*/infrastructure/repositories/` uses parameterized queries.

## 4. XSS Prevention

### 4.1 Frontend

React's JSX escapes output by default. Never use `dangerouslySetInnerHTML` unless absolutely necessary (and only after explicit approval).

```tsx
// GOOD — React auto-escapes
<div>{userInput}</div>

// BAD — XSS vulnerability
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

### 4.2 Backend

Sanitize user input on the backend when stored and returned:

```typescript
// Strip HTML tags from user input before storing
function sanitize(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}
```

### 4.3 Headers

CSP headers are enforced in `frontend/nginx.conf`:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.courtzon.com;";
```

**Evidence:** `frontend/nginx.conf` defines the Content-Security-Policy header.

## 5. CSRF Protection

- **`SameSite=Strict`** cookies for session tokens
- API uses `Authorization: Bearer <token>` header, which is immune to CSRF
- Cookies are not used for authentication in API calls

```typescript
// Cookie configuration for refresh tokens (if used)
{
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/auth',
}
```

**Evidence:** `backend/src/app.ts` configures Fastify with Helmet middleware.

## 6. Rate Limiting

All endpoints must be rate-limited. Different limits apply per route category:

```typescript
import rateLimit from '@fastify/rate-limit';

app.register(rateLimit, {
  max: 100,           // Default: 100 requests per minute
  timeWindow: '1 minute',
});

// Stricter for auth routes
app.register(async function authScope(app) {
  app.register(rateLimit, {
    max: 5,
    timeWindow: '1 minute',
  });
  app.register(authRoutes);
});
```

**Evidence:** `backend/src/modules/brute-force/application/brute-force.service.ts` implements additional brute-force protection for login attempts.

## 7. Secrets Management

### 7.1 Environment Variables

All secrets (API keys, DB passwords, JWT secrets) must be in environment variables, never in code:

```bash
# .env (never committed)
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret
REDIS_PASSWORD=your_redis_password
STRIPE_API_KEY=sk_live_...
```

### 7.2 Never Commit Secrets

- `.env` files are in `.gitignore`
- Never hardcode API keys, tokens, or passwords
- Use environment variables or a secrets manager (e.g., Docker secrets in production)

**Evidence:** `.gitignore` includes `.env`. `backend/.env.example` contains placeholder values only.

## 8. File Upload Validation

All file uploads must be validated for type, size, and path traversal:

```typescript
// backend/src/modules/upload/application/upload.service.ts
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;  // 5 MB

function validateUpload(file: { mimetype: string; size: number; filename: string }) {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    throw new ValidationError('Invalid file type', ErrorCodes.VALIDATION_INVALID_INPUT);
  }
  if (file.size > MAX_SIZE) {
    throw new ValidationError('File too large', ErrorCodes.VALIDATION_INVALID_INPUT);
  }
  // Path traversal prevention
  const sanitized = path.basename(file.filename);
  if (sanitized.includes('..') || sanitized.includes('/') || sanitized.includes('\\')) {
    throw new ValidationError('Invalid filename', ErrorCodes.VALIDATION_INVALID_INPUT);
  }
}
```

**Evidence:** `backend/src/modules/upload/application/upload.service.ts` implements these checks.

## 9. Authentication & Authorization

### 9.1 Route Guards

Every route must have `authMiddleware` and `requirePermission`:

```typescript
app.get('/bookings',
  {
    preHandler: [
      authMiddleware,                          // Verify JWT token
      requirePermission(['bookings.view']),    // Check permission
    ],
  },
  ctrl.getUserBookingsHandler,
);
```

### 9.2 Permission Gating (Frontend)

```tsx
import { Can } from '../permissions/Can';

<Can permission="bookings.cancel">
  <button onClick={handleCancel}>{t('common.cancel')}</button>
</Can>
```

**Evidence:** `frontend/src/permissions/Can.tsx` implements permission gating.

## 10. Security Headers (Helmet)

Fastify uses `@fastify/helmet` to set security headers:

```typescript
import helmet from '@fastify/helmet';

app.register(helmet, {
  contentSecurityPolicy: false,  // Managed by nginx in production
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true },
  xssFilter: true,
  noSniff: true,
});
```

**Evidence:** `backend/src/app.ts` registers Helmet middleware.

## 11. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-01 | Coding Standards — TypeScript (permission guards) |
| TECH-DEV-08 | Code Review Standards (security review checklist) |
| TECH-DEV-12 | Error Handling Standards (not exposing internals in errors) |
| TECH-DEV-13 | Logging Standards (never log secrets/PII) |

## 12. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

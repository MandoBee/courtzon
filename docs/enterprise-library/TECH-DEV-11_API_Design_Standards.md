---
document_id: "TECH-DEV-11"
document_name: "API Design Standards"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer"]
difficulty: "intermediate"
reading_time: 15
depends_on: ["TECH-DEV-01"]
related: ["TECH-DEV-01", "TECH-DEV-04", "TECH-DEV-12", "TECH-DEV-14"]
---

# CourtZon API Design Standards

## 1. Purpose

Define mandatory RESTful API conventions for all CourtZon endpoints.

## 2. Base URL

All API routes are served under `/api` prefix:

```
http://localhost:3000/api/bookings
```

## 3. URL Structure

| Pattern | Convention | Example |
|---------|-----------|---------|
| Resource list | `/{resource}` | `GET /api/bookings` |
| Single resource | `/{resource}/:id` | `GET /api/bookings/42` |
| Admin routes | `/admin/{resource}` | `GET /api/admin/users` |
| Org-scoped | `/org/{resource}` | `GET /api/org/members` |
| Nested resources | `/{parent}/:parentId/{child}` | `GET /api/bookings/42/notes` |
| Actions | `/{resource}/:id/{action}` | `POST /api/bookings/42/cancel` |

**Evidence:** `backend/src/modules/booking/presentation/booking.routes.ts` defines routes under `/bookings`. `backend/src/modules/admin/` uses `/admin/` prefix.

## 4. HTTP Methods

| Method | Operation | Idempotent | Safe |
|--------|-----------|------------|------|
| `GET` | Read/Retrieve | Yes | Yes |
| `POST` | Create | No | No |
| `PUT` | Full update / Replace | Yes | No |
| `PATCH` | Partial update | Yes | No |
| `DELETE` | Delete | Yes | No |

## 5. Request Format

All request bodies must be `application/json` and validated via Zod DTOs:

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

## 6. Response Format

### 6.1 Success Response

```typescript
// Single resource
{
  "id": 42,
  "userId": 1,
  "resourceId": 7,
  "bookingDate": "2026-08-15",
  "startTime": "10:00",
  "endTime": "11:00",
  "status": "confirmed",
  "createdAt": "2026-07-28T12:00:00.000Z",
  "updatedAt": "2026-07-28T12:00:00.000Z"
}

// List (paginated — see section 7)
{
  "data": [ ... ],
  "pagination": { ... }
}

// Create (201)
HTTP 201 Created
{ "id": 43, ... }

// No content (204)
HTTP 204 No Content  // DELETE operations
```

### 6.2 Error Response

Standard error envelope:

```typescript
{
  "error": {
    "code": "BOOKING_NOT_FOUND",
    "message": "Booking not found",
    "statusCode": 404,
    "details": { "bookingId": 42 }
  }
}
```

**Evidence:** `backend/src/shared/errors/app-error.ts` defines the error hierarchy; `backend/src/app.ts` has a global error handler that produces this format.

## 7. Pagination

All list endpoints must support pagination:

### Request

```typescript
// Query parameters
GET /api/bookings?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc
```

| Param | Default | Max |
|-------|---------|-----|
| `page` | 1 | — |
| `pageSize` | 20 | 100 |
| `sortBy` | `createdAt` | Must be a valid column |
| `sortOrder` | `desc` | `asc` or `desc` |

### Response

```typescript
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 142,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

**Evidence:** `backend/src/shared/utils/pagination.ts` provides `paginate()` helper used by all list endpoints.

```typescript
export async function paginate<T>(
  query: string,
  countQuery: string,
  params: any[],
  page: number,
  pageSize: number,
): Promise<{ data: T[]; pagination: PaginationMeta }> {
  const offset = (page - 1) * pageSize;
  const [rows] = await pool.execute<RowData>(query + ' LIMIT ? OFFSET ?', [...params, pageSize, offset]);
  const [[{ total }]] = await pool.execute<RowData>(countQuery, params);
  return {
    data: rows as T[],
    pagination: {
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / pageSize),
      hasNextPage: page * pageSize < total,
      hasPreviousPage: page > 1,
    },
  };
}
```

## 8. Status Codes

| Code | When to Use |
|------|-------------|
| `200 OK` | Successful GET, PUT, PATCH |
| `201 Created` | Successful POST |
| `204 No Content` | Successful DELETE |
| `400 Bad Request` | Validation error (Zod parse failure) |
| `401 Unauthorized` | Missing or invalid authentication |
| `403 Forbidden` | Authenticated but insufficient permissions |
| `404 Not Found` | Resource does not exist |
| `409 Conflict` | Business rule violation (duplicate, slot taken) |
| `422 Unprocessable Entity` | Business validation failure |
| `429 Too Many Requests` | Rate limit exceeded |
| `500 Internal Server Error` | Unexpected server error |

## 9. Route Registration Pattern

```typescript
// presentation/booking.routes.ts
import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './booking.controller.js';

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/bookings',
    { preHandler: [requirePermission(['bookings.view'])] },
    ctrl.getUserBookingsHandler,
  );

  app.get('/bookings/:id',
    { preHandler: [requirePermission(['bookings.view'])] },
    ctrl.getBookingByIdHandler,
  );

  app.post('/bookings',
    { preHandler: [requirePermission(['bookings.create'])] },
    ctrl.createBookingHandler,
  );

  app.post('/bookings/:id/cancel',
    { preHandler: [requirePermission(['bookings.cancel'])] },
    ctrl.cancelBookingHandler,
  );
}
```

## 10. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-01 | Coding Standards — TypeScript (controller/route patterns) |
| TECH-DEV-04 | Naming Conventions (route naming rules) |
| TECH-DEV-12 | Error Handling Standards (error response format) |
| TECH-DEV-14 | Security Coding Standards (auth/permission guards) |

## 11. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

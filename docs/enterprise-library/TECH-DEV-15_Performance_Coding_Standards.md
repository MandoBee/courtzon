---
document_id: "TECH-DEV-15"
document_name: "Performance Coding Standards"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer"]
difficulty: "intermediate"
reading_time: 15
depends_on: ["TECH-DEV-01"]
related: ["TECH-DEV-01", "TECH-DEV-09", "TECH-DEV-11", "TECH-DEV-14"]
---

# CourtZon Performance Coding Standards

## 1. Purpose

Define mandatory performance practices for all CourtZon code to prevent N+1 queries, unbounded data loading, and inefficient resource usage.

## 2. N+1 Query Prevention

**Never query the database inside a loop.** Use JOINs or batch loading instead.

```typescript
// BAD — N+1: 1 query for bookings + N queries for each booking's user
const bookings = await bookingRepository.findByDate(date);
for (const booking of bookings) {
  booking.user = await userRepository.findById(booking.userId);
}

// GOOD — Single query with JOIN
const bookings = await bookingRepository.findByDateWithUsers(date);

// Repository implementation:
async findByDateWithUsers(date: string): Promise<BookingWithUser[]> {
  const [rows] = await this.pool.execute<RowData>(
    `SELECT b.*, u.name AS userName, u.email AS userEmail
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     WHERE b.booking_date = ?`,
    [date],
  );
  return rows as BookingWithUser[];
}
```

## 3. Pagination Requirements

**All list endpoints must be paginated.** No unbounded queries.

```typescript
// BAD — loads ALL rows
async findAll(): Promise<BookingAttributes[]> {
  const [rows] = await this.pool.execute<RowData>('SELECT * FROM bookings');
  return rows as BookingAttributes[];
}

// GOOD — paginated
async findAll(page: number, pageSize: number): Promise<{ data: BookingAttributes[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [rows] = await this.pool.execute<RowData>(
    'SELECT * FROM bookings ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [pageSize, offset],
  );
  const [[{ total }]] = await this.pool.execute<RowData>('SELECT COUNT(*) AS total FROM bookings');
  return { data: rows as BookingAttributes[], total };
}
```

**Default limit:** `pageSize` must default to 20 and never exceed 100.

**Evidence:** `backend/src/shared/utils/pagination.ts` provides the `paginate()` helper used by all list endpoints.

## 4. Redis Caching

Cache expensive or frequently accessed data with Redis. Cache keys follow `{entity}:{id}` pattern:

```typescript
import { getRedis } from '../../../database/redis.js';

const CACHE_TTL = 300;  // 5 minutes

export async function getBookingWithCache(id: number): Promise<BookingAttributes | null> {
  const redis = await getRedis();
  const cacheKey = `booking:${id}`;

  // Try cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit');
    return JSON.parse(cached);
  }

  logger.debug({ cacheKey }, 'Cache miss');
  const booking = await bookingRepository.findById(id);
  if (booking) {
    await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(booking));
  }
  return booking;
}
```

### 4.1 Cache Invalidation

Invalidate cache on mutations:

```typescript
async function updateBooking(id: number, data: UpdateBookingInput): Promise<BookingAttributes> {
  const updated = await bookingRepository.update(id, data);
  const redis = await getRedis();
  await redis.del(`booking:${id}`);           // Invalidate
  await redis.del('bookings:list');            // Invalidate list cache
  return updated;
}
```

**Evidence:** Redis is configured in `docker-compose.yml` and used in select repositories.

## 5. Database Query Optimization

### 5.1 Use EXPLAIN

Before adding a new query pattern, analyze it with `EXPLAIN`:

```sql
EXPLAIN SELECT * FROM bookings WHERE user_id = 42 AND booking_date > '2026-01-01';
```

Ensure the query uses indexes (not full table scans).

### 5.2 Add Indexes

Every new query pattern that filters or sorts by a column must have an index:

```sql
CREATE INDEX idx_bookings_user_date ON bookings (user_id, booking_date);
CREATE INDEX idx_bookings_status ON bookings (status);
```

**Evidence:** `database/baseline/001_courtzon_v3.sql` includes indexes on all foreign keys and frequently filtered columns.

## 6. Lazy Loading (Frontend)

Use React `lazy()` for route-level code splitting:

```tsx
import { lazy, Suspense } from 'react';

const BookingListPage = lazy(() => import('./pages/booking/BookingListPage'));
const BookingDetailPage = lazy(() => import('./pages/booking/BookingDetailPage'));

<Suspense fallback={<div className="p-4"><SkeletonRow count={3} /></div>}>
  <Routes>
    <Route path="/bookings" element={<BookingListPage />} />
    <Route path="/bookings/:id" element={<BookingDetailPage />} />
  </Routes>
</Suspense>
```

**Evidence:** `frontend/src/App.tsx` uses `lazy()` for all page components.

## 7. Bundle Size Awareness

### 7.1 Tree Shaking

Import only what you need:

```typescript
// BAD — imports entire library
import _ from 'lodash';
_.get(obj, 'path');

// GOOD — imports only the function
import get from 'lodash/get';
get(obj, 'path');
```

### 7.2 Monitor Bundle Size

Run `npm run build` and check output size in `frontend/dist/`. Keep initial JS bundle under 200 KB (gzipped).

## 8. Efficient React Rendering

```tsx
// BAD — recreates function on every render
<button onClick={() => handleCancel(booking.id)}>Cancel</button>

// GOOD — stable callback reference
const handleCancel = useCallback((id: number) => {
  cancelMutation.mutate(id);
}, [cancelMutation]);

// GOOD — memoized expensive computations
const sortedBookings = useMemo(() => {
  return [...bookings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}, [bookings]);
```

## 9. Connection Pool Management

Use connection pooling for both MySQL and Redis. Never open/close connections per request:

```typescript
// GOOD — shared pool (singleton)
import { getPool } from '../../database/mysql.js';
const pool = getPool();  // Created once at startup

// BAD — creates new connection per request
const conn = await mysql.createConnection({ ... });
```

**Evidence:** `backend/src/database/mysql.ts` exports `getPool()` which returns a singleton `mysql2/promise` pool.

## 10. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-01 | Coding Standards — TypeScript (general coding patterns) |
| TECH-DEV-09 | Testing Standards (performance regression tests) |
| TECH-DEV-11 | API Design Standards (pagination format) |
| TECH-DEV-14 | Security Coding Standards (rate limiting for performance) |

## 11. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

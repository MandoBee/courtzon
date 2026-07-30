---
document_id: "TECH-ARCH-11"
document_name: "Scalability Design"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["architect", "devops"]
difficulty: "advanced"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Architect"
documentation_owner: "Technical Writing"
reviewer: "DevOps Engineer"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  governs: ["TECH-ARCH-11"]
  references: ["TECH-ARCH-01", "TECH-ARCH-04", "TECH-ARCH-05"]
  related: ["TECH-ARCH-08", "TECH-DEV-15"]
---

# CourtZon Scalability Design

## 1. Horizontal Scaling Approach

CourtZon is designed for **horizontal scaling** through stateless backend instances:

```
                          ┌─────────────────────┐
                          │   Load Balancer      │
                          │  (nginx / cloud LB)  │
                          └──────────┬──────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
    ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
    │  Backend         │  │  Backend         │  │  Backend         │
    │  Instance 1      │  │  Instance 2      │  │  Instance N      │
    │  (stateless)     │  │  (stateless)     │  │  (stateless)     │
    └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
             │                     │                      │
             └─────────────────────┼──────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                              │
                    ▼                              ▼
           ┌──────────────┐              ┌──────────────────┐
           │   MySQL 8    │              │     Redis 7      │
           │  (primary)   │              │  (cache + queue) │
           │  + replicas  │              │                  │
           └──────────────┘              └──────────────────┘
```

**Principles:**
- All application state lives in MySQL or Redis — backend instances are **stateless**
- No server-local filesystems for persistent data (uploads use S3-compatible storage)
- Session tokens are validated via database lookup, not in-memory session stores
- No `MemoryStore` or `process.memory` dependent caching

**Evidence:** `backend/src/database/mysql.ts:1-28` — all state in MySQL. `backend/src/infrastructure/redis/redis.client.ts:1-38` — Redis handles caching. `app.ts:205-218` — session lookup hits `user_sessions` table, not in-memory store.

## 2. Redis-Based Distributed Locks

Booking concurrency is managed via **Redis distributed locks** using `SET NX PX`:

```typescript
// backend/src/modules/booking/infrastructure/redis/redis-lock.ts:24-28
async acquire(resourceId: number, date: string, slotStart: string, owner: string): Promise<boolean> {
  const key = this.lockKey(resourceId, date, slotStart);
  const result = await this.redis.set(key, owner, 'PX', LOCK_TTL_MS, 'NX');
  return result === 'OK';
}
```

**Key characteristics:**
- `LOCK_TTL_MS = 15000` (15 seconds) for booking locks
- `PREPARE_LOCK_TTL_MS = 600000` (10 minutes) for payment preparation locks
- Lua scripts for atomic acquire-and-release
- Owner verification on release (ownsership check prevents unlocking another request)
- `acquireAll()` / `acquireAllForPrepare()` for multi-slot booking with automatic rollback

**Evidence:** `redis-lock.ts:3-4` defines TTLs. Lines 38-46 implement Lua-based atomic release. Lines 76-105 implement `acquireAllForPrepare()` with timeout and rollback.

### Lock Flow for Booking

```
User selects time slots
  → acquireAll(slots, ownerId) — Redis SET NX PX for each slot
    → If all acquired: proceed to prepare booking
      → acquireForPrepare(resource, date, slot, ownerId) — extend lock to 10min
        → User fills payment details
          → Payment processed → booking confirmed → releaseAll()
    → If any slot fails: releaseAll() rollback → tell user slots unavailable
```

## 3. Optimistic Locking via aggregate_version

Concurrent write conflicts on aggregates are handled via **optimistic locking**:

```typescript
// booking.repository.ts — AggregateVersionConflict
export class AggregateVersionConflict extends ConflictError {
  constructor(bookingId: number, expectedVersion: number, actualVersion: number) {
    super(`Booking ${bookingId} version conflict: expected ${expectedVersion}, actual ${actualVersion}`);
  }
}
```

**Update pattern:**
```sql
UPDATE bookings
SET status = 'confirmed', aggregate_version = aggregate_version + 1
WHERE id = ? AND aggregate_version = ?
```

If the version doesn't match, the update affects 0 rows and the service throws `AggregateVersionConflict`. The client retries by re-reading the current state.

**Evidence:** `booking.repository.ts:11-15` defines `AggregateVersionConflict`. The `aggregateVersionConflictsTotal` metric tracks conflict rates.

## 4. Queue-Based Background Processing

BullMQ provides reliable async job processing:

```typescript
// queue.service.ts:141-161
class QueueService {
  private queues = new Map<string, Queue>();

  getQueue(name: string): Queue {
    const queue = new Queue(name, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      },
    });
  }
}
```

**Job types and queues:**
| Queue | Jobs | Scale Strategy |
|-------|------|----------------|
| `default` | settlements, backups, expiry, notifications | Multiple workers per queue |
| `notifications` | email, SMS, push, in-app | Dedicated workers with rate limiting |

**Evidence:** `queue.service.ts:7-14` lists all 18 job types. `queue.service.ts:134-135` defines queue names. `queue.service.ts:144-161` implements lazy queue initialization.

## 5. Read Replicas Consideration

The architecture supports MySQL read replicas for scaling read-heavy workloads:

```
┌──────────────┐     ┌─────────────────┐
│              │     │  Read Replica 1  │
│   MySQL      │────→│  (SELECT only)   │
│   Primary    │     ├─────────────────┤
│   (write)    │────→│  Read Replica 2  │
│              │     │  (SELECT only)   │
└──────────────┘     └─────────────────┘
```

**Implementation approach:**
- Write operations always go to primary pool
- Read operations could route to replica via separate pool
- `getPool()` can be extended to return read/write pools

**Current state:** Single pool with 10 connections to primary. Read replica support is infrastructure-ready but not yet deployed.

## 6. Connection Pooling

```typescript
// mysql.ts:10-18
connectionLimit: 10,
```

Each backend instance maintains a pool of 10 MySQL connections:
- **10 connections × N instances** = 10N total connections to MySQL
- Pool acquisition timeout prevents cascading failures
- Connections are released back to pool after each request

**Evidence:** `backend/src/database/mysql.ts:16` sets `connectionLimit: 10`.

## 7. Caching Strategy

Redis is used for multi-level caching with TTL-based invalidation:

| Cache | Key Pattern | TTL | Purpose |
|-------|-------------|-----|---------|
| Feature flags | `feature:{key}` | 300s | Feature toggle evaluation |
| Reference data | `ref:{countries\|amenities\|...}` | 3600s | Static lookup tables |
| Session cache | (not cached — DB lookup) | — | Security-sensitive |
| Rate limit | `rl:{ip}` | 60s | Built into @fastify/rate-limit |

**Tiered cache flow:**
```
Request
  → Check Redis cache (key exists?)
    → Hit: return cached value
      → Miss: query MySQL → set Redis with TTL → return value
```

**Evidence:** `redis.client.ts:14-21` establishes Redis connection. `app.ts:344` initializes feature flag middleware which uses Redis for caching.

## 8. Eventual Consistency via Event Bus

The EventBusV2 provides **at-least-once delivery** for eventual consistency:

- Events are written transactionally with the aggregate change
- BullMQ retries with exponential backoff (up to 6 attempts)
- Dead letter queue for permanently failed messages
- Cursor-based replay for subscriber recovery

```
Write operation
  → Transaction: UPDATE aggregate + INSERT published_events
    → onAfterCommit: Enqueue to BullMQ
      → Worker picks up → processes → updates cursor
        → On failure: retry (2s, 8s, 32s, 128s, 512s, 2048s)
          → Max retries exhausted → dead letter queue
```

**Evidence:** `event-bus.v2.ts:125-148` implements transaction-aware dispatch. `queue.service.ts:137-139` defines exponential backoff: `Math.min(2000 * Math.pow(4, attemptsMade - 1), 3_600_000)`.

## 9. Performance Considerations

| Concern | Strategy | Evidence |
|---------|----------|----------|
| Booking hotspots | Redis distributed locks + 15s TTL | `redis-lock.ts:24-28` |
| Write conflicts | Optimistic locking via aggregate_version | `booking.repository.ts:11-15` |
| Expensive queries | Pagination, indexed columns | All repository SELECTs use LIMIT/OFFSET |
| File uploads | Size limit (6MB), type validation | `app.ts:351-357` |
| CORS preflight | Whitelist origins, credentials support | `app.ts:185-198` |
| Error storms | Rate limiting + graceful degradation | `app.ts:175-179` |
| Log volume | Structured JSON logging, level control | `app.ts:106-110` |

## 10. Scaling Limits

| Component | Current | Upgrade Path |
|-----------|---------|--------------|
| Backend instances | 1 (Docker) | Horizontal: add more behind load balancer |
| MySQL connections | 10 (single pool) | Increase pool size, add read replicas |
| Redis memory | 512MB | Increase `maxmemory` in config |
| BullMQ concurrency | Single worker | Add worker processes per queue |
| Upload storage | Local filesystem | Migrate to S3-compatible storage |
| API rate limit | 100 req/min/IP | Adjust per plan tier |

## 11. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-ARCH-01 | System Architecture (context) |
| TECH-ARCH-04 | Event Architecture (eventual consistency) |
| TECH-ARCH-05 | Data Architecture (database) |
| TECH-ARCH-08 | Deployment Architecture (horizontal scale) |
| TECH-DEV-15 | Performance Coding Standards |

## 12. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |

---
document_id: "GOV-ADR-022"
document_name: "Customer 360 — UNION Query Across Business Domains"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 5
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-ARCH-22", "TECH-MOD-15"]
  related: ["GOV-ADR-010"]
---

# ADR-022: Customer 360 — UNION Query Across Business Domains

## Status

Accepted

## Context

The CRM module needs to present a unified view of customer activity across all business domains: bookings, marketplace orders, academy enrollments, tournament registrations, wallet transactions, and activity logs. Storing a separate aggregated Customer 360 data store would create data duplication and synchronization challenges. Common approaches include:

1. **Materialized view / separate data store** — pre-computed, fast reads; but stale data, data duplication, and sync complexity
2. **UNION query across domain tables** — real-time, no duplication; but query performance concerns and cross-table complexity
3. **Read-model event projection** — event-sourced read model updated by domain events; eventually consistent, complex infrastructure

## Decision

**Customer 360 is a UNION query across business domain tables, not a separate data store.** The CRM controller runs SQL UNION ALL queries across bookings, orders, enrollments, tournament registrations, wallet transactions, and activity logs to build the customer timeline and aggregated statistics.

### Architecture

```
listCustomersHandler / getCustomerHandler / getCustomerTimelineHandler
  │
  └─ Direct SQL UNION ALL queries against domain tables
       ├─ bookings
       ├─ orders
       ├─ academy_enrollments
       ├─ tournament_registrations
       ├─ wallet_transactions
       └─ activity_logs
```

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| Customer list | `listCustomersHandler()` — SELECT with subquery counts per domain | `crm.controller.ts:10-50` |
| Customer detail | `getCustomerHandler()` — separate COUNT queries per domain | `crm.controller.ts:52-110` |
| Timeline (UNION) | `getCustomerTimelineHandler()` — UNION ALL across 6 domain tables | `crm.controller.ts:112-137` |
| Aggregation | Subqueries in SELECT: `(SELECT COUNT(*) FROM bookings WHERE user_id = u.id)` | `crm.controller.ts:33-35` |
| Segment refresh | `refreshSegmentHandler()` — evaluates segment rules against `users` table | `crm.controller.ts:204-271` |
| No materialized view | All queries hit source tables directly | `crm.controller.ts` |

### Timeline UNION Query

```sql
SELECT created_at, 'booking' AS type, id AS ref_id, status AS ref_status, NULL AS ref_amount FROM bookings WHERE user_id = ?
UNION ALL
SELECT created_at, 'order', id, status, total_amount FROM orders WHERE user_id = ?
UNION ALL
SELECT created_at, 'enrollment', id, status, NULL FROM academy_enrollments WHERE user_id = ?
UNION ALL
SELECT created_at, 'tournament_registration', id, status, NULL FROM tournament_registrations WHERE user_id = ?
UNION ALL
SELECT created_at, 'wallet_transaction', id, type, amount FROM wallet_transactions WHERE user_id = ?
UNION ALL
SELECT created_at, 'activity_log', id, action, NULL FROM activity_logs WHERE user_id = ?
ORDER BY created_at DESC
LIMIT ?
```

**Evidence:** `crm.controller.ts:119-134` — the exact UNION ALL query.

### Domain-Specific Aggregations (getCustomerHandler)

| Metric | Source Table | Query |
|--------|-------------|-------|
| Total bookings | `bookings` | `COUNT(*) WHERE user_id = ?` |
| Cancelled bookings | `bookings` | `SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)` |
| Completed bookings | `bookings` | `SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)` |
| Total orders | `orders` | `COUNT(*) WHERE user_id = ?` |
| Total spent | `orders` | `COALESCE(SUM(total_amount), 0)` |
| Total deposits | `wallet_transactions` | `SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END)` |
| Total withdrawn | `wallet_transactions` | `SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END)` |
| Enrollments | `academy_enrollments` | `COUNT(*)` |
| Tournament registrations | `tournament_registrations` | `COUNT(*)` |
| Last activity | Multiple | `MAX(GREATEST(...))` across all domain tables |

## Consequences

### Positive

- **No data duplication**: Customer 360 is always in sync with source data because it queries source tables directly
- **Real-time**: No ETL delay — data appears in Customer 360 as soon as it's written to the domain table
- **Simple architecture**: No separate data store, no sync jobs, no event projections
- **Schema evolution**: Adding a new domain to Customer 360 = adding one more UNION ALL clause
- **Domain ownership preserved**: Each domain owns its table; CRM does not replicate data

### Negative

- **Query performance**: UNION ALL and per-row subqueries can be slow on large datasets; current LIMIT 200 reduces impact
- **Cross-table indexes**: No dedicated Customer 360 indexes; depends on each domain table having `user_id` indexes
- **No data transformation**: Domain data is returned as-is; CRM-specific transformations must be applied in application code
- **Scaling ceiling**: At very high volumes, this approach will need caching or a read model; acceptable for current scale

## Evidence

- `crm.controller.ts:112-137` — `getCustomerTimelineHandler()` with UNION ALL across 6 tables
- `crm.controller.ts:10-110` — `listCustomersHandler()` and `getCustomerHandler()` with domain-specific aggregations
- `crm.controller.ts:204-271` — `refreshSegmentHandler()` — segment evaluation against `users` table

## Related Decisions

- GOV-ADR-010 (CRM Read Model Pattern): CRM queries use read-optimized patterns

---
document_id: "GOV-ADR-010"
document_name: "CRM Read Model Pattern"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 5
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Architect"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-ARCH-22", "TECH-MOD-15"]
  related: ["GOV-ADR-002", "GOV-ADR-003"]
---

# ADR-010: CRM Uses Read Model Pattern — Customer 360 Is a Projection

## Status

Accepted

## Context

The CRM module needs to present a "Customer 360" view that aggregates data from multiple business domains: bookings, orders, wallet transactions, academy enrollments, tournament registrations, league participation, and activity logs. The question is whether the CRM should own its own copy of this data or query it live from source domains.

## Decision

The CRM **will not** maintain its own primary data store for customer profiles. Instead, the Customer 360 is a **read model / projection** that queries source tables via aggregation queries at request time.

Key implementation details:

1. **Customer 360 profile** (`getCustomerHandler`): Aggregates via individual `SELECT COUNT(*)` and `SUM()` queries on `bookings`, `orders`, `wallet_transactions`, `academy_enrollments`, `tournament_registrations`, `league_teams` per `user_id`.

2. **Customer timeline** (`getCustomerTimelineHandler`): Uses a `UNION ALL` across 6 source tables (`bookings`, `orders`, `academy_enrollments`, `tournament_registrations`, `wallet_transactions`, `activity_logs`) ordered by `created_at DESC`.

3. **Segment rules** (`refreshSegmentHandler`): Evaluates conditions like `has_booking`, `has_order`, `created_after` by generating dynamic SQL against `users` and related tables. The results are cached in the `segment_members` junction table, but this cache is explicitly refreshed on demand.

## Consequences

### Positive

- **No data duplication**: Source domains remain the single source of truth. No sync issues, no stale data.
- **Always current**: Every read reflects the latest state across all domains.
- **Simpler write path**: The CRM never needs to intercept writes to other modules.
- **Consistent with Domain Ownership** (GOV-ADR-002): Each business domain owns its data; CRM is a consumer.

### Negative

- **Read performance**: Each Customer 360 request issues 8+ queries. For high-traffic customer profiles, this could be slow. Mitigation: `segment_members` provides a cached materialization for segment queries. Future optimization may add a CRM-specific materialized view or cache layer.
- **No historical snapshots**: If a customer is deleted from `users`, their CRM history disappears. For audit purposes, `activity_logs` provides an independent record.

## Alternatives Considered

1. **Event-sourced CRM store**: Subscribe to all domain events and build a dedicated CRM database. Rejected: Would require event replay infrastructure, data duplication, and a sync SLA.

2. **Materialized view in MySQL**: Use MySQL's `CREATE MATERIALIZED VIEW`. Rejected: MySQL does not natively support materialized views; would require triggers or scheduled refreshes.

3. **CQRS with separate read DB**: Maintain a read-optimized replica. Rejected: Premature for current scale; would add operational complexity.

## Evidence

- `crm.controller.ts:60-96` — 8 aggregation queries for Customer 360
- `crm.controller.ts:119-134` — `UNION ALL` timeline query
- `crm.controller.ts:215-234` — Dynamic SQL segment rule evaluation

## Related Decisions

- GOV-ADR-002 (Domain Ownership): Each domain owns its data
- GOV-ADR-003 (Event Composable Architecture): Events enable async composition, though CRM currently uses synchronous reads

# ADR-003: Coach Categories — Two Types Only

## Status
Accepted — July 2026

## Context
The original design proposed three coach categories: Resident Coach, Independent Coach, and Hybrid Coach. This would have required a `category` enum with three values and conditional logic throughout the booking flow. After analysis, the "Hybrid" category was determined to be a capability, not a type.

## Decision
Coach categories are **two types only**:
1. **Resident Coach** — permanently associated with one organisation, books only through the organisation's courts
2. **Independent Coach** — associated with multiple organisations, can book at any branch

The **Hybrid** behavior is a capability, not a category:
- An independent coach may temporarily work at one organisation more than others
- A resident coach may occasionally guest at another branch
- These are scheduling constraints, not type distinctions

## Database Schema
```sql
coach_profiles (
  user_id BIGINT,
  organisation_id BIGINT,       -- NULL for independent coaches
  status ENUM('pending','approved','rejected','suspended'),
  hourly_rate DECIMAL(10,2),
  ...
)
```

- `organisation_id IS NOT NULL` → Resident Coach
- `organisation_id IS NULL` → Independent Coach

## Scheduling Engine Impact
The Engine's `CoachProvider` abstracts this distinction:
- For a resident coach: only searches courts in their organisation
- For an independent coach: searches courts across all organisations they're affiliated with

The Engine itself never checks `organisation_id` — the `CoachProvider` translates this into `location.branchId` / `location.organisationId` constraints, which the Engine's generic `locationMatches()` function evaluates.

## Consequences
- **+** No `Hybrid` enum value — simpler schema and fewer conditionals
- **+** Capability-based approach is more flexible (a coach can gain/lose capabilities without changing type)
- **+** Engine stays type-agnostic — handles resident vs. independent via location constraints
- **-** Reporting queries must filter on `organisation_id IS NULL/IS NOT NULL` instead of a `category` column

## Follow-Up
- `CoachProvider` uses `organisationId` from `coach_profiles` to determine search scope
- `locationMatches()` compares `branchId` or `organisationId` generically

# ADR-002: Business Day Definition (OPENING_BASED)

**Status:** Accepted | **Date:** July 2026 | **Architecture:** CourtZon Time Architecture v1.0

## Context

Branches may operate past midnight (e.g., 13:00–02:00). A booking at 00:30 on July 13 may belong to the business day July 12. Without a Business Day concept, reporting, availability, and cash closing are incorrect for overnight branches.

## Decision

A Business Day is defined as one complete operating session starting when the branch opens. It spans the entire session even if it crosses midnight. The Business Day is resolved by the OperatingHoursEngine using the branch's effective operating hours.

Examples:
- Branch 13:00–02:00: Business Day July 12 includes slots 13:00–02:00 (July 13 calendar).
- Branch 08:00–22:00: Business Day July 12 includes slots 08:00–22:00 (July 12 calendar only).

## Consequences

- Positive: Revenue reports, occupancy, cash closing are correct for overnight branches.
- Positive: Availability queries group all slots of a business day under one request.
- Positive: No cross-day query logic needed in slot generation.
- Negative: Requires storing `business_date` as a separate column (not derivable from UTC alone).

## Rejected Alternatives

- **Calendar date only:** Incorrect for overnight branches — midnight splits the operating session.
- **Configurable strategy (OPENING_BASED vs MIDNIGHT_BASED):** Unnecessary complexity. MIDNIGHT_BASED is never correct for overnight branches; for non-overnight branches both produce identical results.

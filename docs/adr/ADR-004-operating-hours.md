# ADR-004: Branch Model as Operating Hours Engine

**Status:** Accepted | **Date:** July 2026 | **Architecture:** CourtZon Time Architecture v1.0

## Context

The Operating Hours Engine determines the effective operating window for a given Business Day. It needs to combine default branch hours, holiday overrides, and modified schedules.

## Decision

No new entity is created. The existing `Branch` model is the Operating Hours Engine. It already owns:
- `timezone` (IANA string)
- `opening_time` / `closing_time` (default hours)
- Holiday mechanism (via schedules)

Phase 1 uses branch defaults directly. Phase 2+ extends with a `branch_hours_overrides` table for modified hours (holidays, Ramadan, maintenance, events) — but this is additive, not a new entity.

## Consequences

- Positive: Zero new database tables for Phase 1.
- Positive: Existing branch configuration screens work without changes.
- Positive: The OperatingHoursEngine is a pure function — takes branch hours as input, returns a session.
- Negative: Override handling is deferred to Phase 2.

## Rejected Alternatives

- **New `operating_session` table:** Unnecessary abstraction. The Branch already has everything needed.

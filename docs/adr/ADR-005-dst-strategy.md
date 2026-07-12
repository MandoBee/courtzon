# ADR-005: DST Strategy

**Status:** Accepted | **Date:** July 2026 | **Architecture:** CourtZon Time Architecture v1.0

## Context

Daylight Saving Time creates three categories of edge cases: spring-forward gaps (an hour doesn't exist), fall-back overlaps (an hour occurs twice), and government rule changes (retroactive or forward changes to DST schedules).

## Decision

### Spring-forward gaps
The SlotGenerator calls `DSTResolver.isInGap()` for each candidate slot. If the slot falls in a gap, it is SKIPPED. The business loses one slot of revenue for that hour. `UtcConverter.localToUtc()` throws `DSTGapError` if an unconvertible time is requested.

### Fall-back overlaps
The SlotGenerator calls `DSTResolver.isInOverlap()` for each candidate slot. If a slot falls in an overlap, TWO slot records are created with different `start_at_utc` values but the same `localStartTime`. The backend exposes both with a `dstOverlap` marker (`first`/`second`). The frontend displays a simple choice ("02:30 (1st)" / "02:30 (2nd)") ONLY when this edge case actually occurs.

### Government rule changes
Existing bookings have immutable `start_at_utc`. Future occurrences use the current IANA timezone database at the time of generation.

## Consequences

- Positive: All known DST scenarios are handled without application-level timezone logic.
- Positive: The IANA database is the authority — government updates are picked up automatically.
- Negative: DST transitions require testing against the local IANA database version.

## Rejected Alternatives

- **Auto-select first occurrence during overlap:** Hides information from the user.
- **Store timezone version snapshot:** The local time is already stored — no need to re-derive it.

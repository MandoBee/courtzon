# ADR-003: Time Engine as Sole Time Entry Point

**Status:** Accepted | **Date:** July 2026 | **Architecture:** CourtZon Time Architecture v1.0

## Context

Business modules frequently constructed `new Date()` objects from `booking_date + start_time` without timezone context. This created 15+ locations with latent timezone bugs.

## Decision

All time operations must route through the TimeEngine module. The following are BANNED outside `TimeEngine`:
- `new Date()` — use `TimeEngine.now()`
- `Date.parse()` — use `TimeEngine.UtcConverter`
- `Intl.DateTimeFormat()` — use `TimeEngine.TimezoneResolver`
- `.toLocaleString()` — use `TimeEngine.UtcConverter`

Enforced via ESLint `no-restricted-syntax` rule. New code must comply immediately. Existing code is grandfathered until Phase 2 migration.

## Consequences

- Positive: Single point of truth for all time logic. No duplicated timezone bugs.
- Positive: TimeEngine can be tested deterministically with FakeClock.
- Positive: If DST rules change, only TimeEngine needs updating.
- Negative: Requires import discipline. Code review must enforce the rule.

## Rejected Alternatives

- **No centralized module:** Duplicated timezone logic creates inconsistent behavior.
- **External library (moment/luxon):** Adds dependency; same discipline required.

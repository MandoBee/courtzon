# ADR-001: UTC as the Absolute Source of Truth

**Status:** Accepted | **Date:** July 2026 | **Architecture:** CourtZon Time Architecture v1.0

## Context

Booking times were stored as local `DATE`/`TIME` columns in the branch timezone. This created ambiguity: a `TIME` value of "22:00" without a timezone offset does not represent a unique point in time.

## Decision

Store `start_at_utc` and `end_at_utc` as `TIMESTAMP` columns in UTC alongside the existing local-time columns. UTC is the authoritative representation of when a booking occurs. Local time is stored for backward compatibility and display convenience.

## Consequences

- Positive: Absolute timestamps enable correct cancellation windows, notification scheduling, and auto-complete across all timezones.
- Positive: UTC is DST-agnostic — government rule changes do not affect stored timestamps.
- Positive: Calendar integrations (Google, Apple, Outlook) require UTC.
- Negative: All business logic must convert between UTC and local time via the TimeEngine.

## Rejected Alternatives

- **Local time only:** Ambiguous during DST transitions; breaks for multi-region deployments.
- **Local time + offset:** More storage; offset can change retroactively if government changes DST rules.

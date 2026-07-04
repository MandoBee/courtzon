# ADR 003: React Query Strategy

**Status:** Accepted  
**Date:** 2026-07-04  
**Authors:** CourtZon Engineering

## Context

The frontend uses TanStack React Query v5 for server state management. Cache strategy decisions affect perceived performance, data freshness, and network utilization. We need a consistent strategy for stale time, cache invalidation, polling, and optimistic updates.

## Decision

1. **Global defaults:** `staleTime: 30000` (30s), `retry: 1`. No custom `gcTime` (default 5min). This means data is considered fresh for 30 seconds and cached for 5 minutes after unmount.

2. **Cache invalidation pattern:** Every mutation MUST call `queryClient.invalidateQueries()` on success with the exact query key matching the affected data. Never use component state (e.g., `expandedBranchId`) to determine the invalidation target — always use the mutation's `variables` parameter.

3. **Polling pattern:** Polling is limited to payment confirmation (1.5s interval, 90s timeout) and notifications (30s interval). All polls use cleanup functions to prevent memory leaks. No unbounded polling.

4. **No optimistic updates.** The network latency (~80ms for local API calls) is below human perception threshold. Optimistic updates add significant complexity (rollback logic, format normalization) for imperceptible UX gain. `invalidateQueries` is sufficient.

5. **Override `staleTime` only when justified.** Explicit overrides exist for: bank/branch admin pages (0 — always fresh), finance data (60s — moderate freshness), language list (5min — rarely changes), coach profile (5min).

## Alternatives Considered

- **SWR vs React Query (chose RQ).** React Query was already in use. Both are equivalent; switching provides no benefit.
- **Optimistic updates (rejected).** See ADR 001's optimization audit.
- **WebSocket/SSE for real-time updates (rejected).** Adds infrastructure complexity. Polling at 1.5-30s intervals is adequate for current use cases.
- **Per-component staleTime overrides (rejected as default).** Global default with explicit overrides is more maintainable than per-query defaults.

## Consequences

- **Positive:** Consistent caching behavior across the app. Predictable data freshness. Simple invalidation pattern.
- **Negative:** No real-time updates for bookings/orders (requires manual refresh or page navigation). Acceptable for current UX.
- **Enforcement:** RQ-01 through RQ-05 in engineering standards.

# EEP Phase 7: Domain Refactoring

## Scope

Implement domain layers for modules identified in Phase 6.

## Target: Match Module

**Current state:** Match module has `presentation/` + `application/` + `domain/` + `infrastructure/` structure but domain is empty. All business logic lives in services with no state machine enforcement.

**Refactoring plan:**

### 1. Match Aggregate (`match/domain/match-aggregate.ts`)
```
States: open → joined → in_progress → completed / cancelled
Transitions:
  open → joined (player joins)
  joined → in_progress (minimum players reached)
  in_progress → completed (match finished)
  any → cancelled (owner or admin)
Invariants:
  Cannot join a cancelled match
  Cannot cancel a completed match
  Player cannot join twice
  Must have minimum 2 players to start
```

### 2. Match Applicant Aggregate (`match/domain/applicant-aggregate.ts`)
```
States: pending → approved / rejected
Transitions:
  pending → approved (owner approves)
  pending → rejected (owner rejects)
Invariants:
  Only match owner can approve/reject
  Cannot approve more than capacity
```

## Implementation (Design Only)

```typescript
// match/domain/match-aggregate.ts
export type MatchStatus = 'open' | 'joined' | 'in_progress' | 'completed' | 'cancelled';
const VALID_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  open: ['joined', 'cancelled'],
  joined: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function assertValidTransition(from: MatchStatus, to: MatchStatus): void {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid transition: ${from} → ${to}`);
  }
}
```

## Regression Validation

All domain refactoring will be verified by:
- `npm run build` → clean tsc compilation
- `npm test` → 649/649 tests pass
- API responses remain identical (no new endpoints, no changed contracts)

## Status

| Module | Action | Status | Verified |
|--------|--------|--------|----------|
| Match | Add domain aggregate | **Queued** | ⏳ |
| Academy | Add enrollment domain | **Queued** | ⏳ |

**Phase 7 Complete.** Domain refactoring is designed and ready for implementation during Engineering Cleanup Week.

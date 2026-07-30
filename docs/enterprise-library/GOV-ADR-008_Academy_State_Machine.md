---
document_id: "GOV-ADR-008"
document_name: "Academy State Machine"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 8
business_owner: "CTO"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
supersedes: []
related_decisions: ["GOV-ADR-009"]
---

# ADR-008: Centralized State Machine for Academy Programs and Enrollments

**Status:** Accepted | **Date:** 2025-07-28

## Context

The academy module manages two stateful entities: `AcademyProgram` (course lifecycle) and `AcademyEnrollment` (player registration lifecycle). Early designs used ad-hoc status checks scattered across controller and service methods, leading to inconsistent transition logic and unreachable states.

Common approaches considered:

1. **Status as free-text field** — Unrestricted `UPDATE` on status; all validation in controllers. Risk of invalid states.
2. **Database CHECK constraints or triggers** — Enforces at storage layer but hard to debug and maintain.
3. **Dedicated state machine in domain layer** — Single source of truth for all allowed transitions, enforced by a validation function before any status write.

## Decision

**Use a centralized, immutable state machine in the domain layer for both `AcademyProgram` and `AcademyEnrollment`.** Each entity has its own transition map and validation function exported from `domain/lifecycle.ts`. Controllers and services must call `validateProgramTransition()` or `validateEnrollmentTransition()` before any status change. The state machine is the **sole authority** on what transitions are legal.

### Implementation

```typescript
// domain/lifecycle.ts
const PROGRAM_TRANSITIONS: Record<AcademyProgramStatus, AcademyProgramStatus[]> = {
  draft: ['published'],
  published: ['open', 'cancelled', 'archived'],
  open: ['full', 'running', 'cancelled', 'archived'],
  full: ['open', 'running', 'cancelled', 'archived'],
  running: ['completed', 'cancelled', 'archived'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};

const ENROLLMENT_TRANSITIONS: Record<AcademyEnrollmentStatus, AcademyEnrollmentStatus[]> = {
  pending: ['confirmed', 'waiting', 'cancelled'],
  confirmed: ['cancelled', 'completed'],
  waiting: ['confirmed', 'cancelled'],
  cancelled: [],
  completed: [],
};
```

### Validation function

```typescript
export function validateProgramTransition(from: AcademyProgramStatus, to: AcademyProgramStatus): void {
  if (from === to) return;  // No-op transition is allowed
  const allowed = PROGRAM_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ConflictError(
      `Cannot transition program from '${from}' to '${to}'`,
      ErrorCodes.ACADEMY_INVALID_TRANSITION,
    );
  }
}
```

### Query helpers

```typescript
export function getAllowedProgramTransitions(status: AcademyProgramStatus): AcademyProgramStatus[];
export function getAllowedEnrollmentTransitions(status: AcademyEnrollmentStatus): AcademyEnrollmentStatus[];
```

These are used by the UI to render only valid action buttons.

## Consequences

### Positive
- **No invalid states** — Every status transition is validated against the declared map. An enrollment can never jump from `pending` to `completed` without going through `confirmed`.
- **Single source of truth** — Both services (`program.service.ts`, `enrollment.service.ts`) and any future consumers read transitions from one definition.
- **Auditable** — The transition map is a readable, testable data structure. Unit tests can exhaustively verify every allowed and disallowed path.
- **UI integration** — `getAllowed*Transitions()` enables dynamic button rendering (disabled states, hidden actions).

### Negative
- **No dynamic transitions** — Adding a new transition requires a code change to the map. This is acceptable since academy lifecycle rules are business-defined and change infrequently.
- **No conditional transitions** — The map is purely state-based, not context-based. For example, `open → full` is always allowed regardless of current capacity. The capacity check is handled separately in `enrollment.service.ts:37-42` before the status transition.
- **Dual enforcement** — The service layer also checks business rules (e.g., capacity) before calling the transition. This is intentional — the state machine validates legal *state* transitions, while services validate *business* preconditions.

## Alternatives Considered

| Alternative | Reason Rejected |
|-------------|----------------|
| Database CHECK constraints | Hard to maintain, no error message control, not portable across DB versions |
| Controller-level validation | Duplicated logic, easy to miss a path |
| ORM lifecycle hooks | Coupled to persistence, not testable in isolation |

## Related Decisions

- **GOV-ADR-009** — Tournament format strategy (similar pattern for tournament lifecycle)
- **VOLUME-11** — Entity Lifecycles catalog (all state machines documented centrally)

**Evidence:** Source implementation at `backend/src/modules/academy/domain/lifecycle.ts:1-52`. Usage in `application/program.service.ts:44-72` (publish, archive, transitionStatus) and `application/enrollment.service.ts:65-84` (cancel, complete, confirm).

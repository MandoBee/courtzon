# CourtZon Enterprise Platform — Volume 11: Entity Lifecycles

## Lifecycle Architecture

Every business entity in CourtZon uses an explicit state machine rather than boolean flags. State transitions are validated through domain policies. Controllers never manipulate status directly.

**Evidence:** All lifecycle files are in `*/domain/lifecycle.ts` or `*/domain/*-aggregate.ts`.

---

## 1. User Account Lifecycle

```
                    ┌──────────┐
                    │  Active  │
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌────────┐ ┌────────┐ ┌────────┐
         │Suspended│ │ Banned │ │ Deleted│
         └────────┘ └────────┘ └────────┘
```

**States:** `active | suspended | banned | deleted`
**Source:** `modules/auth/domain/`
**Transitions:** `active → suspended | banned | deleted`, `suspended → active`

---

## 2. Booking Lifecycle

```
                  ┌──────────┐
    ┌────────────►│ Pending  │◄────────────┐
    │             └────┬─────┘              │
    │                  │                    │
    │           ┌──────┴──────┐             │
    │           ▼             ▼             │
    │     ┌──────────┐ ┌──────────┐         │
    │     │ Confirmed │ │ Expired │         │
    │     └────┬─────┘ └──────────┘         │
    │          │                            │
    │     ┌────┴─────┐                      │
    │     ▼          ▼                      │
    │ ┌────────┐ ┌────────┐                 │
    │ │Check In│ │ No Show│                 │
    │ └────┬───┘ └────────┘                 │
    │      │                                │
    │ ┌────┴────┐                            │
    │ ▼         ▼                            │
    │Completed Cancelled                     │
    │          ▲                             │
    └──────────┘                             │
                                             │
    Any state can transition to Cancelled     │
    Terminal: Completed, Cancelled, Expired   │
```

**States:** `pending | confirmed | checked_in | completed | cancelled | no_show | expired`
**Source:** `modules/booking/domain/booking-aggregate.ts`
**Transition Matrix Evidence:**
```typescript
const ALLOWED_TRANSITIONS = {
  pending: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['checked_in', 'completed', 'cancelled', 'no_show'],
  checked_in: ['completed', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
  expired: [],
};
```

---

## 3. Academy Program Lifecycle

```
Draft → Published → Open → Full → Running → Completed → Archived
                        ↘         ↙
                      Cancelled
```

**States:** `draft | published | open | full | running | completed | cancelled | archived`
**Source:** `modules/academy/domain/lifecycle.ts`
**Evidence:**
```typescript
const PROGRAM_TRANSITIONS = {
  draft: ['published'],
  published: ['open', 'cancelled', 'archived'],
  open: ['full', 'running', 'cancelled', 'archived'],
  full: ['open', 'running', 'cancelled', 'archived'],
  running: ['completed', 'cancelled', 'archived'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};
```

---

## 4. Tournament Lifecycle

```
Draft → Published → Registration Open → Registration Closed → Running → Completed → Archived
                                                              ↘         ↙
                                                            Cancelled
```

**States:** `draft | published | registration_open | registration_closed | running | completed | cancelled | archived`
**Source:** `modules/tournaments/domain/lifecycle.ts`

---

## 5. League Lifecycle

```
Draft → Registration Open → Registration Closed → Running → Completed → Archived
                                                     ↘         ↙
                                                   Cancelled
```

**States:** `draft | registration_open | registration_closed | running | completed | cancelled | archived`
**Source:** `modules/leagues/domain/lifecycle.ts`

---

## 6. Employee Lifecycle

```
Draft → Onboarding → Active → On Leave → Terminated → Archived
                         ↘         ↙
                       Suspended
```

**States:** `draft | onboarding | active | on_leave | suspended | terminated | archived`
**Source:** `modules/hr/domain/lifecycle.ts`

---

## 7. Leave Request Lifecycle

```
Draft → Submitted → Approved → Completed
                 ↘       ↙
               Rejected
                 ↘
              Cancelled
```

**States:** `draft | submitted | approved | rejected | cancelled | completed`
**Source:** `modules/hr/domain/lifecycle.ts`

---

## 8. Payroll Run Lifecycle

```
Draft → Calculated → Approved → Posted → Paid → Closed
```

**States:** `draft | calculated | approved | posted | paid | closed`
**Source:** `modules/hr/domain/lifecycle.ts`
**Note:** "Posted" triggers Finance integration — HR creates the accounting entries for Finance.

---

## 9. Support Ticket Lifecycle

```
Open → In Progress → Waiting on Customer → Resolved → Closed
                    ↘                      ↙
                  Cancelled
```

**States:** `open | in_progress | waiting_on_customer | resolved | closed`
**Source:** `modules/support/domain/` (handlers in controller)

---

## 10. Purchase Order Lifecycle

```
Draft → Submitted → Approved → Received → Closed
                 ↘          ↙
               Cancelled
```

**States:** `draft | submitted | approved | received | cancelled`
**Source:** `modules/marketplace/presentation/inventory.controller.ts`

---

## 11. Marketing Campaign Lifecycle

```
Draft → Active → Paused → Completed → Archived
                 ↕
               Paused
```

**States:** `draft | active | paused | completed | cancelled`
**Source:** `modules/crm/presentation/crm.controller.ts`

---

## 12. Lead Lifecycle

```
New → Qualified → Converted → [Customer]
  ↘           ↘
   Lost       Lost
```

**States:** `new | qualified | converted | lost`
**Source:** `modules/crm/presentation/crm.controller.ts`

---

## 13. Settlement Lifecycle

```
Requested → Calculating → Pending Approval → Approved → Paid → Completed
                                                 ↘         ↙
                                             Rejected    Cancelled
```

**States:** `requested | calculating | pending_approval | approved | paid | completed | rejected | cancelled`
**Source:** `modules/settlement/domain/settlement-aggregate.ts`

---

## 14. Membership Lifecycle

```
Active → Frozen → Active
  ↘         ↘
Cancelled   Expired
```

**States:** `active | frozen | cancelled | expired`
**Source:** `modules/membership/application/user-membership.service.ts`

---

## Common Patterns Across Lifecycles

1. **Every transition is validated** — Controllers call `validateProgramTransition(from, to)` before updating
2. **Invalid transitions throw ConflictError** — e.g., `Cannot transition program from 'running' to 'draft'`
3. **Every transition publishes an event** — e.g., `eventBusV2.emit('tournament:published', ...)`
4. **Every transition is audited** — `recordAudit()` called after every status change
5. **Terminal states exist** — Once an entity reaches `completed`, `cancelled`, `archived`, `deleted`, no further transitions are allowed

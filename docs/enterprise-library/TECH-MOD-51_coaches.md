---
document_id: "TECH-MOD-51"
document_name: "Coaches Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 10
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-35"]
  related: ["TECH-MOD-13"]
---

# Coaches Module (TECH-MOD-51)

**Source:** Route definitions live in `activities.routes.ts` (lines 41-86). Coach CRUD routes and profile management live in the Organisations module.

## 1. Purpose

The coaches module contains the **session state machine** only. Coach profile CRUD routes (admin listing, profile update, verify, delete, availability toggle) are managed through the Activities module routing layer. Coach CRUD at the organisation level lives in the Organisations module.

## 2. Session State Machine

### Canonical Lifecycle (Unified Flow B)

`coach_sessions` is created by Unified Flow B (`/scheduling/book` → `scheduling-booking.service.ts`) and left in **`scheduled`** — the canonical post-booking/link state. Unified Flow B has **no coach acceptance or confirmation step**; the booking/payment confirmation is the booking-domain confirmation. The canonical execution lifecycle is:

```
scheduled → in_progress → completed
scheduled → cancelled
in_progress → cancelled
```

- **Start** is `scheduled → in_progress` (coach starts the session).
- **Complete** is `in_progress → completed`.
- **Cancel** is supported from `scheduled` and `in_progress`.

### Retained Legacy DB States

| Current State | Valid Transitions | Action |
|--------------|-------------------|--------|
| `pending_acceptance` | `confirmed`, `cancelled` | Legacy dual-confirmation flow |
| `confirmed` | `in_progress`, `cancelled` | Legacy pre-start state |

**`confirmed` is NOT part of the canonical Unified Flow B lifecycle.** It remains a retained legacy DB state only, reachable via the removed legacy flow's `pending_acceptance` state.

### Transient

- **`pending_court`** — the DB default during session creation, immediately replaced by `scheduled` during the canonical booking flow. No user-facing transition.

### Retained Terminal

- **`no_show`** — retained in the DB ENUM but currently unreachable from the coach-session state machine. The exact source state for a `no_show` transition remains a pending product decision.

### Legacy Code Terminology

The following statuses are legacy terminology used by old code only and are **not present in the current `coach_sessions.status` ENUM**:

- `requested`
- `accepted`
- `declined`
- `counter_proposal`

## 3. Coach Collaboration Routes (via Activities module)

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/coach-sessions/:id` | auth | Session detail |
| 2 | POST | `/coach-sessions/:id/confirm` | `coaches.confirm_session` | Confirm session |
| 3 | POST | `/coach-sessions/:id/cancel` | auth | Cancel session |
| 4 | POST | `/coach-sessions/:id/start` | `coaches.start_session` | Start session |
| 5 | POST | `/coach-sessions/:id/complete` | `coaches.complete_session` | Complete session |
| 6 | POST | `/coach-sessions/:id/no-show` | `coaches.no_show` | Mark no-show |

## 4. Key Concepts

- **Session creation & Court Booking:** Coach sessions are created via Unified Flow B (`/scheduling/book` → `scheduling-booking.service.ts`), which creates the `coach_sessions` row (`scheduled`) and its court booking atomically with canonical eligibility, pricing, and concurrency guards. The legacy coach-initiated flow (`POST /coaches/sessions` + `bookCourtForSession` → `pending_court`/`pending_acceptance`) was removed in AUD-003 G2-A.
- **Price Breakdown:** Sessions have complex price breakdown: coach fee, court fee, platform fee, org fee, with split percentages from org agreements
- **Commission:** Platform commission calculated via `commissionService` for both session price and court booking
- **Availability:** Coach weekly availability slots + blackout dates managed per-coach

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

Coach sessions progress through the following states:

```
requested → pending_court → pending_acceptance → confirmed → completed
                                                      ↓
                                                 cancelled ← (any state)
                                                      ↓
                                                 no_show
```

### State Transitions

| Current State | Valid Transitions | Action |
|--------------|-------------------|--------|
| `requested` | `pending_court` | Coach creates session, court not yet booked |
| `pending_court` | `pending_acceptance`, `cancelled` | Coach books court → moves to acceptance |
| `pending_acceptance` | `confirmed`, `cancelled` | Player accepts or declines |
| `confirmed` | `completed`, `cancelled`, `no_show` | Session in progress |
| `completed` | — | Terminal state |
| `cancelled` | — | Terminal state |
| `no_show` | — | Terminal state |

## 3. Coach Collaboration Routes (via Activities module)

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | POST | `/coach-sessions/request` | `coaches.book` | Request coach session |
| 2 | GET | `/coach-sessions/requests` | auth | List coach requests |
| 3 | GET | `/coach-sessions/:id` | auth | Session detail |
| 4 | POST | `/coach-sessions/:id/respond` | `coaches.respond_request` | Respond to request |
| 5 | POST | `/coach-sessions/:id/confirm` | `coaches.confirm_session` | Confirm session |
| 6 | POST | `/coach-sessions/:id/cancel` | auth | Cancel session |
| 7 | POST | `/coach-sessions/:id/start` | `coaches.start_session` | Start session |
| 8 | POST | `/coach-sessions/:id/complete` | `coaches.complete_session` | Complete session |
| 9 | POST | `/coach-sessions/:id/no-show` | `coaches.no_show` | Mark no-show |

## 4. Key Concepts

- **Court Booking:** On `pending_court`, coach can book a court via `bookCourtForSession` which creates a booking record and transitions to `pending_acceptance`
- **Price Breakdown:** Sessions have complex price breakdown: coach fee, court fee, platform fee, org fee, with split percentages from org agreements
- **Commission:** Platform commission calculated via `commissionService` for both session price and court booking
- **Availability:** Coach weekly availability slots + blackout dates managed per-coach

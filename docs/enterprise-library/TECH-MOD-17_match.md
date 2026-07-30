---
document_id: "TECH-MOD-17"
document_name: "Match Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 30
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-03"]
  related: ["TECH-MOD-05", "TECH-MOD-06"]
---

# Match Module (TECH-MOD-17)

**Source:** `backend/src/modules/match/` (31 files: 6 dirs, 8 domain, 9 application services, 4 presentation)

## 1. Purpose

Public matchmaking for sports sessions. Players create open matches, set eligibility criteria, invite or accept join requests, and manage participation through a 7-state lifecycle. Includes waiting list, eligibility service, invitations, and session tracking.

## 2. Architecture

```
domain/
  match.entity.ts              — Match aggregate with state machine
  match.types.ts               — MatchStatus, JoinRequestStatus, etc.
  join-request.entity.ts       — Join request with 5-state lifecycle
  invitation.entity.ts         — Invitation entity
  participant.entity.ts        — Participant data
  waiting-list-entry.entity.ts — Waiting list position management
  match-criteria.vo.ts         — Eligibility criteria value object
  match-session.vo.ts          — Session tracking value object
application/
  services/
    match.service.ts           — Match CRUD orchestration
    matchmaking.service.ts     — Auto-invite eligible players
    eligibility.service.ts     — Player eligibility checks
    join-request.service.ts    — Join request workflow
    invitation.service.ts      — Invitation management
    participant.service.ts     — Participant management
    waiting-list.service.ts    — Waiting list operations
    session.service.ts         — Session management
    deadline.service.ts        — Deadline tracking
presentation/
  match.routes.ts              — 9 endpoints
  match.controller.ts          — Request handlers
  match.serializer.ts          — Response serialization
```

**Evidence:** Directory structure.

## 3. Match Lifecycle — State Machine

Defined in `match.entity.ts:10-18`:

```
            open ←→ full
              ↓        ↓
            closed ────┘
              ↓
         in_progress
          ↓        ↓
     completed   cancelled
        void
```

| From | To |
|------|----|
| `open` | `full`, `closed`, `cancelled`, `void` |
| `full` | `open`, `closed`, `cancelled`, `void` |
| `closed` | `in_progress`, `cancelled`, `void` |
| `in_progress` | `completed`, `cancelled` |
| `completed` | *(terminal)* |
| `cancelled` | *(terminal)* |
| `void` | *(terminal)* |

**Evidence:** `match.entity.ts:10-18` defines `VALID_TRANSITIONS`. `:70-80` implements `transition()`.

## 4. Join Request Lifecycle

Defined in `join-request.entity.ts:4-10`:

```
submitted → approved → [terminal]
  ↓      ↓      ↓
  │      └→ rejected → [terminal]
  │      └→ auto_rejected → [terminal]
  └→ withdrawn → [terminal]
```

| From | To |
|------|----|
| `submitted` | `withdrawn`, `approved`, `rejected`, `auto_rejected` |
| `withdrawn` | *(terminal)* |
| `approved` | *(terminal)* |
| `rejected` | *(terminal)* |
| `auto_rejected` | *(terminal)* |

**Evidence:** `join-request.entity.ts:4-10` defines `VALID_TRANSITIONS`. Methods `approve()`, `reject()`, `withdraw()`, `autoReject()` at `:46-67`.

## 5. Routes (9)

Defined in `match.routes.ts:8-16`:

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/matches` | List matches |
| 2 | GET | `/matches/:id` | Get match detail |
| 3 | POST | `/matches/:id/join` | Submit join request |
| 4 | POST | `/matches/:id/withdraw` | Withdraw join request |
| 5 | GET | `/matches/:id/applicants` | List applicants |
| 6 | POST | `/matches/:id/applicants/:requestId/approve` | Approve applicant |
| 7 | POST | `/matches/:id/applicants/:requestId/reject` | Reject applicant |
| 8 | POST | `/matches/:id/close` | Close match to new applicants |
| 9 | POST | `/matches/:id/cancel` | Cancel match |

## 6. Eligibility Service

`eligibility.service.ts:50-94` — `findEligiblePlayerIds()` filters by:
- Age range (`minAge`, `maxAge`)
- Gender (`targetGender`)
- Skill level (`targetLevelId`)
- Sport interest (main sport or `player_sport_interests`)

**Evidence:** `eligibility.service.ts:7-48` (`isEligible()`), `:50-94` (`findEligiblePlayerIds()`).

## 7. Matchmaking Service

`matchmaking.service.ts:12-29` — `sendInvitations()`:
1. Queries eligible players via `eligibilityService.findEligiblePlayerIds()`
2. Sends invitation to each eligible player via `invitationService.send()`
3. Skips duplicates (catches `DUPLICATE_INVITATION`)

## 8. Waiting List

`waiting-list-entry.entity.ts` — Position-tracked list. Supports `setPosition()` for reordering.

Match aggregate methods: `addToWaitingList()`, `removeFromWaitingList()` at `match.entity.ts:144-160`.

## 9. Types

Defined in `match.types.ts`:
- `MatchType = 'public'` (currently only public matches)
- `MatchStatus = 'open' | 'full' | 'closed' | 'in_progress' | 'completed' | 'cancelled' | 'void'`
- `Visibility = 'public' | 'invite_only'`
- `InvitationStatus = 'sent' | 'read' | 'declined' | 'expired'`
- `JoinRequestStatus = 'submitted' | 'withdrawn' | 'approved' | 'rejected' | 'auto_rejected'`
- `SessionStatus = 'in_progress' | 'completed' | 'voided'`

## 10. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Match | `matches` | `id, type, status, booking_id, sport_id, version` |
| Join Request | `join_requests` | `id, match_id, user_id, status, submitted_at, responded_at` |
| Invitation | `invitations` | `id, match_id, user_id, status` |
| Participant | `participants` | `id, match_id, user_id, role` |
| Waiting List | `waiting_list` | `id, match_id, user_id, position` |
| Public Match Detail | `public_match_details` | `match_id, creator_id, min_age, max_age, target_gender, target_level_id` |

---
document_id: "TECH-MOD-35"
document_name: "Activities Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-03", "TECH-MOD-04", "TECH-MOD-05"]
  related: ["TECH-MOD-51", "VOLUME-11"]
---

# Activities Module (TECH-MOD-35)

**Source:** `backend/src/modules/activities/` (7 entries: domain/, application/, commands/, infrastructure/, presentation/)

## 1. Purpose

Unified module that routes tournament, academy, and coach operations. Despite its name, it does not manage a standalone `activity_logs` table — rather it serves as the routing layer for the **Tournaments**, **Academies**, and **Coaches** sub-domains from a single presentation boundary. Coach session activities, player activity feed data is aggregated via direct SQL queries in their respective domains.

## 2. Routes (87)

Defined in `activities.routes.ts:6-87`:

### Tournaments (5) — gated by `app.tournaments_enabled`
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | POST | `/tournaments` | `tournaments.create` | Create tournament |
| 2 | POST | `/tournaments/:id/generate-bracket` | `tournaments.manage_brackets` | Generate bracket |
| 3 | POST | `/matches/:matchId/score` | `tournaments.enter_scores` | Enter match score |
| 4 | PUT | `/tournaments/:id` | adminGuard | Update tournament |
| 5 | DELETE | `/tournaments/:id` | adminGuard | Delete tournament |

### Academies (9) — gated by `app.academies_enabled`
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 6 | GET | `/academies` | — | List academies |
| 7 | GET | `/academies/:id` | — | Get academy |
| 8 | POST | `/academies` | `academies.create` | Create academy |
| 9 | POST | `/academies/:id/curriculums` | `academies.edit` | Create curriculum |
| 10 | POST | `/academies/:id/enroll` | — | Enroll player |
| 11 | POST | `/academies/:id/sessions` | `academies.edit` | Create academy session |
| 12 | POST | `/sessions/:sessionId/attendance` | — | Mark attendance |
| 13 | POST | `/academies/:id/evaluations` | `academies.evaluate` | Create evaluation |
| 14 | GET | `/admin/academies` | adminGuard | Admin list academies |
| 15 | PUT | `/academies/:id` | adminGuard | Update academy |
| 16 | DELETE | `/academies/:id` | adminGuard | Delete academy |

### Coaches (13)
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 17 | GET | `/coaches` | — | List coaches |
| 18 | GET | `/coaches/:id` | — | Get coach by ID |
| 19 | GET | `/coaches/:id/agreements` | — | List coach agreements |
| 20 | GET | `/coaches/profile/me` | — | My coach profile |
| 21 | POST | `/coaches/profile` | `coaches.manage_profile` | Create coach profile |
| 22 | PUT | `/coaches/profile` | `coaches.manage_profile` | Update coach profile |
| 23 | GET | `/coaches/agreements` | — | List org agreements |
| 24 | POST | `/coaches/agreements` | `coaches.manage_agreements` | Upsert org agreement |
| 25 | POST | `/coaches/agreements/:id/respond` | `coaches.invites.respond` | Respond to org invite |
| 26 | GET | `/coaches/sessions/me` | — | My coach sessions |
| 27 | GET | `/coaches/stats` | — | Coach stats |
| 28 | GET | `/coaches/players` | — | Coach players |
| 29 | POST | `/coaches/:coachId/reviews` | — | Create coach review |

### Coach Collaboration Flow (6)
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 30 | GET | `/coach-sessions/:id` | — | Get session detail |
| 31 | POST | `/coach-sessions/:id/confirm` | `coaches.confirm_session` | Confirm session |
| 32 | POST | `/coach-sessions/:id/cancel` | — | Cancel session |
| 33 | POST | `/coach-sessions/:id/start` | `coaches.start_session` | Start session |
| 34 | POST | `/coach-sessions/:id/complete` | `coaches.complete_session` | Complete session |
| 35 | POST | `/coach-sessions/:id/no-show` | `coaches.no_show` | Mark no-show |

### Coach Availability (5)
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 36 | GET | `/coaches/availability/me` | `coaches.availability.manage` | My availability |
| 37 | PUT | `/coaches/availability/me` | `coaches.availability.manage` | Set availability |
| 38 | POST | `/coaches/availability/me/blackouts` | `coaches.availability.manage` | Add blackout |
| 39 | DELETE | `/coaches/availability/me/blackouts/:id` | `coaches.availability.manage` | Remove blackout |
| 40 | GET | `/coaches/:id/availability` | — | Public coach availability |

### Admin Coach (5)
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 41 | GET | `/admin/coaches` | adminGuard | Admin list coaches |
| 42 | PUT | `/coaches/:id` | adminGuard | Admin update coach |
| 43 | DELETE | `/coaches/:id` | adminGuard | Admin delete coach |
| 44 | PATCH | `/coaches/:id/verify` | adminGuard | Verify coach |
| 45 | PATCH | `/coaches/:id/toggle` | adminGuard | Toggle coach availability |

## 3. Services

`activities.service.ts` provides:

- **Tournaments:** `listTournaments`, `getTournament`, `createTournament`, `updateTournament`, `registerPlayer`, `generateBracket`, `enterMatchScore`
- **Academies:** `listAcademies`, `getAcademy`, `createAcademy`, `createCurriculum`, `enrollPlayer`, `createSession`, `markAttendance`, `createEvaluation`
- **Coaches:** `listCoaches`, `getCoachProfile`, `getCoachById`, `createCoachProfile`, `updateCoachProfile`, `upsertOrgAgreement`, `respondToOrgInvite`, `createCoachReview`, `getCoachSessions`
- **Coach Availability:** `getMyCoachAvailability`, `setMyCoachAvailability`, `addMyCoachBlackout`, `removeMyCoachBlackout`, `getCoachAvailabilityPublic`
- **Coach Sessions:** Slice-4 lifecycle (confirm/cancel/start/complete/no-show) via `coachSessionStateService`; session creation and court booking flow through Unified Flow B (`/scheduling/book` → `scheduling-booking.service.ts`). Legacy coach-initiated flow (POST `/coaches/sessions` + book-court/accept/decline) removed in AUD-003 G2-A.
- **Admin:** `listTournamentsAdmin`, `deleteTournament`, `listAcademiesAdmin`, `updateAcademy`, `deleteAcademy`, `listCoachesAdmin`, `updateCoachAdmin`, `deleteCoach`, `verifyCoach`, `toggleCoachAvailability`

## 4. Domain Model

`activities-aggregate.ts` defines a generic `ActivityRecord` interface with status state machine:

```
scheduled → in_progress → completed
         ↘ cancelled
```

## 5. Event Emissions

Events emitted via `eventBusV2`:
- `tournament:created` — on tournament creation
- `tournament:match-scheduled` — per match in generated bracket
- `tournament:result` — per player on match score entry
- `academy:enrolled` — on player enrollment
- `coach:agreement-added` — on org agreement creation
- `coaching:session-scheduled` — on coach session creation (emitted by canonical `/scheduling/book`)
- `coaching:session-cancelled` — templates/engine retain the mapping, but no active producer since the legacy `declineCoachSession` emit was removed (AUD-003 G2-A)
- `organisation:approved` / `organisation:rejected` — forwarded from approvals

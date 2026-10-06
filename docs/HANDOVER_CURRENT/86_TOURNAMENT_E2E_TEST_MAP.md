# 86_TOURNAMENT_E2E_TEST_MAP.md

**Date:** 2026-10-06
**Stage:** Stage 1 — E2E discovery / executable test map (no execution)
**Type:** Documentation only

---

## 1. Purpose

Build an accurate, executable E2E test map for the current CourtZon application, focused on
tournament functionality, to be run like a real user. This stage produced **no source changes**.

---

## 2. Current application routes relevant to E2E

### Authentication / landing
| Route | Component | Guard |
|---|---|---|
| `/login` | `LoginPage` | `LandingRoute` (redirects authenticated users home) |
| `/forgot-password`, `/reset-password`, `/temporary-reset-password` | `ForgotPasswordPage` / `ResetPasswordPage` / `TemporaryResetPasswordPage` | `PublicRoute` |
| `/` (landing), `/:slug` | `LandingPage` | `LandingRoute` |
| `/registration*` path | `*RegisterPage` | `PublicRoute` / feature flags |

### Protected player (AppLayout)
| Route | Component |
|---|---|
| `/app` | `PlayerDashboardPage` |
| `/tournaments` | `TournamentListPage` |
| `/tournaments/:id` | `TournamentDetailPage` (tabs: overview / bracket / matches / standings / players; holds `TournamentBracket`, `MatchCard`, `MatchDetailsDrawer`, `TournamentPrintView`) |
| `/tournaments/:id/team` | `PlayerTeamPage` |
| `/my/tournaments` | `PlayerTournamentsPage` |
| `/matches`, `/matches/:id`, `/matches/:id/result` | `MatchListPage` / `MatchLobbyPage` / `MatchResultPage` |
| `/my/match-results` | `MatchResultHistoryPage` |
| `/notifications` | `NotificationsPage` |

### Admin (AdminRoute, AdminLayout)
| Route | Component |
|---|---|
| `/admin`, `/admin/tournament/dashboard` | `AdminDashboard` / `TournamentDashboardPage` |
| `/admin/tournament/list` | `TournamentListAdminPage (mode=admin)` |
| `/admin/tournament/list/:id` | `TournamentDetailAdminPage (mode=admin)` (bracket + drawer + print) |
| `/admin/tournament/list/:id/participants` | `TournamentParticipantsPage` |
| `/admin/tournament/list/:id/draw` | `TournamentDrawPage` |
| `/admin/tournament/list/:id/schedule` | `TournamentSchedulePage` |
| `/admin/tournament/matches` | `TournamentMatchesAdminPage` (drawer) |
| `/admin/match-results` | `AdminMatchResultsPage` |
| `/admin/users`, `/admin/permissions`, `/admin/feature-flags` | RBAC/management |

### Organisation (OrgRoute → OrgApprovedGuard → OrgLayout)
| Route | Component |
|---|---|
| `/org/:orgId/tournaments` | `OrgTournamentsPage` |
| `/org/:orgId/tournaments/:id` | `OrgTournamentDetailPage` (thin wrapper over the admin detail page, `mode=org`) |
| `/org/:orgId/tournaments/:id/participants` | `TournamentParticipantsPage mode=org` |
| `/org/:orgId/tournaments/:id/draw` | `TournamentDrawPage mode=org` |
| `/org/:orgId/tournaments/:id/schedule` | `TournamentSchedulePage mode=org` |
| `/org/:orgId/matches`, `/org/:orgId/match-results` | `OrgMatchesPage` / `OrgMatchResultsPage` |
| `/org/:orgId/pending-approval` | `OrgPendingApprovalPage` |

### Referee (RefereeRoute)
| Route | Component |
|---|---|
| `/referee`, `/referee/dashboard` | `RefereeDashboardPage` |
| `/referee/assignments` | `RefereeAssignmentsPage` (TournamentBracket + MatchDetailsDrawer, tabs upcoming/completed/bracket) |
| `/referee/matches` | `RefereeMatchHistoryPage` |
| `/referee/availability` | `RefereeAvailabilityPage` |
| `/referee/profile` | `RefereeProfilePage` |

### Public (no auth)
| Route | Component |
|---|---|
| `/tournaments/public` | `PublicTournamentsPage` |
| `/tournaments/public/:id` | `PublicTournamentDetailPage` (TournamentBracket; no drawer) |
| `/tournaments/public/:id` bundle data source | `GET /public/tournaments/:id` |

---

## 3. Roles and accessible tournament surfaces

| Role | Tournament surfaces | Holder |
|---|---|---|
| Player | `/tournaments`, `/tournaments/:id`, `/my/tournaments`, `/matches/:id`, `/matches/:id/result`, `/my/match-results` | TEST_PLAYER 133, TEST_PLAYER2 134 |
| Organizer | `/org/35/tournaments*` | TEST_MANAGER 128 (org 35) |
| Admin | `/admin/tournament/*` | TEST_ADMIN 127 |
| Super Admin | all admin surfaces incl. `bracket-types`, `match-results`, workbench cross-org registration | TEST_SUPERADMIN 126 |
| Receptionist / Accountant / Coach / Seller | non-tournament admin/org fields (booking, finance, coaching) — no dedicated tournament bracket surface | 129 / 130 / 131 / 136 |
| Referee | `/referee/*` (assignments, match history) | TEST_REFEREE 132 |
| Public | `/tournaments/public*` | anonymous |

All bracket surfaces render the **same shared** `TournamentBracket`/`MatchCard`/`MatchDetailsDrawer`;
there is no role-specific bracket implementation.

### Guard behavior (verified in `App.tsx`)
- `ProtectedRoute` → redirects to `/login` when unauthenticated; admin roles accessing `/app` → `/admin`.
- `AdminRoute` → requires auth + admin role else `/`.
- `RefereeRoute` → requires auth + `referee.dashboard.view` else user home.
- `OrgRoute` → requires auth + at least one org scope else `/`.
- `OrgApprovedGuard` → pending-approval orgs see `/org/:orgId/pending-approval`.
- `LandingRoute`/`PublicRoute` → redirect authenticated users to their home.
- Unknown path → `NotFoundPage`.

---

## 4. Verified test identities (context)

> **Discovery note:** the running Docker DB (`courtzon_v3`, 74 users / 3 tournaments) does **not**
> contain these identities. The list below is the project-provided test roster and is expected to be
> present in the **local XAMPP / Hostinger `courtzon_v2`** database that E2E execution must target.
> Read-only DB access with the available root password was **not available** in this discovery
> run (access denied on `127.0.0.1:3306`); the first execution step must re-verify these records.

| Role | id | Notes |
|---|---|---|
| TEST_SUPERADMIN | 126 | admin role incl. super-admin/master-admin |
| TEST_ADMIN | 127 | admin |
| TEST_MANAGER | 128 | org 35 operator |
| TEST_RECEPTIONIST | 129 | org 35 staff |
| TEST_ACCOUNTANT | 130 | org 35 staff |
| TEST_COACH | 131 | coach |
| TEST_REFEREE | 132 | referee |
| TEST_PLAYER | 133 | player |
| TEST_PLAYER2 | 134 | player (winner of Tournament 5) |
| TEST_SELLER | 136 | seller |
| TEST_ORG | 35 | TEST_MANAGER / TEST_ADMIN org |
| TEST_ORG main branch | 21 | booking/court ownership |
| TEST_COURT_1 | 6 | court resource |

**Login method:** country + phone number + password (`POST /auth/login`), session via httpOnly
cookie + `GET /auth/refresh` + `GET /auth/me` (see `auth.store.ts`). Exact phone numbers/passwords
for the test roster must be provided from test fixtures before execution (not present in code).

### Existing safe test tournaments (DO NOT MODIFY)
| Field | Tournament 4 | Tournament 5 |
|---|---|---|
| Name | TEST_TOURNAMENT_T001 | TEST_TOURNAMENT_RESULT_01 |
| Org | 35 | 35 |
| Status | `in_progress` (registration_open draw locked, match scheduled) | completed |
| Draw | 1 (locked) | 2 (locked) |
| Tournament match | 1 (scheduled 2026-10-10 10:00–11:30, court 6, referee 1=TEST_REFEREE) | 2 (result submitted, completed 2–1, winner TEST_PLAYER2, submission_status `pending_confirmation`) |
| Public match | 14 | 15 |
| Hard rule | Do not modify. Do not accept/complete/cancel/alter Tournament 5's result. |

---

## 5. E2E test case groups

Legend: **P0** critical · **P1** important · **P2** secondary · Mutating = alters data (do not run in
read-only discovery; run only in a controlled mutation stage with cleanup).

### A — AUTHENTICATION

| ID | Role | Pre | Start | Actions | Expected | Mutating | Priority |
|---|---|---|---|---|---|---|---|
| AUTH-01 | Any | DB roster seeded | `/login` | Enter TEST_PLAYER phone+password, submit | Redirect to home workspace; nav shows user; roles/permissions present | No | P0 |
| AUTH-02 | Any | wrong password | `/login` | Submit invalid password | Inline/root error; stays on `/login`; no session | No | P0 |
| AUTH-03 | Any | authenticated | `/login` | Open `/login` while logged in | `LandingRoute` redirects to home | No | P1 |
| AUTH-04 | Player | authenticated | nav "Logout" | Click logout | Returns to landing/login; protected routes now redirect `/login` | No (clears local/reduces tokens) | P1 |
| AUTH-05 | SuperAdmin | none | `/admin/tournament/list` unauthenticated | Direct URL | Redirect `/login` | No | P0 |
| AUTH-06 | Player | none | unauthenticated `/app`, `/tournaments` | Direct URL | Redirect `/login` | No | P0 |
| AUTH-07 | Admin | authenticated | `/app` | Direct URL | `ProtectedRoute` redirects `→ /admin` | No | P1 |
| AUTH-08 | Player | authenticated | `/admin` | Direct URL | `AdminRoute` redirects `→ /` | No | P1 |
| AUTH-09 | Any | authenticated | reload several protected pages | Refresh `/tournaments`, `/profile` | Session persists via `/auth/refresh`+`/auth/me`; user remains logged in | No | P1 |
| AUTH-10 | Any | none | `/bogus` | Navigate | `NotFoundPage` renders | No | P2 |

### B — PLAYER FLOW

| ID | Role | Pre | Start | Actions | Expected | Mutating | Priority |
|---|---|---|---|---|---|---|---|
| P-01 | Player | auth | `/tournaments` | Load list | Tournaments visible w/ name/sport/status; row click opens detail | No | P0 |
| P-02 | Player | auth | `/tournaments/:id` (T4) | Open detail | Tabs render (overview/bracket/matches/standings/players); status shown (`in_progress` for T4) | No | P0 |
| P-03 | Player | auth | `/tournaments/:id` overview | Read headline | Sport • bracket type • fee • dates • organizer; registration status line | No | P0 |
| P-04 | Player | auth | `/tournaments/:id` Bracket tab | Open Bracket tab | Shared `TournamentBracket` renders; columns ordered by round | No | P0 |
| P-05 | Player | auth, TEST_PLAYER is a participant | Bracket | Inspect own match | Current-player highlighted (primary bold + emphasis) on their `MatchCard` | No | P0 |
| P-06 | Player | auth | Bracket → tap a `MatchCard` | Open match details | `MatchDetailsDrawer` opens as a bottom-sheet/centered dialog (`role="dialog"`, focus enters) | No | P0 |
| P-07 | Player | auth | Drawer on T4 match | Inspect sections | MATCH (single score between players) • SCHEDULE (10:00–11:30) • VENUE (court 6 name) • OFFICIAL (Test Referee) • RESULT if present | No | P0 |
| P-08 | Player | auth | Drawer | Read score/winner | Score appears **once**; winner side has "Winner" badge; loser muted; initials avatars rendered | No | P0 |
| P-09 | Player | auth | Drawer nav | Click Previous/Next | Only enabled when progression unambiguous; selecting updates drawer, stays open; disabled otherwise | No | P0 |
| P-10 | Player | auth | Drawer Escape / close | Close drawer | Dialog closes; focus returns to opener | No | P0 |
| P-11 | Player | auth, T5 | `/tournaments/:id` (T5) drawer | Open completed match | Result shows 2–1, winner TEST_PLAYER2; no duplicated score | No | P0 |
| P-12 | Player | auth | Bracket on mobile | Narrow viewport | Horizontal scroll no page overflow; cards readable; drawer sheet usability | No | P1 |
| P-13 | Player | auth | detail page print | Click print "Tournament Bracket" (player page) | Print dialogue; printed bracket readable (winner via score + badge, not color-only) | No (print only) | P2 |
| P-14 | Player | auth | `/tournaments/:id`, then reload | Refresh while viewing | Data reloads from `/tournaments/:id/matches`; drawer state resets (closed); no crash | No | P1 |
| P-15 | Player | auth | List → Detail, then browser Back/Forward | Use history | Back returns to list; Forward returns to detail; state sane | No | P1 |
| P-16 | Player | auth, T4 registration_open, no existing reg | `/tournaments/:id` Register button | Open Register modal (flow) | Shows effective payment method (Cash/Card) or free; **do not submit** in read-only stage | **Yes if submitted** (creates registration; requires cancel cleanup) | P1 |
| P-17 | Player | auth | `/my/tournaments` | Load | Shows tournaments the player is registered in | No | P1 |

### C — ORGANIZER / ADMIN FLOW

| ID | Role | Pre | Start | Actions | Expected | Mutating | Priority |
|---|---|---|---|---|---|---|---|
| O-01 | Manager 128 / Admin 127 | auth | `/org/35/tournaments` or `/admin/tournament/list` | Load list | Org-scoped / admin tournament list renders | No | P0 |
| O-02 | Manager | auth | `/org/35/tournaments/:id` (T4) | Open detail | Shared bracket + admin matches table + tabs; org/tenant scoping enforced | No | P0 |
| O-03 | Admin | auth | `/admin/tournament/list/:id` (T4) | Open detail | Same shared bracket; administrative matches table still present | No | P0 |
| O-04 | Admin/Org | auth | Detail → Bracket | Open Bracket tab | Drawer opens from bracket; Details / Record Result footer actions gated by `tournaments.enter_scores` / `tournament.result.manage` | No | P0 |
| O-05 | Admin/Org | auth | `/admin/tournament/list/:id/participants` (T4) | Load | Participant/registration table + seeds renders (T4 draw locked) | No | P1 |
| O-06 | Admin/Org | auth | Schedule page T4 | Load `/org/35/tournaments/4/schedule` | Match scheduled 2026-10-10 10:00–11:30 on court 6 with referee | No | P1 |
| O-07 | Admin | auth | `/admin/tournament/matches` | Load | Match list; drawer opens per row | No | P1 |
| O-08 | Admin/SuperAdmin | auth | `/admin/match-results` | Load | T5 result visible (pending_confirmation); row action present (Review) — **do not accept/cancel** | No | P1 |
| O-09 | Admin | auth | Detail T4 | Inspect status actions | Actions shown per status (start/complete/cancel/…); buttons permission-checked | No | P1 |
| O-10 | Admin | auth | `/admin/tournament/list/:id` print | Print bracket | Readable print from admin surface | No | P2 |
| O-11 | Admin/SuperAdmin | auth | `/admin/tournament/list/:id` register | Register a participant via admin | **Mutating** → deferred (creates/confirms registration; cleanup required) | **Yes** | P2 |
| O-12 | Admin/SuperAdmin | auth | `/admin/tournament/list/:id/draw` | Inspect draw | Draw 1/2 locked state read-only; move/approve/lock are gated mutating actions (deferred) | Mixed | P1 |
| O-13 | Manager | auth | `/org/35/tournaments/new` | Open create form | Feature-flag/permission gating; fields gated (venue ungated, daily window gated by `tournaments.create.prize`) | No (do not submit) | P1 |
| O-14 | Admin | auth (cross-org) | `/admin/tournament/list/:id/register` | Admin-register a participant | Org-aware guard (G11.21.4). **Mutating** → deferred | **Yes** | P2 |

### D — REFEREE FLOW

| ID | Role | Pre | Start | Actions | Expected | Mutating | Priority |
|---|---|---|---|---|---|---|---|
| R-01 | Referee 132 | auth | `/referee/assignments` | Load | T4 match assigned to TEST_REFEREE appears; tabs Upcoming/Completed/Bracket | No | P0 |
| R-02 | Referee | auth | Assignments → Bracket tab | Open bracket | Shared TournamentBracket for the referee's assignments only | No | P0 |
| R-03 | Referee | auth | Assignments table row → Details | Open drawer | Drawer shows match details (court, referee, schedule) | No | P0 |
| R-04 | Referee | auth | Assignments row actions | Inspect Accept/Decline | Present and gated by `referee.assignments.manage`; **mutating** → deferred | **Yes if used** | P1 |
| R-05 | Referee | auth | `/referee/matches` history | Load | Match history incl. completed matches | No | P1 |
| R-06 | Referee | auth | `/referee` direct URL | Direct access | Dashboard renders; without `referee.dashboard.view` → redirect home | No | P1 |

### E — PUBLIC FLOW

| ID | Role | Pre | Start | Actions | Expected | Mutating | Priority |
|---|---|---|---|---|---|---|---|
| PUB-01 | anonymous | none | `/tournaments/public` | Load | Public tournament list renders without auth | No | P0 |
| PUB-02 | anonymous | none | `/tournaments/public/:id` (T4) | Load | Public detail incl. shared bracket (participant names only fallback) | No | P0 |
| PUB-03 | anonymous | none | Public detail | Inspect match cards | Score present; names via participant fallback; no P{id} leak in bracket/drawer (drawer not rendered publicly) | No | P0 |
| PUB-04 | anonymous | none | Public detail on mobile | Narrow viewport | Bracket scrolls horizontally; no page overflow | No | P1 |
| PUB-05 | anonymous | none | `/tournaments/public/:id` then login redirect | Try to sign in while browsing | `/login` is available; after login user goes to their home (not forced into public page) | No | P1 |
| PUB-06 | anonymous | none | `/public/...` unknown id | Invalid public id | Degrades gracefully (error/empty) — see EDGE-07 | No | P1 |

### F — RESPONSIVE / UX

| ID | Device | Target | Actions | Expected | Mutating | Priority |
|---|---|---|---|---|---|---|
| RESP-01 | Desktop 1440 | `/tournaments/:id` Bracket | Inspect all rounds | Columns fill width; no horizontal overflow; cards legible | No | P0 |
| RESP-02 | Tablet ~768 | Bracket + Drawer | Open drawer | Drawer centered panel; no clipped content; buttons tappable | No | P1 |
| RESP-03 | Mobile ~390 | Bracket | Scroll dashboard | Horizontal scroll only within bracket scroller; page itself no horizontal overflow | No | P0 |
| RESP-04 | Mobile | Drawer | Open full drawer + nav | Bottom sheet with scroll; Previous/Next reachable; no content clipped behind BottomNav | No | P1 |
| RESP-05 | Mobile | Drawer focus | Tab through drawer | Focus cycles inside dialog; Escape closes; focus returns to opener | No | P1 |
| RESP-06 | Mobile | Long player names | Bracket | Names truncate or wrap; no overflow/clipping | No | P2 |
| RESP-07 | All | Reduced motion | Toggle OS reduced-motion | Bracket entrance/hover animations disabled; content stable | No | P2 |
| RESP-08 | All | Print | window.print() from player/admin detail | Print layout: headers black + rule, cards have borders, winners not colour-only, no nav controls | No | P2 |

### G — ERROR / EDGE CASES

| ID | Pre | Start | Actions | Expected | Mutating | Priority |
|---|---|---|---|---|---|---|
| EDGE-01 | tournament with no matches generated | `/admin/tournament/list/:id` Bracket | Empty bracket | "Bracket not yet generated." empty state; no crash | No | P1 |
| EDGE-02 | match with no result (T4 match 1, scheduled) | Drawer | Open | No duplicate score; "vs" or no score line; no winner badge; status Scheduled | No | P0 |
| EDGE-03 | match with winner (T5 match 2) | Drawer | Open | 2–1 winner TEST_PLAYER2; winner emphasised, loser muted | No | P0 |
| EDGE-04 | missing referee | any match | Drawer | OFFICIAL section shows neutral "Not available" (never `#<id>`) | No | P1 |
| EDGE-05 | missing court/venue | any match | Drawer | VENUE section absent or "Not available"; never `#<id>` | No | P1 |
| EDGE-06 | bye/TBD participant | bracket with unfilled slot | Bracket card | Card shows Bye/TBD label + safe initials fallback; no P{id} in drawer | No | P1 |
| EDGE-07 | invalid match id | `/matches/999999` | Direct URL | 404/degraded; no crash | No | P1 |
| EDGE-08 | invalid tournament id | `/tournaments/999999` | Direct URL | Error state; no crash | No | P1 |
| EDGE-09 | stale data | T4 detail → another user updates T5 | Re-fetch / refresh | Refresh reflects latest result; no optimistic mismatch locks UI | No | P1 |

### H — REAL-TIME / STATE

| ID | Observation | Test | Expected | Mutating | Priority |
|---|---|---|---|---|---|
| RT-01 | No Socket.IO listener exists in any tournament page (verified: no socket hooks in tournament components) | Monitor during execution | Live updates are **not** pushed to the bracket UI today; state changes appear after refetch/refresh | No | P2 |
| RT-02 | Result submission (admin) | Submit a **sandbox** result, observe player page | Requires re-fetch to reflect; note current behaviour | **Yes (sandbox only)** | P2 |
| RT-03 | Notifications platform | Confirm `GET /notifications` reflects tournament events | In-app notification seeded for registration/result events where enabled | No | P2 |

> Real-time item is recorded as "currently not exposed at the tournament UI layer" — it is not a
> supported flow, so the map does not assume live bracket updates.

---

## 6. Priority counts

| Group | P0 | P1 | P2 | Total |
|---|---|---|---|---|
| Authentication | 4 | 5 | 1 | 10 |
| Player | 11 | 5 | 1 | 17 |
| Org/Admin | 4 | 7 | 3 | 14 |
| Referee | 3 | 3 | 0 | 6 |
| Public | 3 | 3 | 0 | 6 |
| Responsive | 2 | 3 | 3 | 8 |
| Error/Edge | 2 | 7 | 0 | 9 |
| Real-time | 0 | 0 | 3 | 3 |
| **Total** | **29** | **33** | **11** | **73** |

**Overall: 73 cases.** 67 are read-only (safe). **6 are mutation-involved and deferred to a
controlled mutation stage with explicit cleanup** (P-16 registration, O-11/O-14 admin registration,
O-12 draw actions, R-04 referee accept/decline, RT-02 sandbox result submission). AUTH-04 (logout) is
session-scoped and leaves no persistent tournament data change.

## 7. Recommended execution order

1. **Baseline health:** `/health`, `/health/ready`; confirm DB roster (identities 126–136, org 35, branch 21, court 6, T4/T5).
2. **Authentication (read-only):** AUTH-01 → AUTH-06 → AUTH-08/09/10 (logins per role, session persistence, direct-URL guards).
3. **Public:** PUB-01 → PUB-02 → PUB-03 → PUB-06.
4. **Player read + UX:** P-01 → P-02 → P-04 → P-05 → P-06 → P-07 → P-08 → P-09 → P-10 → P-11 → P-14 → P-15 → P-17.
5. **Responsive:** RESP-01 → RESP-03 → RESP-04 → RESP-05 → RESP-06 → RESP-07 (mobile + tablet first; desktop last).
6. **Organizer/Admin (read):** O-01 → O-02 → O-03 → O-04 → O-05 → O-06 → O-07 → O-08 → O-09 → O-12 (read-only parts).
7. **Referee (read):** R-01 → R-02 → R-03 → R-05 → R-06.
8. **Edge cases:** EDGE-01 → EDGE-02 → EDGE-03 → EDGE-04 → EDGE-05 → EDGE-06 → EDGE-07 → EDGE-08 → EDGE-09.
9. **Print:** P-13 / O-10 / RESP-08.
10. **Deferred mutation stage (separate controlled run with cleanup):** registration (P-16), admin register (O-11/O-14), referee accept/decline (R-04), draw actions (O-12 mutating part), result submission (RT-02 on sandbox only). **Never** against Tournament 4/5.

## 8. Blockers for actual execution

1. **Test-DB credentials/roster unknown in this environment.** Read-only access to `courtzon_v2`
   (127.0.0.1:3306) was denied with the available root password, and the Docker DB does not contain
   tournament 4/5. Execution requires working login credentials (phone/password) for users 126–136
   and confirmed T4/T5 records.
2. **Login credential fixture.** Phone numbers/passwords for the TEST_* roster are not in the code —
   they must be supplied by test fixtures.
3. **Forbidden-touch guardrails.** T4 and T5 are locked as read-only fixtures; the refactor/result
   flow must never accept/complete/cancel T5's `pending_confirmation` result, and never alter T4.
4. **Mutation cleanup.** Any registration acceptance (P-16/O-11/O-14), referee accept/decline (R-04),
   or draw/result action (O-12/RT-02) mutates data — they are deferred to a controlled mutation stage
   with an explicit cleanup plan (cancel registration, decline acceptance, revert result on a sandbox
   tournament only).
5. **Real-time.** No Socket.IO integration exists in the tournament UI — assertions about live updates
   are recorded as current-behaviour observations only.

---

## 9. Verification performed for this map
- Frontend routes + guards (`App.tsx`), auth store (`auth.store.ts`), player/admin/org/referee
  tournament pages, shared `TournamentBracket`/`MatchCard`/`MatchDetailsDrawer`/`TournamentPrintView`.
- Backend API surface: player (`/tournaments…`), admin (`/admin/tournaments…` incl. draw, schedule,
  result, register with org-scope guard), org (`/org/:orgId/tournaments…`), public
  (`/public/tournaments…`), referee (`/referee/assignments…`, accept/decline).
- Verified no Socket.IO listener exists in tournament UI. Verified the 9 pre-existing test failures were
  resolved (suite green) — not part of this E2E map.
- No source, backend, database, or Docker changes were made.
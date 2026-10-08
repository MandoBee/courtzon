# Tournament Matches Consolidation Audit

> Read-only architecture & UX audit — repository state at `648c11db` (Step 2B-2).
> No files other than this document were created or modified.

## 1. Executive Verdict

Tournament matches are currently implemented in **six partially-overlapping surfaces**, plus a separate shared Match/Result module that tournament matches pass through:

1. **Tournament Hub → Matches** (read-only table) — `pages/admin/tournament/TournamentDetailPage.tsx`
2. **Standalone Tournament Matches** (full management) — `pages/admin/tournament/TournamentMatchesPage.tsx`
3. **Tournament Schedule** (generation + scheduling) — `pages/admin/tournament/TournamentSchedulePage.tsx`
4. **Match Results (admin/org)** (shared result approval/dispute/correction) — `pages/admin/match-results/AdminMatchResultsPage.tsx`, `pages/org/Matches/OrgMatchResultsPage.tsx`
5. **Matches monitor (admin/org)** (shared match lifecycle list) — `pages/admin/Matches/AdminMatchesPage.tsx`, `pages/org/Matches/OrgMatchesPage.tsx`
6. **Shared Match Session pages** (lobby / result entry / history for players & referees) — `pages/booking/MatchLobbyPage.tsx`, `pages/booking/MatchResultPage.tsx`, `pages/booking/MatchListPage.tsx`, `pages/booking/MatchResultHistoryPage.tsx`
7. **Match Details Drawer** (read-only modal) — `components/tournaments/MatchDetailsDrawer.tsx`

**Verdict:** The consolidated target is correct and low-risk: make **Tournament Hub → Matches** the single management surface by absorbing the standalone Tournament Matches capabilities (result entry, start/complete, court/referee assign), while keeping **Match Results** and **Matches Monitoring** as shared-module surfaces conceptually reachable **through** the Hub (Results tab / Live tab) rather than as separate tournament-level screens. No DB change is required. The main risks are (a) losing the standalone page's result-entry and court/referee-assignment actions, and (b) the existing GSK realtime gap (groups/knockout generation events are still not published to Socket.IO).

## 2. Existing Match Surfaces

| # | Surface | File | Route(s) | Role | Tournament-specific |
|---|---|---|---|---|---|
| 1 | Hub Matches tab | `pages/admin/tournament/TournamentDetailPage.tsx` | `/admin/tournament/list/:id` (+ org `/org/:orgId/tournaments/:id`) | Admin/Org | Yes |
| 2 | Standalone Tournament Matches | `pages/admin/tournament/TournamentMatchesPage.tsx` | `/admin/tournament/matches` | Admin | Yes |
| 3 | Tournament Schedule | `pages/admin/tournament/TournamentSchedulePage.tsx` | `/admin/tournament/list/:id/schedule` (+ org `/org/:orgId/tournaments/:id/schedule`) | Admin/Org | Yes |
| 4 | Match Results (admin) | `pages/admin/match-results/AdminMatchResultsPage.tsx` | `/admin/match-results` | Admin | No (shared) |
| 5 | Match Results (org) | `pages/org/Matches/OrgMatchResultsPage.tsx` | `/org/:orgId/match-results` | Org | No (shared) |
| 6 | Matches monitor (admin) | `pages/admin/Matches/AdminMatchesPage.tsx` | `/admin/matches` | Admin | No (shared) |
| 7 | Matches monitor (org) | `pages/org/Matches/OrgMatchesPage.tsx` | `/org/:orgId/matches` | Org | No (shared) |
| 8 | Match Lobby (shared session) | `pages/booking/MatchLobbyPage.tsx` | `/matches/:id` | Player/Referee/Any participant | No (session) |
| 9 | Match Result entry (shared) | `pages/booking/MatchResultPage.tsx` | `/matches/:id/result` | Player/Referee/Org | No (session) |
| 10 | My Match Results | `pages/booking/MatchResultHistoryPage.tsx` | `/my/match-results` | Player | No |
| 11 | My Matches list | `pages/booking/MatchListPage.tsx` | `/matches` | Player | No |
| 12 | Referee Assignments | `pages/referee/RefereeAssignmentsPage.tsx` | `/referee/assignments` | Referee | Yes (tournament+non) |
| 13 | Referee Match History | `pages/referee/RefereeMatchHistoryPage.tsx` | `/referee/matches` | Referee | No |
| 14 | Match Details Drawer | `components/tournaments/MatchDetailsDrawer.tsx` | (modal, used by 1 & 2 & bracket) | All roles | Yes |

## 3. Frontend Route Inventory

| Route (App.tsx) | Page | Purpose | Role | Tournament-specific | Duplicate? | Keep/Redirect/Consolidate |
|---|---|---|---|---|---|---|
| `/tournaments/public/:id` (638-639) | `PublicTournamentDetailPage` | Public tournament + GSK views | Public | Yes | no | Keep (read-only) |
| `/matches` (650) | `MatchListPage` | Player's matches (shared sessions) | Player | No | no | Keep (shared) |
| `/matches/:id` (651) | `MatchLobbyPage` | Shared match session lobby | Player/Referee | No | no | Keep (shared; drawer/deep-link target for Instances) |
| `/matches/:id/result` (652) | `MatchResultPage` | Score entry (shared) | Player/Referee | No | no | Keep (shared; reached from Hub "Record Result") |
| `/my/match-results` (653) | `MatchResultHistoryPage` | Player result history | Player | No | no | Keep |
| `/tournaments` , `/tournaments/:id` (666-667) | consumer list/detail | Legacy consumer tournament screens | Player | Yes | superseded by `/my/tournaments` + public | Deprecate later (out of scope here) |
| `/referee/assignments` (720) | `RefereeAssignmentsPage` | Referee match assignments | Referee | Partly | no | Keep |
| `/referee/matches` (721) | `RefereeMatchHistoryPage` | Referee history | Referee | No | no | Keep |
| `/admin/tournament/dashboard` (780) | `TournamentDashboardPage` | Tournament dashboard | Admin | Yes | no | Keep |
| `/admin/tournament/list/:id` (783) | **Hub `TournamentDetailPage`** | Tournament Hub (tabs) | Admin | Yes | **duplicates the standalone matches+schedule+participants+draw** | **Canonical target** |
| `/admin/tournament/list/:id/participants` (785) | `TournamentParticipantsPage` | Participants | Admin | Yes | also reachable as Hub tab | Keep-route; Hub embeds it (line 514) |
| `/admin/tournament/list/:id/draw` (786) | `TournamentDrawPage` | Draw | Admin | Yes | also Hub Competition tab | Keep-route; Hub embeds it |
| `/admin/tournament/list/:id/schedule` (787) | `TournamentSchedulePage` | Generate + schedule | Admin/Org | Yes | **currently only route for scheduling** | **Consolidate INTO Hub Matches** |
| `/admin/tournament/matches` (788) | `TournamentMatchesPage` | **Standalone tournament match management** | Admin | Yes | **duplicates Hub Matches (read) + adds actions** | **Consolidate INTO Hub Matches** |
| `/admin/tournament/bracket-types` (789) | Bracket types | Bracket CRUD | Admin | Yes | no | Keep |
| `/admin/matches` (791) | `AdminMatchesPage` | Shared matches monitor (all match sessions) | Admin | No | no | Keep (shared) |
| `/admin/match-results` (790) | `AdminMatchResultsPage` | Shared result approval/dispute | Admin | No | no | Keep (shared); surface as Hub "Results" entry |
| `/admin/tournaments` (779) | `TournamentAdminPage` | Legacy admin list | Admin | Yes | superseded by `/admin/tournament/list` | Deprecate later (already flagged in prior audit) |
| `/org/:orgId/matches` (884) | `OrgMatchesPage` | Org shared matches monitor | Org | No | no | Keep (shared) |
| `/org/:orgId/match-results` (885) | `OrgMatchResultsPage` | Org result approval | Org | No | no | Keep (shared); entry from Hub org "Results" |
| `/org/:orgId/tournaments/:id` (919) | `OrgTournamentDetailPage` | Org Hub (same component `TournamentDetailPage` w/ mode=org) | Org | Yes | same as admin Hub | **Canonical (org)** |
| `/org/:orgId/tournaments/:id/schedule` (922) | `TournamentSchedulePage` (mode=org) | Org schedule | Org | Yes | duplicates Hub | Consolidate |

## 4. Navigation Inventory

| Label | Route | Role | Source | Duplicates Hub? |
|---|---|---|---|---|
| Tournament | `/admin/tournament/list` | Admin | `AdminSidebar` (keys `sidebar.tournament`, `sidebar.tournament-list`, `sidebar.tournament-matches`, `sidebar.tournament-dashboard`) | — |
| "Tournament Matches" (sidebar section) | `/admin/tournament/matches` | Admin | `AdminSidebar` (`sidebar.tournament-matches`, registry.ts:752) | **Yes — standalone screen duplicating Hub** |
| Match Results | `/admin/match-results` | Admin | `AdminSidebar` | No (shared) — but overlaps tournament result actions |
| Matches | `/admin/matches` | Admin | `AdminSidebar` | No (shared monitor) |
| Org Matches / Org Match Results | `/org/:orgId/matches` , `/org/:orgId/match-results` | Org | Org sidebar | No (shared) |
| Refresh "Matches", "Match Results" | `nav.tournaments` etc. | Player | BottomNav/App nav (App.tsx:470-471 `/tournaments`) | Legacy link `/tournaments` (consumer) |
| Referee sidebar matches/assignments | `/referee/matches` , `/referee/assignments` | Referee | Referee layout | No |

**Navigation to retire/redirect in a later phase:** `sidebar.tournament-matches` (standalone) — should point into the Hub's Matches tab (or the Hub only); the Hub already exposes a "Matches & Schedule" button (`TournamentDetailPage.tsx:684-690`) that jumps to the standalone schedule route — this link should eventually target in-Hub scheduling instead.

## 5. Tournament Hub Current Match Capabilities

Source: `pages/admin/tournament/TournamentDetailPage.tsx` (`TournamentDetailPage` used for both admin and org via `mode`).

- **Data source:** `tournamentApi.getMatches`/`orgTournamentApi.getMatches` → `GET /admin/tournaments/:id/matches` or `/org/:orgId/tournaments/:id/matches` (`service.getAdminMatches` → `tournamentService.getMatchesDetailed`); query key `['${keyRoot}-matches', tournamentId]` and `['tournament', tournamentId, 'matches']`.
- **Matches tab (lines 679-736):** read-only table — Round, Match No, Player1, Player2, Court, Referee, Status, Score, Details. `Details` opens `MatchDetailsDrawer` (read-only).
- **Bracket tab (lines 640-677):** `TournamentBracket` with per-match footer: **Details** + **Record Result** (`can('tournaments.enter_scores') && m.match_id != null && m.status !== 'completed'`) → navigates to shared `/matches/${m.match_id}/result`.
- **Schedule entry point:** "Matches & Schedule" button → standalone schedule route (lines 684-690) gated by `perms.update` (`tournament.update` / `org.tournaments.update`).
- **Result entry / start / complete / court / referee actions: ABSENT from Hub** (they live in the standalone `TournamentMatchesPage`).
- **Realtime:** Hub relies on React Query invalidation + socket events (`tournament.match-created`, `match-progressed`, `matches-generated`, `schedule-updated`, `court-reserved/released`, `result` etc. — see §13); hub-level invalidations refresh bracket/matches/standings.
- **GSK:** group matches appear in the same matches table; GSK group/knockout stages visible through `stage_id`; the Competition tab holds group/qualification/knockout views.

**Missing from Hub vs standalone/schedule:** result submission modal, match start/complete actions, inline court/referee assignment, match generation, auto-schedule, per-match scheduling modal, shared-status column, tournament filter (not needed inside the Hub).

## 6. Standalone Tournament Matches

Source: `pages/admin/tournament/TournamentMatchesPage.tsx` (route `/admin/tournament/matches`).

### Display
Table columns: Round, Match No, Player1, Player2, Court, Referee, Status (+ `shared_status` chip), Score, Actions. No stage/group columns; no pagination beyond a hardcoded 20 which is effectively unused (single tournament fetch).

### Filters
- Tournament dropdown (required) — `tournamentApi.getTournaments({limit:100})` → `'admin-tournaments-simple'`.
- No stage / group / court / referee / date / search filters. Status filter NONE (all statuses shown).

### Actions (row buttons)
- **Details** → `MatchDetailsDrawer`.
- **Assign Court** (`tournament.manage` — inline numeric resource ID input, not a picker).
- **Assign Referee** (`tournament.manage` — inline numeric referee ID input).
- **Start Match** (`tournament.manage`, shown when `shared_status==='closed'`) → `POST /admin/tournaments/matches/:matchId/start`.
- **Complete Match** (`tournament.manage`, when `in_progress||completed`) → `POST .../complete`.
- **Record Result** (`tournament.result.manage`) → result modal → `POST /admin/tournaments/matches/:matchId/result` with shared `RawMatchResultPayload` (outcome completed/walkover/forfeit/retired/abandoned + sets or goals or winnerSide), building payload per `rule_snapshot.score_structure` (lines 40-58, 268-330).

### Mutations / API
`tournamentApi.getMatches`, `recordResult`, `startMatch`, `completeMatch`, `assignCourt`, `assignReferee`. Permissions: page gated by `admin-tournaments.view`; actions by `tournament.manage` / `tournament.result.manage`.

### Realtime
Invalidates `['tournament-admin-matches']` and `['tournaments']` after mutations (no socket subscription of its own; relies on list refetch on navigation).

### Weaknesses
Inline numeric-id court/referee inputs (not pickers) — poor UX and error-prone; no court/referee dropdown lists; no stage/group filter; not accessible via Hub navigation (only sidebar).

## 7. Match Results

Sources: `pages/admin/match-results/AdminMatchResultsPage.tsx`, `pages/org/Matches/OrgMatchResultsPage.tsx` (nearly identical; org variant adds `orgId` scoping), backed by **shared module** `services/match-result.api.ts` and `components/match-result/*` (`DynamicResultForm`, `ResultSummaryView`).

- **Route:** `/admin/match-results`, `/org/:orgId/match-results`.
- **Purpose:** approve/reject (resolve) disputes, correct submitted results, view per-status result queue.
- **Filters:** result status — All / `pending_confirmation` / `approved` / `disputed` / `no_result`.
- **Actions:** Resolve dispute (approve or no-result + note) → `POST /admin/match-results/:resultId/resolve`; Correct result → `PUT /admin/match-results/:resultId/correct`; both gated by `matches.result.manage`.
- **Unique functions:** cross-tournament / cross-booking **result approval pipeline**, dispute resolution, result correction (with the pre-start knockout correction guard), which **no tournament surface currently exposes**.
- **APIs:** `GET /admin/match-results?status=` ; `POST .../resolve` ; `PUT .../correct` ; `GET /sports/:sportId/formats` (for rules).
- **Realtime:** invalidates `['admin-match-results', status]`; relies on socket `tournament.result` / `tournament.updated` + `match:result-*` invalidation for list refresh.
- **Tests:** `pages/admin/match-results/__tests__/AdminMatchResultsPage.spec.tsx`.

**Recommendation:** Match Results is genuinely a shared, cross-entity approval surface. It should NOT be absorbed into tournament-only UI; instead the Hub should offer a per-tournament **Results** entry (filtered view of the same admin-match-results API scoped to the tournament) — or simply a link into `/admin/match-results`. Do not duplicate the resolve/correct logic.

## 8. Matches Monitoring

Sources: `pages/admin/Matches/AdminMatchesPage.tsx`, `pages/org/Matches/OrgMatchesPage.tsx`.

- **Route:** `/admin/matches`, `/org/:orgId/matches`.
- **Purpose:** monitor ALL shared match sessions (open/full/closed/in_progress/completed/cancelled/void) — bookings, academy, tournament matches alike; `AdminMatchRow` includes sport, branch, org, resource, booking date/time, participant count, `resultEntryOpen`, `pendingRequests`.
- **API:** `GET /admin/matches` / `/org/:orgId/matches` (`fetchAdminMatches`/`fetchOrgMatches`, `services/match-result.api.ts`).
- **Realtime:** no socket subscription; list refresh on navigation. Invalidation keys `['admin-matches', status]` / org equivalent.
- **Verdict: B** — it is a **generalized live/monitoring dashboard across match kinds**, not a tournament duplicate. Tournament matches appear here through their shared `matches` rows.
- **Target:** keep it as the shared platform monitor; inside the Hub, add a **Live / Monitoring** tab ONLY if it shows tournament-scoped live status (courts, in-progress, upcoming within the tournament). Evidence does not currently support a rich watch view — a minimal Hub "Live" tab would simply filter `getMatchesDetailed` by status. Do not build a big dashboard unless requirements demand it.

## 9. Match Details Drawer

Source: `components/tournaments/MatchDetailsDrawer.tsx`.

- **Read-only, universal, role-agnostic.** Fields: match info (players/score/status/round/match no), schedule (date/start/end), venue (court name), official (referee name), booking (present/absent), result (via `ResultSummaryView` when `resultRecord` provided — the consumer page passes the shared result record), bracket navigation (previous/next when `matches` + `onSelectMatch` supplied — page-local, no network).
- **Permissions:** none enforced inside — visibility of the drawer is controlled by callers (admin hub, standalone matches, bracket, public/player views).
- **No actions** (no schedule/result/court here) — that is by design; the drawer is the **universal Match Details surface** and can safely become the shared details view for the consolidated Hub and (via `resultRecord`/`matches` props) for player/public contexts.
- GSK: works with GSK matches (stage/group ids carried on `TournamentMatchNode`); no special-casing required.

## 10. Match Result Lifecycle

Verified end-to-end chain (backend; from prior Tournament audits — evidence files listed):

1. **UI entry** — standalone `TournamentMatchesPage` result modal OR shared `pages/booking/MatchResultPage.tsx` (`/matches/:id/result`) OR Hub bracket "Record Result".
2. **Tournament controller** — `recordMatchResultHandler` (`tournament.controller.ts:543-557`) → `tournamentService.recordSharedResult` (T-B comment: results go through the **authoritative shared Match Result lifecycle**; `tournament_match_results` retained for history).
3. **Shared submission** — `POST /matches/:id/result` (shared module, `matches.result.submit`) or `POST /admin/tournaments/matches/:matchId/result` (`tournament.result.manage`).
4. **Approval** — opponent confirm (`accept`), auto-approve worker past deadline, or admin dispute resolution (`matches.result.manage`).
5. **Events** — `match:result-approved`, `match:result-auto-approved`, `match:result-resolved`, `match:result-corrected`, `match:result-no-result`.
6. **Progression processor** — `tournament-progression.listener.ts` `handleProgressionEvent` (BullMQ queue, concurrency 1): `syncSharedResultMirror` → `progressFromApprovedResult` (`tournament.service.ts:2254+`) → seat winner participant → standings recompute → bracket target seating (`attachSharedMatchToTarget`, FOR UPDATE idempotent) → stage complete → tournament auto-complete → `captureBracketPlacements`.
7. **Standings** — `computeStandings`/`recalculateStandings` (round-robin groups).
8. **GSK** — group RR results land in standings; `qualification.service.qualifyGroupStage` consumes standings; `knockout-transition.service` builds the KO bracket; KO results progress to final → completion → winner.

**Duplicate risk:** the same result can be entered through three distinct UIs (standalone page modal, shared `/matches/:id/result`, Hub bracket link) all hitting the same shared submission path — consolidation must keep ONE canonical entry (Hub) and retire the standalone modal; the shared `/matches/:id/result` page remains the player/referee entry.

## 11. Scheduling and Court/Referee Assignment

Sources: `TournamentSchedulePage.tsx`; backend `match-schedule.service.ts`.

- **Schedule APIs:** `POST /admin/tournaments/:id/matches/generate`, `POST /admin/tournaments/:id/matches/:matchId/schedule` (body `{date,start_time,end_time,resource_id}`), `POST /admin/tournaments/:id/matches/auto-schedule`, `POST .../matches/:matchId/release-court`, `GET .../matches/eligible-courts` (org mirrors in `org-tournament.routes.ts`). Court reservation reuses the shared booking system (conflict-validated, non-financial).
- **Assignment:** `PUT /admin/tournaments/matches/:matchId/court`, `PUT /admin/tournaments/matches/:matchId/referee` (org mirrors).
- **Permissions:** `tournament.manage`, `org.tournaments.manage`.
- **UI:** scheduling lives **only** in the standalone `TournamentSchedulePage` (admin + org route/embed). The Hub only links to it. The standalone `TournamentMatchesPage` offers inline numeric court/referee assignment (no picker).
- **Duplication:** scheduling exists in exactly one place (Schedule page) but is reachable from Hub via a link — acceptable; consolidation should move the schedule UI into Hub Matches (a "Scheducre/Start" area) and optionally keep the standalone route as a redirect.

## 12. Backend Match APIs

| Endpoint | Consumer | Scope | Purpose | Duplicate? |
|---|---|---|---|---|
| `GET /tournaments/:id/matches` | consumer/player | tournament | matches list (raw) | superseded by admin detail |
| `GET /admin/tournaments/:id/matches` | Hub + standalone | tournament | detailed matches (shared_status, names, courts, refs) | **canonical tournament source** |
| `GET /org/:orgId/tournaments/:id/matches` | org Hub | tournament | org detailed matches | mirror (same service) |
| `GET /admin/tournaments/:id/bracket` | bracket consumers | tournament | bracket projection | no |
| `POST /admin/tournaments/:id/matches/generate` | Schedule | tournament | generate sets from locked draw | no |
| `POST .../matches/:matchId/schedule` , `auto-schedule`, `release-court`, `GET .../eligible-courts` | Schedule | tournament | scheduling | no |
| `PUT .../matches/:matchId/court` , `.../referee` | Standalone | tournament | assignment | no |
| `POST .../matches/:matchId/start` , `complete` | Standalone/Hub | tournament→shared | lifecycle | no |
| `POST .../matches/:matchId/result` | Standalone/Hub | tournament→shared | result entry | shared with `POST /matches/:id/result` |
| `GET/POST/PUT /admin/match-results...` , `resolve`, `correct` | Admin Results | shared | approval | shared |
| `GET /admin/matches`, `/org/:orgId/matches` | Monitors | shared | all-session monitor | shared |
| `GET /matches/:id/result` etc. | booking pages/referee | shared | session result | shared |

**Recommended canonical tournament source:** `GET /admin/tournaments/:id/matches` (detailed shape: `match_id`, `stage_id`, `group_id`, `bracket_position`, participants, shared `status`/`shared_status`, court/referee/booking, `progression_state`/`progression_meta`) — already what the Hub consumes. The standalone `TournamentMatchesPage` uses the same endpoint plus hardcoded pagination; consolidation uses one source.

## 13. Realtime / Socket.IO

Frontend subscription map: `realtime/useRealtimeCacheUpdates.ts`.

| Event | Emitter (backend) | Frontend handler | Affected query keys |
|---|---|---|---|
| `tournament.match-created` | progression `attachSharedMatchToTarget` | ✓ invalidate bracket | `['tournament',id,'bracket']` |
| `tournament.match-progressed` | progression | ✓ invalidate bracket/standings | bracket/standings |
| `tournament.stage-completed` | progression | ✓ invalidate bracket | bracket |
| `tournament.matches-generated` | `match-schedule.service` | ✓ invalidate matches/schedule/courts | matches/schedule/courts |
| `tournament.schedule-updated` / `court-reserved` / `court-released` | scheduling | ✓ | schedule/court lists |
| `tournament.result` | result module (re-emitted) | ✓ invalidate standings | standings |
| `tournament.updated` / `registration-paid` etc. | various | ✓ | tournament/registrations/standings |
| `match:result-*` (approved/auto-approved/resolved/corrected/no-result) | shared result module | handled via `tournament.result`/`tournament.updated` re-emits + `['tournament',id,'standings']` | standings/bracket |
| **`tournament.group-stage-generated`** | `group-stage.service` (`:206`) | **✗ NOT subscribed** | — |
| **`tournament.knockout-generated`** | `knockout-transition.service` (`:219`) | **✗ NOT subscribed** | — |

**Confirmed GSK gap still present at `648c11db`:** neither `group-stage-generated` nor `knockout-generated` is in the `socket-publisher.ts` allowlist nor handled in `useRealtimeCacheUpdates.ts`. After an organizer generates groups/knockout, passive viewers (public/player/other admins) see stale GSK panels until refresh. The acting organizer is fine (mutation `onDone` refetch). **Phase F must add these two events + invalidation.**

## 14. RBAC

| Surface | Action | Permission | Backend | Frontend |
|---|---|---|---|---|
| Hub Matches read | view list | `tournament.view` / `org.tournaments.view` (+ page `admin-tournaments.view` for admin list) | Yes | `<Can>` (hub tabs) |
| Hub "Record Result" (bracket) | submit result | `tournaments.enter_scores` (frontend gate) → shared `matches.result.submit` (backend) | Yes (shared) | `<Can permission="tournaments.enter_scores">` — **name mismatch** with backend keys |
| Hub "Matches & Schedule" link | navigate | `tournament.update` / `org.tournaments.update` | — | `<Can>` |
| Standalone matches actions | start/complete/court/referee | `tournament.manage` / `org.tournaments.manage` | Yes | `<Can>` |
| Standalone result entry | submit result | `tournament.result.manage` (route) / `org.tournaments.result.manage` | Yes | `<Can permission="tournament.result.manage">` |
| Schedule page | generate/schedule | `tournament.manage` / `org.tournaments.manage` | Yes | `<Can>` |
| Match Results (admin/org) | resolve/correct | `matches.result.manage` | Yes | `<Can>` (page list) |
| Match Lobby / Result entry (shared) | view/submit/accept/dispute | `matches.view` / `matches.result.submit` / `matches.result.accept` / `matches.result.dispute` | Yes | yes |
| Referee assignments | officiate/result | referee dashboards + shared result submit | Yes | yes |
| Public/Player GSK views | read | `tournaments.view` (authenticated) / public read (`is_public=1`) | Yes | — |

**Notable mismatch (P2):** the Hub bracket "Record Result" gate uses the frontend-only key `tournaments.enter_scores` while the actual backend result routes require `tournament.result.manage` / `org.tournaments.result.manage` (or `matches.result.submit`). If a role holds `tournaments.enter_scores` but not the backend result permission, the button shows but the call 403s; if it holds the backend permission but not `tournaments.enter_scores`, the button is hidden. Consolidation should align this to a single key.

## 15. Duplicate Function Matrix

| Function | Hub Matches | Standalone Matches | Schedule | Match Results | Match Drawer | Referee/Shared |
|---|---|---|---|---|---|---|
| List matches | FULL (table) | FULL | FULL (pre-schedule) | PARTIAL (by result state) | NONE | FULL (sessions) |
| Search | NONE | NONE | NONE | NONE | NONE | NONE |
| Filter (status) | NONE | NONE (all) | NONE | FULL (result status) | NONE | PARTIAL |
| Filter (stage/group) | NONE | NONE | NONE | NONE | NONE | NONE |
| Schedule match | NONE | NONE | FULL | NONE | NONE | NONE |
| Auto-schedule | NONE | NONE | FULL | NONE | NONE | NONE |
| Assign court | NONE | FULL (inline ID) | FULL (picker schedule form) | NONE | NONE | NONE |
| Assign referee | NONE | FULL (inline ID) | NONE | NONE | NONE | NONE (referee sees assignments) |
| Start match | NONE | FULL | NONE | NONE | NONE | PARTIAL (lobby) |
| Live status | NONE | PARTIAL (shared_status chip) | NONE | NONE | NONE | FULL (lobby) |
| Score/result display | FULL (score + drawer) | FULL | PARTIAL | FULL | FULL | FULL |
| Submit result | FULL-via-link | FULL (modal) | NONE | NONE | NONE | FULL (player/referee) |
| Approve/confirm result | NONE | NONE | NONE | FULL (resolve) | NONE | FULL (opponent accept) |
| Dispute/correct result | NONE | NONE | NONE | FULL | NONE | PARTIAL (dispute) |
| View details | FULL (drawer) | FULL (drawer) | NONE | PARTIAL | FULL | NONE |
| Bracket navigation | FULL | NONE | NONE | NONE | FULL (when matches prop) | NONE |
| Group/standings | FULL (standings tab) | NONE | NONE | NONE | NONE | NONE |
| Progression visibility | PARTIAL (drawer,bracket) | PARTIAL | NONE | NONE | PARTIAL | NONE |
| Monitoring (all sessions) | NONE | NONE | NONE | NONE | NONE | FULL (Adm/OrgMatches) |

## 16. Missing Capabilities

- Hub Matches: **no result submission modal, no start/complete, no court/referee assignment (picker), no scheduling UI** (link only), no stage/group/status filters, no shared-status column, no Results (pending approval) view, no Live view.
- Standalone Matches: no court/referee **pickers** (numeric IDs), no stage/group filters, not reachable from Hub UI.
- All tournament match surfaces: no per-tournament "pending approval" queue (only the global Match Results screen).
- No tournament-scoped live/upcoming monitoring (only the global monitor).

## 17. Dead / Legacy / Duplicate Surfaces

- **Legacy consumer tournament routes** (`/tournaments`, `/tournaments/:id`) — superseded; deprecate later (separate step, previously flagged).
- **Legacy admin list** `/admin/tournaments` (`TournamentAdminPage`) vs `/admin/tournament/list` — deprecate later.
- **Standalone `TournamentMatchesPage`** — duplicate of Hub Matches + actions; **primary consolidation target** (consolidate, then deprecate route).
- **`TournamentSchedulePage`** — scheduling is unique but reachable; move into Hub, keep route as redirect.
- No dead buttons found (all buttons hit real endpoints). Minor P3: inline numeric court/referee inputs are poor UX but functional.
- P0: none found.

## 18. Mobile UX

- Hub/standalone match tables use `overflow-x-auto` (acceptable); standalone page requires selecting a tournament first (extra tap).
- Actions in standalone rows are small (`text-[10px]`), several per row — likely to overflow on narrow screens; Hub Matches tab has only Details (fine).
- `MatchDetailsDrawer` is a modal (bottom-sheet behavior on mobile via `variant="auto"`) — already mobile-friendly; drawable from bracket tap.
- Shared `/matches/:id` lobby handles mobile.
- **Recommendation for consolidated Hub Matches on mobile:** tabbed segmented control (All / Upcoming / Live / Completed / Results), card-list instead of table (or a very narrow table), primary actions as a bottom sheet / drawer per match, ≥44px targets, schedule/result forms inside the existing bottom-sheet modals. Drawer stays as the universal details surface.

## 19. Test Coverage

| Test file | Covers |
|---|---|
| `frontend/src/pages/admin/tournament/__tests__/TournamentDetailPage.spec.tsx` | Hub tabs incl. Matches table + details drawer wiring |
| `frontend/src/pages/admin/tournament/__tests__/GskHub.spec.tsx` | Hub GSK competition views |
| `frontend/src/components/tournaments/__tests__/MatchDetailsDrawer.*.spec.tsx` | Drawer presentation / navigation / a11y |
| `frontend/src/components/tournaments/__tests__/matchPresentation.spec.tsx`, `TournamentBracket.universal.spec.tsx` | Bracket + match cards |
| `frontend/src/pages/admin/match-results/__tests__/AdminMatchResultsPage.spec.tsx` | Resolve/correct flows (shared) |
| `frontend/src/pages/admin/tournament/__tests__/TournamentDrawPage.spec.tsx` | Draw (state) |
| Backend `tournaments/__tests__/tournament-live-play.spec.ts` | Shared Match bridging (start/complete/result) |
| Backend `tournament-progression.spec.ts`, `knockout-integration.spec.ts`, `tournament-gsk-lifecycle.integration.spec.ts` | Progression incl. GSK through the real processor |
| Backend `tournament-schedule-config.spec.ts`, `tournament-standings.g8a.spec.ts`, `tournament-rr-contract.g8d.spec.ts` | Scheduling rules, standings, RR |
| Backend `ko-correction.g8d.spec.ts`, `no-result-reconciliation.g8d.spec.ts` | Result correction boundaries |

**Gaps:** no frontend tests for the standalone `TournamentMatchesPage`; no frontend tests for `TournamentSchedulePage`; no tests asserting Hub "Record Result" permission alignment; no tests for tournament-scoped "pending approval" or live monitoring (not implemented); no frontend realtime tests for GSK group/knockout generation events.

## 20. Database Impact

**No database change required.** The existing schema (`tournament_matches`, shared `matches`, `tournament_match_results`, `tournament_standings`, `match_result_*`, court/booking linkage) already supports a consolidated Hub Matches surface. All queries reuse existing indexes. No migration, no column, no index changes are needed for this consolidation.

## 21. Recommended Target Architecture

```
Tournament Hub  (TournamentDetailPage — admin + org mode)
  Overview | Participants | Competition | Matches | Standings | Finances | Settings
                                        │
                        Matches tab (canonical management surface):
                          segmented view: All | Upcoming | Live | Completed | Results (pending approval)
                          table/cards: match info, court, referee, status(+shared), score
                          actions per match (permission-gated):
                            Details (MatchDetailsDrawer — universal)
                            Schedule/Reschedule (reuse schedule form, moved in)
                            Assign court / referee (pickers, moved in)
                            Start / Complete (moved in)
                            Record Result (moved-in modal OR shared /matches/:id/result)
                            View Result Approval (Results view for pending/disputed)
                          footer action: "Generate matches & auto-schedule" (from Schedule page capability)
```

- **Match Details Drawer** becomes the single details surface across roles (Hub, player/public through bracket/drawer props).
- **Match Results** stays a shared module screen; the Hub gets a per-tournament **Results** tab (filtered list) that links/uses the same resolve/correct APIs, without duplicating logic.
- **Monitoring** stays the shared platform monitor (`/admin/matches`, `/org/:orgId/matches`); the Hub's Live view is a tournament-scoped status filter (minimal), not a new dashboard.
- **Legacy standalone `TournamentMatchesPage` and schedule route** become deprecated/redirect after consolidation.

## 22. Safe Implementation Plan

**Phase A — Canonical match data/API contract (no UI):**
- Files: `backend tournament.service.getMatchesDetailed` (enrich shape: stage/group/bracket/`shared_status`/result state), frontend `services/tournament.ts` types, `types/tournamentBracket.ts`.
- Additive DTO fields only; keep `GET /admin/tournaments/:id/matches` response compatible.
- Tests: backend detail-shape snapshot; frontend type tests.
- DB: none.

**Phase B — Consolidated Hub Matches management surface:**
- Files: `pages/admin/tournament/TournamentDetailPage.tsx` (replace Matches tab), new `components/tournaments/hub/MatchesManager.tsx` (or folder), reuse `MatchDetailsDrawer`, `DynamicResultForm`, `match-result.api`.
- Move start/complete/court/referee/schedule/result actions into Hub; introduce segment filters (All/Upcoming/Live/Completed).
- Deprecate standalone `TournamentMatchesPage` (keep route working during transition).
- Tests: Hub Matches spec (list/filters/actions/drawer); keep existing Hub spec green.
- DB: none.

**Phase C — Results integration:**
- Files: Hub Results sub-view using shared `match-result.api` (`fetchAdminResults` scoped by tournament); `AdminMatchResultsPage` stays.
- Add result-approval entry points (pending/disputed) per tournament.
- Tests: Hub Results view; RBAC alignment test for "Record Result".
- DB: none.

**Phase D — Live/Monitoring integration:**
- Files: optional Hub Live tab = status filter over matches; keep shared monitors.
- Tests: filter behavior.
- DB: none.

**Phase E — Legacy route redirects/deprecation:**
- Redirect `/admin/tournament/matches` → `/admin/tournament/list/:id#matches` (or keep as archival), deprecate online-court-ID inputs (replace with pickers).
- Keep shared match-result, monitor, and shared session routes intact.
- DB: none.

**Phase F — Realtime parity:**
- Files: `socket-publisher.ts` allowlist (+`tournament:group-stage-generated`, `tournament:knockout-generated`), `useRealtimeCacheUpdates.ts` handlers invalidating groups/stages/matches; recheck `dashboard`/public GSK pages.
- Tests: handler unit tests for the two new events; GSK hub invalidation test.
- DB: none.

Each phase preserves existing behavior until the replacement is in place; the backend remains authoritative at all times.

## 23. Risks

- **P1 Functional:** consolidating while standalone actions (result/start/court/referee) aren't yet in the Hub would lose functionality — Phase B must port every action.
- **P1 Realtime:** GSK group/knockout generation events not published → stale GSK views for non-actors (known gap; address in Phase F).
- **P2 RBAC:** `tournaments.enter_scores` vs backend result permission mismatch can hide/deny the Hub "Record Result" button.
- **P2 UX:** inline numeric court/referee IDs are error-prone; must become pickers during consolidation.
- **P2 Scope:** risk of over-building a Live dashboard — keep it a status filter unless requirements demand more.
- No P0 (data-loss/security) risks identified.

## 24. Final Verdict

The **Tournament Hub → Matches consolidation is safe and recommended**; it removes a genuine duplicate (standalone TournamentMatchesPage) and moves scheduling/actions into the canonical Hub. The two shared-module surfaces (Match Results, Matches Monitoring) should be **linked/accessed through the Hub**, not copied into it. No database changes are required. The highest-value, lowest-risk first step is **Phase A + B** (canonical contract + Hub Matches management), with **Phase F** (GSK realtime) done early because it is a pre-existing correctness gap. Keep the Backend authoritative for all result/lifecycle decisions; the frontend stays a thin, permission-gated consumer.
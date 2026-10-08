# Tournament Monitoring Consolidation Audit

> Read-only architecture audit — repository state at `0cc87478` (Step 3F).
> No files other than this document were created or modified.

## 1. Executive Summary

Match/session **Monitoring** exists today as two global/shared workbench screens — `/admin/matches` (`AdminMatchesPage`, platform-wide, all match kinds/sessions) and `/org/:orgId/matches` (`OrgMatchesPage`, org-scoped) — both backed by the shared match module (`match_result_records`-adjacent `matches` sessions). They are **broader operational monitors, not tournament-specific screens**, and they are **not duplicating** the Tournament Hub Matches manager: the Hub manages a single tournament’s matches with full lifecycle actions; Monitoring lists every match session (bookings, academy, tournament, public) with status/court/org/branch context, applicant/pending-result signals.

Verdict: **Tournament → Matches → Live can become the canonical tournament-scoped monitoring surface** by reusing the existing canonical tournament match API (Step 3B/3F) and the shared match-session endpoints — **no new backend API and no DB change required**. The global Admin/Org Monitoring screens must remain as the shared cross-session operational tool. The dominant gap is **realtime**: the Hub currently does **not** subscribe to live match events (matches/status/score/result), and the GSK generation gap (`tournament:group-stage-generated`/`knockout-generated`) still exists.

## 2. Current Monitoring Surfaces

| Surface | File | Route | Scope | Kind |
|---|---|---|---|---|
| Admin Matches workbench | `pages/admin/Matches/AdminMatchesPage.tsx` | `/admin/matches` | Platform-wide | Shared global monitor |
| Org Matches workbench | `pages/org/Matches/OrgMatchesPage.tsx` | `/org/:orgId/matches` | Org | Shared org monitor |
| Player match list | `pages/booking/MatchListPage.tsx` | `/matches` | Player | Shared sessions |
| My matches (session) | `pages/booking/MatchLobbyPage.tsx` | `/matches/:id` | Player/Referee | Shared session |
| Referee assignments | `pages/referee/RefereeAssignmentsPage.tsx` | `/referee/assignments` | Referee | Shared + tournament bracket |
| Admin/Org result queues | `Admin/OrgMatchResultsPage` | `/admin|org/.../match-results` | Admin/Org | Shared (results, not monitoring) |
| **Hub Matches (Live segment)** | `components/tournaments/hub/MatchesManager.tsx` | (Hub tab) | Admin/Org | **Tournament-scoped candidate** |

The Admin/Org workbench row model (`AdminMatchRow`) includes: shared `matches.id`, status (open/full/closed/in_progress/completed/cancelled/void), sport/branch/org/resource names, booking date/time, `resultEntryOpen`, `pendingRequests`, participantCount — a genuinely broader operational monitor. Neither screen shows scoring/scores in the list, live timers, or a live dashboard — they are **status/operational tables** with a status filter.

## 3. Current Routes

| Route | Page | Permission | Notes |
|---|---|---|---|
| `/admin/matches` (App 791) | AdminMatchesPage | `matches.admin.view` | Platform-wide workbench |
| `/org/:orgId/matches` (App 884) | OrgMatchesPage | `org.matches.view` | Org workbench |
| `/matches` (650) / `/matches/:id` / `/:id/result` | player session pages | `matches.view` / `matches.result.*` | Shared session flows |
| `/referee/assignments` (720) | RefereeAssignmentsPage | referee.permissions | Referee assignment + bracket |
| `/admin/match-results` (790) / `/org/:orgId/match-results` (885) | result queues | `matches.result.manage` / `org.matches.results.view` | Shared results (not monitoring) |
| Hub admin `/admin/tournament/list/:id` + org `/org/:orgId/tournaments/:id` | TournamentDetailPage (Matches tab) | `tournament.view` / org | Canonical Hub |

No tournament-specific monitoring route exists (no `/:id/monitor`), and none is needed — the Hub tab is the tournament monitor.

## 4. Current Backend APIs

| API | Guard | Purpose |
|---|---|---|
| `GET /admin/matches` | `matches.admin.view` | Platform monitor list (all statuses) |
| `GET /org/:orgId/matches` | `org.matches.view` | Org monitor list (tenant-scoped) |
| `GET /matches` / `/matches/my` / `/matches/:id` | `matches.view` | Player list/detail |
| `POST /matches/:id/start|complete|close|cancel` | `matches.manage` | Shared session lifecycle |
| `POST /admin/tournaments/matches/:matchId/start|complete` | `tournament.manage` | **Tournament start/complete (existing, used by Hub)** |
| `POST /admin|org/.../matches/:matchId/result` | `tournament.result.manage` / org | Tournament result (shared path) |
| `PUT .../court` , `.../referee` | `tournament.manage` / org | Tournament assignment |
| `GET /admin/tournaments/:id/matches` (+ org) | `tournament.view` / org | **Canonical tournament match list (Step 3B)** — includes `shared_status`, `result_status`, stage/group, court/referee, booking |

The canonical tournament match API is sufficient for a **Live** view (status incl. `shared_status`=in_progress, court, referee, participants, stage/group, score_summary, schedule). No new API needed.

## 5. Current Permissions / RBAC

- Monitoring list: `matches.admin.view` (global) / `org.matches.view` (org).
- Shared session actions: `matches.manage`, `matches.apply`, `matches.cancel`, `matches.view`, `matches.result.*`.
- Tournament actions (already used by the Hub): `tournament.manage`, `tournament.result.manage` / org equivalents, `tournament.view` for reads.
- **No mismatch found** between the Hub’s frontend gates (Steps 3C/3E/3F aligned) and backend routes. The only stale key remains the **player-facing consumer** “Enter Score” (`tournaments.enter_scores`), unrelated to monitoring.

## 6. Current Realtime Events

`socket-publisher.ts` publishes (lines 25-36, 93-117):
- Shared session: `match:available|created|updated|status_changed|cancelled|completed|removed|pending`.
- Result: `match:result-submitted|approved|auto-approved/disputed|rejected|resolved|corrected|no-result|withdrawn`.
- Tournament: `tournament:match-scheduled|result|bracket-generated|match-created|match-progressed|stage-completed|completed|matches-generated|schedule-updated|court-reserved|court-released` etc.

Frontend (`useRealtimeCacheUpdates.ts`) subscribes to `match.available/removed/updated` and `match:result-*` (invalidates `['match', id]`, result lists, standings) and to the `tournament.*` events listed above.

**Critical finding:** the **Hub (`MatchesManager`) has NO socket subscription** — it refreshes only via mutation invalidation + query refetch. So live start/status/score changes made by *another* actor (e.g., a referee via the shared lobby, or a second admin) do not appear in the Hub until a refetch. For a true **Live** segment this must be closed later (realtime phase).

**GSK gap still present (verified):** `tournament:group-stage-generated` and `tournament:knockout-generated` are **not** in the publisher allowlist and have **no** frontend handler — passive viewers see stale GSK panels.

## 7. Current Tournament Hub Matches Architecture

- `MatchesManager` (Step 3C/3F): one canonical fetch → segments All/Upcoming/Live/Completed/Results; actions Details/View Result/Record Result/Accept/Start/Complete/Court/Referee/Schedule; result sub-filters; contextual links to shared Monitoring/Results.
- **Live segment today** = client-side filter `status==='in_progress' || shared_status==='in_progress'` over the canonical list; shows the same row/card (status chip, score, court, referee, participants, stage/group) with all actions and a “Live Monitoring” link to the shared workbench.
- Data source already includes everything a Live view needs.

## 8. Duplication Analysis

- **Is Monitoring duplicating MatchesManager?** No. Monitoring spans all match sessions org/platform-wide with applicant/pending-result signals; the Hub manages one tournament. They overlap only in showing match rows — the Hub’s rows come from the tournament API; the workbenches from the shared match list API.
- **Is Monitoring a broader operational tool that should remain global?** Yes — keep it (accounting/pending-result/applicant context, cross-kinds, all branches).
- **Are there tournament-specific monitoring routes?** No dedicated route; the Hub tab is the correct surface.
- **Functions lost if Monitoring were removed:** cross-tournament/branch/booking/academy view, applicants+`pendingRequests`, `resultEntryOpen` flags, global status roll-up — none of which belong in the Hub.
- **Functions for Hub→Live:** same-tournament live ops (start/complete/result/court/referee/details) — already present in the Hub.
- **Only in shared Monitoring:** global/org lists, applicant management, cross-session pending signals.

## 9. What Must Move Into Tournament → Matches → Live

Only presentation, reusing existing capabilities (all already present in `MatchesManager`):
- current-live + about-to-start matches of the tournament (`shared_status`/status filters).
- court + referee + participants + score/status + stage/group per match.
- actions Start / Complete / Record Result / Assign Court / Assign Referee / View Result / Details.
- contextual link to the shared Monitoring surface for cross-session view.

No new backend behavior, no progression logic (backend authoritative).

## 10. What Must Remain In Shared/Global Monitoring

- `AdminMatchesPage` / `OrgMatchesPage` (all-session status workbench, applicants, pending-result signals, cross-org/platform scope) — remain the “Operations” surface.
- Player session pages / Referee assignments / shared result queues — untouched.
- Hub provides “Live Monitoring” links into `/admin/matches` and `/org/:orgId/matches` (already implemented).

## 11. Proposed Final Navigation

```
Admin  →  Tournament  →  detail/:id  →  Matches (All | Upcoming | Live | Completed | Results)
Admin  →  Matches            (shared monitor — stays)
Admin  →  Match Results     (shared queue — stays)
Org    →  Matches / Match Results  (org mirrors — stay)
```
No new top-level navigation; **Live** remains an in-tab segment.

## 12. API Reuse vs Missing Data

- Reuse: canonical `GET /admin/tournaments/:id/matches` (+ org) — has `shared_status`, `result_status`, names, court/referee, stage/group, booking, schedule. Sufficient for Live.
- Missing for a richer live tile (optional, additive, NOT required): none critical. If a live dashboard ever wants per-second cues, it would use the shared session API (`GET /admin/matches` filtered) or realtime — deferred.
- **No new API created.**

## 13. Realtime Gaps

- **P1:** Hub has no socket subscription for `match:status_changed`/`match:completed`/`match:result-*` → Live/status can go stale for non-actors until refetch.
- **P1 (known):** GSK `group-stage-generated` / `knockout-generated` not published/handled.
- Fix in a later realtime phase: subscribe Hub/Live to the already-published `match.*` + `tournament.*` events and invalidate the Hub’s canonical queries; publish + handle the two GSK events.

## 14. Permission Gaps

No monitoring-related mismatch found. Hub actions use `tournament.*` keys matching backend routes; workbenches use `matches.admin.view`/`org.matches.view`; result actions `matches.result.manage`. (Remaining unrelated stale key: player consumer `tournaments.enter_scores`.)

## 15. Mobile UX Findings

- `AdminMatchesPage`/`OrgMatchesPage` are **desktop-oriented tables** (status filter + table rows; `overflow-x-auto`).
- Recommendation for **Live on mobile:** reuse the Hub’s responsive stacked cards (already mobile-safe, 44px targets) with segment chips; a bottom-sheet action menu for start/result/assign; no horizontal scroll.

## 16. Legacy Route / Deprecation Plan (no changes now)

- Keep: `/admin/matches`, `/org/:orgId/matches` (shared), `/matches*` session routes, referee routes, result queues.
- Deprecate later (after Hub proves parity): standalone `TournamentMatchesPage` route `/admin/tournament/matches` (result/schedule modals superseded by Hub) — redirect to `/admin/tournament/list/:id#Matches` in a later phase.
- No route removed or redirected in this audit.

## 17. Test Coverage Gaps

- Existing: `AdminMatchResultsPage.spec`; `MatchesManager.spec` (31: includes Results/Live linkage); `TournamentBracket.universal.spec`; match module backend specs; `tournament-match-*-contract` specs.
- **Missing before Live consolidation:** a `MatchesManager` Live-segment focused spec (live filter correctness, live link, start/complete within Live), and (realtime phase) tests that socket `match.*` events invalidate the Hub queries. No Admin/OrgMatchesPage frontend spec exists.

## 18. Database Impact

**No database change required.** The canonical tournament match read (already joins `matches`/`resources`/`referees`/`match_result_records`) plus existing indexes fully support a Live view. No migration, column, or index needed.

## 19. Implementation Plan for Step 3G (future, not this task)

- **Phase A — Live segment polish:** use the existing Live filter; ensure `shared_status`-driven Start/Complete show within Live rows (already supported); add a “Starting soon” sub-heading using `status==='scheduled' && start_time` (client-side, no API).
- **Phase B — Links:** ensure Live rows carry “Open Monitoring” / “Open Session” links to the shared workbench/lobby (existing route/params).
- **Phase C — Realtime:** later — subscribe Hub to `match.*`/`tournament.*`; publish GSK generation events.
- **Phase D — Legacy:** later — deprecate standalone TournamentMatchesPage.
Each phase: frontend-only; backend untouched; DB none; tests per phase.

## 20. Risks / Non-Goals

- **Non-goal:** building a global realtime wall — monitoring stays shared.
- **Non-goal:** moving applicant/pending-result signals into the Hub.
- **Risk:** stale Live without realtime (P1, realtime phase).
- **Risk:** scope creep to a new dashboard — keep Live as a segment, not a new screen.
- No P0 risks identified.

## 21. Final Recommendation

**A. Can Hub → Matches → Live become the canonical tournament-scoped monitoring surface?** Yes — the canonical tournament match API already carries everything (status, `shared_status`, court, referee, participants, score, stage/group, schedule), and the Hub already contains the required actions. It should be a polished **segment**, not a new screen.

**B. Exact functionality it must contain:** live + starting-soon matches; court/referee/participants/score/status/stage-group; Details/View Result/Record Result/Accept/Start/Complete/Court/Referee/Schedule; link “Open Monitoring” to the shared workbench/lobby.

**C. Monitoring functionality that must remain global/shared:** all-session status workbenches (Admin/Org), applicant management, `pendingRequests`/`resultEntryOpen` signals, cross-org/platform scope, player/referee session flows, result queues.

**D. Implementable without a new DB change?** Yes — zero DB changes required.

**E. Reuse the canonical tournament match API?** Yes — no new API; optionally independent live tiles would reuse the shared session API, not a new one.

**F. Realtime work required:** subscribe the Hub to already-published `match.*` + `tournament.*` events (invalidate the canonical queries), and publish + handle `tournament:group-stage-generated` / `tournament:knockout-generated` (the outstanding GSK gap). Deferred to the realtime phase.

**G. Permissions mismatches?** None in the monitoring/live scope; Hub uses authoritative `tournament.*` keys; only the unrelated player consumer stale key (`tournaments.enter_scores`) remains.

**H. Legacy routes to redirect/deprecate later:** standalone `/admin/tournament/matches` (after Hub parity) → redirect to the Hub Matches tab; Admin/Org workbenches, session routes, referee routes, and result queues stay.

**I. What to implement first after this audit:** the **realtime phase** is the highest-value next step (Live staleness + GSK generation gap), followed by a Live-segment polish with tests; then standalone-route deprecation. No DB, no new API, no new permissions.
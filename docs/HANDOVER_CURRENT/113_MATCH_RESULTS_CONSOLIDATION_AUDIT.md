# Match Results Consolidation Audit

> Read-only architecture & UX audit — repository state at `d14ea250` (Step 3C).
> No files other than this document were created or modified.

## 1. Executive Verdict

Match Results is a **shared, cross-entity result lifecycle** (`match_result_records`) that tournament matches forward into. It is surfaced in **four production UIs** plus read-only cards and a submit flow:

1. **Admin Match Results** — `AdminMatchResultsPage` (approval/dispute/correction, global).
2. **Org Match Results** — `OrgMatchResultsPage` (same actions, org-scoped).
3. **Match Result page (shared session)** — `MatchResultPage` (score entry + accept/dispute/withdraw/replace/correct, per-match).
4. **My Results** — `MatchResultHistoryPage` (player history).
5. **ResultSummaryView / DynamicResultForm** — shared read-only card + dynamic score form.
6. **MatchDetailsDrawer** — optional Result section (currently only used where the caller passes `resultRecord`; not wired in tournament Hub/consumer pages).

**Verdict:** The Hub's lightweight **Results** segment (already shipped in Step 3C) is the correct *entry point*; the shared management module (approval/dispute/correction, org-scoped) must **remain** in the shared module. Recommended target: **Hybrid (Option D)** — a Hub Results management view that reuses the existing shared components/APIs for per-tournament pending results, plus contextual access to the full shared Match Results screen for cross-tournament/dispute/correction work. Do **not** build a duplicate result engine. No DB change required.

## 2. Result Surfaces

| # | Surface | File | Route | Role | Tournament-specific |
|---|---|---|---|---|---|
| 1 | Admin Match Results | `pages/admin/match-results/AdminMatchResultsPage.tsx` | `/admin/match-results` | Admin | No (shared) |
| 2 | Org Match Results | `pages/org/Matches/OrgMatchResultsPage.tsx` | `/org/:orgId/match-results` | Org | No (shared) |
| 3 | Match Result (session) | `pages/booking/MatchResultPage.tsx` | `/matches/:id/result` | Player/Referee/Org | No (shared session) |
| 4 | My Match Results | `pages/booking/MatchResultHistoryPage.tsx` | `/my/match-results` | Player | No |
| 5 | Result card | `components/match-result/ResultSummaryView.tsx` | (component) | All | No |
| 6 | Dynamic score form | `components/match-result/DynamicResultForm.tsx` | (component) | All | No |
| 7 | Hub Results segment | `components/tournaments/hub/MatchesManager.tsx` (Results) | (Hub tab) | Admin/Org | **Yes** |
| 8 | MatchDetailsDrawer result section | `components/tournaments/MatchDetailsDrawer.tsx` | (modal) | All | Partial |
| 9 | Tournament standalone result modal | `pages/admin/tournament/TournamentMatchesPage.tsx` | (modal) | Admin | Yes (being superseded by Hub) |

## 3. Frontend Route Inventory

| Route (App.tsx) | Page | Role | Purpose | Scope | Duplicate? | Recommendation |
|---|---|---|---|---|---|---|
| `/matches/:id/result` (652) | `MatchResultPage` | Player/Referee/Org | Per-match result entry + accept/dispute/withdraw/replace/correct | Shared | no | Keep (shared) |
| `/my/match-results` (653) | `MatchResultHistoryPage` | Player | Player result history | Shared | no | Keep (shared) |
| `/admin/match-results` (790) | `AdminMatchResultsPage` | Admin | Global approval/dispute/correction | Global | no | Keep (shared, global) |
| `/org/:orgId/match-results` (885) | `OrgMatchResultsPage` | Org | Org approval/dispute/correction | Org | mirror of admin | Keep (shared, org-scoped) |
| `/matches/:id` (651) | `MatchLobbyPage` | Player/Referee | Session lobby incl. result view | Shared | no | Keep |
| Hub Matches → Results | `MatchesManager` Results segment | Admin/Org | Tournament result-attention list + link | Tournament | no | **Extend** (Phase B) |
| `/admin/tournament/matches` (788) | `TournamentMatchesPage` | Admin | Legacy result modal in standalone | Tournament | superseded by Hub | Keep during transition |

No result-specific legacy route found that is dead; `/my/match-results` and `/admin/match-results` are actively consumed.

## 4. Admin Match Results

File: `pages/admin/match-results/AdminMatchResultsPage.tsx`.

### Display
Result-record cards: header `Result #id (Match #matchId)` + `updatedAt`; `ResultSummaryView` (participants with win/draw/loss, score summary, status badge, sport/format/venue/tournament context). No table; no pagination UI (backend returns `{records,total}`; only first 50 shown by default via API `limit`).

### Filters
Single dropdown on `submissionStatus`: All / `pending_confirmation` / `approved` / `disputed` / `no_result` (defaults to `disputed`). No tournament/match/date/org/player filters.

### Actions
Only when `matches.result.manage`:
- **Approve** a disputed result (`resolve`, `approve:true`).
- **No Result** resolve (`resolve`, `approve:false`) for disputed.
- **Correct** an approved result (`correct`) — with the pre-start knockout correction guard.
No withdraw/history actions here.

### Permissions
`matches.result.manage` (backend `requirePermission(['matches.result.manage'])` on list/resolve/correct).

### APIs
`GET /admin/match-results?status=` · `POST /admin/match-results/:resultId/resolve` · `PUT /admin/match-results/:resultId/correct` · `GET /sports/:sportId/formats` (rules for the form).

### Realtime
Invalidates `['admin-match-results', status]` after mutations. Socket `match:result-*` events are published (see §15) but this page has no direct subscription; it refreshes on navigation/mutation only.

## 5. Organization Match Results

File: `pages/org/Matches/OrgMatchResultsPage.tsx`.

- Route `/org/:orgId/match-results`; reads `fetchOrgResults(orgId, status)` → `GET /org/:orgId/match-results` (`org.matches.results.view`); actions `resolveOrgDispute`/`correctOrgResult` → `/org/:orgId/match-results/:resultId/{resolve,correct}` (org-scoped `matches.result.manage`).
- Same UI/modal structure as Admin (duplicated file; ~identical code), scoped query key `['org-match-results', orgId, status]`.
- Server enforces tenant (`listForOrg` on `bookings.organisation_id`, and tenant ownership check on actions — `org-match-result.routes.ts` header comment).
- **Duplication finding:** `AdminMatchResultsPage` and `OrgMatchResultsPage` are near-identical implementations (only API path + scoping differ). Suitable for a shared component refactor, but both must remain functional.

## 6. Shared Result Flow

Verified end-to-end (see evidence files):
1. **Entry UIs:** `MatchResultPage` (submit/accept/dispute/withdraw/replace), Hub/standalone record-result modals (`POST /admin/tournaments/matches/:matchId/result` → `recordMatchResultHandler` → `tournamentService.recordSharedResult`), standalone `TournamentMatchesPage` result modal.
2. **Shared submission:** `POST /matches/:id/result` (`matches.result.submit`) → `match-result.service.submitResult` → `match_result_records` with `submission_status='pending_confirmation'`.
3. **Approval paths:** opponent `acceptMatchResult` (`matches.result.accept`); worker auto-approval at deadline (`autoApproved`); admin/org dispute resolution (`resolve` approve/no-result); `withdraw`; `replace`.
4. **Events:** `match:result-submitted|approved|auto-approved|disputed|rejected|resolved|corrected|no-result|withdrawn`.
5. **Progression:** `tournament-progression.listener.ts` `handleProgressionEvent` (on approved/auto-approved/resolved/corrected/no-result) → `syncSharedResultMirror` + `progressFromApprovedResult` → standings recompute / bracket seat / stage complete / tournament complete / placements.
6. **GSK:** group RR results → standings → `qualification.service.qualifyGroupStage` → `knockout-transition.service` → KO results → final → completion.

Statuses (authoritative from `match-result.types.ts:3`): `pending_confirmation | approved | disputed | withdrawn | no_result`. Outcome: `completed | retired | walkover | forfeit | abandoned | no_result | disputed`.

## 7. Submission vs Management

- **Result submission/score entry** = player/referee (and org staff with `matches.result.submit`) via `MatchResultPage`/Hub/standalone modals.
- **Result management (approval/reject/dispute-resolve/correction)** = `matches.result.manage` (admin/org) in `Admin/OrgMatchResultsPage`; opponent **accept** = `matches.result.accept`; **dispute** = `matches.result.dispute`.

| Action | Player | Referee | Organizer/Org staff | Org Admin | Admin | Superadmin |
|---|---|---|---|---|---|---|
| Submit/replace result | SUBMIT ✓ | SUBMIT ✓ | manage ✓ | ✓ | ✓ | ✓ |
| Accept (confirm) | ACCEPT ✓ (opponent) | — | — | — | ✓* | ✓* |
| Dispute | DISPUTE ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Resolve dispute (approve/NoResult) | — | — | MANAGE ✓ | ✓ | ✓ | ✓ |
| Correct result | — | — | MANAGE ✓ | ✓ | ✓ | ✓ |
| View admin queue | — | — | results.view ✓ | ✓ | ✓ | ✓ |

(*Superadmin/`*` permission bypass; admin can accept via resolve/manage path.) Submitting player cannot edit an approved result (`MatchResultPage.tsx:75-78,361`).

## 8. Result History

- **Stored:** `match_result_records` per match (one current row; correction updates the same row — `updateResult`, `replace`), `audit_logs` records every transition (`entityType: 'match_result_records'`), `match_result_participants` snapshot.
- **Viewable:** Player history via `fetchMyResults` → `/me/results` (`['my-results', status]`); admin/org queue lists records. There is **no per-match history timeline UI**.
- **Who/scope:** per-user for `me/results`; global for admin; org-scoped for org.
- **Recommendation (evidence-based):** history is a **shared** concern (global/org + per-player). Keep `MatchResultHistoryPage` and the admin/org queues as-is; optionally surface a **record-level** "last updated by/at" in `MatchDetailsDrawer` (fields already exist: `submittedBy/At`, `acceptedBy/At`, `resolvedBy/At`, `updatedAt`), but a full history timeline should stay in the shared module.

## 9. Corrections and Disputes

- **Initiate:** dispute → participant (or staff) with `matches.result.dispute`; correction → `matches.result.manage`.
- **Guards:** correction only while `submission_status` allows (`pending_confirmation` for replace; approved for `correct`); knockout pre-start boundary enforced by `knockout-correction.ts` (`evaluateKnockoutCorrectionBlockReason`, `TOURNAMENT_KNOCKOUT_CORRECTION_BLOCKED`). Dispute resolution is `approve | no_result`.
- **Record behavior:** corrections update the same record (original `rawResult` overwritten; audit trail preserves before/after in `audit_logs` / `notification_audit_trail`). No second record is created per correction.
- **Progression on correction:** `match:result-corrected` → listener recomputes standings + re-mirrors projection (no bracket reversal after live-play boundary); `no-result` reconciliation is point-neutral.
- **Notifications/audit:** `recordAudit` on every transition; notification engine events for result events.
- **Risk:** high-touch; do **not** move correction/dispute logic into the Hub — keep in the shared service and expose via contextual links/actions.

## 10. Result Progression

- Approved result → `match:result-(auto-)approved|resolved` → progression listener → `progressFromApprovedResult`:
  - mirror winner → standings (`computeStandings`/`recalculateStandings`) for round-robin/group matches;
  - seat winning participant into target bracket slot (`attachSharedMatchToTarget`, FOR UPDATE idempotent; `repairMissingTargetSharedMatch` recovery);
  - stage complete → `stageCompleted`; final/max-stage → `tournamentCompleted` → `captureBracketPlacements`.
- **GSK chain:** Group RR result → standings → `qualifyGroupStage` (read-only) → `introduceKnockoutStage` (builds KO) → KO results → final → completion → winner/placements.
- Champion/winner: `winner_id` + `winner_participant_id` + `final_position`; `captureBracketPlacements` fail-closed resolver.

## 11. Match Details Drawer

`components/tournaments/MatchDetailsDrawer.tsx` — read-only, role-agnostic.
- Currently shows: match info, score (via `formatTournamentScore`), schedule, venue, official, booking, optional **Result** section only when the caller supplies `resultRecord` (renders `ResultSummaryView`).
- **Verified gap:** the **Hub and the consumer tournament page do NOT pass `resultRecord`** to the Drawer — so tournament contexts show score/status but not the full shared result record (submission/approval/dispute state). The shared `MatchLobbyPage` passes the record.
- Safe additions (fields already exist): show `submissionStatus` chip + `result status` when a shared result exists (via `result_id`/`result_status` on the canonical match row — no new API needed) and "last updated" from the record if loaded. Keep history/correction to the shared screens.

## 12. Tournament Hub Results Segment

`components/tournaments/hub/MatchesManager.tsx` (Step 3C):
- **Results** = client-side filter over the canonical match list where `result_status ∈ {pending_confirmation, disputed, no_result}`.
- UI: same row/card as other segments (status chip `result_status`), plus a contextual **Open Match Results** button (`onOpenResults` → admin/org `match-results`), and **Live** segment links to monitoring.
- **Gap vs Admin/Org Match Results:** the Hub segment identifies needing-attention matches but has **no approval/dispute/correction actions**, no result record details (only `result_status` scalar), no submitter/approver timestamps. It is intentionally a thin entry point.

## 13. Backend API Inventory

| Method | Endpoint | Perm | Purpose | Scope | Used by |
|---|---|---|---|---|---|
| GET | `/matches/:id/result` | `matches.view` | fetch record + participants | shared/session | MatchResultPage, lobby |
| POST | `/matches/:id/result` | `matches.result.submit` | submit result | shared | MatchResultPage, Hub/standalone modals (tournament route) |
| PUT | `/matches/:id/result` | `matches.result.manage` | replace result | shared | MatchResultPage |
| POST | `/matches/:id/result/withdraw` | `matches.result.submit` | withdraw | shared | MatchResultPage |
| POST | `/matches/:id/result/accept` | `matches.result.accept` | confirm | shared | MatchResultPage |
| POST | `/matches/:id/result/dispute` | `matches.result.dispute` | dispute | shared | MatchResultPage |
| GET | `/me/results` | `matches.view` | player history | user | MatchResultHistoryPage |
| GET | `/admin/match-results` | `matches.result.manage` | global queue | global | AdminMatchResultsPage |
| POST | `/admin/match-results/:id/resolve` | `matches.result.manage` | resolve dispute | global | AdminMatchResultsPage |
| PUT | `/admin/match-results/:id/correct` | `matches.result.manage` | correct | global | AdminMatchResultsPage |
| GET | `/org/:orgId/match-results` | `org.matches.results.view` | org queue | org | OrgMatchResultsPage |
| POST | `/org/:orgId/match-results/:id/resolve` | org-scoped `matches.result.manage` | resolve | org | OrgMatchResultsPage |
| PUT | `/org/:orgId/match-results/:id/correct` | org-scoped `matches.result.manage` | correct | org | OrgMatchResultsPage |
| GET | `/sports/:sportId/formats` | `matches.view` | rules for form | shared | result pages |
| POST | `/admin/tournaments/matches/:matchId/result` | `tournament.result.manage` | tournament result (shared path) | tournament | Hub/standalone |
| POST | `/org/:orgId/tournaments/matches/:matchId/result` | org-scoped result.manage | tournament result | tournament | Hub/org |

Canonical per operation: submission → `/matches/:id/result` (or the tournament route forwarding to `recordSharedResult`); management → admin/org `match-results`; history → `/me/results` (+ queues).

## 14. Result Data Contract

`MatchResultRecord` (types/match-result.ts:150-186) — id, matchId, sportId/formatId/ruleSetId, rulesSnapshot, matchType, playedAt, branch/resource/academy/tournament ids, participantPayload, rawResult, finalResult, outcome, submissionStatus, submittedBy/At, acceptedBy/At, autoApproved, disputedBy/At, disputeReason, resolvedBy/At, resolutionNote, submissionDeadlineAt, autoApprovalDeadlineAt, evidenceCounted, ratingAppliedAt, createdAt, updatedAt. List items add sport/format/venue/tournament/participants.

- **Safe for organizer/admin:** submissionStatus, outcome, rawResult (display form), participants, timestamps, tournament context.
- **Private:** submitter *user identities* should be shown only to staff (`matches.result.manage`); disputeReason/resolutionNote are staff/audit context; registration/evidence/rating internals should remain out of the player-facing drawer.

## 15. Realtime / Socket.IO

`socket-publisher.ts` allowlist includes all `match:result-*` events (34-36) and `tournament:result` (93). Frontend handlers (`useRealtimeCacheUpdates.ts`) cover:
- `match:result-*` → invalidate `['match', id]`, result list, my-results; `tournament.result` → invalidate standings; `tournament.updated` with `standings/bracket` flags handles result correction/no-result reconciliation.
- Emitted from match-result service + progression listener; no Hub-specific result socket exists (Hub refreshes via query invalidation on mutation/refetch).

## 16. RBAC

| Surface | Action | Frontend key | Backend key | Correct? |
|---|---|---|---|---|
| MatchResultPage | submit/replace/withdraw | `matches.result.submit` | `matches.result.submit` | ✅ |
| MatchResultPage | accept | `matches.result.accept` | `matches.result.accept` | ✅ |
| MatchResultPage | dispute | `matches.result.dispute` | `matches.result.dispute` | ✅ |
| MatchResultPage | edit approved | `matches.result.manage` | `matches.result.manage` | ✅ |
| Admin/Org Results | resolve/correct | `matches.result.manage` | `matches.result.manage` | ✅ |
| Org list | view | `org.matches.results.view` | `org.matches.results.view` | ✅ |
| Tournament result record (Hub/standalone) | submit | `tournament.result.manage` / `org.tournaments.result.manage` (route) vs UI `tournaments.enter_scores` (bracket tab link) | `tournament.result.manage` | **P1 mismatch on the bracket-tab "Record Result" link** (still `tournaments.enter_scores`, a frontend-only key) |

Hub MatchesManager result action uses `tournament.result.manage`/`org.tournaments.result.manage` ✅. Known mismatch classified **P1 Functional** (can hide or 403 the bracket-tab link for roles with one key but not the other); backend never weakened.

## 17. Organization Scoping

- Org reads: `listForOrg` scoped to `bookings.organisation_id = orgId`; actions verify tenant ownership of the result before delegating (org-match-result.routes.ts). Cross-org access blocked.
- Admin: global scope. Hub org matches/results use org routes; Hub admin uses admin routes. No cross-org leak found.

## 18. Duplication Matrix

| Function | Hub Matches | Admin Results | Org Results | MatchResultPage | History | Drawer |
|---|---|---|---|---|---|---|
| Submit result | FULL (modal) | NONE | NONE | FULL | NONE | NONE |
| View result (record) | PARTIAL (status chip) | FULL | FULL | FULL | FULL | PARTIAL (only w/ resultRecord) |
| Approve/confirm | NONE | FULL (resolve-approve) | FULL | FULL (accept) | NONE | NONE |
| Reject/NoResult | NONE | FULL | FULL | PARTIAL (no apply) | NONE | NONE |
| Dispute | NONE | NONE (resolve only) | NONE | FULL (initiate) | NONE | NONE |
| Correct | NONE | FULL | FULL | FULL (staff) | NONE | NONE |
| Withdraw | NONE | NONE | NONE | FULL | NONE | NONE |
| History | NONE | PARTIAL (queue) | PARTIAL | PARTIAL | FULL | NONE |
| Score display | FULL | FULL | FULL | FULL | FULL | FULL |
| Winner display | FULL | FULL | FULL | FULL | FULL | FULL |
| Result status | FULL (chip) | FULL | FULL | FULL | FULL | PARTIAL |
| Progression effect | refreshes standings | NONE | NONE | NONE | NONE | NONE |
| Notifications | NONE | NONE | NONE | NONE | NONE | NONE |
| Audit trail | NONE | NONE | NONE | NONE | NONE | NONE |

## 19. Recommended Target Architecture

**Option D (Hybrid)** — recommended:
- **Hub Matches → Results** becomes a **tournament-scoped management view**: it filters the canonical match list by `result_status` (pending/disputed/no_result) and, for each row, reuses the **shared** result actions via the existing `/admin/match-results`-style service scoped to the tournament. Concretely: keep the lightweight segment and add per-row actions that call the shared resolve/correct/submit endpoints (tournament-scoped) only where a `match_id`/`result_id` exists; do **not** re-implement the submission/form logic (reuse `DynamicResultForm`).
- **Keep the shared module** for global cross-tournament queues, dispute management, correction history, audit. The Hub "Open Match Results" link already navigates there.
- **Do not** create a second `match_result_records`-management screen.

Phase ordering is below; Phase B (Hub Results management) is the main deliverable; avoid moving dispute/correction/history into the Hub.

## 20. Match Details Drawer Recommendation

Show (when `result_id`/`result_status` present — no new API):
- SUMMARY (existing) · SCORE (existing) · **RESULT STATUS** chip (`result_status`) + winner; optionally "last updated by/at" only for staff roles.
Do NOT add: dispute/correction/history timelines, submitter identities to players, approval controls (keep those in Admin/Org Results / MatchResultPage).

## 21. Mobile UX

- Admin/Org Results uses stacked cards + a single status dropdown — already mobile-safe.
- MatchResultPage form (sets/goals) fits a bottom-sheet (`Modal` `variant="auto"`).
- Hub results rows already stack on mobile with 44px targets.
- Recommendation: per-result actions in the Hub Results segment should use a bottom-sheet action menu; approval confirmations keep the existing `a11yDialog`.

## 22. Dead / Legacy / Duplicate Surfaces

- **P2 Duplicate:** `AdminMatchResultsPage` ≈ `OrgMatchResultsPage` (near-identical) — candidate for a shared component refactor, not removal.
- **P2:** Hub bracket-tab "Record Result" still gated by `tournaments.enter_scores` (stale) while Hub MatchesManager uses the correct key — align in Phase B.
- **P3:** Standalone `TournamentMatchesPage` result modal will be superseded by Hub; keep during transition, deprecate later.
- No P0/dead buttons found.

## 23. Test Coverage

- Backend: `match-result` module specs (service, repository, ko-correction g8d, result-window, match-lifecycle integration, match-result.r5b/recurring?) plus tournament progression/GSK/standings specs; `tournament-match-canonical-api` covers `result_status` in the tournament contract.
- Frontend: `AdminMatchResultsPage.spec.tsx` (resolve/correct); `MatchesManager.spec.tsx` (Results segment + result modal payload); `MatchDetailsDrawer.*` (presentation/navigation/a11y).
- **Gaps:** no `OrgMatchResultsPage` spec; no frontend spec for `MatchResultPage`/`MatchResultHistoryPage`; no per-tournament result-management tests (pending Phase B); no dispute/correction UI tests in the Hub.

## 24. Database Impact

**No database change required.** `match_result_records`, `match_result_participants`, `match_sessions`, `tournament_matches` (+ `result_id`/`result_status` derived in the canonical read), audit tables, and existing indexes fully support every recommended option. No migration, column, or index change is needed.

## 25. Safe Implementation Plan

- **Phase A — Result contract/API parity:** (if Hub needs per-row actions) expose tournament-scoped result list/management helpers reusing the shared service; add `result_id`/`result_status` already in the canonical contract. Files: shared `match-result` service/controller (additive) + `match-result.api` + Hub types. Tests: backend contract + frontend type tests. DB: none.
- **Phase B — Hub Results management:** per-tournament Results view with action reuse (`resolve`/`correct`/`submit` via shared endpoints), `DynamicResultForm` reuse; align the bracket-tab `tournaments.enter_scores` key. Files: `MatchesManager.tsx`, `TournamentDetailPage.tsx`, `match-result.api`, permissions registry. Tests: Hub Results management spec. DB: none.
- **Phase C — History/correction/dispute integration:** optional record-level "last updated" in Drawer (staff-only); keep full history in shared module. DB: none.
- **Phase D — Contextual shared-module access:** enhance "Open Match Results"/"Open disputes" links with tournament context (query param) when supported. DB: none.
- **Phase E — Legacy routes:** after Hub parity, deprecate standalone `TournamentMatchesPage` result modal; keep `Admin/OrgMatchResultsPage` + `MatchResultPage` + `History` (shared). DB: none.
- **Phase F — Realtime parity:** (postponed) ensure Hub Results/live panels update on `match:result-*` (already published) via invalidations; GSK generation events remain the outstanding realtime gap.

## 26. Risks

- **P1:** removing or duplicating dispute/correction logic would break audit/history guarantees — keep shared service authoritative.
- **P1:** bracket-tab `tournaments.enter_scores` mismatch can hide or 403 a legitimate action (align in B).
- **P2:** near-duplicate Admin/Org results pages drift if not refactored to a shared component.
- **P2:** exposing submitter/dispute metadata to players via the Drawer — keep staff-only.
- No P0 (security/data-loss) risks found; corrections are pre-start-boundary guarded.

## 27. Final Verdict

Match Results is a mature **shared** module; the Hub's Results segment is the correct thin entry point. Recommend **Hybrid (Option D)**: give the Hub Results segment per-tournament management actions that **reuse** the shared service/components, keep global/dispute/correction/history in the shared module, and align the stale `tournaments.enter_scores` gate. No database change is required. Highest-value, lowest-risk first step is **Phase B** on top of the already-shipped Step 3C segment.
# Tournament Matches Hub Consolidation

> Step 3C — Tournament Hub → Matches consolidation (frontend-only).
> Repository state: post `fc0c1fa0` (canonical match API) + this step.

## 1. Objective
Make **Tournament Hub → Matches** the primary tournament-specific match-management surface by moving the standalone `TournamentMatchesPage` functionality into the Hub's Matches tab, while keeping the standalone page active as a fallback during transition. Canonical data source: `GET /admin/tournaments/:id/matches` (org mirror), additive contract from Step 3B (`stage_name`, `stage_order`, `stage_progression_format`, `group_name`, `result_id`, `result_status`).

## 2. Existing Functionality Preserved
Everything outside the Matches section is untouched: Overview, Participants, Competition (incl. GSK groups/qualification/knockout/bracket), Standings, Finances, Settings, the universal `MatchDetailsDrawer`, permissions, translations, and all other routes. The bracket tab's "Record Result" link behavior is unchanged.

## 3. Hub Matches Architecture
- New component `frontend/src/components/tournaments/hub/MatchesManager.tsx` fed by the Hub's existing canonical matches query — **one fetch** drives all segments (no per-segment requests).
- Standalone result-form logic extracted to `frontend/src/utils/tournamentResult.ts` (single source; the standalone page imports it too — no duplicated result calculation).
- `TournamentMatchNode` extended additively with the Step 3B canonical fields.

## 4. Match Segments
Client-side filtering on the same loaded array. Mapping (documented in code, based on actual status/result fields):
- **All** — every match.
- **Upcoming** — `status === 'scheduled'`.
- **Live** — `status === 'in_progress' || shared_status === 'in_progress'`.
- **Completed** — `status ∈ {completed, walkover, forfeit, no_show}`.
- **Results** — `result_status ∈ {pending_confirmation, disputed, no_result}` (matches needing result attention).
- Optional lightweight **Stage** filter (client-side) when >1 stage exists.

## 5. Actions
Per-match, gated by the exact backend permissions (`tournament.manage` / `org.tournaments.manage`; Record Result → `tournament.result.manage` / `org.tournaments.result.manage`):
- **Details** — opens the universal `MatchDetailsDrawer` (page-level, unchanged).
- **Matches & Schedule** — entry point to the existing schedule page (scheduling architecture untouched).
- **Start** (when `shared_status === 'closed'`) / **Complete** (when `in_progress|completed`) — existing APIs.
- **Assign Court** — picker built on the existing eligible-courts endpoint (no more raw-id field in the Hub).
- **Assign Referee** — existing numeric-id API (no referee-list endpoint exists in the project; documented limitation).
- **Record Result** — ported result modal with sport-aware sets/goals payload via the shared result API.

## 6. Result Integration
The Hub invokes the **existing** result flow (`POST /admin/tournaments/matches/:matchId/result` with shared `RawMatchResultPayload`); no new result engine. The **Results** segment provides a contextual **Open Match Results** link to the shared `AdminMatchResultsPage`/`OrgMatchResultsPage` (no duplicated approval/dispute UI).

## 7. Scheduling Integration
The `TournamentSchedulePage` is **not moved**; the Matches section keeps the existing `Matches & Schedule` entry point and per-row Schedule buttons. After returning, matches refetch via the canonical query. No scheduling logic duplicated.

## 8. GSK Support
- Group-stage matches: `stage_progression_format='round_robin'` + `group_name` chip shown.
- Knockout matches: `stage_progression_format='knockout'`, no group chip.
- Single-elimination and round-robin rows render with the same contract; nothing assumes every match is a bracket match.

## 9. Permissions
Every action uses the existing authoritative keys; nothing new. The known pre-existing mismatch (`tournaments.enter_scores` frontend gate vs backend `tournament.result.manage`) is unchanged and documented; the Hub's result entry uses the correct backend-facing key (`...result.manage`). Backend remains authoritative.

## 10. Query Invalidation
After start/complete/court/referee/result mutations: invalidate the canonical matches query (`[tournament-matches, id]` / org equivalent), standings, and the player-facing `['tournament', id, ...]` matches/standings/bracket keys. One canonical fetch per tournament.

## 11. Responsive / Accessibility
Responsive rows (stacked on mobile, inline metadata on desktop, no list-level horizontal scroll), 44px segment/action targets, text+badge status (never color-only), `Badge`/`Button`/`Modal(a11yDialog)` primitives, `aria-pressed` segments, labelled controls, focus + Escape handling via the existing Modal; no new animation; reduced-motion untouched.

## 12. Legacy Page Status
`frontend/src/pages/admin/tournament/TournamentMatchesPage.tsx` **remains active and unchanged** except importing the shared result util. **No legacy route was removed or redirected.**

## 13. Tests
- New `src/components/tournaments/hub/__tests__/MatchesManager.spec.tsx` — 19 tests (canonical data render, segments, stage/group, drawer callback, start/complete, court picker, referee API, result modal payload, loading/error/empty, results/monitoring links, stage filter, mobile layout, dialog a11y).
- Existing tournament suites updated only for the intentional consolidation (universal-spec mock now exports participant APIs; hub detail spec still asserts player/court/referee/score rendering in the new section).
- Tournament frontend suite: **309 passed / 28 files**.

## 14. Docker / Build
Frontend rebuilt and restarted; backend/mysql/redis healthy; `npm run build` green; no DB changes; only the intended files changed.

## 15. Known Limitations
- Referee assignment still uses the numeric-id input (no referee-list endpoint exists).
- GSK realtime gap (group-stage/knockout-generated events not published) remains — later realtime phase.
- The known `tournaments.enter_scores` frontend/backend key mismatch remains for the bracket tab's Record Result link.
- Scheduling remains on the standalone page (entry point only from Matches).

## 16. Next Step
Phase D/E/F: live/monitoring integration, legacy route deprecation (after parity proven), and realtime parity. Match Results / Monitoring shared screens remain untouched.
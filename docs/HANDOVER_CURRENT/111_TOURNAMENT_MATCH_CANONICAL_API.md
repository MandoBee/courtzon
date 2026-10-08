# Tournament Match Canonical API

> Step 3B — canonical backend read contract for the upcoming **Tournament Hub → Matches** consolidation.
> Repository state: post `648c11db` (Step 2B-2) + this step.
> **Frontend consolidation is NOT included in this step.** No database changes were made.

## 1. Canonical endpoint

```
GET /admin/tournaments/:id/matches        (authenticated, tournament.view)
GET /org/:orgId/tournaments/:id/matches   (org-scoped, org.tournaments.view)
```

- Both call `tournamentService.getMatchesDetailed(id)` → `tournamentRepository.findMatchesDetailed(id)`.
- Response: **RAW array** (`[]`) of detailed tournament match rows — no envelope, no pagination (pre-existing admin/org contract, preserved exactly).
- The player/public read `GET /tournaments/:id/matches` keeps its `{ data: [...] }` envelope and serves the **same detailed row** (this is the pre-existing shared-detail design; this step does not change it).
- The consumer (Hub + standalone page) already reads this endpoint via `tournamentApi.getMatches(id)` / `orgTournamentApi.getMatches(...)`.

## 2. Existing behavior preserved

- All pre-existing `tournament_matches.*` columns returned via `tm.*` (identity, participants, winner/loser, status, progression, scheduling, court, referee, bracket fields) — unchanged names, types, semantics.
- Existing joins preserved: shared `matches` (`shared_status`, `format_snapshot`, `rule_snapshot`, `booking_id`), user names (`player1_name`/`player2_name`), participant names (`participant1_name`/`participant2_name`), resource name, referee name.
- Ordering unchanged: `ORDER BY tm.round, tm.bracket_position`.
- No pagination introduced; no envelope change; no field renamed; no field removed.

## 3. Added fields (additive, derived — no DB changes)

| Field | Type | Source | Purpose (Hub Matches) |
|---|---|---|---|
| `stage_name` | `string \| null` | `LEFT JOIN tournament_stages st` | Stage label (e.g. “Group Stage”, “Knockout”) |
| `stage_order` | `number \| null` | same join | Stage ordering (GSK: 1=groups, 2=knockout) |
| `stage_progression_format` | `string \| null` | same join (`st.progression_format`) | round_robin vs knockout discriminator |
| `group_name` | `string \| null` | `LEFT JOIN tournament_groups g` | Group label (GSK group matches; NULL for knockout/plain) |
| `result_id` | `number \| null` | scalar subquery over `match_result_records` | Latest shared Match result id (pending-approval entry) |
| `result_status` | `string \| null` | scalar subquery (`submission_status`) | `pending_confirmation \| approved \| disputed \| withdrawn \| no_result` |

- Scalar subqueries (not joins) for `result_id`/`result_status` so rows are never multiplied.
- No duplicate aliases of existing fields were introduced (e.g. participants already have both id and name).

## 4. Filters

The canonical endpoint currently supports **none** beyond the tournament id path param (pre-existing; the Hub and standalone page fetch the full tournament match set). This step deliberately does **not** add status/stage/group/date/court/referee/search filters: the consolidated UI will filter client-side from this single source, and a server-side filter layer (if needed) should be a following step reusing existing service patterns.

## 5. Stage/group semantics

- **Group-stage (GSK):** `stage_id` + `group_id` + `group_name` + `stage_progression_format='round_robin'`.
- **Knockout (GSK second stage / plain knockout):** `stage_id` + `stage_progression_format='knockout'`, `group_id`/`group_name` remain `NULL`.
- **Single elimination:** knockout stage context; bracket fields (`bracket_position`, `is_final`, `bracket_depth`, `progression_meta`) available via `tm.*`.
- **Round robin:** group context or `NULL` groups (legacy); standings operate via `tournament_standings`.
- No code assumes every match has a group or is a bracket match; both legacy and GSK rows are handled by the same contract.

## 6. Status/result semantics

- `status` — tournament match status (`scheduled|in_progress|completed|walkover|cancelled|forfeit|no_show`).
- `shared_status` — shared `matches` session status (`open|full|closed|in_progress|completed|cancelled|void`) — drives standalone start/complete visibility.
- `progression_state` — bracket/group progression (`pending|ready|bye|completed|cancelled`).
- `result_status` — shared Match Result **submission/approval state** (`pending_confirmation|approved|disputed|withdrawn|no_result`); enables the future Hub "Results / Pending Approval" segment without new queries.

## 7. Admin/org scope

- Admin and org use **separate endpoints that share the same service + repository** and identical response shape (raw array). Both preserved; no merging of routes.
- Org reads are tenancy-guarded: `assertOrgOwnsTournament(orgId, id)` runs **before** any data access (cross-org → 404 `TOURNAMENT_NOT_FOUND`).

## 8. Authorization

- Read: `tournament.view` (admin) / `org.tournaments.view` (org) / `tournament.view` (player `GET /tournaments/:id/matches`); public discovery remains `GET /public/tournaments/:id`.
- The canonical **read** contract does not weaken any backend permission.
- Known (unfixed, per audit) mismatch remains for later steps: the Hub "Record Result" button is frontend-gated by `tournaments.enter_scores` while the backend result routes require `tournament.result.manage` / `org.tournaments.result.manage` / (shared) `matches.result.submit`. This step does not touch it.

## 9. Performance considerations

- Single query per tournament; no N+1; existing indexed filters (`tournament_id`, `stage_id`, `group_id`, `match_id`). The two new scalar subqueries are correlated but confined by `match_result_records.match_id` (per-match result rows), matching how the shared module already reads them.
- No in-memory global filtering; no extra participant/court/referee round-trips.

## 10. Compatibility

- Backward compatible for the Hub (`TournamentDetailPage`), standalone `TournamentMatchesPage`, org Hub, and player/public `getMatchesHandler`.
- Existing frontend reads (`m.stage_id`, `m.group_id`, `m.shared_status`, `m.rule_snapshot`, `m.player1_name`, `m.resource_name`, `m.referee_name`, `m.match_id`, `m.score_summary`, …) are all unchanged.
- No frontend source change was required for this step.

## 11. Tests

- `backend/.../__tests__/tournament-match-repository.contract.spec.ts` (3): SQL shape (single query, no top-level pagination), additive joins/subqueries present, row passthrough preserves existing + new fields.
- `backend/.../__tests__/tournament-match-canonical-api.spec.ts` (5): admin raw-array contract with new fields; player `{ data }` envelope; org cross-org 404 enforcement; org owning-org passthrough; documented-field union (no unexpected private fields).
- Existing tournament detail-contract + bracket-capability + match-result suites remain green.

## 12. Limitations

- No server-side filters yet (client-side filtering in the consolidated Hub is the immediate path).
- Result state is the *latest* `match_result_records` row per shared match (scalar subquery) — matches the shared module's per-match result model; not a history list.
- GSK realtime gap (group-stage-generated / knockout-generated not published) is unchanged and documented in the consolidation audit — a later phase.
- No pagination for the match list (pre-existing).

## 13. Next Step

Phase B (not in this step): consolidate **Tournament Hub → Matches** management UI on this canonical contract — segment filters (All/Upcoming/Live/Completed/Results), port standalone actions (start/complete/court/referee/result), single Match Details Drawer, and keep backend authoritative. Frontend consolidation is explicitly NOT included here.
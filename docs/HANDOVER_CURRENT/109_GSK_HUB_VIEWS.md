# HANDOVER 109 — GSK Views in Tournament Hub (Step 4B)

**Date:** 2026-10-07
**Scope:** Step 4B only — frontend Organizer/Admin Tournament Hub GSK competition views (Groups / Qualification / Knockout). No backend/DB/engine changes; no Player/Public GSK views.

---

## 1. Hub Changes
`frontend/src/pages/admin/tournament/TournamentDetailPage.tsx` (the shared admin/org Hub) now detects GSK via `tournament.format === 'group_stage_knockout'` and adapts the **Competition** area:
- GSK sub-tabs: `Groups · Qualification · Draw · Knockout` (org also `Categories`).
- Non-GSK sub-tabs unchanged: `Groups · Draw · Bracket` (org also `Categories`).
The existing Draw sub-tab and all other Hub tabs are preserved. A `stages` query (existing `getStages` route) fetches the group (`round_robin`) and knockout stages; competition refresh invalidates groups/matches/standings/stages queries.

## 2. Groups View
`frontend/src/components/tournaments/hub/GskCompetitionViews.tsx → GskGroupsView` — renders real `tournament_groups` with the **authoritative** per-group `tournament_standings` (filtered by `group_id`, ordered by `rank_position`): rank, participant (existing `PlayerAvatar`), played, W/D/L, points, games won/lost, and a `Q` badge for ranks within `group.advance_count`. No frontend standings calculation. A permission-gated `Generate Groups` action (`generate-gsk-groups`, POST `…/generate-groups {stage_id}`) is disabled when no group stage exists or groups already exist.

## 3. Qualification View
`GskQualificationView` — shows the configured rule (`topPerGroup` + best thirds + ordering, read from the group stage `config`), a `Run Qualification` action (POST `…/qualify {stage_id}`) gated by `tournament.manage`/`org.tournaments.manage`, and the returned qualified list (rank, group, group rank, type). States: **qualification pending** when no group stage exists; **incomplete** when not all group matches are `completed` (action disabled); result shown immediately after success (React Query invalidation, no page reload). Never fabricates qualifiers.

## 4. Knockout Integration
`GskKnockoutView` — reuses the ONE shared `TournamentBracket` (no second implementation) with matches filtered to the knockout `stage_id`, preserving `MatchDetailsDrawer` via `onMatchClick`. Before the knockout stage exists it shows a **"Knockout stage not generated yet"** state plus a permission-gated `Generate Knockout` action (POST `…/knockout {stage_id}`), disabled until the group stage exists; never auto-generates on load.

## 5. Lifecycle Actions
Actions follow backend state: groups generation only when a group stage exists and no groups; qualification only when all group matches are completed; knockout only when the group stage exists (backend enforces qualification completeness and 409s are surfaced as toasts). Mutations disable while pending (no double submit); 409/idempotency errors are shown via `getErrorMessage` → toast (no raw codes).

## 6. Permissions
All generation/qualification buttons are wrapped in `<Can permission={managePerm}>` where `managePerm = tournament.manage` (admin) / `org.tournaments.manage` (org). Views are read-only for users without manage permission.

## 7. Realtime / Refresh
After each GSK mutation, `refreshCompetition()` invalidates `groups`, `matches`, `standings`, `stages` query keys; existing realtime invalidation continues to refresh the player-side keys. No full-page reload.

## 8. Responsive / Accessibility
Groups render a responsive `grid-cols-1 lg:grid-cols-2`; standings tables use `overflow-x-auto` (contained). Actions use `min-h-[44px]`. Buttons have text labels; the pending/incomplete states use text (not colour-only); bracket keeps existing horizontal-scroll behaviour and reduced-motion CSS.

## 9. Tests
New `frontend/src/pages/admin/tournament/__tests__/GskHub.spec.tsx` — **5 passed**: format detection exposes Qualification/Knockout (not Bracket); real groups + authoritative standings render; qualification-incomplete state disables the action; knockout view renders when the stage exists; non-GSK keeps the Bracket tab and does not fetch stages.
Tournament frontend suites: **26 files / 227 passed** (broader run 27 files / 243 passed incl. translation integrity).
`npm run build` (tsc + Vite): **PASS**.

## 10. Build / Docker / Health
`npm run build` → PASS. Frontend Docker: `docker compose build frontend` + `up -d frontend` → healthy; `:5173` → 200; backend unchanged, `/health` → 200. (Recorded after the run.)

## 11. Known Limitations
Qualification results are recomputed on demand (backend does not persist them), so the qualified list resets to the pending state after a full reload until `Run Qualification` is pressed again; manual per-seed editing UI not included; Player/Public GSK views not implemented; group `Q` badge uses `advance_count` only; no play-ins / DE / Swiss.

## 12. Commit
Hash/push recorded after verification — message: **`feat(tournaments): integrate GSK views into tournament hub`**.

## 13. Exact Next Recommended Step
**Step 4C — Player/Public GSK views**: mirror the Groups/Standings/Qualification/Knockout read-only experience on the player and public tournament pages (reusing `GskGroupsView`, `TournamentBracket`, and the public read-model).
# HANDOVER 110 — Player & Public GSK Views (Step 4C)

**Date:** 2026-10-07
**Scope:** Step 4C only — frontend READ-ONLY Group Stage + Knockout (GSK) experience for (1) authenticated tournament players and (2) public unauthenticated visitors. No backend/DB/engine/API-contract changes. No DE/Swiss/play-ins.

---

## 1. Result

- **Player (authenticated):** full read-only GSK experience delivered — Overview · Matches · **Groups** · **Qualification** · **Knockout** · Standings · Participants — reusing the ONE shared `TournamentBracket`, `MatchCard`/`MatchDetailsDrawer`, and the shared GSK presentation components.
- **Public (unauthenticated):** GSK is detected and the authoritative public match list + standings are shown **honestly** (the match list is labelled *Matches*, never claimed to be a knockout-only bracket). The **public read-model does not expose the data required** for grouped standings or a knockout-only bracket — see §12 Known Limitations / missing contract. **No backend change was made** (per Step 4C constraints).

## 2. Player GSK Experience

`frontend/src/pages/tournaments/TournamentDetailPage.tsx`:
- Detects GSK via `tournament.format === 'group_stage_knockout'`.
- For GSK the tab bar becomes `Overview · Matches · Groups · Qualification · Knockout · Standings · Players`; **non-GSK tabs are unchanged** (`Overview · Bracket · Matches · Standings · Players`). Tabs now use `role="tab"` + `aria-selected`.
- **Groups tab** → shared `GskGroupsView` with authoritative per-group `tournament_standings` (filtered by `group_id`, ordered by `rank_position`), seed-independent, plus the **current-player highlight** (see §5).
- **Qualification tab** → shared read-only `GskQualificationPanel` (see §6).
- **Knockout tab** → shared read-only `GskKnockoutPanel` wrapping the ONE `TournamentBracket`, filtered to the knockout stage; `MatchDetailsDrawer` preserved via `onMatchClick` (see §7).
- **No organizer actions** are rendered (no Generate Groups / Run Qualification / Generate Knockout / lifecycle controls).

## 3. Public GSK Experience

`frontend/src/pages/player/PublicTournamentDetailPage.tsx`:
- Detects GSK via `t.format === 'group_stage_knockout'`.
- Renders the existing public `TournamentBracket` under the heading **Matches** (with the note *"Includes group-stage and knockout matches."*) instead of implying a knockout bracket, and the existing public standings table. Everything remains read-only and unauthenticated.
- No organizer actions, no fee/prize/payment/organisation/private-participant data (unchanged public safety posture).

## 4. Groups / Standings

- **Player:** `GskGroupsView` (shared with the Organizer Hub) renders real `tournament_groups` (name, participants count) with the authoritative per-group standings — rank, avatar + name, P/W/D/L, points, games won/lost, and a `Q` badge for ranks within `group.advance_count`. **No frontend standings calculation** and no duplicate standings table.
- **Public:** the public standings table (flat) is shown; per-group separation is impossible from the public read-model (no `group_id`), documented in §12.

## 5. Current-Player Highlight

`GskGroupsView` gained an optional `highlightRegistrationId`. The row whose `tournament_standings.registration_id` matches the player's registration is highlighted and marked **not colour-only**: `data-current-player="true"`, `aria-current="true"`, a bordered **"You"** badge (`data-testid="gsk-current-player"`), plus a subtle `bg-[var(--color-primary-bg)]` tint. Identity resolution reuses the existing participant list (`player_id → registration_id`). Public visitors get no highlight.

## 6. Qualification

- Player qualification is **read-only**: the shared `GskQualificationPanel` shows the configured **rule** (top-per-group + best thirds + ordering, read from the group stage `config`), an honest **incomplete** state when not all group matches are `completed` (`gsk-qual-incomplete`), a **pending** state when no group stage exists (`gsk-qual-pending`), and — once complete — *"The qualified participants will be published by the organiser."* It **never fabricates** qualifiers and **never mutates**.
- The backend qualification result is not persisted; a read endpoint to retrieve it does not exist, so the player/public surfaces do not attempt to display a persisted result. The shared panel *can* render a `qualified[]` list when/if such data is supplied (unit-tested), ready for a future read endpoint.
- The organizer `Run Qualification` action remains only in `GskQualificationView` (Step 4B Hub), not on player/public surfaces.

## 7. Knockout / Bracket

- Reuses the **single** `TournamentBracket` (`GskKnockoutPanel`); only knockout-stage matches (`stage_id === knockoutStage.id`) are passed in. Round labels, participants, scores, winners and progression come from the existing component. `MatchDetailsDrawer` opens read-only on match click.
- Before knockout exists: **"Knockout stage not generated yet."** (`gsk-knockout-pending`). **No generation controls** and nothing is auto-generated.
- Print: the existing player Print action is preserved (`Print Knockout` on the GSK tab).

## 8. Match Details

Clicking a GSK knockout match uses the existing `MatchDetailsDrawer` (unchanged). It stays read-only and shows the existing supported fields. No new match-details implementation and no admin-only data is exposed.

## 9. Responsive / Accessibility

- Groups: responsive `grid-cols-1 lg:grid-cols-2`; standings tables use contained `overflow-x-auto` (no page-level overflow). Mobile stacks groups vertically.
- Bracket keeps its existing horizontal-scroll behaviour and reduced-motion CSS.
- Tabs are `role="tab"` with `aria-selected`; match cards are real `<button>`s; qualification indication is text + border + ARIA (not colour-only); loading/error/empty states reuse existing patterns.

## 10. Realtime / Refetch

No new realtime mechanism. The player/public views use the existing React Query keys (`['tournament', id, 'matches'|'standings'|'participants'|'groups'|'stages']`) so existing socket-driven invalidation refreshes matches/standings/bracket on navigation without a full reload. (A new `stages`/`groups` key pair was added but is invalidated by the same tournament query family on the player side.)

## 11. Files Changed

- `frontend/src/components/tournaments/hub/GskCompetitionViews.tsx` — `highlightRegistrationId` on `GskGroupsView`; new read-only `GskQualificationPanel` + `GskKnockoutPanel`.
- `frontend/src/pages/tournaments/TournamentDetailPage.tsx` — GSK detection, additive tabs, Groups/Qualification/Knockout sections, current-player highlight, knockout filtering.
- `frontend/src/pages/player/PublicTournamentDetailPage.tsx` — GSK detection, honest "Matches" labelling + test hooks.
- `frontend/src/services/tournament.ts` — normalised `getStages` (`{data}` for admin, raw array for org) — also fixes a latent Step 4B Hub stages-shape bug.
- `frontend/src/i18n/translation-keys.registry.ts` — `tournaments.hub.gsk.you` / `qualPendingReadonly` / `qualNotPublished`.
- `frontend/src/pages/tournaments/__tests__/GskPlayerPublic.spec.tsx` — new 14-test suite.

## 12. Known Limitations / Missing Backend Contract (NOT modified)

The **public** `GET /public/tournaments/:id` read-model (`tournament.service.getPublicTournament`) omits fields required for full public GSK views:
1. `standings[]` drops `group_id` → public per-group standings cannot be separated.
2. `bracket[]` drops `stage_id` and `group_id` → group matches cannot be distinguished from knockout matches, so a knockout-only bracket cannot be rendered.
3. No `groups[]` and no `stages[]` are exposed publicly → no group names or qualification rules publicly.

**Required (future backend step, not done here):** add `group_id` to public standings; add `stage_id`/`group_id` (or a `stage_kind`) to public bracket rows; optionally expose public group names and the GSK qualification config. Until then the public page stays honest and read-only.

Also: the player Groups/Stages reads go through the existing `tournament.view`-guarded `GET /admin/tournaments/:id/groups` and `/stages` (the player role already holds `tournament.view`; both are read-only). If a deployment removes `tournament.view` from players, the Groups/Qualification/Knockout tabs degrade to their pending states.

## 13. Tests

New `GskPlayerPublic.spec.tsx` — **14 passed**: player GSK detection (Groups/Qualification/Knockout, not Bracket); real groups + authoritative standings; current-player highlight (ARIA + badge); qualification incomplete state (no fabricated qualifiers); knockout renders the shared `TournamentBracket`; `MatchDetailsDrawer` opens; no organizer mutation actions; shared panel pending state; shared panel qualified render; public match list + standings (no auth); public no-fabrication/no-organizer-actions; public no admin/private data; player non-GSK regression; public non-GSK regression.

Broader: **31 files / 281 tests passed** (tournaments, admin/org tournament hubs, tournament components, player pages, translation integrity). Pre-existing unrelated failures: `src/navigation/parity/parity.test.ts` (7 tests) fails on clean `master` too (verified via `git stash`) — not touched by this step.

## 14. Build / Docker / Health

- `npm run build` (tsc + Vite + PWA): **PASS**.
- Frontend Docker: rebuilt + recreated; container healthy; `http://localhost:5173` → **200**; backend `/health` → **200** (recorded after the run).
- No backend rebuild required (no backend change).

## 15. Commit / Push

Message: **`feat(tournaments): add player and public GSK views`** — commit **`07dbb8e5`**. Pushed to `origin/master`; `HEAD == origin/master`, working tree clean.

## 16. Exact Next Recommended Step

**Step 4D — Public GSK read-model contract:** extend `getPublicTournament` only (add `group_id` to standings, `stage_id`/`group_id` to bracket, expose group names + qualification config) so the public page can render grouped standings and a knockout-only bracket; then upgrade the public page to the full Groups → Qualification → Knockout experience. (Backend + public contract step; keep the player experience as delivered.)

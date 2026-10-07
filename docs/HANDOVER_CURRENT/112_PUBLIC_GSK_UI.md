# HANDOVER 112 — Public GSK UI (Step 4E)

**Date:** 2026-10-07
**Scope:** Step 4E only — FRONTEND public tournament page upgrade to a read-only Group Stage + Knockout (GSK) experience, consuming the Step 4D public read-model. No backend/DB/migration/engine changes; no Player UI / Organizer Hub changes; no new endpoint; no public mutation.

---

## 1. Public GSK UI Changes

`frontend/src/pages/player/PublicTournamentDetailPage.tsx` now detects `format === 'group_stage_knockout'` and renders a read-only tabbed experience driven **entirely** by the public endpoint (`GET /public/tournaments/:id`):

**GSK tabs:** `Overview · Matches · Groups · Qualification · Knockout · Standings` (`role="tab"` / `aria-selected`, wrapped for narrow screens).

Non-GSK `knockout` / `round_robin` keep their **exact** previous layout (description → Details → Venue → Bracket → Standings), still using the shared `TournamentBracket`. No tabs are shown for non-GSK.

Data is taken from the public contract only: `groups[]`, `stages[]`, `standings[].group_id`, `bracket[].stage_id|group_id`. Match nodes get a synthetic stable `id` (the public contract exposes no internal ids).

## 2. Groups

Uses the shared `GskGroupsView` with `groups[]` from the public contract and `standings` filtered by `standings[].group_id` (never inferred). Each group card shows: group name, participant count, and the authoritative standings table — rank, participant display name, P/W/D/L, points, games won/lost. Where the public `stages[].config.groupStage.qualification.topPerGroup` is present it is passed as `qualifyTop`, so the shared "Q" qualification indicator works publicly without per-group `advance_count`. Empty state: **"Groups have not been generated yet."** (`data-testid="gsk-groups-empty"`). No participant/internal ids are shown.

## 3. Group Standings

Authoritative only — no frontend standings calculation. Rows are filtered by `group_id` and sorted by the backend `rank_position`. The flat `Standings` tab also remains available (responsive, contained horizontal scroll).

## 4. Group-Stage Matches

The `Matches` tab renders the public match list as shared `MatchCard`s, with an explicit group filter (`All` + each `groups[].name`) that filters by **`bracket[].group_id`** — never by round/number/order/name. Empty state: "No matches yet."

## 5. Qualification Configuration

Uses the shared read-only `GskQualificationPanel` with the group stage (`progression_format === 'round_robin'`) and the group-stage matches (`bracket[].group_id != null`). It shows the configured rule (`topPerGroup` + best thirds + ordering) from the public `stages[].config` whitelist. The backend does **not** persist a public qualification result, so:
- No `qualified[]` list is fabricated.
- When there is no group stage → **"Qualification pending — the group stage has not been generated yet."** (`gsk-qual-pending`).
- When the group matches are complete → "The qualified participants will be published by the organiser." (`gsk-qual-published`).
No organizer/admin qualification endpoint is called; no public mutation exists. The panel still accepts a `qualified[]` prop for a future public read-model extension.

## 6. Knockout / Bracket

The `Knockout` tab uses the shared `GskKnockoutPanel` → the ONE `TournamentBracket`. The knockout stage is selected explicitly by `progression_format === 'knockout'`, and matches by `bracket[].stage_id === knockoutStage.id` (no ordering/name inference). Rounds, participants, scores, winners, progression and the final render via the existing component. Before the stage exists → **"Knockout stage not generated yet."** (`gsk-knockout-pending`). No generation controls, no auto-generation, no print (the public page never supported print).

## 7. Match Details

Public match clicks (Knockout bracket and Matches cards) open the existing shared `MatchDetailsDrawer` (read-only, `role="dialog"`, name-only nodes — no internal ids, no organizer controls, no private/admin fields). No second drawer implementation.

## 8. Responsive / Accessibility

- Tabs `role="tablist"`/`role="tab"` with `aria-selected`; filter buttons use `aria-pressed`; touch targets ≥32–44px; labels are text.
- Groups: shared `grid-cols-1 lg:grid-cols-2`; standings tables use contained `overflow-x-auto` on a `max-w-3xl` page → no page-level horizontal overflow.
- Bracket keeps its existing horizontal-scroll behaviour; match cards stay readable.
- Qualification indication is text + border (the "Q"/"You" badges), never colour-only. Reduced-motion CSS is inherited from existing components.

## 9. Data Safety

The public page reads from the public endpoint ONLY. It never calls `/admin/…`, `/org/…`, or private player endpoints, and renders only public fields (no fees, prizes, payment methods, participants/registration, user/organisation internal ids, referee/resource ids).

## 10. Shared-Component (additive) Changes

`frontend/src/components/tournaments/hub/GskCompetitionViews.tsx`:
- `GskGroupsView` gained an optional `qualifyTop?: number` (used only when a group has no `advance_count`) and a defensive row key `${group.id}-${rank}`; its empty state gained `data-testid="gsk-groups-empty"`. Player/Organizer behaviour is unchanged when the prop is omitted (per-group `advance_count` still wins).

`frontend/src/types/tournamentBracket.ts`:
- `TournamentMatchNode` gained optional `stage_id` / `group_id` (frontend type-only; the runtime rows already carried them).

No Player UI or Organizer Hub files were modified beyond the shared additive props/types above.

## 11. Tests

`frontend/src/pages/tournaments/__tests__/GskPlayerPublic.spec.tsx` — now **21 passed** (was 14), including the Step 4E public suite: GSK detection + tabs + no organizer controls; groups from `groups[]` with `standings[].group_id` filtering; honest empty-groups state; group-stage match filtering by `bracket[].group_id`; qualification rule render + no fabrication + `gsk-qual-pending`; knockout stage identified via `progression_format`/`stage_id` (group-stage names excluded); `gsk-knockout-pending`; `MatchDetailsDrawer` opens; standings + no admin/private data; plus the preserved Player GSK tests and non-GSK regressions.

Broader suite: **31 files / 288 tests passed** (tournaments, player pages, tournament components, admin/org hubs, translation integrity). Pre-existing unrelated `src/navigation/parity/parity.test.ts` failures (7) are unchanged and out of scope. `npm run build` (tsc + Vite + PWA) — **PASS**.

## 12. Docker / Build / Health

Frontend `docker compose build frontend` → fresh image; `up -d frontend` → healthy; `http://localhost:5173` → **200**; backend `/health` → **200** (recorded after the run). No backend change/rebuild.

## 13. Known Limitations

- Qualification **results** remain unpublished (backend does not persist them); the public page shows configuration + honest states only, by design.
- The public contract exposes no participants list, so there is **no Participants tab** (participant names appear via standings/bracket only). A public participants read-model would be a separate future step.
- The public `Standings` tab is a flat table across groups; grouped standings live under `Groups` (the public contract intentionally omits per-group `advance_count`).
- No DE / Swiss / play-ins.

## 14. Commit / Push

Message: **`feat(tournaments): complete public GSK tournament experience`** — hash + push recorded after verification; `HEAD == origin/master`, working tree clean.

## 15. Exact Next Recommended Step

**Step 4F — Public participants read-model + UI (optional):** if a public participants list is desired, expose a minimal public `participants[]` (`{ name }`-only, no ids) in `getPublicTournament` and add a `Participants` tab to the public GSK page. Otherwise proceed to any unrelated backlog item; the GSK public experience (Groups → Standings → Qualification → Knockout) is complete.

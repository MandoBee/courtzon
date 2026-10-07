# HANDOVER 111 — Public GSK Read-Model Contract (Step 4D)

**Date:** 2026-10-07
**Scope:** Step 4D only — BACKEND extension of the existing public tournament read-model so the public frontend can truthfully render Group Stage + Knockout (GSK). No frontend edits, no DB/schema/migration/seed changes, no engine/logic changes, no new endpoint.

---

## 1. Current Public Read-Model Behaviour

`GET /public/tournaments/:id` (anonymous, `is_public=1`, non-draft only):

- **Route:** `backend/src/modules/tournaments/presentation/public-tournament.routes.ts` → `getPublicTournamentHandler`.
- **Controller:** `tournament.controller.ts` → returns `{ data: getPublicTournament(id) }`.
- **Service:** `tournament.service.ts → getPublicTournament(id)` — the ONLY place the public shape is projected (allowlist, never spread).
- **Repository reads:** `findById`, `findByIdDetailed`, `findMatchesDetailed`, `getStandings`, and now `findGroups` + `findStages`.
- Before this step the response contained tournament fields, plus optionally `bracket[]` (round, round_name, match_number, bracket_position, participant names, status, progression_state, score_summary, start_time) and `standings[]` (rank_position, player_name, points, wins, losses, draws, games_won/lost, sets_won/lost) — with **no way to distinguish group vs knockout** and **no group labels**.

## 2. Public Endpoint / Contract Changed

**No new endpoint, no semantic change.** The existing `GET /public/tournaments/:id` response is extended **additively** (optional fields present only when the underlying data exists). The auth middleware continues to short-circuit `/public/…` (no token required).

## 3. Fields Added (all additive / optional)

Bracket rows (`d.bracket[]`):
- `stage_id` — the stage the match belongs to (nullable).
- `group_id` — the group the match belongs to; **`null` identifies a knockout (or non-grouped) match** (nullable).

Standings rows (`d.standings[]`):
- `group_id` — the group the standing belongs to (nullable; `null` for non-grouped round-robin/knockout standings).

New optional top-level keys (only emitted when the data exists):
- `groups[]` — minimal `{ id, name }` (public group label).
- `stages[]` — `{ id, name, stage_order, progression_format, config }` where `config` is a **public-safe subset** (see §6).

## 4. GSK Group Representation

- Group standings are now attributable: each `standings[]` row carries `group_id`, and `groups[]` supplies `{ id, name }` so the public UI can render **Group A / Group B** tables without inference.
- Group matches carry `group_id` in `bracket[]`; knockout matches have `group_id: null`.
- Only `id` + `name` are exposed for a group — `advance_count`, `competition_id`, `size`, timestamps and all internal columns are **not** projected.

## 5. GSK Knockout Representation

- Knockout matches carry the knockout `stage_id` and `group_id: null`, so the public UI can select **only** knockout matches (`stage_id === knockoutStage.id`) without frontend inference.
- `stages[]` exposes `progression_format` (`round_robin` / `knockout`) so the knockout stage is identifiable directly.

## 6. Qualification Configuration Behaviour

`stages[].config` is projected by a dedicated whitelist helper (`buildPublicStageConfig`) and contains **only**:
- `groupStage.groupCount`
- `groupStage.participantsPerGroup`
- `groupStage.qualification.{ topPerGroup, bestThirdPlaces, ordering }`
- `knockout.startingRound`

Explicitly **excluded** (organizer-only): `seeding`, `separateGroupWinners`, `preventSameGroupRematch`, `allowByes`, `playInRounds`, and all rule-set/match-format ids. `config` is `null` when the stage carries no public configuration.

**No qualification RESULT is fabricated or persisted.** The backend recomputes qualification on demand and does not store a qualified list; the public contract therefore exposes **configuration only**, never a pretended qualified list. (Verified in the integration test: no `qualified` data is emitted.)

## 7. Security / Privacy

Verified (integration test asserts key-by-key):
- No financial fields: `entry_fee`, `registration_fee`, `currency_code`, `commission_rate`, `prizes`, `sponsors`, `registration_payment_methods`, `price_type`.
- No tenant/internal keys: `creator_id`, `organisation_id`, `branch_id`, `deleted_at`, `created_at`, `updated_at`.
- No identity leaks: bracket rows never expose `match_id`/`participant*_id`/`player*_id`/`winner_id`/`referee_id`/`resource_id`; standings never expose `registration_id`/`player_id`/`user_id`.
- No raw member/user ids appear anywhere in the serialized public response.
- `group_id`/`stage_id` are competition identifiers, not user identity.
- Private/draft/cancelled/archived/nonexistent tournaments still behave as an indistinguishable 404 `TOURNAMENT_NOT_FOUND` (unchanged).

## 8. Backward Compatibility

- All additions are **optional** and emitted only when the underlying rows exist.
- Non-GSK `knockout` / `round_robin` responses keep their previous shape; the new `stage_id`/`group_id` on bracket rows are simply `null` when unset, and `groups`/`stages` are **not invented** when absent (asserted).
- The existing `tournament-public-discovery.g11-16` integration suite (which enforces the no-leak contract) passes unchanged.

## 9. Tests

- **New** `backend/src/modules/tournaments/__tests__/tournament-public-gsk.g11-16d.integration.spec.ts` — **2 passed**: (1) public GSK with stages/groups/standings group matches + knockout matches asserts `standings[].group_id`, `bracket[].stage_id`, group-match `group_id`, knockout `stage_id` + null `group_id`, minimal `groups[]`, safe stage `config` (and exclusion of organizer-only flags), plus full no-leak sweeps; (2) non-GSK knockout response stays shape-compatible (no `groups`/`stages`, nullable discriminators).
- **Updated** `tournament-not-found-error-code.spec.ts` mock to reflect the two new repository reads (`findGroups`, `findStages`).
- **Existing** `tournament-public-discovery.g11-16.integration.spec.ts` + `tournament-gsk-lifecycle.integration.spec.ts` — **22 passed** (backward compatibility + GSK engine untouched).
- Tournament backend unit suite — **47 files / 789 passed**.
- `npm run build` (backend `tsc`) — **PASS**.

## 10. Docker / Build / Health

- Backend `docker compose build backend` → fresh image; `up -d backend` → healthy; `/health` → **200**; `/health/ready` → **200** (recorded after the run). Frontend untouched.

## 11. Database Status

**No migration, no schema/seed change, no DB reset.** All fields already exist: `tournament_matches.stage_id` / `group_id` / `round_name` (indexed), `tournament_standings.group_id`, `tournament_groups`, `tournament_stages.config`. Baseline untouched.

## 12. Commit / Push

Message: **`feat(tournaments): expose GSK public read model`** — hash + push recorded after verification; `HEAD == origin/master`, working tree clean.

## 13. Remaining Limitations

- Qualification **results** are not persisted server-side; the public contract exposes configuration/state only. A persisted qualification read model would be a separate future step if required.
- Public contract still exposes only display names (no participant ids); public GSK views remain display-only.
- Group `advance_count` is intentionally not exposed (qualification `topPerGroup` covers the public "who advances" indicator); revisit only if a public UI needs per-group advance counts.
- No DE / Swiss / play-ins.

## 14. Exact Next Recommended Step

**Step 4E — Public GSK UI (frontend):** upgrade `frontend/src/pages/player/PublicTournamentDetailPage.tsx` to consume the new `groups` / `stages` / `standings[].group_id` / `bracket[].stage_id|group_id` fields and render **Groups → Group Standings → Qualification (config) → Knockout** (read-only, unauthenticated), reusing the shared `GskGroupsView`, `GskQualificationPanel`, `GskKnockoutPanel` and `TournamentBracket`. No backend change expected.

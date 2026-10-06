# HANDOVER 99 — Group Stage + Knockout (GSK): Architecture & Contract Audit

**Status:** Step 3A — AUDIT ONLY. No code, DB, migration, or behaviour changes.
**Purpose:** Precise evidence-based contract for the future GSK engine (Step 3B).

---

## 1. Executive Summary

CourtZon's current engine executes **exactly two formats**: `knockout` and `round_robin`
(`ENGINE_EXECUTABLE_FORMATS`, `backend/src/modules/tournaments/domain/tournament-aggregate.ts:14`).
The domain has the concepts GSK needs (**stages, groups, group members, standings, progression
metadata, stage ordering, byes, deterministic seeding**) but almost none of the group-stage
**execution** is wired:

- `generateGroups` creates group + member rows only — **no group matches, no `group_id` writes**.
- The shared match generator (`MatchScheduleService.buildSlots`) throws for anything except
  knockout/round_robin and **never sets `group_id` or a stage's `stageId`**.
- `generateStageMatches` (the only GSK-aware generator) is **domain-only** (no production caller),
  and its GSK branch merely maps a round-robin list onto round 1 — it cannot produce the
  8×4 → R16 journey.
- `advance_count` is stored but **never consumed**; there is **no qualification engine**.
- The create contract (`tournament.dto.ts:70`) restricts `format` to `knockout|round_robin`.

**Verdict: REQUIRES ARCHITECTURAL CHANGE** (engine + service + contract) **with a MINOR, additive
DATABASE CHANGE** required to persist per-tournament GSK configuration.

## 2. Current Tournament Architecture

- Domain owner: `backend/src/modules/tournaments/domain/tournament-aggregate.ts`
  (`generateKnockoutBracket`, `normaliseBracketTargets`, `generateRoundRobinMatches`,
  `generateStageMatches`, `computeStandings`, `seededShuffle`, `createSeededRng`).
- Match generation: `backend/src/modules/tournaments/application/match-schedule.service.ts`
  (`generateMatchesFromLockedDraw` → `buildSlots`, locked-draw gated, per competition).
- Lifecycle: `domain/lifecycle.ts` (10 statuses), `tournament.service.ts` (`startTournament`,
  `completeTournament`, guarded transitions).
- Group/stage/standings service: `application/tournament.service.ts` (`generateGroups`,
  `createStage`, `getStages`, `recalculateStandings`, `progressFromApprovedResult`).
- Draw/seeding: `application/participant-draw.service.ts` (seeds, generateDraw, locked-draw).
- Results/progression: shared Match Result engine + `progressFromApprovedResult`
  (`tournament.service.ts:2150`) and the progression listener.
- Routes: `presentation/tournament.routes.ts`, `org-tournament.routes.ts`,
  `public-tournament.routes.ts` (~152 registrations; all permissioned).
- Frontend: Tournament Hub (step 1) + 8-step Creation Wizard (step 2) show GSK as
  "Engine preparation" only.

## 3. Database / Data Model Audit (`database/baseline/001_courtzon_v3.sql`)

| Concept | Current model | Verdict |
| --- | --- | --- |
| Stage representation | `tournament_stages` (5658): `stage_order`, `progression_format` varchar, `match_format_id`, `rule_set_id`, `advance_count`, `status varchar('pending')` | **PARTIALLY SUPPORTED** — can hold Group (RR) + Knockout stages and ordering; `progression_format` is unconstrained varchar; **no per-stage configuration storage** beyond `advance_count` |
| Stage ordering | `stage_order` int | **FULLY SUPPORTED** (orderable) |
| Group stages | `tournament_groups` (5581): `competition_id`, `name`, `size` (never written), `advance_count` | **PARTIALLY SUPPORTED** — rows represent groups; `size` unused; config (per-group format, best-third, ordering) has **no home** |
| Group membership | `tournament_group_members` (5565): `group_id`, `registration_id`, `seed` (unique group/registration) | **PARTIALLY SUPPORTED** — membership + in-group seed exist, but keyed to **registrations**, while matches/seeds are participant-based |
| Standings | `tournament_standings` (5844): `tournament_id`, `group_id`, `registration_id`, wins/losses/draws/points/games/sets, `rank_position`; UNIQUE(tourn,reg,group) | **PARTIALLY SUPPORTED** — group-scoped standings + ranks exist; `games_*` are match counts, `sets_*` always 0, tie-breakers not rules-driven |
| Group vs knockout matches | `tournament_matches` (5685): `group_id` (indexed, **no FK**), `stage_id` (FK SET NULL), `round`, `bracket_position`, `progression_state`, `progression_meta` json | **PARTIALLY SUPPORTED** — columns exist; **`group_id` is never written by production code**, `stage_id` is never set by the slot builder |
| Progression metadata | `progression_meta` json (`is_bracket`, `target_round`, `target_bracket_position`, `target_side`, `bye`, `is_final`, `bracket_depth`) | **PARTIALLY SUPPORTED** — winner→slot wiring for knockout works; **no group→knockout qualification wiring** |
| Qualification | `tournaments`/`tournament_groups.advance_count`, `tournament_standings.rank_position` | **NOT SUPPORTED as behaviour** — values stored, **never consumed** |

## 4. Backend Contract Audit (`presentation/tournament.dto.ts`)

- `CreateTournamentSchema.format` = `z.enum(['knockout','round_robin']).default('knockout')` (line 70)
  — GSK **cannot be created**. `bracket_type_id` NOT NULL FK → a GSK creation needs a bracket-type id
  (none for GSK; the seeded `tournament_bracket_types` holds single/double/round-robin/swiss only).
- `CreateStageSchema.progression_format` (line 275) accepts `group_stage_knockout` (+7 more) — wider
  than the engine; `advance_count` only, **no qualification/knockout config fields**.
- `GenerateGroupsSchema` (line 250): `group_size`, `advance_count`, `competition_id` — minimal,
  **no qualifier rule, no seeding/knockout parameters**.
- Match generation (`match-schedule.service.ts:203-236`): `buildSlots` supports `knockout` and
  `round_robin` only; throws otherwise. Locked-draw path is the only generation entry point.
- `RegisterSchema`/draw: participant + competition-scoped; `tournament_seeds` per competition
  (`tournament_seeds.seed_number`) — seeding namespace exists.

## 5. Existing Stage / Group / Standings Capabilities

- `tournament.service.createStage` (3372): inserts a stage (validates match format↔rule set pair),
  emits `tournament:stage-created`.
- `progressFromApprovedResult` (2150–2318): after a result, marks stage `completed` when
  `countIncompleteStageMatches(stage_id)==0`; completing the **last** stage (max `stage_order`)
  completes the tournament. **This is the stage-transition skeleton GSK needs — but nothing seats
  qualified participants into the next stage.**
- `tournament.repository.recalculateStandings(tournamentId, groupId?)` (1164–1243) → domain
  `computeStandings`; `getStandings(tournamentId, groupId?)` filters by group; rows keyed by
  registration.
- `generateGroups` (1919): deterministic group allocation via `seededShuffle(confirmed, draw_seed)`,
  `addGroupMember(registration_id, seed)`.

## 6. Existing Progression / Knockout Capabilities

- `generateKnockoutBracket(participantIds, {seed, seededBy})` (aggregate 899): deterministic,
  explicit byes, optional seeded ordering via `seededBy` map → **reusable for a GSK knockout stage
  if given a qualified, seeded participant list**.
- `normaliseBracketTargets` (963): single source of bracket target topology.
- `buildSlots` knockout path annotates `is_final`/`bracket_depth` at generation.
- `progressFromApprovedResult` (2150): seats winner (participant + legacy user) into the
  `target_round/target_bracket_position/target_side` slot; terminal slot → validated
  `completed` transition; stage completion; byes fixed at draw time via `advanceByes` (2020).
- Draw: seeded, competition-scoped, locked → match generation preserves draw order.

## 7. GSK Gap Analysis (32 → 8×4 → RR → top2 → R16 → QF → SF → F)

| Required step | Existing support | Gap |
| --- | --- | --- |
| Create tournament with GSK | ❌ create `format` rejects it; no bracket-type row | Extend format enum + bracket-type data + GSK config contract |
| Stage chain (group → knockout) | Stage rows + `stage_order` + stage completion exist | No qualification transition seats participants into stage 2 |
| Group creation | `generateGroups` | Members must map to **participants** (not registrations); persist GSK config |
| Group match generation | `generateRoundRobinMatches` reusable | New service path: per-group RR + write `group_id` + `stage_id` |
| Standings per group | `recalculateStandings(groupId)` | Keyed by registration → needs participant bridging; tie-breakers |
| Qualification engine | ❌ | Top-N per group + best-third + ordering → qualified participant list |
| Knockout from qualifiers | `generateKnockoutBracket` + `seededBy` | Provide seeded qualified list, starting round, rematch/winner-separation constraints |
| Progression | `progressFromApprovedResult` | Reuse as-is once stage-2 matches exist |
| Byes / play-ins | Byes yes; play-ins ❌ | Validate qualifier count vs bracket size; explicit play-in layer or rejection |
| Config persistence | ❌ (only `advance_count`) | Add per-stage config JSON (see §12) |

## 8. Proposed GSK Contract (architecture only — NOT implemented)

```ts
// Adapts to existing terminology: `tournament_stages.progression_format`,
// `advance_count`, `tournament_groups`, `tournament_standings.rank_position`.
type GskKnockoutStart = 'round_of_16' | 'quarterfinals' | 'semifinals' | 'final' | 'first_valid_round';

interface GskQualificationRule {
  topPerGroup: number;          // ≥1, ≤ participantsPerGroup
  bestThirdPlaces?: number;     // 0 = none; bounded by group count
  ordering: 'seed' | 'points' | 'rank'; // how the qualified list is ordered
}

interface GskGroupStageConfig {
  groupCount: number;
  participantsPerGroup: number;
  progressionFormat: 'round_robin';
  qualification: GskQualificationRule;
}

interface GskKnockoutConfig {
  startingRound: GskKnockoutStart;
  seeding: 'manual' | 'automatic';
  separateGroupWinners: boolean;      // avoid group winners meeting too early
  preventSameGroupRematch: boolean;   // seeded-lane constraint
  allowByes: boolean;                 // explicit byes when qualifier count ≠ next power of 2
  playInRounds?: number;              // explicit play-in layer (otherwise reject)
}

interface GskConfiguration {
  format: 'group_stage_knockout';
  groupStage: GskGroupStageConfig;
  knockout: GskKnockoutConfig;
}
```

**Where it lives (proposal):** extend `CreateTournamentSchema` with optional `gsk_config` (+
`format: 'group_stage_knockout'`); persist as JSON on a new `tournament_stages.config` column with
two stage rows (order 1 = groups, order 2 = knockout); `advance_count` mirrors `topPerGroup`.

## 9. Qualification Rules

1. **Group standings** derive from the existing rules-driven `computeStandings` per group.
2. **Rank** = points desc → game difference (current) → (future) rules-driven tie-breakers.
3. **Qualifiers per group** = first `topPerGroup` by rank (all group winners/runners-up).
4. **Best third places** = the best (by points → game difference) `k` third-placed participants
   across groups, `k = bestThirdPlaces`.
5. **Qualified list ordering** = configurable (`seed` / `points` / `rank`), group winners first
   (serpentine for winner separation when configured).
6. **Knockout entries** = the ordered qualified participant list handed to
   `generateKnockoutBracket(ids, { seededBy })`.
7. **Same-group rematch prevention** = seeding lanes place group-mates on opposite halves where
   mathematically possible; otherwise the engine must reject the configuration explicitly.

## 10. Invalid Configuration Rules (to be enforced, not implemented)

- `groupCount < 1`; `participantsPerGroup < 2`.
- `topPerGroup > participantsPerGroup`; `topPerGroup < 1`.
- `bestThirdPlaces > groupCount` (cannot exceed the number of third-place positions).
- `groupCount × participantsPerGroup` must match the tournament participant count (or the product
  must be ≥ participants with byes allowed and explicit).
- Qualifier count `Q = groupCount×topPerGroup + bestThirdPlaces` must be `≥ 2`.
- If `Q` is not a power of two and `allowByes=false` → choose a valid starting round; if also not
  valid for any round and `playInRounds` not allowed → **reject** (never silently guess).
- `bestThirdPlaces` + `topPerGroup` duplicate qualification impossible (disjoint sets).
- Knockout starting round must be consistent with `Q` (e.g., Q=20 requires a 16→4 play-in layer,
  or starting at a 32 bracket with 12 byes, or rejection).
- `preventSameGroupRematch` / `separateGroupWinners` must be satisfiable; else reject.
- Stage 1 may not be marked complete while any group match is unresolved.

## 11. Frontend Contract Requirements

- The Step-2 wizard (`TournamentCreatePage.tsx`) already shows GSK as "Engine preparation"
  (`TournamentFormatSelector` handles `group-stage-knockout` as a planned card with a journey
  preview). Unsupported formats are never submitted.
- Required configuration flow (architecture only): **Format → Group Configuration → Qualification
  Rules → Knockout Configuration → Validation Preview → Review**, rendered only when the backend
  contract exists.
- UI fields map 1:1 to the `GskConfiguration` object; the Review step summarises
  `groupCount × participantsPerGroup → topPerGroup (+ best third) → qualified Q → bracket size`.
- The Hub's Competition tab needs a **Groups** view + **Standings per group** + **Qualified**
  panel before the knockout bracket (post-engine).

## 12. Database Change Assessment

**Recommendation: MINOR, additive database change (REQUIRED for first-class GSK).**

| Change | Why | Classification |
| --- | --- | --- |
| `tournament_stages.config json NULL` (per-stage GSK config + qualification rule) | No per-tournament GSK configuration storage exists today | **REQUIRED (minor)** |
| FK `tournament_matches.group_id → tournament_groups(id)` | `group_id` exists but has no FK (defensive integrity) | **REQUIRED (minor, defensive)** |
| (optional) `tournament_groups.size` maintenance | `size` column unused today | Optional |

Everything else (stages, groups, members, standings, matches, progression_meta, stage_order) is
**structurally sufficient** — the bulk of GSK lives in a new **qualification + group-generation
service layer and the extendable contract/engine**, not in schema.

## 13. Recommended Architecture Decision

**Option B — MINOR schema extension + service/engine-first implementation.** The current tables and
knockout/draw/progression engines are genuinely reusable; GSK must be built as new
services (`GskConfigurationService`, `GroupStageService`, `QualificationService`) plus
`generateGroupStageMatches` and a qualification consumer feeding `generateKnockoutBracket`. The DB
change is limited to one additive JSON column (plus the defensive group FK).

## 14. Step 3B Implementation Plan (not executed)

1. Backend contract: extend `CreateTournamentSchema` (`format: 'group_stage_knockout'` +
   `gsk_config`); extend `CreateStageSchema`; bracket-type row/seed decision.
2. GSK configuration validation (rules from §10).
3. Stage creation: two `tournament_stages` rows + persisted `config` JSON.
4. Group generation: participant-based groups (fix registration→participant keying; write `size`).
5. Group match generation: per-group `generateRoundRobinMatches`, write `group_id` + `stage_id`.
6. Standings calculation: per group (`recalculateStandings(groupId)`), participant bridging.
7. Qualification engine: top-N + best-third + ordering → ordered qualified participant list.
8. Knockout participant generation: qualified list + seed map.
9. Knockout seeding: arrival `generateKnockoutBracket` with `seededBy`; rematch/winner-separation.
10. Progression integration: reuse `progressFromApprovedResult` + stage completion.
11. API tests (see §15).
12. Frontend wiring: wizard GSK config steps + Hub groups/qualification views.
13. Full validation pass (invalid configs, idempotency, completion).

## 15. Test Strategy

**Existing relevant suites (reusable):** `tournament-aggregate.spec.ts` (RR/KO/mixed-stage domain),
`tournament-rr-contract.g8d.spec.ts`, `tournament-standings.g8a.spec.ts`,
`tournament-draw-seeding.spec.ts`, `tournament-progression.spec.ts`, `knockout-placements.spec.ts`,
`g9a-round1-targets.spec.ts`, `tournament-live-play.spec.ts`, `match-schedule.service.spec.ts`,
`tournament-formats-scope.g8c.spec.ts` (engine-executable guard).

**Minimum future GSK matrix:** 32/8/top2→R16; other valid group counts; other per-group sizes;
invalid qualification count rejected; invalid knockout size rejected; best-third qualification
(with and without); tie-break scenarios; same-group rematch prevention; deterministic seeding
(repeat seed → identical bracket); group-stage completion before qualification (incomplete results
block); missing/incomplete group results; full knockout progression; final completion; repeated
execution/idempotency (no duplicate groups/matches).

## 16. Risks / Edge Cases

- Registration-based groups vs participant-based identity (teams/pairs) — bridging must be
  explicit.
- Qualifier counts that do not map to a power-of-two bracket (byes/play-ins) — never silent.
- Rematch/winner-separation constraints can be unsatisfiable — must reject, not guess.
- Stage-completion → qualification ordering (atomic, race-safe: reuse `runProvidedTransaction` +
  `FOR UPDATE` pattern from `generateMatchesFromLockedDraw`).
- `setValue`/draw re-generation after withdrawal of a qualified participant mid-knockout.
- Tie-breaker semantics not yet rules-driven (current sort is points → game difference).
- Multi-competition scoping: groups/stages/standings must stay per-competition.

## 17. Final Conclusion

GSK is **architecturally reachable with the existing backbone** — the knockout generator,
progression engine, stage model, standings and draw/seeding infrastructure are reusable — but it
requires (a) a **contract extension** to create GSK tournaments and persist configuration,
(b) a **new qualification engine**, (c) per-group **match generation** wiring, and (d) a **MINOR
additive DB column** (`tournament_stages.config JSON` + defensive `group_id` FK). This is an
Option B outcome: service/engine-first with a small, forward-compatible schema addition.
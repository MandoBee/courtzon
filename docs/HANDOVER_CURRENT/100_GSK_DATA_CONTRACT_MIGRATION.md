# HANDOVER 100 — GSK Data Contract + Minimal Database Migration (Step 3B-1)

**Date:** 2026-10-06
**Scope:** Step 3B-1 only — minimal additive DB foundation + GSK configuration contract + structural validation.
**Not implemented:** group engine, qualification engine, knockout integration, GSK match generation, standings/result/progression changes, any frontend change.

---

## 1. Objective
Prepare the persistent data contract and validated configuration shape for the future Group Stage + Knockout (GSK) engine, without executing any GSK behaviour. The engine remains non-executable.

## 2. Files Changed
| File | Change |
| --- | --- |
| `database/migrations/195_tournament_gsk_config.sql` | **New** additive migration (config column + defensive FK) |
| `database/baseline/001_courtzon_v3.sql` | Baseline updated to match the migration (column + FK) |
| `backend/src/modules/tournaments/domain/gsk-config.ts` | **New** — contract-only GSK configuration types |
| `backend/src/modules/tournaments/domain/tournament-aggregate.ts` | Added `ENGINE_PLANNED_FORMATS` marker; `TournamentStage.config` field |
| `backend/src/modules/tournaments/presentation/tournament.dto.ts` | Added `GskConfigurationSchema` (+ sub-schemas) and `CreateStageSchema.config` |
| `backend/src/modules/tournaments/infrastructure/repositories/tournament.repository.ts` | `createStage` persists `config` JSON; `findStages` parses it |
| `backend/src/modules/tournaments/__tests__/tournament-gsk-contract.spec.ts` | **New** — 19 contract + artifact tests |
| `docs/HANDOVER_CURRENT/99_GSK_ARCHITECTURE_CONTRACT_AUDIT.md` | (from Step 3A) committed with this foundation |

## 3. Database Changes
- **Migration:** `195_tournament_gsk_config.sql` (`COURTZON_MIGRATION_ENV: PRODUCTION_SAFE`, additive, no data mutation).
  1. `ALTER TABLE tournament_stages ADD COLUMN config json DEFAULT NULL` — per-stage configuration (future GSK payload); NULL = unconfigured; existing knockout/round_robin stages unaffected.
  2. `ALTER TABLE tournament_matches ADD CONSTRAINT fk_tm_group FOREIGN KEY (group_id) REFERENCES tournament_groups(id) ON DELETE SET NULL` — defensive integrity; matches history preserved (SET NULL matches `stage_id` convention). Pre-check: 0 orphan `group_id` rows in the Docker `courtzon_v3` DB → safe.
- **Baseline** `001_courtzon_v3.sql` updated identically.
- No existing row modified; no backfill; no unrelated index/table touched.

## 4. Backend Contract Changes
- **`domain/gsk-config.ts`** — contract-only types: `GskConfiguration`, `GskGroupStageConfig`, `GskQualificationRule`, `GskKnockoutConfig`, `GskKnockoutStart`.
- **`tournament-aggregate.ts`** — `ENGINE_PLANNED_FORMATS = ['group_stage_knockout']` (contract exists, engine not executable); `TournamentStage.config?: Record<string, unknown> | null`.
- **`tournament.dto.ts`** — `GskConfigurationSchema` (format literal `group_stage_knockout`, groupStage, qualification, knockout) + `CreateStageSchema.config` (nullable/optional). Create path validated structurally; never executed.
- **`tournament.repository.ts`** — `createStage` inserts `config` as JSON; `findStages` parses it.

## 5. Validation Rules
`groupCount ≥ 1` · `participantsPerGroup ≥ 2` · `topPerGroup ≥ 1` · `topPerGroup ≤ participantsPerGroup` · `bestThirdPlaces ≥ 0` · `bestThirdPlaces ≤ groupCount` · enum-valid `startingRound`/`seeding`/`ordering` · booleans required in knockout shape · `playInRounds ≥ 0` if supplied.

## 6. Backward Compatibility
Existing knockout/round_robin tournaments unaffected; stages with `config = NULL` valid; matches with `group_id = NULL` valid; match queries unchanged; no production record modified. `ENGINE_EXECUTABLE_FORMATS` unchanged — GSK is **not** advertised as executable.

## 7. Tests
- Backend tournament suite: **43 files / 708 tests passed** (incl. 19 new in `tournament-gsk-contract.spec.ts`).
- Focused command: `npx vitest run src/modules/tournaments/__tests__/tournament-gsk-contract.spec.ts src/modules/tournaments/__tests__/tournament.dto.spec.ts src/modules/tournaments/__tests__/tournament-format-scope.g8c.spec.ts src/modules/tournaments/__tests__/tournament-aggregate.spec.ts src/modules/tournaments/__tests__/match-schedule.service.spec.ts` → **94 passed**.
- Backend build (`npm run build`, tsc): **PASS**.

## 8. Docker Verification
- `docker compose build backend` + `docker compose up -d backend` — entrypoint auto-applies migration 195 to Docker `courtzon_v3`.
- Health: `curl http://localhost:3000/health` → **200**; `docker compose ps backend` → healthy.
- Verified on the live Docker DB: `tournament_stages.config` present; `fk_tm_group` present; 0 orphan `group_id`.

## 9. Git Commit
- Hash/message and push result recorded after the final verification (see commit `feat(tournaments): add GSK data contract foundation`).

## 10. Known Limitations
- `group_stage_knockout` cannot yet be created through `CreateTournamentSchema` (create acceptance requires a bracket-type row + engine-boundary changes — deferred to the engine step; `CreateStageSchema.config` is the prepared contract path).
- No engine, qualification, match generation, progression, standings or result changes.
- No frontend changes.

## 11. GSK Engine IS NOT Implemented Yet
This step only adds the storage column, the defensive FK and the validated configuration contract. Nothing executes GSK.

## 12. Next Step: Step 3B-2 — Group Stage Engine
Implement the group-stage engine (group creation from participants, per-group round-robin match generation writing `group_id`/`stage_id`, per-group standings) and the qualification engine, then the knockout transition (reusing `generateKnockoutBracket`).
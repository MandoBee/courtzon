# HANDOVER 104 — GSK Creation/API Contract (Step 3B-5A)

**Date:** 2026-10-07
**Scope:** Step 3B-5A only — make `group_stage_knockout` a valid, explicitly supported **creation** contract (validated config + skeleton only). No frontend, no payments, no migration, no full HTTP journey.

---

## 1. Objective
Let a tournament creator explicitly request a GSK tournament through the existing creation API with a validated `gsk_config`, while preserving knockout/round_robin exactly, never enabling DE/Swiss, never claiming groups/knockout already exist, and staying out of `ENGINE_EXECUTABLE_FORMATS`.

## 2. Files Changed
- `backend/src/modules/tournaments/presentation/tournament.dto.ts` — `CreateTournamentSchema.format` enum now includes `group_stage_knockout`; new `gsk_config` field (lazy `GskConfigurationSchema`), coupled via `superRefine` (required for GSK, forbidden otherwise).
- `backend/src/modules/tournaments/application/tournament.service.ts` — `create()`: creation-supported-format guard incl. GSK; bracket-derived format overwrite skipped for GSK; GSK substrate (`single-elimination`) + config guard; auto-creates the Group Stage skeleton (stage_order 1, round_robin, validated config); response augmented with `gsk_config` + `competition_prepared:false`.
- `backend/src/modules/tournaments/__tests__/tournament-format-scope.g8c.spec.ts` — GSK removed from the "rejected at create" list (DE/swiss/league/custom remain).
- `backend/src/modules/tournaments/__tests__/tournament-gsk-create-contract.spec.ts` — **new** (19 tests).

## 3. Creation / API Contract Changes
Request (existing `POST /org/:orgId/tournaments`, no new endpoint):
```jsonc
{
  "format": "group_stage_knockout",
  "gsk_config": {
    "format": "group_stage_knockout",
    "groupStage": { "groupCount": 8, "participantsPerGroup": 4, "format": "round_robin",
                    "qualification": { "topPerGroup": 2, "bestThirdPlaces": 0, "ordering": "rank" } },
    "knockout": { "startingRound": "round_of_16", "seeding": "automatic",
                  "separateGroupWinners": true, "preventSameGroupRematch": true, "allowByes": false }
  },
  "bracket_type_id": 1 // single-elimination substrate (the GSK knockout stage is single elimination)
}
```
Server: persists `format=tournaments.format='group_stage_knockout'`, creates the default competition AND the Group Stage skeleton (`tournament_stages` stage_order 1, `progression_format='round_robin'`, `config=<validated gsk_config>`, `advance_count=topPerGroup`, `status='pending'`).

## 4. Validation Rules
Structural (reuses `GskConfigurationSchema`): `groupCount ≥ 1`, `participantsPerGroup ≥ 2`, `topPerGroup ∈ [1, participantsPerGroup]`, `bestThirdPlaces ∈ [0, groupCount]`, valid `ordering`/`startingRound`/`seeding`, booleans required, `playInRounds ≥ 0`. Coupling: `gsk_config` required iff `format=group_stage_knockout`, forbidden otherwise. Service layer also requires the `single-elimination` bracket substrate and a present config.

## 5. Lifecycle Behavior
Explicit and unchanged: `create → publish → open/close registration → prepare/generate competition`. Creating a GSK tournament **does not** generate groups or knockout matches; it only creates the group-stage skeleton. `competition_prepared:false` is returned; `status` stays `draft`.

## 6. Engine Boundary
`ENGINE_EXECUTABLE_FORMATS` remains **`['knockout','round_robin']`** exactly. `group_stage_knockout` is accepted at **creation** as the explicit preparation contract (the GSK engines from 3B-2/3B-3/3B-4 consume it later), but it is NOT advertised as immediately executable, and `double_elimination`/`swiss`/`league`/`custom`/`mixed` remain rejected.

## 7. Tests / Results
- `tournament-gsk-create-contract.spec.ts` — **19 passed**: DTO valid GSK; reject groupCount<1, perGroup<2, topPerGroup<1/`>perGroup`, bestThird<0/`>groupCount`, invalid ordering/startingRound/seeding, playInRounds<0, `gsk_config` coupling; service: GSK created with persisted format + Group Stage skeleton (stage_order 1, round_robin, config, advance_count) and NO groups/matches; no config ⇒ rejected; non-single-elimination substrate ⇒ rejected; no premature generation; response carries `gsk_config` + `competition_prepared:false`; `ENGINE_EXECUTABLE_FORMATS` unchanged; DE/swiss still rejected; knockout/round_robin behavior unchanged.
- Full backend tournament unit suite: **47 files / 789 passed** (was 770; +19).
- Backend `npm run build` (tsc): **PASS**.

## 8. Docker / Build / Health
`npm run build` → PASS. Docker: `docker compose build backend` (fresh image) + `docker compose up -d backend` → container healthy; `http://localhost:3000/health` → 200; `/health/ready` → 200. (Recorded after the run.)

## 9. Commit
Hash/push recorded after verification — message: **`feat(tournaments): expose GSK creation contract`**.

## 10. Known Limitations
Creation is the only exposed GSK surface so far; the group-stage → knockout lifecycle requires the explicit prepare/generate operations (3B-2/3B-3/3B-4 services; no HTTP journey validated yet); `ENGINE_EXECUTABLE_FORMATS` unchanged; no frontend/wizard/UI; no payment changes; no migration.

## 11. Exact Next Recommended Step
**Step 3B-5B — expose the GSK prepare/generate HTTP flow**: wire `GroupStageService.generateGroupStage`, `QualificationService.qualifyGroupStage`, and `KnockoutTransitionService.introduceKnockoutStage` behind the existing permissioned routes (with `stage_id`), then validate the full backend journey over HTTP before considering promotion in `ENGINE_EXECUTABLE_FORMATS`.
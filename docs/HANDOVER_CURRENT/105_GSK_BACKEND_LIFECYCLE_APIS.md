# HANDOVER 105 — GSK Backend Lifecycle APIs + HTTP Journey (Step 3B-5B)

**Date:** 2026-10-07
**Scope:** Step 3B-5B only — expose `QualificationService.qualifyGroupStage` and `KnockoutTransitionService.introduceKnockoutStage` over the permissioned routes (group generation already exposed via the Step 3B-2 `stage_id` branch) and validate the GSK journey over HTTP. No frontend, no payments, no migration, no `ENGINE_EXECUTABLE_FORMATS` change.

---

## 1. Objective
Make the complete GSK backend lifecycle reachable through the existing authenticated/permissioned API and prove it over HTTP: create GSK → close registration → generate groups/matches → (incomplete) qualify/knockout rejections → transition wiring, with lifecycle, authorization and idempotency enforced by the real middleware.

## 2. API Routes Exposed / Changed
- `POST /org/:orgId/tournaments/:id/generate-groups` — existing route, `stage_id` branch already wired to `GroupStageService.generateGroupStage` (Step 3B-2).
- **New:** `POST /org/:orgId/tournaments/:id/qualify` → `qualifyGroupStageHandler` → `QualificationService.qualifyGroupStage`.
- **New:** `POST /org/:orgId/tournaments/:id/knockout` → `introduceOrgKnockoutStageHandler` → `KnockoutTransitionService.introduceKnockoutStage`.
- **New admin mirrors:** `POST /admin/tournaments/:id/qualify` and `POST /admin/tournaments/:id/knockout`.
- Request body (new `GskLifecycleSchema` in `presentation/tournament.dto.ts`): `{ stage_id: number, competition_id?: number }`.

## 3. Permissions
Admin workbench routes: `tournament.manage`. Org routes: `requireOrgScopedPermission('org.tournaments.manage')`. Same convention as `generate-groups`. Unauthorised (no token) requests are rejected (401 verified over HTTP).

## 4. GroupStageService Integration
`GroupStageService.generateGroupStage` invoked through the `generate-groups` route when `stage_id` is supplied; legacy non-GSK behaviour unchanged; service-internal lifecycle check, transactional `FOR UPDATE`, `TOURNAMENT_GROUPS_ALREADY_GENERATED` idempotency preserved.

## 5. QualificationService Integration
`/qualify` returns the deterministic `GskQualificationResult` (`stageId`, `qualified[]`, `totalQualified`) or rejects with the authoritative error (incomplete stage ⇒ `TOURNAMENT_MATCHES_UNRESOLVED`). It never creates knockout matches.

## 6. KnockoutTransitionService Integration
`/knockout` recomputes qualification internally (never trusts client lists), validates knockout config/`startingRound`/`allowByes`/seeding, creates/reuses the knockout stage once, and persists the bracket; duplicates rejected; does not complete the tournament.

## 7. Full HTTP Journey (verified)
`tournament-gsk-lifecycle.integration.spec.ts` (Fastify harness + real Docker MySQL via `app.inject`):
1. Create GSK tournament over `/org/.../tournaments` → 201 (format `group_stage_knockout`, `competition_prepared=false`).
2. Publish → open-reg → close-reg; seed the 8 participants with the established integration fixture (registrations `confirmed` + participants + member rows).
3. `generate-groups {stage_id}` → 200; DB: 2 groups, 8 members, 12 matches, all with `group_id`/`stage_id`.
4. Duplicate `generate-groups` → 409 (`already generated`).
5. `qualify` before completion → 409 (`unresolved`).
6. `knockout` before completion → 409 (`unresolved`).
7. Unauthorised qualify/knockout → 401.
8. Admin `qualify` reachable and lifecycle-guarded → 409 (`unresolved`).

## 8. Test Configuration
Harness = Fastify + `initAuthMiddleware` (token→user, permissive role/permission/org guards) + `initRouteGuard`; DB = `127.0.0.1:3307 / courtzon_v3` (integration config). GSK config: 2 groups × 4, round robin, top 2, no best thirds, quarterfinals, automatic seeding, separate winners + rematch prevention, no byes, playInRounds 0.

## 9. Test Results
- `npm run test:int -- tournament-gsk-lifecycle.integration.spec.ts` (i.e. `vitest run --config vitest.integration.config.ts …`) → **8/8 passed**.
- Full tournament unit suite: **47 files / 789 passed**.
- Backend `npm run build` (tsc): **PASS**.

## 10. Edge Cases (covered over HTTP)
Duplicate group generation (409) · qualify before completion (409) · knockout before completion (409) · unauthorized (401) · admin surface guarded (409) · correct DB structures (2 groups / 4 members each / 12 matches / stage+group ids).

## 11. Docker / Build / Health
`npm run build` → PASS. `docker compose build backend` (fresh image) + `docker compose up -d backend` → healthy; `/health` → 200; `/health/ready` → 200. (Recorded after the run.)

## 12. Database Status
**NO DATABASE CHANGES.** No migration, table, or seed modification; uses the existing GSK foundation only.

## 13. Is GSK Proven Executable?
**Partially.** The creation + group-generation + (rejected-then-valid) qualify/knockout surface is proven over HTTP, and the full service-side happy path (qualify success, knockout bracket generation, byes, constraints) is unit-proven in `qualification-engine.spec.ts` / `knockout-integration.spec.ts`. The **result → standings → second-stage progression → final → completion** segment over HTTP is **not yet proven**: group results require the shared result confirmation/auto-approval pipeline (BullMQ subscriber worker) which cannot fire deterministically in the in-process harness. `group_stage_knockout` was **NOT** added to `ENGINE_EXECUTABLE_FORMATS`.

## 14. Commit
Hash/push recorded after verification — message: **`feat(tournaments): expose GSK backend lifecycle APIs`**.

## 15. Known Limitations
No result-approval/progression HTTP segment verified end-to-end (pending-confirmation/auto-approval worker dependency); no tournament completion triggered by the journey test; `ENGINE_EXECUTABLE_FORMATS` unchanged; no frontend; play-ins unsupported; elimination of participants over the API (org register registers the operator) means the test uses the established integration fixture for participant population.

## 16. Exact Next Step
**GSK promotion decision + completion validation (Step 3B-5C):** drive group results to APPROVED via the real acceptance path (or a deterministic approval fixture through the shared result service), verify standings → qualification success → knockout progression → final → lifecycle `completed` over HTTP; if that passes, take the separate explicit decision to add `group_stage_knockout` to `ENGINE_EXECUTABLE_FORMATS`.
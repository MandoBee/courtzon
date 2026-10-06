# HANDOVER 106 — GSK Result-Progression Lifecycle Validation (Step 3B-5C)

**Date:** 2026-10-07
**Scope:** Step 3B-5C only — make the integration test execute the REAL production result-confirmation/progression pipeline deterministically and complete the GSK HTTP journey (group results → standings → qualification → knockout → SF → F → completion). No frontend, no migration, no `ENGINE_EXECUTABLE_FORMATS` change.

---

## 1. Objective
Close the 3B-5B gap ("result-approval needs the BullMQ subscriber worker") by driving the exact production processor and fixing the real defects it surfaced, so the journey is verified end-to-end over HTTP.

## 2. Exact Result Pipeline (traced)
- Submit: `POST /org/:orgId/tournaments/matches/:matchId/result` → `tournamentService.recordSharedResult` (operator, `pending_confirmation`).
- Accept: `POST /matches/:id/result/accept` (match-result routes) → `matchResultService.acceptResult` (opponent participant) → `submission_status='approved'` + emits `match:result-approved`.
- Progression processor (production BullMQ subscriber `tournament-progression` / `subscriber.worker`): **`tournament-progression.listener.ts` → `handleProgressionEvent`** → `syncSharedResultMirror` + `progressFromApprovedResult` (standings per group, knockout seating, stage/tournament completion).
- Standings: `tournamentRepository.recalculateStandings` → domain `computeStandings`.

## 3. How the Test Executes It
`tournament-gsk-lifecycle.integration.spec.ts` registers the real `orgTournamentRoutes` + `tournamentRoutes` + `matchResultRoutes`, maps per-player tokens, and for each match: operator-submit (HTTP) → opponent-accept (HTTP) → invokes the **exported production `handleProgressionEvent`** with the same `match:result-approved` envelope the worker receives. No SQL-built results, no mocks, no duplicated business logic.

## 4. Changes Made
- `backend/src/modules/tournaments/application/tournament-progression.listener.ts` — `handleProgressionEvent` exported (only keyword change; the function the BullMQ subscriber runs).
- `backend/src/modules/tournaments/infrastructure/repositories/tournament.repository.ts` — **real defect fix:** `tournament_standings.registration_id` FK (`→ tournament_registrations.id`) was violated because standings keys are primary-member *user* ids; `recalculateStandings` now translates each key to the participant's registration id (`tournament_participant_members`/`tournament_participants`).
- `backend/src/modules/tournaments/application/qualification.service.ts` — standings keys are now registration ids, so qualification additionally maps `registration_id → participant` (user-id OR registration-id resolution).
- `backend/src/modules/tournaments/__tests__/tournament-gsk-lifecycle.integration.spec.ts` — completed the 12-test journey.

## 5. HTTP Journey (verified, 12/12)
CREATE → PUBLISH → OPEN REG → (fixture participants) → CLOSE REG → GENERATE GROUPS → operator-submit + opponent-accept + real processor on all 12 group matches → STANDINGS → QUALIFY (4) → KNOCKOUT (bracket 4: 2 SF + 1 F) → QF/SF/F results via the same real pipeline → COMPLETE (existing lifecycle endpoint) → tournament `completed`.

## 6. Standings Verification
After the 12 group results: `tournament_standings` has exactly 4 rows per group with unique `rank_position` 1..4 (sum 10) and correct points — the FK-identity defect that previously blocked inserts is fixed and verified.

## 7. Qualification Verification
HTTP qualify → `totalQualified = 4`, 2 groups present, every qualifier `groupRank ∈ {1,2}` (top 2 per group).

## 8. Knockout Verification
HTTP knockout → `bracketSize = 4` (semifinals), rounds `[1:2, 2:1]` — 2 semifinals + 1 final; all participants unique; no extra matches (total stage rows = 3).

## 9. Semifinal & Final Verification
All knockout matches resolved through the real pipeline (submit/accept/process); the final is the sole `is_final` match; no additional knockout matches are generated.

## 10. Tournament Completion Verification
Tournament reaches `completed` via the existing lifecycle endpoint after all matches resolved; final champion slot resolved (the harness auto-completion sub-path and champion `final_position`/placements projection remain a bracket-placements concern — see limitations).

## 11. Tests
- Journey: `vitest run --config vitest.integration.config.ts …tournament-gsk-lifecycle.integration.spec.ts` → **12/12 passed**.
- Full tournament + match-result unit suites: **56 files / 940 passed**.
- `npm run build` (tsc): **PASS**.

## 12. Docker / Build / Health
`npm run build` → PASS; `docker compose build backend` (fresh image) + `up -d backend` → healthy; `/health` → 200; `/health/ready` → 200. (Recorded after the run.)

## 13. Database Status
**NO DATABASE CHANGES** — no migration, schema or seed changes; only the repository standings writer was corrected (application code).

## 14. Remaining Limitations
- In-Process processor invocation is used instead of the BullMQ/Redis worker/outbox (deterministic in the harness); production still routes through BullMQ.
- Auto-completion/pre-start-of-results: automatic tournament completion fired only via the lifecycle `complete` endpoint in the harness; the `captureBracketPlacements`/champion `final_position` projection sub-path was not asserted (reported, not hidden).
- `group_stage_knockout` remains **outside** `ENGINE_EXECUTABLE_FORMATS`.

## 15. Commit
Hash/push recorded after verification — message: **`test(tournaments): validate GSK result progression lifecycle`** (plus the standings/qualification fixes in the same commit).

## 16. Exact Next Step
**Promotion decision (review-driven):** if the complete HTTP journey is accepted, take the separate explicit decision whether to add `group_stage_knockout` to `ENGINE_EXECUTABLE_FORMATS` (no code change otherwise required).
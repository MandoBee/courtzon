# HANDOVER 107 — GSK Promotion to Executable Format

**Date:** 2026-10-07
**Scope:** Promotion decision (no engine logic, DB, or frontend changes). Adds `group_stage_knockout` to the authoritative `ENGINE_EXECUTABLE_FORMATS` after the 3B-5C HTTP-validated lifecycle review.

---

## 1. Promotion Decision
Based on the accepted 3B-5C validation (12/12 HTTP journey: create → groups → real result submit/accept → production `handleProgressionEvent` → standings → qualify → knockout → SF → F → completion), `group_stage_knockout` is promoted to a fully executable format.

## 2. Exact File Changed
`backend/src/modules/tournaments/domain/tournament-aggregate.ts`:
- `ENGINE_EXECUTABLE_FORMATS = ['knockout', 'round_robin', 'group_stage_knockout'] as const;`
- `ENGINE_PLANNED_FORMATS = [] as const;` (GSK removed; DE/swiss/league/custom/mixed remain future/reserved).
Supporting (non-behavioural) edits: `application/tournament.service.ts` (creation guard now uses the constant directly), and two test expectations (`tournament-format-scope.g8c.spec.ts`, `tournament-gsk-create-contract.spec.ts`) updated to the 3-format list.

## 3. Exact Executable-Format Behaviour
Now executable: `knockout`, `round_robin`, `group_stage_knockout`. Still rejected at creation: `double_elimination`, `swiss`, `league`, `custom`, `mixed` (DTO enum + application boundary). `group_stage_knockout` creation still requires `gsk_config` + single-elimination bracket substrate; the engine implementation, qualification, knockout, and result/progression logic are unchanged.

## 4. Tests
- Focused format/registry tests (`tournament-format-scope.g8c.spec.ts` + `tournament-gsk-create-contract.spec.ts`): **28 passed** (registry = [knockout, round_robin, group_stage_knockout]; DE/swiss still rejected; GSK create contract unchanged).
- GSK lifecycle integration: **12/12 passed**.
- Full tournament + match-result unit suites: **56 files / 940 passed**.
- Backend `npm run build` (tsc): **PASS**.

## 5. Docker / Build / Health
`npm run build` → PASS. `docker compose build backend` (fresh image) + `docker compose up -d backend` → **Up (healthy)**; `/health` → 200; `/health/ready` → 200. (Recorded after the run.)

## 6. Database Status
**NO DATABASE CHANGES** — no migration, schema, or seed changes (SQL from 3B-1 unchanged).

## 7. Commit
Hash/push recorded after verification — message: **`feat(tournaments): promote GSK to executable format`**.

## 8. Remaining Limitations
No frontend/GUI for GSK; play-ins unsupported (`playInRounds>0` rejected); `UpdateTournamentSchema` still only permits knockout/round_robin format changes; in-test progression drives the production processor in-process (BullMQ/outbox for production delivery); champion `final_position`/bracket-placements projection remains a separate bracket-placements concern.

## 9. Exact Next Recommended Step
Frontend GSK integration (creation wizard Format step + Tournament Hub Groups/Qualified/Knockout views) as a separate controlled step — out of scope for this promotion.
# HANDOVER 101 — GSK Group Stage Engine (Step 3B-2)

**Date:** 2026-10-06
**Scope:** Step 3B-2 only — Group Stage engine (participants → groups → membership → Round Robin matches with `stage_id` + `group_id`). Qualification/knockout transition is explicitly NOT implemented (Step 3B-3).

---

## 1. Objective
Turn ACTIVE tournament participants of a competition into exactly `groupCount` deterministic groups, persist membership, and generate a complete Round Robin schedule per group — every match carrying its `stage_id` and `group_id` — safely, transactionally and idempotently. STOPS before qualification.

## 2. Current Architecture Used
- Domain: `generateRoundRobinMatches`, `seededShuffle`, `isTournamentParticipantProgressionEligible` (`domain/tournament-aggregate.ts`).
- Persistence: `tournamentRepository.createGroup / addGroupMember / createMatch / findGroups / findStages`; `participantDrawRepository.listParticipantsByCompetition`; `participantMemberRepository.listMembersByParticipant`.
- Shared matches: `matchService.createForTournament` (results/courts reuse).
- Transaction/race safety: `runProvidedTransaction` + `SELECT ... FOR UPDATE` (same pattern as `MatchScheduleService.generateMatchesFromLockedDraw`).
- API surface: existing routes `POST /admin/tournaments/:id/generate-groups` and `POST /org/:orgId/tournaments/:id/generate-groups` — extended with an optional `stage_id` (no new endpoint).

## 3. Participant Source
`participantDrawRepository.listParticipantsByCompetition(tournamentId, competitionId)` — ACTIVE `tournament_participants` of the stage's competition, filtered through `isTournamentParticipantProgressionEligible`. Each must carry a `registration_id` (needed for `tournament_group_members` and group-scoped standings); a participant without one is rejected explicitly.

## 4. Group Assignment
`assignGroupsDeterministic` (`domain/group-stage.ts`) — `seededShuffle(participants, tournament.draw_seed ?? Date.now())` then contiguous partition into `planGroupMemberCounts` sizes (balanced base/base+1; every group ≥ 2, none > `participantsPerGroup`; a smaller final group is allowed — established convention). Same tournament + participant set + seed ⇒ identical membership.

## 5. Group Creation
`tournamentRepository.createGroup` (transactional, competion-scoped) — exactly `groupCount` groups named A, B, C, … with `advance_count = config.groupStage.qualification.topPerGroup` (config snapshot; not consumed yet).

## 6. Group Membership
`tournamentRepository.addGroupMember` — one row per participant (`registration_id`, deterministic in-group `seed` 1..N). Unique `uk_group_reg` prevents duplicates; each participant appears in exactly one group (partition guarantees).

## 7. Round Robin Generation
Per group `generateRoundRobinMatches(memberParticipantIds)` (existing circle method, joinable odd groups). 4→6, 5→10, 6→15 matches per group.

## 8. Match Persistence
Per pairing: `matchService.createForTournament` (shared authoritative Match) then `tournamentRepository.createMatch` with `tournament_id`, `competition_id`, `match_id`, `round`/`round_name`, auto `match_number`, `group_id`, `stage_id`, `participant1/2_id`, `player1/2_id` (primary member), `status='scheduled'`, `progression_state='pending'`, `progression_meta={is_bracket:false}`, `is_final=0`. All inside one transaction.

## 9. stage_id / group_id Verification
Verified by tests: every generated Group Stage match is persisted with its `stage_id` and a non‑null `group_id`.

## 10. Idempotency
In-transaction `findGroups(tournamentId, competitionId)` re-check after `FOR UPDATE`; existing groups ⇒ `ConflictError(TOURNAMENT_GROUPS_ALREADY_GENERATED)` and no group/member/match is written. Re-running a completed generation is blocked, never duplicated.

## 11. Transaction / Race Safety
Whole pipeline in `runProvidedTransaction` with the tournament row `SELECT ... FOR UPDATE` and a locked-transaction existence re-count (mirrors `generateMatchesFromLockedDraw`). Two concurrent requests cannot both generate.

## 12. Standings Compatibility
`tournament.standings` (+ SQL) scopes by `tm.group_id = ?`, and `recalculateStandings(tournamentId, groupId)` consumes matches carrying `group_id`; `player1_id`/`player2_id` (primary member user ids) are set exactly like existing RR/knockout matches, so no standings change was needed.

## 13. Tests
New `backend/src/modules/tournaments/__tests__/group-stage-engine.spec.ts` — **22 tests**: pure planning counts (4/1, 8/2×4, 16/4×4), min/max/capacity validation, determinism (same seed equal, different seed differs), no omission/duplicate participants; service: 4/1→6, 8/2×4→12 (6+6 + advance_count), 16/4×4→24, stage_id+group_id on every match, non-group stage / missing GSK config / completed stage / wrong lifecycle / count violation / missing registration all rejected, idempotent second-run rejected with zero duplicates.
- Full backend tournament unit suite: **44 files / 730 passed** (was 708; +22 engine).
- Backend `npm run build` (tsc): **PASS**.

## 14. Docker Verification
`docker compose build backend` + `docker compose up -d backend` → container healthy; `http://localhost:3000/health` → 200; `/health/ready` → 200. (Recorded after the run.)

## 15. Git Commit
`feat(tournaments): implement GSK group stage engine` — hash/push recorded after verification.

## 16. Known Limitations
- Groups are scoped by tournament+competition only (no `stage_id` on `tournament_groups` — schema unchanged).
- No qualification, best-third, ranking across groups, knockout participant/seed generation, knockout stage creation, or legacy `generateGroups` rewrite (legacy path untouched, still registration-based).
- No frontend/Hub changes; standing preview per group relies on existing group-scoped standings consumers.

## 17. Qualification / Knockout Transition NOT Implemented
The engine hard-stops after group matches are persisted. `advance_count` is stored but never consumed; no knockout stage or match is ever produced by this step.

## 18. Next Step: Step 3B-3 — Qualification Engine
Consume group standings/`advance_count` to produce the ordered qualified participant list (top-N per group + optional best-third), then feed `generateKnockoutBracket` for the knockout stage.
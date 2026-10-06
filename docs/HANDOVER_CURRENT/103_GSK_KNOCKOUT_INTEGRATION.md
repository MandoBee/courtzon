# HANDOVER 103 — GSK Knockout Integration (Step 3B-4)

**Date:** 2026-10-07
**Scope:** Step 3B-4 only — backend transition from `GskQualificationResult` to a persisted, progression-compatible knockout stage via the EXISTING knockout generator. No frontend, no new DB schema.
**Status:** GSK backend lifecycle is now executable end-to-end; `ENGINE_EXECUTABLE_FORMATS` remains **`['knockout','round_robin']`** (see §18).

---

## 1. Objective
Create/identify the Knockout stage, apply deterministic constraint-aware seeding (group winner separation + same-group rematch prevention), validate bracket size vs `startingRound`/`allowByes` (play-ins explicitly unsupported), and persist the bracket through the same match-creation path as the existing knockout engine — transactionally, idempotently, without touching Group Stage matches.

## 2. Qualification Input
`KnockoutTransitionService.introduceKnockoutStage(tournamentId, groupStageId, actorId, competitionId?)` recomputes through `qualificationService.qualifyGroupStage` (never trusts caller lists) and validates: unique participants, all belong to the tournament, valid members, `totalQualified` consistent. Qualified entries keep `participantId`, `groupId`, `groupRank`, `qualificationType` for seeding.

## 3. Knockout Stage Creation
`application/knockout-transition.service.ts`: inside a `runProvidedTransaction` with `SELECT … FOR UPDATE` on the tournament row, finds an existing `progression_format='knockout'` stage for the competition (reuse, no duplicate) or creates one with `stage_order = groupStage.stage_order + 1`, `config = <full GSK config>`. Guard: `countStageMatches` — if knockout matches already exist ⇒ `ConflictError(TOURNAMENT_MATCHES_ALREADY_GENERATED)`.

## 4. Bracket Size Validation
`N` from `startingRound` (`round_of_16=16, quarterfinals=8, semifinals=4, final=2`) or `first_valid_round` = next power of two ≥ `Q`. Rules: `Q ≤ N`; if `Q < N` then `allowByes === true` and `Q > N/2` required; otherwise rejected. Non-power-of-two `Q` with `allowByes=false` rejected. `playInRounds > 0` ⇒ explicit unsupported error. Example: `Q=20 → round_of_16 (N=16)` rejected (play-ins unsupported) — never silently converted.

## 5. Bye Handling
Reuses the EXISTING safe bye mechanism: `generateKnockoutBracket(participantIds)` pads to `N`, emits `bye:true` for vacant round-1 slots; those are persisted as explicit bye rows (`match_number = 0`, `progression_meta.bye`) and resolved by the EXISTING `tournamentService.advanceByes` after commit (same as the draw path). Bye rows never create fake participants/users.

## 6. Play-In Handling
NOT SUPPORTED by the engine. `playInRounds > 0` ⇒ `ConflictError(TOURNAMENT_KNOCKOUT_CONFIG_INVALID)`. Configuration requesting play-ins is rejected explicitly (documented limitation; Step 3B-6 could add a play-in layer later).

## 7. Automatic Seeding
`assignKnockoutSeeding` (`domain/knockout-seeding.ts`): winners first (by group, then seed), then others (by seed/participant id), greedy least-loaded-pair placement honoring `separateGroupWinners` and `preventSameGroupRematch`; deterministic, bounded, no random retry; throws when impossible.

## 8. Manual Seeding
Requires an authoritative `seed_number` for every qualified participant — missing ⇒ rejected. Order = stable sort by seed; `validateKnockoutPairing` rejects orders violating separation/same-group constraints. No silent fallback to random.

## 9. Group Winner Separation
Automatic mode assigns each group winner to its own first-round pair; winners > first-round pairs ⇒ rejected. Manual mode rejects any ordering where two winners become round-1 opponents.

## 10. Same-Group Rematch Prevention
Every first-round pair must hold participants from different groups. Automatic greedy assignment avoids it; manual validation rejects collisions. Impossible configurations ⇒ rejected (never violated).

## 11. Bracket Generation
`generateKnockoutBracket(orderedIds)` + `normaliseBracketTargets(slots, Q)` + `is_final`/`bracket_depth` annotation mirror `MatchScheduleService`. The existing generator remains the source of truth for targets, byes and structure.

## 12. Match Persistence
Per slot, via the existing path: `matchService.createForTournament` (shared Match) + `tournamentRepository.createMatch` with `stage_id` (knockout), `bracket_position`, round label, `participant1/2_id`, `player1/2_id` (primary members), `progression_state='pending'`, `progression_meta={is_bracket, target_round/position/side, is_final, bracket_depth, bye?}`. Group Stage matches untouched (no update/overwrite).

## 13. Progression Compatibility
Generated rows are indistinguishable from engine-produced knockout rows; `progressFromApprovedResult` seats winners via the existing `target_round/target_bracket_position/target_side` wiring and completes the tournament when the final resolves. The transition itself **never** completes the tournament.

## 14. Transaction / Idempotency
Single `runProvidedTransaction` + `FOR UPDATE` + in-transaction stage-match count ⇒ two concurrent transitions cannot both generate; repeated runs either reuse the stage (no duplicate) or reject when matches already exist. `advanceByes` runs post-commit (mirrors the draw path).

## 15. Test Results
New `backend/src/modules/tournaments/__tests__/knockout-integration.spec.ts` — **19 tests** (domain seeding determinism/separation/rematch/impossible + service: 16→R16(15 matches), 4→semis(3), 2→final(1), Q=20→R16 rejected, allowByes on/off, startingRound mismatch, playInRounds rejected, automatic determinism, manual honored/missing-seed rejected, impossible constraints rejected, stage reuse + second-run conflict, concurrency guard, uniqueness/no‑fake/no-completion, bracket wiring).
- Full backend tournament unit suite: **46 files / 770 passed** (was 751; +19).
- `npm run build` (tsc): **PASS**.

## 16. Docker Verification
`docker compose build backend` + `docker compose up -d backend` → container healthy; `http://localhost:3000/health` → 200; `/health/ready` → 200. (Recorded after the run.)

## 17. Git Commit
`feat(tournaments): integrate GSK qualification with knockout` — hash/push recorded after verification.

## 18. Executable Format Decision
**NOT added to `ENGINE_EXECUTABLE_FORMATS`.** Though the whole backend lifecycle (groups → RR → standings → qualification → knockout stage/bracket/persistence/progression) is now implemented and unit-tested, the product still has **no create/user flow and no API path that lets a real operator create a GSK tournament end-to-end** (`CreateTournamentSchema` still only accepts `knockout|round_robin`). Executable-advertising is gated on Step 3B-5 (API/E2E validation) proving the complete lifecycle through the HTTP layer.

## 19. Known Limitations
No frontend/wizard/Hub GSK UI · no public GSK create path · play-ins unsupported (`playInRounds>0` rejected) · `Q=20`-style counts rejected (not converted) · grouping is per competition without a `stage_id` on `tournament_groups` · `ENGINE_EXECUTABLE_FORMATS` unchanged.

## 20. Next Step
**Step 3B-5 — API / End-to-End Backend Validation**: `group_stage_knockout` creation contract + routes + an end-to-end backend journey test (create → groups → RR → standings → qualify → knockout → progression → final → complete).
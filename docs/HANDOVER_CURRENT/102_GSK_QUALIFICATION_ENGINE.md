# HANDOVER 102 — GSK Qualification Engine (Step 3B-3)

**Date:** 2026-10-06
**Scope:** Step 3B-3 only — compute deterministic qualified participant lists from completed Group Stage standings. NO knockout stage/matches/seeding, NO DB changes, NO frontend changes.

---

## 1. Objective
After the Group Stage is complete, rank each group using the existing standings, select top-N per group, optionally select best third-place participants, validate the result deterministically, and return a typed qualified participant list for Step 3B-4. Hard stop before any knockout work.

## 2. Standings Source
`tournamentRepository.getStandings(tournamentId, groupId)` — the authoritative per-group `tournament_standings` rows (`points`, `wins`, `draws`, `losses`, `games_won`, `games_lost`, `rank_position`), produced by `recalculateStandings` → domain `computeStandings`. Identity mapping uses each participant's primary member user id (`first member of member_user_ids`, the same key `computeStandings` ranks on) via `participantDrawRepository.listParticipantsByCompetition`.

## 3. Group Completion Validation
`tournamentRepository.countIncompleteStageMatches(stageId)` (the product rule used for stage completion): any match with `progression_state NOT IN ('completed','bye')` ⇒ `ConflictError(TOURNAMENT_MATCHES_UNRESOLVED)` — no participant list is produced. Missing groups (count ≠ `groupCount`), missing standings, standings/members mismatch, and unknown/duplicate identities are all rejected.

## 4. Top-N Qualification
Per group, standings sorted by `rank_position` asc (comparator fallback for ties/unranked), first `topPerGroup` selected (`groupRank` 1..N). A group with fewer ranked participants than `topPerGroup` is rejected; `topPerGroup` must be within `1..participantsPerGroup`.

## 5. Best-Third Qualification
Third-place candidates = participants ranked 3rd (`rank_position === 3`) per group with ≥ 3 members, excluding participants already qualified by top-N (`topPerGroup < 3`). Candidates sorted deterministically (standings comparator, then identity) and exactly `bestThirdPlaces` selected; if fewer candidates than requested ⇒ rejected.

## 6. Tie-Breaking
`compareStandingRows` (`domain/gsk-qualification.ts`) mirrors the ONLY standings authority (`computeStandings`): **points DESC → game difference (games_won − games_lost) DESC**. Cross-group ties fall back to deterministic identity keys (`compareGroupIdentity`: groupId, participantId) — never head-to-head across groups, never randomness.

## 7. Qualification Ordering
`qualification.ordering` is honored (never ignored): `rank` → by source group, group-position before best-third, then groupRank; `points` → standings points DESC + comparator; `seed` → tournament seed (`seed_number`) ascending with stable identity fallback.

## 8. Result Contract
`domain/gsk-qualification.ts`:
```ts
type GskQualificationType = 'group_position' | 'best_third';
interface GskQualifiedParticipant { participantId; groupId; groupRank; qualificationType; qualificationRank; seed?; points?; }
interface GskQualificationResult { tournamentId; stageId; qualified: GskQualifiedParticipant[]; totalQualified; }
```

## 9. Determinism
No `Date.now()`, no `Math.random()`, no shuffle. Same tournament + stage + standings + config + seeds ⇒ byte-identical result (seeds come only from existing `seed_number`). Repeated calls return the identical object.

## 10. Idempotency
Pure read/compute operation — no writes, no persisted records, no audit, no events. Running twice is unchanged; no duplicates can accumulate.

## 11. Database Impact
**NO DATABASE CHANGES.** No migration, table, column, or data modification. Uses `tournament_stages.config`, `advance_count`/`topPerGroup`, existing standings and participant/group relations.

## 12. Tests
New `backend/src/modules/tournaments/__tests__/qualification-engine.spec.ts` — **21 tests** covering the required matrix: 8×4→16, 4×4→4, 8×4 top2+best4→20, bestThird 0/1, bestThird > groupCount rejected, topPerGroup > perGroup rejected, small-group third behaviour, incomplete stage rejected, missing groups rejected, missing standings rejected, duplicate participant rejected, top-N⊄best-third, comparator tie-break, rank_position ordering, seed/points/rank orderings, repeated-run equality, result contract completeness, and NO knockout side effects.
- Full backend tournament unit suite: **45 files / 751 passed** (was 730; +21).
- `npm run build` (tsc): **PASS**.

## 13. Docker Verification
`docker compose build backend` + `docker compose up -d backend` → container healthy; `http://localhost:3000/health` → 200; `/health/ready` → 200. (Recorded after the run.)

## 14. Git Commit
`feat(tournaments): implement GSK qualification engine` — hash/push recorded after verification.

## 15. Known Limitations
- `totalQualified` is returned **without** knockout-compatibility validation (that is Step 3B-4's responsibility — e.g., Q=20 is returned valid, not silently fixed to R16).
- No knockout stage/match creation, no seeding, no byes/play-ins, no completion; no persistent qualification result (recomputable from standings + config).
- No frontend/Hub/wizard changes.

## 16. Knockout Integration NOT Implemented
This service returns ONLY the qualified list. It never calls `generateKnockoutBracket`, never writes seeds or stages, never completes the tournament, and never marks GSK executable.

## 17. Next Step: Step 3B-4 — GSK Knockout Integration
Consume `GskQualificationResult`: create the knockout stage (config from `knockout.*`), seed via `qualified` (winning groups/runners-up/best-thirds; `separateGroupWinners`/`preventSameGroupRematch`), generate the bracket with `generateKnockoutBracket`, and validate bracket size/byes/play-ins using `totalQualified`.
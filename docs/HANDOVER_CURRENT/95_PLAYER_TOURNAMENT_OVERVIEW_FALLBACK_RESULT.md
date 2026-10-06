# 95_PLAYER_TOURNAMENT_OVERVIEW_FALLBACK_RESULT.md

**Date:** 2026-10-06
**Type:** Frontend-only Tournament UX fix (remove internal ids from the player overview prediction line)
**Overall verdict:** PASS

---

## 1. Starting HEAD

- `9085819c` (`fix(tournaments): remove internal ids from match cards` era HEAD stated in the brief;
  actual repository HEAD at start: `9085819c7d71708c1c71ec1ca93b26a6193267bd`).
- Working tree at start was clean; `origin/master` aligned.

## 2. Problem

The player tournament overview page (`TournamentDetailPage`) still rendered a `P{id}`-style fallback
in the "Match Summary" prediction line (~line 278):

```
{m.player1_name || `P${m.player1_id || '—'}`} vs {m.player2_name || `P${m.player2_id || '—'}`}
```

A match whose participant slot had an id but no display name rendered **P10 vs P11** (raw internal
numeric participant ids) directly to the user. This was the last remaining `P{}` occurrence in the
player-facing tournament UI after the `MatchCard` fix (report 94).

## 3. Root cause

The overview card predated the bracket read-model label rule. It concatenated the player name with an
interpolated internal id instead of using the participant display name / localized neutral fallback
already used by `MatchCard` and `MatchDetailsDrawer`.

## 4. Exact fix

New shared helper `frontend/src/components/tournaments/matchSideLabel.ts`:

```ts
resolveMatchSideLabel(match, 'p1' | 'p2', t)  // per-side label, never an id
matchPredictionLabel(match, t)                // "A vs B" overview line
```

Resolution order per side (identical to the existing MatchCard / drawer rule):

1. `player{n}_name`
2. `participant{n}_name` (pair/team slots and public read-model expose only this)
3. `tournamentBracket.notAvailable` when the slot has an id but no display name
4. `tournamentBracket.tbd` / `tournamentBracket.bye` for unassigned slots (bye detection reuses
   the existing `hasBye()` utility)

`matchPredictionLabel()` keeps the `A vs B` structure only when at least one side carries meaningful
information (a real display name, TBD or Bye). When both sides would resolve to the neutral label the
line collapses to a single `tournamentBracket.notAvailable` — so no `Not available vs Not available`
and no id ever enters the string through concatenation, fallback interpolation or any alternate path.

Behavior matrix:

| Case | Before | After |
|---|---|---|
| Display name present (player or participant) | `Ali vs Sara` | `Ali vs Sara` (unchanged) |
| Slot assigned but no name (only id) | `P10 vs P11` | `Not available` (localized neutral label) |
| One side named, other id-only | `Ali vs P11` | `Ali vs Not available` |
| Unassigned side | `P—` / `TBD` | `tournamentBracket.tbd` (unchanged) |
| Bye slot | `P—` / `Bye` | `tournamentBracket.bye` (unchanged) |

## 5. Files changed

| File | Change |
|---|---|
| `frontend/src/components/tournaments/matchSideLabel.ts` | **New** — shared ID-free side/prediction label resolver |
| `frontend/src/pages/tournaments/TournamentDetailPage.tsx` | Prediction line now renders `matchPredictionLabel(m, t)` instead of the `P{id}` template |
| `frontend/src/pages/tournaments/__tests__/TournamentDetailPage.spec.tsx` | Added 8 focused prediction-line tests |

No backend, database, migration, API-contract, RBAC, MatchCard, MatchDetailsDrawer, bracket
navigation, animation, print, responsive or E2E-infrastructure files were changed. F-02 was not
touched. No unrelated cleanup.

## 6. Focused tests

```
npx vitest run src/pages/tournaments/__tests__/TournamentDetailPage.spec.tsx
Test Files  1 passed (1)
Tests       27 passed (27)
```

New coverage proves:

1. Real participant names are displayed when available (`Ali vs Sara`).
2. Participant display-name fallback for pair/team slots (`Team Alpha vs Team Bravo`).
3. TBD remains TBD.
4. Bye remains Bye (`Ali vs Bye`).
5. A participant with only an internal id never renders `P{id}` (line is exactly `Not available`,
   no `\bP\d+\b`, no raw id digits).
6. One-sided name keeps the `vs` structure without leaking the other side's id
   (`Ali vs Not available`).
7. No raw numeric participant ids, `P{}` or `#` anywhere in the prediction line.
8. Existing prediction-line behavior intact when valid names exist (round/status cells unchanged).

## 7. Full tournament test result

```
npx vitest run src/components/tournaments src/pages/tournaments src/pages/admin/tournament src/pages/referee
Test Files  23 passed (23)
Tests       208 passed (208)   // baseline 200 → 208 (+8 new)
```

**0 failures.**

## 8. TypeScript / build

- `npx tsc --noEmit` → **clean (exit 0)**.
- `npm run build` → **PASS (exit 0)** — tsc -b + Vite + PWA service worker generated.

## 9. Docker status

- `docker compose build frontend` → succeeded (frontend-only change).
- `docker compose up -d` → `courtzon-frontend` **Up (healthy)**, `courtzon-backend` **Up (healthy)**.
- `http://localhost:5173/` → **200**.
- `http://localhost:3000/health` → **200** `{"status":"ok"}` (database/redis/memory ok).

## 10. Commits

- Feature: `d0f81d9d` — `fix(tournaments): remove internal ids from player overview`
- Docs: the `docs: add player overview fallback result` commit (this file)

## 11. Final Git status

- Working tree: clean after both commits.
- `HEAD == origin/master` after pushing both commits to `master`.

## 12. Confirmation — no backend / database / API / RBAC changes

Frontend only. No database, migrations, backend, API-contract, RBAC, or tournament business-logic
changes. No permission keys, notifications, audit, realtime or i18n registry changes were required
(the fix only reuses already-registered keys `tournamentBracket.notAvailable`,
`tournamentBracket.tbd`, `tournamentBracket.bye`).

## 13. Remaining original Tournament UX backlog items

- Backend **F-02** (tournament 404 error-code label `ACADEMY_PROGRAM_NOT_FOUND`) remains open —
  separate backend track, explicitly out of scope.
- No other original Tournament UX backlog issues remain open in this frontend scope: `P{id}` is gone
  from MatchCard (report 94) and from the player overview prediction line (this report).

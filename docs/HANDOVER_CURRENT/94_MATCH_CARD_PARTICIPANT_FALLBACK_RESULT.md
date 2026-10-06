# 94_MATCH_CARD_PARTICIPANT_FALLBACK_RESULT.md

**Date:** 2026-10-06
**Type:** Frontend-only Tournament UX fix (remove internal ids from MatchCard)
**Overall verdict:** PASS

---

## 1. Starting HEAD

- Actual repository HEAD at start: `0d16b137` (`docs: add authenticated e2e capability result`).
  The task brief referenced `70d57590` (two E2E documentation commits earlier); those later commits
  are already on `master` and are unrelated to this change. Working tree at start was clean.

## 2. Problem

`MatchCard` used an internal participant-id fallback:
```
match.player1_id ? `P${match.player1_id}` : ...   // p1
match.player2_id ? `P${match.player2_id}` : ...   // p2
```
A match whose participant slot had an id but no display name rendered **P{id}** (e.g. P10) directly
to the user. The `MatchDetailsDrawer` had already been fixed (neutral localized label); `MatchCard`
was the remaining surface.

## 3. Exact fix

`frontend/src/components/tournaments/MatchCard.tsx` — participant labels now use the same resolution
as the drawer:
```
const p1N = match.player1_name || match.participant1_name ||
            (match.player1_id != null ? t('tournamentBracket.notAvailable') : t('tournamentBracket.tbd'));
const p2N = match.player2_name || match.participant2_name ||
            (match.player2_id != null ? t('tournamentBracket.notAvailable') : bye ? t('tournamentBracket.bye') : t('tournamentBracket.tbd'));
```
Behavior matrix:

| Case | Before | After |
|---|---|---|
| Display name present (player or participant) | name | name (unchanged) |
| Slot assigned but no name (only id) | `P{id}` | `tournamentBracket.notAvailable` → "Not available" (localized) |
| Unassigned / TBD side | `TBD` | `tournamentBracket.tbd` (unchanged) |
| Bye slot | `Bye` | `tournamentBracket.bye` (unchanged) |

No internal numeric/participant id is ever rendered. Initials avatars, winner/loser styling,
current-player styling, score rendering, navigation, animations, print and responsive behavior are
all unchanged (only the label resolution changed).

## 4. Files changed

| File | Change |
|---|---|
| `frontend/src/components/tournaments/MatchCard.tsx` | Replaced `P{id}` fallback with neutral `notAvailable` label (drawer-consistent) |
| `frontend/src/components/tournaments/__tests__/TournamentBracket.universal.spec.tsx` | Referee bracket test no longer expects `P10`/`P21`; asserts the neutral fallback and absence of `P{id}` |
| `frontend/src/components/tournaments/__tests__/matchPresentation.spec.tsx` | Added 5 focused tests for the new fallback |

No backend, DB, migrations, RBAC, navigation, drawer, avatar, or E2E files were changed.

## 5. Tests

Focused:
```
vitest run matchPresentation.spec.tsx TournamentBracket.universal.spec.tsx
Test Files  2 passed (2)
Tests       26 passed (26)
```
New coverage proves: real name renders; `participant_name` fallback renders; TBD renders TBD; Bye
remains Bye; id-only participants do **not** render `P{id}` and the rendered card contains no
`\bP\d+\b` or `#`; current-player highlight and initials avatars are preserved when names are absent.

Full relevant tournament suite:
```
Test Files  23 passed (23)
Tests       200 passed (200)   // was 195; +5 new
```
Zero failures; zero new failures.

## 6. TypeScript / build

- `npx tsc --noEmit` → **clean (exit 0)**.
- `npm run build` → **PASS** (exit 0).

## 7. Docker status

- `docker compose build frontend` → rebuilt (frontend-only change).
- `docker compose up -d` → `courtzon-frontend` **Up (healthy)** (rebuild), `courtzon-backend` Up (healthy); `http://localhost:5173/` → 200; `http://localhost:3000/health` → 200 (`status: ok`).

## 8. Commits

- Feature: `896cdaba` — `fix(tournaments): remove internal ids from match cards`
- Docs: the `docs: add match card participant fallback result` commit (this file)

## 9. Final Git status

- Working tree: clean.
- `HEAD == origin/master` after both commits are pushed to `master`.

## 10. Confirmation — no DB / backend changes

Frontend-only. No database, migrations, backend, API, RBAC, or tournament business-logic changes.

## 11. Remaining original Tournament UX backlog items

- `frontend/src/pages/tournaments/TournamentDetailPage.tsx` (overview "Player X vs Player Y"
  prediction line) still uses a `P{id}`-style fallback (`m.player1_name || P${m.player1_id || '—'}`)
  — **out of scope** for this task (not MatchCard); a candidate for a later backlog item.
- Backend F-02 (tournament 404 error-code label) remains open (separate track).
- No other original Tournament UX backlog issues remain open in this scope.
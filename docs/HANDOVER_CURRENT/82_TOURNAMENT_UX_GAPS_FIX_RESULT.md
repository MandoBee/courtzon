# 82_TOURNAMENT_UX_GAPS_FIX_RESULT.md

**Date:** 2026-10-06
**Type:** Frontend-only UX fix (3 confirmed audit gaps)
**Overall verdict:** PASS

---

## 1. Starting state

- Starting HEAD: `8cfaec5d` (`docs: add final tournament ux audit`)
- Working tree at start: clean.
- Prior features preserved: navigation, animations, print view, drawer open/close, role parity.

## 2. Files changed

| File | Change |
|------|--------|
| `frontend/src/components/tournaments/PlayerAvatar.tsx` | NEW — `playerInitials`, `resolveWinnerSide`, `PlayerAvatar` (frontend-only) |
| `frontend/src/components/tournaments/MatchCard.tsx` | Single centred score, winner/loser treatment, initials avatars |
| `frontend/src/components/tournaments/MatchDetailsDrawer.tsx` | Single primary score, winner badge, initials avatars, Result section only for structured data |
| `frontend/src/components/tournaments/__tests__/matchPresentation.spec.tsx` | NEW — 11 focused tests |

No other files were modified.

## 3. Duplicate score fix (FIX 1)

**MatchCard**
- Removed the naive per-side score tokens (`score.split(' ')` → `homeScore`/`awayScore`).
- The score is now rendered **exactly once**, centred between the two players (the middle row shows the score when present, otherwise `vs`).
- Sport-aware formatting still comes from the shared `formatTournamentScore()` — football `2 - 0`, single-set `6 - 3`, best-of-3 match-level `2 - 1`, and detailed set strings such as `6-4 6-3` are preserved verbatim.
- No arbitrary `-` splitting remains.

**MatchDetailsDrawer**
- Removed the per-side `scoreFirst`/`scoreRest`.
- The primary score is rendered **once** in the Match section (large, centred between the players).
- The Result section now renders **only** when a structured `resultRecord` is supplied (`ResultSummaryView`) — genuine additional detail — instead of re-printing the same summary score and winner.
- `scoreStructure` is shown once as a small hint under the score.

## 4. Winner / loser visual treatment (FIX 2)

Implemented in both `MatchCard` and `MatchDetailsDrawer` via `resolveWinnerSide()` (uses existing `winner_id`, with a `winner_participant_id` fallback for team/pair slots; never guesses):

- **Winner:** semibold name + a textual **"Winner"** badge (green-tinted). The badge is text, so the result is not communicated by colour alone.
- **Loser:** muted text colour — visible and fully interactive, **not** disabled or hidden.
- **Current player:** keeps the primary-colour bold highlight (and the one-shot emphasis animation), which always takes precedence so it stays distinguishable from winner styling.
- **Draw / unplayed / bye / missing result:** no winner badge, no dimming (both rows default).
- No continuous pulsing, no layout shift, no new dependency.
- Print: the "Winner" text badge survives the print palette (all print text is forced black), so the winner remains identifiable in print without additional CSS changes.

## 5. Initials avatars (FIX 3)

- New frontend-only helper `PlayerAvatar.tsx`:
  - `playerInitials(name)`: two-word → 2 initials (`Alpha Bravo` → `AB`), one-word → 1 (`Alpha` → `A`), separators (`/`, whitespace) handled, empty/null → safe `?`, digits/punctuation handled via the first alphanumeric character.
  - `PlayerAvatar`: circular, compact (`h-7 w-7` on cards, `h-9 w-9` in the drawer), CourtZon primary tokens, `aria-hidden` (decorative; the adjacent name is the accessible label).
  - Tones: `default`, `current` (ringed primary), `winner` (success), `loser` (muted) — consistent with the winner/loser fix.
- Uses **only** names already present in the bracket read-model. No avatar URLs, no backend/API fields, no profile queries, no network calls, no database changes, no internal IDs.
- No layout shift: avatars sit in the existing flex rows (`shrink-0`) and names use `truncate flex-1`.

## 6. Tests / results

New focused tests (`matchPresentation.spec.tsx`) — **11 passed**:
- `playerInitials` one/two-word, separators, empty/null/undefined, digit fallback.
- `resolveWinnerSide` player-id, participant fallback, and none.
- MatchCard: score appears exactly once; multi-set score once (no naive split); winner badge + loser muted (not disabled); draw/unplayed have no winner treatment; current-player highlight distinct; missing-name safe fallback.
- MatchDetailsDrawer: primary score once; multi-set once; winner clear.

Regression suites (all still pass):
- `matchNavigation.spec.ts` (11), `MatchDetailsDrawer.navigation.spec.tsx` (9), `bracketAnimation.spec.tsx` (5), `printView.spec.tsx` (3) → **28 passed**.

Full relevant tournament suite:
```
Test Files  2 failed | 19 passed (21)
Tests       9 failed | 173 passed (182)
```
The 9 failures are the **same pre-existing baseline failures** (8 × `TournamentBracket.universal.spec.tsx` from its broken i18n mock + 1 × `TournamentCreatePage.spec.tsx` RBAC-visibility expectation). This task added **zero new failures** (173 = previous 162 + 11 new).

## 7. TypeScript result

```
cd frontend
npx tsc --noEmit
```
→ **clean (exit 0)**.

> Note: the first `npm run build` surfaced a stricter `tsc -b` error on an `unknown` React child (`resultRecord && …`). Fixed by coercing to `Boolean(resultRecord)`. Both `tsc --noEmit` and the build now pass.

## 8. Build result

```
cd frontend
npm run build
```
→ **PASS** (exit 0; `tsc -b` + `vite build` + PWA `sw.js` + notification SW).

## 9. Docker result

```
docker compose build backend frontend
docker compose up -d
docker compose ps
```

→ **PASS**
- Both images built (frontend bundle includes the new `PlayerAvatar` chunk).
- Containers after restart:
  - `courtzon-frontend` — `Up (healthy)`, `0.0.0.0:5173->80/tcp`
  - `courtzon-backend` — `Up (healthy)` (image unchanged, cached)
  - `courtzon-mysql` — `Up (healthy)`, `courtzon-redis` — `Up (healthy)`
- HTTP checks:
  - `GET http://localhost:5173` → **200**
  - `GET http://localhost:3000/health` → **200** (`status: ok`)

## 10. Confirmation of untouched areas

- **Database:** unchanged.
- **Migrations:** unchanged.
- **Backend:** unchanged.
- **API contracts:** unchanged.
- **RBAC:** unchanged.
- **Business rules:** unchanged.
- **Tournament 4 / Tournament 5 test data:** untouched.
- **Preserved:** bracket navigation + resolver, animations + reduced-motion, print view, drawer open/close, role parity (Player / Organizer / Admin / Super Admin / Referee / Public), and the shared `TournamentBracket`/`MatchCard` architecture (no role-specific variants).

## 11. Remaining known gaps (out of this task's scope)

1. Drawer still shows raw internal IDs as fallbacks (`#resource_id`, `#referee_id`, `#booking_id`, `P{id}`).
2. Drawer still groups court/referee/booking inside the Schedule section (no distinct VENUE/OFFICIAL/BOOKING sections).
3. Shared `Modal` still lacks dialog semantics/focus management (`role`, `aria-modal`, `aria-labelledby`, focus trap).
4. Referee surface still has no print entry point.
5. Pre-existing `TournamentBracket.universal.spec.tsx` i18n-mock defect (and the `TournamentCreatePage` RBAC visibility expectation) remain.
6. Unused `tournamentBracket.sectionProgression` translation key remains.

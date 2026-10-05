# 78_TOURNAMENT_BRACKET_NAVIGATION_RESULT.md

**Date:** 2026-10-06
**Type:** Frontend-only feature (defensive bracket navigation)
**Overall verdict:** PASS

---

## 1. Starting state

- Starting HEAD: `64354684` (`docs: match details drawer ux result`)
- Working tree at start: only two untracked pre-existing handover docs (73, 74); no modified tracked files.

## 2. Files changed

Feature commit (`feat(tournaments): add bracket match navigation`):

| File | Change |
|------|--------|
| `frontend/src/components/tournaments/matchNavigation.ts` | NEW — pure, defensive resolver for previous/next bracket matches |
| `frontend/src/components/tournaments/MatchDetailsDrawer.tsx` | Added optional `matches` + `onSelectMatch` props, Previous/Next controls, removed raw `progression_meta` rendering |
| `frontend/src/i18n/translation-keys.registry.ts` | Added `tournamentBracket.prevMatch` / `tournamentBracket.nextMatch` EN defaults |
| `frontend/src/pages/tournaments/TournamentDetailPage.tsx` | Wired `matches` + `onSelectMatch` into the shared drawer |
| `frontend/src/pages/referee/RefereeAssignmentsPage.tsx` | Wired `matches` + `onSelectMatch` into the shared drawer |
| `frontend/src/pages/admin/tournament/TournamentDetailPage.tsx` | Wired `matches` + `onSelectMatch` into the shared drawer |
| `frontend/src/pages/admin/tournament/TournamentMatchesPage.tsx` | Wired `matches` + `onSelectMatch` into the shared drawer |
| `frontend/src/components/tournaments/__tests__/matchNavigation.spec.ts` | NEW — resolver unit tests |
| `frontend/src/components/tournaments/__tests__/MatchDetailsDrawer.navigation.spec.tsx` | NEW — drawer navigation integration tests |

No other file was modified. `TournamentBracket.tsx`, `MatchCard.tsx` and `TournamentPrintView.tsx` were intentionally left untouched.

## 3. Navigation logic implemented

`resolveBracketNavigation(current, matches, currentUserId)` is a **pure function** over the already-loaded match rows. It never issues a request and never mutates state.

The only persisted progression contract it reads is the documented `progression_meta` shape
(`backend/src/modules/tournaments/domain/knockout-placements.ts`):

```
{ is_bracket?: boolean; bye?: boolean;
  target_round?: number|null; target_bracket_position?: number|null;
  target_side?: 'player1'|'player2'|null }
```

Semantics: the **winner** of a slot advances into the match at (`target_round`, `target_bracket_position`).

- **Next Match** — resolves to the **unique** loaded match in the same tournament whose
  `round === target_round` and `bracket_position === target_bracket_position`.
  A terminal slot (`target_round`/`target_bracket_position` null) has no Next.
- **Previous Match** — resolves to a feeder whose `progression_meta` points at the current
  slot's (`round`, `bracket_position`).
  - exactly one feeder → that feeder is Previous;
  - two feeders → ambiguous as a single "previous"; resolved ONLY when the authenticated
    user occupies a side of the current match, in which case the feeder whose `target_side`
    matches the user's side is used;
  - otherwise Previous stays disabled.

Both controls are disabled unless a target is proven. When a control is enabled, clicking it
calls `onSelectMatch(target)`, which the parent uses to re-target the existing drawer **without
closing it**. The drawer, the shared `TournamentBracket` and `MatchCard` remain the single
source of truth across Player / Organizer / Admin / Super Admin / Referee surfaces; the public
surface has no drawer and is unchanged for navigation purposes.

## 4. Defensive / ambiguity handling

- `is_bracket !== true` (round-robin, league, group, or unknown meta) → **no navigation ever**.
- Missing / non-numeric `target_round` or `target_bracket_position` → no Next.
- More than one match at the target coordinates (including cross-tournament collisions) → no Next.
- Two feeders without a determinable viewer side → no Previous.
- `matches` omitted, `null`, `[]`, or `onSelectMatch` omitted → navigation controls are not
  rendered at all, so existing drawer contracts/surfaces behave exactly as before.
- `progression_meta` of an unknown shape (nested objects, strings, null) is inspected
  defensively and can never throw or render raw JSON.

## 5. Score / progression rendering

- Score display semantics were **not** changed; the existing `formatTournamentScore()` output is
  used unchanged (football, tennis single set, tennis best-of-3, structured-result precedence,
  `score_summary` fallback).
- The pre-existing **raw `progression_meta` JSON section has been removed** from the drawer,
  satisfying the "never expose raw progression_meta / internal implementation details" rule.

## 6. Tests executed and results

New tests (both pass):

```
npx vitest run \
  src/components/tournaments/__tests__/matchNavigation.spec.ts \
  src/components/tournaments/__tests__/MatchDetailsDrawer.navigation.spec.tsx

✓ matchNavigation.spec.ts ................................. 11 tests
✓ MatchDetailsDrawer.navigation.spec.tsx .................  9 tests
Test Files  2 passed (2)
Tests      20 passed (20)
```

Coverage includes: valid Next, valid Previous, lone-feeder Previous, viewer-side disambiguation,
disabled navigation for unknown relationships, disabled navigation for ambiguous relationships,
round-robin receives no invented navigation, `progression_meta` unknown structure does not crash,
drawer re-targets to the selected match, raw `progression_meta` is never rendered, and no network
call is made while navigating.

Relevant existing tournament suites (`src/components/tournaments`, `src/pages/tournaments`,
`src/pages/admin/tournament`, `src/pages/referee`):

```
Test Files  2 failed | 16 passed (18)
Tests       9 failed | 154 passed (163)
```

The 9 failures are **pre-existing at the baseline commit `64354684`** — verified by stashing this
task's changes and re-running the identical two files, which produced the exact same
`9 failed | 19 passed` result and the same errors:
- `TournamentBracket.universal.spec.tsx` — 8 failures (incl. an unhandled
  "Objects are not valid as a React child (found: object with keys {type})").
- `TournamentCreatePage.spec.tsx` — 1 RBAC-visibility failure.

This task introduced **zero new test failures**.

## 7. TypeScript result

```
cd frontend
npx tsc --noEmit
```
→ **clean (no errors)**.

## 8. Build result

```
cd frontend
npm run build
```
→ **PASS** (`tsc -b` + `vite build` + PWA `sw.js` generation + notification SW injection).

## 9. Docker validation

```
docker compose build frontend
docker compose up -d
docker compose ps
```

→ **PASS**
- `courtzon-frontend` image rebuilt (Vite production build + PWA `sw.js` + notification SW injection).
- Container recreated and healthy:
  - `courtzon-frontend` — `Up (healthy)`, `0.0.0.0:5173->80/tcp`
  - `courtzon-backend` — `Up (healthy)`, `0.0.0.0:3000->3000/tcp`
  - `courtzon-mysql` — `Up (healthy)`, `courtzon-redis` — `Up (healthy)`
- HTTP checks:
  - `GET http://localhost:5173` → **200**
  - `GET http://localhost:3000/health` → **200** (`status: ok`, database check reported)

## 10. Confirmation of untouched areas

- **Database:** unchanged.
- **Migrations:** unchanged (no new migration files; baseline untouched).
- **Backend:** unchanged (no backend source modified).
- **API contracts:** unchanged (no endpoint added/removed/altered).
- **RBAC:** unchanged (no permission keys added; existing surface gates untouched).
- **Tournament 4 / Tournament 5:** not modified (no seed or test data touched).

## 11. Navigation limitations (documented, intentional)

- Next/Previous rely entirely on the persisted `progression_meta`; if a read-model row omits the
  documented coordinates, navigation for that row stays disabled (fail-closed, never guessed).
- Previous is disabled for a standard two-feeder match when the viewer is not identified as one
  of the two participants (the relationship would otherwise be ambiguous as a single "previous").
- Chronological order (`start_time`) is never used as a substitute for bracket progression.
- No avatars are introduced; the existing initials/name fallbacks are unchanged.

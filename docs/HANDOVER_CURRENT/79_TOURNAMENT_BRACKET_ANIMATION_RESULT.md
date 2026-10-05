# 79_TOURNAMENT_BRACKET_ANIMATION_RESULT.md

**Date:** 2026-10-06
**Type:** Frontend-only UX polish (subtle bracket animations)
**Overall verdict:** PASS

---

## 1. Starting state

- Starting HEAD: `115c23e9` (`docs: add bracket navigation result and phase handover notes`)
- Feature reference: `d5eb4b20` (bracket match navigation)
- Working tree at start: clean.

## 2. Files changed

| File | Change |
|------|--------|
| `frontend/src/components/tournaments/TournamentBracket.tsx` | Per-round staggered entrance class + inline `animation-delay` on interactive (non-print) columns |
| `frontend/src/components/tournaments/MatchCard.tsx` | Added `cz-match-card` hook; hover/active transform transition; current-player emphasis class |
| `frontend/src/index.css` | New CSS-only keyframes + utility classes + reduced-motion protection |
| `frontend/src/components/tournaments/__tests__/bracketAnimation.spec.tsx` | NEW — timing-free animation-contract tests (5) |

No backend, database, migration, API, RBAC, navigation-resolver, `MatchDetailsDrawer`, or `TournamentPrintView` file was touched.

## 3. Animation behavior

**Bracket appearance (staggered entrance)**
- Each round column (knockout columns and round-robin round groups) receives `.cz-bracket-col`.
- Keyframe `cz-bracket-rise`: `opacity 0 → 1` and `translateY(8px) → 0`, duration **320 ms**, easing `cubic-bezier(0.22, 1, 0.36, 1)`, `animation-fill-mode: both`.
- Stagger is applied per column via an inline `animationDelay` of `index * 60 ms` — fast and professional, with no long chains.
- Print mode (`printOnly`) receives **no** animation class and no inline delay.

**Match cards (subtle hover/focus)**
- `hover:-translate-y-px` (a 1px lift) with `active:translate-y-0`; transition is limited to `transform, border-color` at 150 ms.
- The existing focus ring (`focus-visible:ring-2`) and hover border colour are preserved.
- Transform-only → **no layout shift**, **no horizontal overflow**.

**Current-player highlight**
- The pre-existing highlight (primary colour + bold) is unchanged.
- A one-shot `cz-emphasis-in` settle (opacity `0.45 → 1`, `translateX(-3px → 0)`, 360 ms) is added only to the current player's name span. It is **finite** — never a continuous pulse.

**Winner state / details opening**
- Existing winner styling and drawer behaviour are untouched. The shared `Modal` already provides the sheet/fade entrance (`cz-sheet-enter` / `cz-fade-enter`); no changes were needed or made.
- Navigation behaviour is unchanged.

## 4. Reduced-motion behavior

Inside the existing `@media (prefers-reduced-motion: reduce)` block:
- `.cz-bracket-col` and `.cz-player-emphasis` are added to `animation: none` (entrance/emphasis become instantaneous).
- `.cz-match-card`, `.cz-match-card:hover`, `.cz-match-card:active` get `transform: none !important` and `transition: none !important`, so hover/active produce no motion.
- No JavaScript reduced-motion detection is used — pure CSS media query.

## 5. Accessibility considerations

- Motion is transform/opacity only (no layout-affecting properties).
- All animations are one-shot and subtle; no looping/pulsing.
- Reduced-motion users receive effectively instantaneous transitions.
- Existing focus-visible ring and keyboard behaviour are preserved; no visual hierarchy change.
- No colour-only semantics were introduced.

## 6. Tests / results

New focused tests (timing-free; assert class/CSS contracts only):

```
npx vitest run src/components/tournaments/__tests__/bracketAnimation.spec.tsx
✓ bracketAnimation.spec.tsx (5 tests)
```

Combined with the existing navigation suites:

```
npx vitest run \
  src/components/tournaments/__tests__/bracketAnimation.spec.tsx \
  src/components/tournaments/__tests__/MatchDetailsDrawer.navigation.spec.tsx \
  src/components/tournaments/__tests__/matchNavigation.spec.ts
Test Files  3 passed (3)
Tests       25 passed (25)
```

Full relevant tournament suite (`src/components/tournaments`, `src/pages/tournaments`,
`src/pages/admin/tournament`, `src/pages/referee`):

```
Test Files  2 failed | 17 passed (19)
Tests       9 failed | 159 passed (168)
```

The **9 failures are pre-existing at the baseline** (`TournamentBracket.universal.spec.tsx` ×8
and `TournamentCreatePage.spec.tsx` ×1 — the former's i18n mock returns parameter objects as
React children). This task introduced **zero new failures** (159 passed = previous 154 + 5 new).

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

## 9. Docker result

```
docker compose build backend frontend
docker compose up -d
docker compose ps
```

→ **PASS**
- Both images rebuilt (`courtzon-backend`, `courtzon-frontend`).
- Containers after restart:
  - `courtzon-frontend` — `Up (healthy)`, `0.0.0.0:5173->80/tcp`
  - `courtzon-backend` — `Up (healthy)`, `0.0.0.0:3000->3000/tcp`
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
- **Match navigation resolver / MatchDetailsDrawer navigation:** unchanged.
- **TournamentPrintView:** unchanged.
- **Tournament 4 / Tournament 5 test data:** not modified.

## 11. Limitations

- Column entrance is animated per round column (stagger). Individual cards are not separately
  staggered, to keep the effect fast and avoid long cascades in large brackets.
- Hover lift is 1px and only on hover-capable input; touch devices simply show the static card.

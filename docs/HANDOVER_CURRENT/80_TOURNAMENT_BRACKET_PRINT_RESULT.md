# 80_TOURNAMENT_BRACKET_PRINT_RESULT.md

**Date:** 2026-10-06
**Type:** Frontend-only print UX/readability improvements
**Overall verdict:** PASS

---

## 1. Starting state

- Starting HEAD: `25815bf1` (`docs: add bracket animation result`)
- Working tree at start: clean.
- Prior work (navigation `d5eb4b20`, animations `1b310708`) left intact.

## 2. Files changed

| File | Change |
|------|--------|
| `frontend/src/components/tournaments/TournamentPrintView.tsx` | Semantic `header`/`section.print-bracket`/`legend` structure + classes for print targeting |
| `frontend/src/index.css` | Expanded `@media print` rules: readability, borders, pagination, no-motion, no-clipping |
| `frontend/src/components/tournaments/__tests__/printView.spec.tsx` | NEW — print-only focused tests (3) |

Not modified: `MatchDetailsDrawer`, `MatchCard`, `TournamentBracket` behaviour, navigation resolver, animations, backend, DB, migrations, API, RBAC, `TournamentPrintView`'s consumers other than this component.

## 3. Print improvements

**Readability**
- All text inside `.cz-print-area` is forced to solid black (`color: #000 !important`) so muted CSS-variable colours never print as light grey.
- Round headers (`h4`) print black, bold-weight, with a black bottom rule and a 12px size, giving clear round hierarchy.
- Match cards get a solid `1px solid #000` border and white background, so each match stays visually distinct even when browsers drop background fills.
- Status badges / chips (`[class*="rounded-full"]`) get a solid outline so status stays legible without relying on colour fill.
- Player names and numeric scores are preserved unchanged; the numeric result is inherently colour-independent (no colour-only winner cue exists in `MatchCard`, so nothing is lost).

**Layout / pagination**
- Match cards use `break-inside: avoid` / `page-break-inside: avoid` so an individual card is not split across pages.
- Round headers use `break-after: avoid` so a header is never orphaned at the page bottom.
- `.print-rounds > div` now uses `flex: 1 1 0` (previously shrink-only) so bracket columns share the printable width instead of overflowing horizontally.
- The `.cz-print-area` overlay no longer pins `bottom: 0` (`left:0; top:0; width:100%`), so content taller than one page is not clipped by the box height.
- `@page { margin: 12mm; }` gives professional, consistent page margins.
- `truncate` on player names is neutralised in print (`white-space: normal`, `text-overflow: clip`, `overflow-wrap: anywhere`) so names wrap instead of being cut off.

**Print-only hygiene**
- `.cz-print-area, .cz-print-area * { animation: none !important; transition: none !important; }` guarantees no entrance/hover motion in print, even if a screen animation class ever leaks through.
- Match card `transform`/`box-shadow` are neutralised in print.
- No interactive navigation controls are present in the print view: it renders only the shared `TournamentBracket` in `printOnly` mode, which already suppresses the TBD hint, the table hint and the animation classes. The `MatchDetailsDrawer` is never part of the print area.
- `.cz-no-print` remains hidden; app chrome (`nav`, `aside`, bottom nav, drawer, toasts) stays hidden.

**Visual quality**
- Existing CourtZon visual language and the shared `TournamentBracket`/`MatchCard` architecture are reused; no second bracket implementation, no new dependency, no full redesign.

## 4. Screen behavior unchanged

- Every change is either inside `@media print` or in `TournamentPrintView`, which is rendered only inside the `hidden print:block .cz-print-area` container. The on-screen bracket, cards, navigation and animations are untouched.

## 5. Tests / results

New focused print tests (no browser-print assertions):

```
npx vitest run src/components/tournaments/__tests__/printView.spec.tsx \
               src/components/tournaments/__tests__/bracketAnimation.spec.tsx
✓ printView.spec.tsx ........... 3 tests
✓ bracketAnimation.spec.tsx .... 5 tests
Test Files  2 passed (2)
Tests       8 passed (8)
```

Full relevant tournament suite (`src/components/tournaments`, `src/pages/tournaments`,
`src/pages/admin/tournament`, `src/pages/referee`):

```
Test Files  2 failed | 18 passed (20)
Tests       9 failed | 162 passed (171)
```

The **9 failures are pre-existing at the baseline** (`TournamentBracket.universal.spec.tsx` ×8
due to a stale i18n mock, `TournamentCreatePage.spec.tsx` ×1). This task introduced **zero new
failures** (162 passed = previous 159 + 3 new print tests).

## 6. TypeScript result

```
cd frontend
npx tsc --noEmit
```
→ **clean (no errors)**.

## 7. Build result

```
cd frontend
npm run build
```
→ **PASS** (`tsc -b` + `vite build` + PWA `sw.js` generation + notification SW injection).

## 8. Docker result

```
docker compose build backend frontend
docker compose up -d
docker compose ps
```

→ **PASS**
- Both images built; `courtzon-frontend` recreated with the new print CSS.
- Containers:
  - `courtzon-frontend` — `Up (healthy)`, `0.0.0.0:5173->80/tcp`
  - `courtzon-backend` — `Up (healthy)` (image unchanged, cached)
  - `courtzon-mysql` — `Up (healthy)`, `courtzon-redis` — `Up (healthy)`
- HTTP checks:
  - `GET http://localhost:5173` → **200**
  - `GET http://localhost:3000/health` → **200** (`status: ok`)

## 9. Confirmation of untouched areas

- **Database:** unchanged.
- **Migrations:** unchanged.
- **Backend:** unchanged.
- **API contracts:** unchanged.
- **RBAC:** unchanged.
- **Match navigation / MatchDetailsDrawer / MatchCard behaviour / animation logic:** unchanged.
- **Tournament 4 / Tournament 5 test data:** not modified.

## 10. Limitations

- The print area uses the app's existing `visibility`-based hiding + absolute overlay strategy.
  The bottom edge is no longer pinned (reducing clipping), but browsers remain inconsistent about
  fragmenting absolutely-positioned content across pages for very tall brackets; very large
  brackets may still prefer the browser's "Fit to width / Scale" print option.
- Winner indication in the printed bracket is by numeric score (there is no colour-coded winner
  treatment in `MatchCard` to preserve), which is inherently print- and accessibility-safe.

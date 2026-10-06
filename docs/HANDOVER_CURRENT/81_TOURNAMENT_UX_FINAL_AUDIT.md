# 81_TOURNAMENT_UX_FINAL_AUDIT.md

**Date:** 2026-10-06
**Type:** READ-ONLY final audit (Tournament Bracket & Match Details UX)
**Auditor:** automated repository inspection
**Overall verdict:** PASS WITH MINOR GAPS

---

## 1. Executive summary

The Tournament Bracket & Match Details UX is architecturally coherent and safe to proceed to manual
end-to-end tournament testing.

- One shared bracket system (`TournamentBracket` → `MatchCard`) is used by every role surface.
- Defensive bracket navigation, CSS-only animations and the print view are implemented and tested.
- No duplicate bracket renderer exists.
- TypeScript is clean and the production build passes.
- The working tree is clean; `HEAD == origin/master`.
- No database, migration, backend, API or RBAC changes are present in the tournament UX commits.

The audit found **no blocking regression and no architecture violation**. It did find several
**pre-existing, non-blocking UX gaps** relative to the original spec — most importantly that
**player initials avatars were never implemented**, that `MatchCard` has **no winner/loser visual
treatment**, and that the **score is rendered more than once** in both the card and the drawer. The
known 9 test failures are unrelated to this UX work (a broken test-harness i18n mock and one RBAC
visibility expectation).

## 2. Baseline

- HEAD: `0b53a005` (`docs: add bracket print result`)
- origin/master: `0b53a005` (aligned)
- Working tree: clean
- Relevant history: `a0f7a5a3` (universal reuse) → `c7c07b72` (Phase A doc only) →
  `513165b1` (drawer polish) → `d5eb4b20` (navigation) → `1b310708` (animations) →
  `8a8fc4c4` (print) plus documentation commits.

## 3. Shared architecture audit

**Result: PASS.**

- `frontend/src/components/tournaments/TournamentBracket.tsx` is the single bracket renderer.
- `frontend/src/components/tournaments/MatchCard.tsx` is the single match card.
- `frontend/src/components/tournaments/MatchDetailsDrawer.tsx` is the single details drawer.
- `frontend/src/components/tournaments/TournamentPrintView.tsx` reuses `TournamentBracket` in
  `printOnly` mode — no second bracket implementation.
- `frontend/src/components/tournaments/matchNavigation.ts` is a pure resolver used by the drawer.

No duplicate bracket implementation was found.

**Observation (non-blocking):** `frontend/src/pages/referee/RefereeDashboardPage.tsx` defines a
local `function MatchCard(...)`. It is a *referee dashboard "today's matches" summary tile*, not a
bracket card, and does not render the bracket. It is a naming collision only.

## 4. Role parity audit

**Result: PASS.**

| Surface | Entry point | Bracket | Drawer | Print |
|--------|-------------|---------|--------|-------|
| Player | `pages/tournaments/TournamentDetailPage.tsx` | shared | shared | yes |
| Organizer | `pages/org/OrgTournamentDetailPage.tsx` → `pages/admin/tournament/TournamentDetailPage.tsx` (`mode="org"`) | shared | shared | yes |
| Admin | `pages/admin/tournament/TournamentDetailPage.tsx` | shared | shared | yes |
| Super Admin | same admin page (RBAC-gated) | shared | shared | yes |
| Referee | `pages/referee/RefereeAssignmentsPage.tsx` | shared | shared | **no** |
| Public | `pages/player/PublicTournamentDetailPage.tsx` | shared | n/a (by design) | n/a |

All bracket surfaces render the same `TournamentBracket`/`MatchCard`. Organizer is a thin wrapper
over the admin detail page, so org and admin cannot diverge. Public maps the public read-model into
the same rows and omits the drawer intentionally.

**Minor gap:** the print entry point exists on player/org/admin detail pages only; the referee
assignments page has no print action.

## 5. MatchCard audit

**Result: PASS WITH GAPS.**

Present and correct:
- Current-player highlighting (`isCurrentUser` → primary colour + bold, plus one-shot emphasis).
- Sport-aware score via `formatTournamentScore()` (structured result > `score_summary` > dash).
- Status badge and date/time/court rows.
- Fallbacks for missing names: player name → participant name → `P{id}` → `TBD` → `Bye`.
- Responsive: `truncate` names, `min-w-[220px]` columns, `overflow-x-auto` scroller.

Gaps vs. the audit objectives (all pre-existing, see §13):
- **Player initials avatars are not implemented.** No `getInitials`/avatar exists anywhere in
  `frontend/src` (verified with `git grep` and full history search).
- **No winner/loser visual treatment** in `MatchCard` — the card never reads `winner_id`.
- **Score duplication:** the score is rendered per side (`homeScore`, `awayScore`) *and* again as a
  centred full-score line. The per-side split is also naive: football `"2 - 0"` yields side tokens
  `"2"` and `"- 0"`; tennis `"6-3, 4-6, 6-2"` splits oddly. This violates "single centred score /
  no duplicated score".

## 6. MatchDetailsDrawer audit

**Result: PASS WITH GAPS.**

Present and correct:
- Modal header with title; player names with current-player highlight; winner indicated by the text
  label "Winner" (colour-independent).
- Sections implemented: **Match** (status, round, match number), **Schedule** (date, start, end,
  court, referee, booking), **Result** (structured `ResultSummaryView` when a record is supplied,
  otherwise score + winner).
- Raw `progression_meta` JSON has been **removed** (no raw JSON rendered).
- Close/open behaviour unchanged (shared `Modal`, Escape + overlay close, body scroll lock).
- Mobile: bottom-sheet on small screens, `max-h-[85vh]`/`md:max-h-[90vh]` with internal scroll.
- Navigation controls have `aria-label` and correct `disabled` states.

Gaps:
- **Score displayed twice:** per-side score in the Match section *and* the full score in the Result
  section.
- **No initials avatars.**
- **No distinct VENUE / OFFICIAL / BOOKING sections** — court, referee and booking are rows inside
  the Schedule section (information is present, grouping differs from the spec).
- **Raw internal IDs are shown as fallbacks:** `#resource_id`, `#referee_id`, and `#booking_id`
  (booking is always shown as `#id`), plus `P{player_id}` name fallbacks.

## 7. Navigation audit

**Result: PASS.**

- `resolveBracketNavigation()` is pure, reads only the already-loaded `matches` array, and makes no
  network call.
- Reads only the documented `progression_meta` shape (`is_bracket`, `target_round`,
  `target_bracket_position`, `target_side`); unknown/malformed meta fails closed.
- **Next** = the unique match at the documented target coordinates. **Previous** = a feeder; two
  feeders are resolved only via the authenticated player's side, otherwise disabled.
- Round-robin / non-bracket slots receive no navigation.
- Selecting a target calls `onSelectMatch`, which re-targets the existing drawer without closing it.
- Drawer close behaviour is untouched.
- The resolver is wired on player, org/admin and referee surfaces (`matches` + `onSelectMatch`).
- Covered by 20 passing focused tests.

## 8. Animation audit

**Result: PASS.**

- CSS-only keyframes (`cz-bracket-rise`, `cz-emphasis-in`); no animation library, no new dependency.
- Bracket columns get a staggered entrance via inline `animationDelay` (`index × 60 ms`); print mode
  is excluded.
- `MatchCard` hover/active uses a 1px transform with a 150 ms `transform, border-color` transition.
- Current-player emphasis is a finite one-shot settle — no continuous pulse.
- No layout shift (transform/opacity only).
- `@media (prefers-reduced-motion: reduce)` disables the entrance/emphasis animations and neutralises
  the card transform/transition.
- The only `infinite` animation in the stylesheet is the unrelated `.cz-skeleton` shimmer.

## 9. Print audit

**Result: PASS.**

- `TournamentPrintView` reuses `TournamentBracket` (`printOnly`) — no duplicate bracket.
- Readable round headers (black + bottom rule, `break-after: avoid`), names wrap instead of being
  clipped (`truncate` neutralised), cards get a solid black border and `break-inside: avoid`.
- All print-area animation/transition is disabled; hover/active is neutralised.
- No screen-only navigation controls exist in the print view (it renders only the bracket).
- Print columns share the page width (`flex: 1 1 0`) to avoid horizontal overflow; `@page { margin:
  12mm }`.
- Screen behaviour is unchanged: the view renders only inside `hidden print:block .cz-print-area`.
- Winner/result in print is communicated by numeric score, and status badges get an outline — not
  colour-only.

**Limitation:** the print area uses the existing `visibility`-hide + absolute-overlay strategy; the
bottom edge is no longer pinned (reducing clipping), but very tall brackets may still be best served
by the browser's "Fit to width / Scale" option.

## 10. Accessibility audit

**Result: PASS WITH GAPS.**

- Keyboard: `MatchCard` is a native `<button>` (focusable, Enter/Space); the drawer's close button is
  a native button with `aria-label="Close"`; Escape and overlay-click close the drawer.
- Navigation buttons expose `aria-label` ("Previous match"/"Next match") and `disabled` when no safe
  target exists.
- Reduced motion is honoured (see §8).
- Winner indication is textual ("Winner") in the drawer; status badges include a text label, so
  neither relies on colour alone.
- **Gap:** the shared `Modal` (and therefore the drawer) has no `role="dialog"`, `aria-modal`, or
  `aria-labelledby`, and does not move/trap focus into the dialog. This is a pre-existing shared-UI
  limitation, not bracket-specific.

## 11. Responsive audit

**Result: PASS.**

- Bracket: knockout columns `min-w-[220px]` inside `overflow-x-auto` (horizontal scroll on mobile,
  no page-level overflow); round-robin uses a responsive `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
- Drawer: bottom-sheet on mobile, centred panel on `md+`, internal scroll, safe-area/bottom-nav
  reservation via the shared `Modal`.
- Navigation controls: full-width, thumb-sized buttons in a single row.
- No clipped-content or unusable-control issue was found in the implementation.

## 12. Test coverage

**Added by these phases (all passing):**

| File | Tests | Covers |
|------|-------|--------|
| `__tests__/matchNavigation.spec.ts` | 11 | Next/Prev, ambiguity, round-robin, malformed meta, cross-tournament |
| `__tests__/MatchDetailsDrawer.navigation.spec.tsx` | 9 | Nav enabling/disabled, target selection updates drawer, no raw JSON, no network call |
| `__tests__/bracketAnimation.spec.tsx` | 5 | Entrance class/stagger, print exclusion, card hook, reduced-motion CSS |
| `__tests__/printView.spec.tsx` | 3 | Print header/bracket render, print-mode (no animation), print CSS contracts |

**Existing relevant coverage:** player `TournamentDetailPage` (bracket renders names +
`score_summary`), admin/org `TournamentDetailPage` (enriched fields, matches table), draw/list/
participants/create page tests.

**Gaps:** no dedicated `MatchCard` unit test (initials / winner treatment / single-score not
covered); no drawer section test (VENUE/OFFICIAL/BOOKING); the universal spec is unusable (see §13);
no test asserting the score is rendered once; no modal-dialog accessibility test; print tests assert
CSS contracts, not browser rendering.

## 13. Known 9 baseline failures

`npx vitest run src/components/tournaments src/pages/tournaments src/pages/admin/tournament src/pages/referee`
→ **9 failed | 162 passed (171)**, `2 failed test files | 18 passed`.

Since the working tree is clean at `HEAD == origin/master`, this run **is** the current baseline. All
9 failures pre-existed earlier phases (verified in tasks 78–80 by stashing those changes and
re-running). **No current UX change introduced a new failure.**

1. **8 × `TournamentBracket.universal.spec.tsx`** — test-harness defect. Its i18n mock is
   `t: (k, d) => d ?? k`, which returns the **params object** when components call
   `t(key, { round })` / `t(key, { type })`; React then throws "Objects are not valid as a React
   child (found: object with keys {round}/{type})". Some assertions are also stale (e.g. expecting an
   exact `"Semi Final"` node). Not a product bug.
2. **1 × `TournamentCreatePage.spec.tsx`** `hides the venue/daily section when the prize permission
   is absent (RBAC visibility)` — the venue field still renders with only `org.tournaments.create`.
   An RBAC-visibility expectation mismatch in the create page; unrelated to bracket UX.

## 14. TypeScript / build results

- `npx tsc --noEmit` → **clean (exit 0)**.
- `npm run build` → **PASS** (exit 0; `tsc -b` + `vite build` + PWA `sw.js` + notification SW).

## 15. Git status

- Working tree: clean.
- `HEAD` = `0b53a005...`; `origin/master` = `0b53a005...` (aligned).

## 16. Data / business safety

- The tournament UX commits (`a0f7a5a3` → `0b53a005`) change **only `frontend/**` and `docs/**`**.
- No database, migration, backend business-logic, API-contract or RBAC changes in the UX work.
- No seed/fixture changes; Tournament 4 and Tournament 5 test data untouched.

## 17. Remaining gaps (non-blocking)

1. Player **initials avatars not implemented** (never existed despite docs claiming so).
2. `MatchCard` has **no winner/loser visual treatment**.
3. **Score rendered more than once** in `MatchCard` and in the drawer; `MatchCard` per-side token
   split is naive for hyphenated/multi-set scores.
4. Drawer **VENUE / OFFICIAL / BOOKING** are combined into the Schedule section rather than separate
   sections.
5. Drawer exposes **raw internal IDs** (`#resource_id`, `#referee_id`, `#booking_id`, `P{id}`) as
   fallbacks.
6. Shared `Modal` lacks **dialog semantics / focus management** (`role`, `aria-modal`,
   `aria-labelledby`, focus trap).
7. Referee surface has **no print entry point**.
8. **Documentation drift:** docs 73/74/77 claim initials, winner/loser states and "score displayed
   once" that the code does not implement; the `TournamentBracket.universal.spec.tsx` mock defect is
   long-standing.
9. Unused translation key `tournamentBracket.sectionProgression` remains after the raw progression
   section was removed.

## 18. Final verdict

**PASS WITH MINOR GAPS.**

No blocking regression, architecture violation, or broken shared component was found. The shared
architecture and role parity are intact, navigation/animation/print are implemented defensively and
tested, and the build/type checks pass. The gaps above are cosmetic/spec-completeness issues that do
not prevent functional end-to-end testing.

## 19. Recommendation for the next step

1. **Proceed to manual end-to-end tournament testing** on the deployed build (player → org → admin /
   super admin → referee → public), exercising registration, bracket generation, navigation, drawer,
   animations and print.
2. During UAT, decide whether to address (in a separate, scoped change): the duplicated score
   rendering (highest visible-impact gap), winner/loser emphasis in `MatchCard`, and initials
   avatars.
3. Separately, repair the stale `TournamentBracket.universal.spec.tsx` i18n mock so the shared
   bracket has a trustworthy regression suite, and re-check the `TournamentCreatePage` RBAC visibility
   expectation.
4. Optional polish: add drawer dialog semantics/focus handling, a referee print action, and remove
   the now-unused `sectionProgression` key.

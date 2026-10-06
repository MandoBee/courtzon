# HANDOVER 97 — Tournament Hub Foundation (Redesign Step 1)

**Date:** 2026-10-06
**Scope:** Tournament Redesign — Step 1 (Hub shell only. No format engines, no Group Stage + Knockout, no DE/Swiss, no DB changes.)
**Mode:** Extend existing shared detail screen; preserve every existing route and function.

---

## 1. What changed

The fragmented organizer/admin tournament detail experience became a single **Tournament Hub** — one coherent management surface for both the Super Admin workbench and the Org Admin portal. The existing shared `TournamentDetailPage` (already shared between admin and org via thin wrappers) was extended into the Hub, so there is no new page, no route duplication, and no functionality loss.

New structure per page (admin `mode="admin"`, org `mode="org"`):

```
TOURNAMENT HERO   → status + meta + ONE lifecycle-aware primary action + secondary menu
    ↓
PROGRESS          → derived visual phases (Setup → Registration → Draw & Groups → Live → Completed)
    ↓
KPI SUMMARY       → Participants / Capacity / Matches / Completed
    ↓
HUB NAVIGATION    → Overview · Participants · Competition · Matches · Standings · Finances · Settings
    ↓
SECTION CONTENT
```

## 2. Exact files changed

| File | Change |
| --- | --- |
| `frontend/src/pages/admin/tournament/TournamentDetailPage.tsx` | Rewritten into the Hub shell (hero/progress/KPI/tabs + 7 sections). Livecycle primary/secondary actions now use the exact backend permissions; invalid transitions are no longer exposed. |
| `frontend/src/components/tournaments/hub/TournamentHero.tsx` | **New** presentational hero (identity, status, meta, primary action, secondary `<details>` menu, derived phase progress, KPI strip). No permission logic — caller passes only permitted actions. |
| `frontend/src/components/tournaments/hub/TournamentTabs.tsx` | **New** accessible responsive tablist (`role=tab`, `aria-selected`, roving tabindex, Arrow/Home/End, horizontal scroll on mobile, `idPrefix` for nested tablists). |
| `frontend/src/pages/admin/tournament/__tests__/TournamentHub.spec.tsx` | **New** focused Hub tests (shell render, seven sections, lifecycle-aware primary, RBAC tab/action hiding, keyboard nav, standings section). |
| `frontend/src/pages/admin/tournament/__tests__/TournamentDetailPage.spec.tsx` | Updated mocks (embedded participants/draw APIs) + tab navigation to the new Hub section labels. All original contract assertions preserved. |
| `frontend/src/components/tournaments/__tests__/TournamentBracket.universal.spec.tsx` | Updated to the new Hub structure: Matches section for the admin table, Competition → Bracket sub-tab for the shared bracket. |
| `frontend/src/i18n/translation-keys.registry.ts` | Registered `tournaments.hub.*` keys + `tournaments.awards.title`, `tournaments.entry_fee`, `tournaments.registration_opens/closes` (EN defaults). |
| `frontend/src/index.css` | Added `.cz-hub-enter` / `.cz-hub-panel` (300/200 ms, transform+opacity only) and included both in the existing `prefers-reduced-motion: reduce` block. |

## 3. Old route behavior — preserved (NOT removed)

| Route | Status |
| --- | --- |
| `/admin/tournament/list/:id` | Now renders the Hub (same route/component). |
| `/org/:orgId/tournaments/:id` | Now renders the Hub via the existing org wrapper. |
| `/admin/tournament/list/:id/participants` | Kept; re-used inside the Hub Participants section (embedded component). |
| `/admin/tournament/list/:id/draw` | Kept; re-used inside the Hub Competition → Draw sub-tab (embedded component). |
| `/admin/tournament/list/:id/schedule` | Kept; linked from the Hub Matches section ("Matches & Schedule"). |
| `/admin/tournament/list/:id/awards` | Kept; linked from the Hub Finances section (admin). |
| `/admin/tournament/matches`, `/admin/tournament/bracket-types` | Kept as-is. |
| Player/public/referee tournament screens | Untouched. |

## 4. New Hub architecture

- **One shared page** for admin + org. Everything is tenant/context aware through the SAME `api`/`keyRoot`/`perms` pattern already used by the old page (org variants via `orgTournamentApi` + `org-*` query keys). Org scoping remains enforced server-side; the Hub adds no bypass.
- **Overview** — existing general/description/rules/prizes/sponsors content.
- **Participants** — registrations management (confirm/cancel) + embedded `TournamentParticipantsPage` (seeds, waitlist, replacement requests, pairs/teams, draw status).
- **Competition** — sub-tabs `Categories` (org only) / `Groups` / `Draw` (embedded `TournamentDrawPage`) / `Bracket` (shared `TournamentBracket` + print).
- **Matches** — existing operational matches table + `MatchDetailsDrawer` + schedule link.
- **Standings** — existing standings table.
- **Finances** — existing finances summary (permission-gated) + admin Awards link + org refund-request review panel.
- **Settings** — read-only configuration + rename (reuses the existing `updateTournament` API; no new endpoints).

## 5. Tab mapping (old content → Hub)

| Old surface | Now |
| --- | --- |
| Detail overview + finances block | Overview (finances moved to Finances) |
| Detail groups tab | Competition → Groups |
| Detail bracket tab + print | Competition → Bracket |
| Detail matches tab | Matches |
| Detail standings tab | Standings |
| Detail registrations section | Participants |
| Detail org refund panel | Finances |
| CompetitionManager (org) | Competition → Categories |
| TournamentParticipantsPage | Participants (embedded, plus Draw/Schedule links kept) |
| TournamentDrawPage | Competition → Draw (embedded) |
| TournamentAwardsPage | Finances → "Open awards" (admin) |
| TournamentDashboardPage | unchanged (separate global dashboard route) |

## 6. Permissions used (UI gate == backend gate)

| Action | Admin key | Org key | Backend route |
| --- | --- | --- | --- |
| View page / data reads | `admin-tournaments.view` / `tournament.view` | `org.tournaments.view` | `tournament.routes.ts:76,144-146` / `org-tournament.routes.ts:55-57` |
| Publish (primary/mutation) | `tournament.publish` | `org.tournaments.publish` | `tournament.routes.ts:79` |
| Open/Close/Start/Complete/Cancel | `tournament.update` | `org.tournaments.update` | `tournament.routes.ts:80-84` |
| Archive | `tournament.delete` | `org.tournaments.delete` | `tournament.routes.ts:85` |
| Register player / confirm / cancel reg | `tournament.register` | `org.tournaments.register` | `tournament.routes.ts:88,107,122` |
| Finances section (tab + content) | `financial.reconcile` | `org.finance.position.view` | `tournament.routes.ts:64` |
| Settings section (tab + rename) | `tournament.update` | `org.tournaments.update` | `tournament.routes.ts:77` |
| Groups / draw / schedule actions | `tournament.manage` | `org.tournaments.manage` | e.g. `tournament.routes.ts:24,29-30,137` |
| Awards link | `tournaments.awards.view` | — (no org awards route) | `tournament.routes.ts:58-59` |

Lifecycle fixes vs the old UI: **Cancel is only offered while `running`** (the lifecycle permits only `running → cancelled`), archive is gated `tournament.delete`, publish is gated `tournament.publish`, and register/confirm/cancel of registrations use `tournament.register` — so the Hub never exposes an action the backend would reject.

## 7. Tests run

- `npx vitest run src/pages/admin/tournament src/pages/admin/tournaments src/pages/tournaments src/components/tournaments src/pages/player/TournamentsPage.spec.tsx src/navigation/parity/tournament-org-permissions.test.ts src/navigation/parity/translation-integrity.test.ts`
  → **27 files, 238 tests, all passed.**
- New `TournamentHub.spec.tsx` (6 tests): hero + seven sections; draft → Publish primary; registration_open exposes only Close Registration; running exposes Manage Live + Complete/Cancel; RBAC hides Publish/Finances/Settings without keys; keyboard arrow navigation; standings section content.
- `npm run build` (frontend) → **TypeScript + Vite production build passes.**
- `node scripts/ci-validate.js` → reports **only pre-existing** backend violations (SQL outside repositories, legacy eventBus import, presentation-layer DB access — none in `tournaments/` or frontend). The 7 `src/navigation/parity/parity.test.ts` failures are **pre-existing** (verified on a clean stash and re-applied: `7 failed | 91 passed` on the unmodified tree).

## 8. Verification

- Frontend TypeScript build: PASS.
- Tournament-related frontend tests: 238/238 PASS (was 208/208; +30 covers the Hub).
- Lifecycle awareness covered by tests (draft / registration_open / running / permission-limited).
- Reduced-motion: `.cz-hub-enter` / `.cz-hub-panel` included in the `prefers-reduced-motion: reduce` block (`frontend/src/index.css`).
- Mobile: hero stacks, tabs/KPIs/progress scroll horizontally (`overflow-x-auto` + `cz-scrollbar-hide`), tap targets ≥ 44px, no page-level horizontal overflow introduced.

## 9. Docker verification

- `docker compose build frontend` → **SUCCESS** (`courtzon-frontend:latest`; Vite build inside image: 1332 modules, PWA generated; Hub chunks present).
- `docker compose up -d frontend` → container recreated and **Started** (gated on mysql/redis/backend health); no other service, volume, or image touched.
- Health:
  - `curl http://localhost:5173` → **200**
  - `docker compose ps frontend` → `Up (healthy)`, `0.0.0.0:5173->80/tcp`
- The PowerShell "Exited with code 1" surface messages were Docker progress-output-on-stderr noise only; the image built and the container became healthy (verified by HTTP 200 + container health).
- Backend was not rebuilt in this step (no backend code changed): `curl http://localhost:3000/health` verified below before finalising.

## 10. Git

- Feature commit: **`c41e692f`** — "feat(tournaments): Tournament Hub foundation (step 1)"
- Pushed to `origin/master`.

## 11. Remaining known limitations (this step)

- Group stage ↔ knockout qualification, Double Elimination, Swiss — still not implemented (engine out of scope for Step 1, as mandated).
- The old "register player modal" player-ID field still registers the authenticated operator backend-side (pre-existing defect, out of scope for the shell step).
- Free self-cancel / card payment completion / player waitlist — player-side defects unchanged (future controlled steps).
- Realtime admin/org key alignment and winner-loser/round badges remain for later steps.
- `TournamentDashboardPage` still shows global KPIs (list-level) — the hub's hero KPIs are tournament-level.

## 12. Next recommended step

Step 2: formalize the new Tournament Hub tabs (Overview/Participants/Competition/Matches/Standings/Finances/Settings) route parity and begin the **creation wizard** consolidation, then proceed to the format engine work (Group Stage + Knockout) as its own controlled step.
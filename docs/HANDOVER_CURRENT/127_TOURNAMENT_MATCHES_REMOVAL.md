# 127 — Legacy Tournament Matches surface removed (Step 5G)

**Step 5G** of the Tournament Architecture/Navigation Cleanup.
Branch: `master` · Date: 2026-10-08
Feature commit: `f7bd8730`

---

## 1. Exact files changed/deleted

| File | Action |
|---|---|
| `frontend/src/App.tsx` | route `tournament/matches` element → `<Navigate to="/admin/tournament/list" replace />`; removed the now-unused `TournamentMatchesAdminPage` lazy import |
| `frontend/src/pages/admin/tournament/TournamentMatchesPage.tsx` | **DELETED** (legacy surface; no remaining callers) |
| `frontend/src/pages/admin/tournament/__tests__/AdminTournamentMatchesDeprecation.spec.tsx` | **DELETED** (Step 5F transition-only spec that asserted the pre-redirect state — superseded) |
| `frontend/src/pages/admin/tournament/__tests__/AdminTournamentsRedirect.spec.tsx` | extended: new test `6.` (`/admin/tournament/matches` → `/admin/tournament/list`) + test `7.` (does not bypass authorization); test 5 now also asserts no `/admin/tournament/matches` nav path; module comment updated |
| `frontend/src/permissions/registry.ts` | removed dormant `sidebar.tournament-matches` UI element; re-pointed the live, shared `tournament.result.manage` element's informational `componentPath` from the deleted page to `components/tournaments/hub/MatchesManager.tsx` (the actual live surface) so no reference to the deleted file remains |
| `frontend/src/i18n/translation-keys.registry.ts` | removed 7 keys proven exclusive to the deleted screen: `admin.sidebar.tournament_matches`, `tournaments.matches.title`, `tournaments.select_tournament`, `tournaments.select_tournament_hint`, `tournaments.match.player1`, `tournaments.match.player2`, `tournaments.match.score` |
| `backend/src/modules/rbac/application/role-permission-templates.ts` | removed `sidebar.tournament-matches` from `TOURNAMENT_WORKBENCH_KEYS` (comment updated) |
| `backend/scripts/role-permission-templates.mjs` | same removal (+ comment updated) |
| `backend/src/modules/rbac/__tests__/template-parity.spec.ts` | removed `sidebar.tournament-matches` from `adminWorkbenchKeys` and `workbenchNavKeys` |

**NOT touched:** `TournamentSchedulePage.tsx`, Hub `MatchesManager.tsx`, `AdminMatchResultsPage`,
`OrgMatchResultsPage`, `AdminMatchesPage`, backend tournament APIs, GSK engine, realtime, accounting.

## 2. Redirect behavior

- `/admin/tournament/matches` → `<Navigate to="/admin/tournament/list" replace />`
  (same React Router convention as Step 5D).
- Authorization is fully preserved: `AdminRoute` (admin role) + the destination's page gate
  `Can(admin-tournaments.view)` remain authoritative — a non-admin hitting the old URL is
  blocked before any destination content renders (verified by the new test 7).
- No new page, no duplicated functionality, no query parameters.

## 3. Legacy artifacts removed

- Frontend route import + route body → now a redirect.
- The legacy page component file + its transition-only test spec.
- Nav registry entry was already removed in Step 5F; parity/legacy copies and count
  invariants were updated in Step 5F and remain valid (no further nav change in 5G).

## 4. Permissions / translations removed

- **Permission:** `sidebar.tournament-matches` — removed from the frontend UI registry and
  from both role-template sources (`role-permission-templates.ts` / `.mjs`,
  `TOURNAMENT_WORKBENCH_KEYS`) plus the template-parity spec expectations. Confirmed by
  repository-wide grep that no live code references it anymore. The `permissions`/`role`
  **database** rows and `database/seeds/001_baseline.sql` were **NOT modified** (data is out of
  scope); they remain as historical/orphaned rows for a future data-cleanup step.
- **Translations:** 7 keys removed (see table §1). Shared keys used by Hub Matches /
  Schedule (`assign_court`, `assign_referee`, `record_result`, `save_result`,
  `result_recorded`, `court_assigned`, `referee_assigned`, `match.round`, `match.match_no`,
  `match.court`, `match.referee`, `match.status`, `match_status.*`, `tournamentBracket.details`)
  were verified shared and left intact.

## 5. Tests + exact results

- `AdminTournamentsRedirect.spec.tsx` — **7/7 pass** (incl. new: `/admin/tournament/matches`
  redirects to `/admin/tournament/list`, list heading renders, deleted page heading absent;
  non-admin blocked).
- `backend/src/modules/rbac/__tests__/template-parity.spec.ts` — **63/63 pass** (post template edit).
- Relevant frontend tournament + navigation + org-journal suite — **18 files / 310 tests:
  303 passed, 7 failed**. The 7 failures are the **same pre-existing** `parity.test.ts`
  drifts (org-sidebar/player-nav locale) present on the Step 5F baseline — none are caused
  by Step 5G, none reference tournaments.
- Coverage of canonical Hub Matches is preserved intact (`MatchesManager.spec` 43 tests run
  as part of the suite; untouched).
- Full `npx vitest run src/pages/admin/tournament src/pages/admin/tournaments src/pages/tournaments
  src/navigation src/pages/org/OrgJournalRedirect.test.tsx` executed after the change.

## 6. Build

- Frontend: `npx tsc --noEmit` exit 0; `npm run build` ✓ (`tsc -b` + vite + PWA, 8.17s).
- Backend: `npm run build` ✓ — translation artifact regenerated at **2682 keys** (exactly
  −7 from 2689, matching the removed keys); tsc passes.

## 7. Docker / container health

- `docker compose build frontend backend` ✅ (both images rebuilt from the final code).
- `docker compose up -d` ✅ (frontend + backend containers recreated via `up -d`).
- Status: frontend container **healthy**, backend **healthy**, mysql **healthy**, redis **healthy**.

## 8. Git commit + push

- `f7bd8730` — `refactor(tournaments): remove legacy matches surface` (focused commit;
  unrelated files excluded).
- Pushed to `origin/master` (`7d52b0a5..`). Final working tree clean.

## 9. Remaining legacy/deprecation items

- `/admin/tournaments` (Step 5D) and `/admin/tournament/matches` (Step 5G) both now redirect
  to `/admin/tournament/list`; the redirects are permanent.
- **Dormant data rows** (not code): the `permissions` row and `role` grants for
  `sidebar.tournament-matches` and the locale rows for the 7 removed translation keys remain
  in the database (out of scope: no DB changes) — safe to sweep in a future data-cleanup/sync
  step.
- The `tournament.result.manage` element's informational `componentPath` was re-pointed to
  `components/tournaments/hub/MatchesManager.tsx` (it was the last string reference to the
  deleted page). The permission itself is shared/live and unchanged.
- Player/consumer surfaces and `TournamentSchedulePage` remain (intentional — still live).
- `tournaments.enter_scores` unused key cleanup remains tracked (pre-existing, unrelated).

## 10. Explicit confirmations

- `TournamentSchedulePage` — **NOT modified** (file untouched; scheduling/generation/
  reservation APIs untouched).
- **Database** — not modified (no schema, migrations, seeds, or data writes).
- No backend tournament API changes; no GSK engine changes; no realtime changes;
  no accounting/payment changes.
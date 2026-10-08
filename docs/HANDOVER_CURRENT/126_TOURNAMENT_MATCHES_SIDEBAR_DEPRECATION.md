# 126 — Legacy Tournament Matches sidebar deprecation (Release N)

**Step 5F** of the Tournament Architecture/Navigation Cleanup.
Branch: `master` · Date: 2026-10-08
Feature commit: `3de93862`

---

## 1. Purpose

Release-N deprecation preparation for the legacy `/admin/tournament/matches` screen,
per verification `docs/HANDOVER_CURRENT/125_TOURNAMENT_MATCHES_DEPRECATION_CHECK.md`:

- Remove the **sidebar navigation** for the legacy screen so new navigation stops pointing at it.
- **Keep the route fully functional and URL-reachable** for existing bookmarks/direct links.
- **No redirect yet** — that happens in release N+1 (Step 5G, after the deprecation window).

## 2. Legacy route

`/admin/tournament/matches` → `pages/admin/tournament/TournamentMatchesPage.tsx`
(route registration at `frontend/src/App.tsx` remains **unchanged**).

## 3. Canonical replacement

Tournament List → Tournament Hub → Matches
(`/admin/tournament/list` → `/admin/tournament/list/:id` → Matches tab, `MatchesManager.tsx`).
All match operations (list/start/complete/court/referee/record-result) plus accept/view/
results/monitoring/filters/stage-group exist in the Hub; the legacy page's only unique
facet was the global cross-tournament picker.

## 4. Sidebar change

`frontend/src/navigation/admin.registry.ts` — **removed** the child entry
`nav.admin.tournament-matches` (`path: '/admin/tournament/matches'`,
`permissionKey: 'sidebar.tournament-matches'`) from the `nav.admin.tournament` group.
The group now exposes **3 screens**: Dashboard, Tournament List, Bracket Types.

## 5. Parity changes

Kept the admin sidebar parity gate valid after the registry edit:

- `frontend/src/navigation/parity/legacy/admin-sidebar.ts` — removed the matching legacy
  `tournament_matches` parity entry.
- `frontend/src/navigation/parity/parity.test.ts`:
  - workbench test renamed `…all 4 screens` → `…all 3 screens` and its ids list now
    `[tournament-dashboard, tournament-list, tournament-bracket-types]`;
  - removed `'sidebar.tournament-matches'` from the `masterAdminWorkbenchKeys` set;
  - updated hard node-count invariants that tracked the removed node:
    `adminIds.length` 145→144, `ADMIN_ID_TO_KEY.size` 137→136, resolved-admin walk
    145→144, workspace counts 145→144 (3 assertions).
- `frontend/src/navigation/parity/translation-integrity.test.ts` — id-count snapshot
  145→144 (structure/order/permission/route/flags cross-locale assertions unchanged).

No unrelated parity assertions were weakened or touched.

## 6. Route preservation

- `App.tsx` route `path="tournament/matches"` → **untouched**, still renders
  `TournamentMatchesAdminPage`.
- `TournamentMatchesPage.tsx` → **not deleted**; fully functional.
- **No redirect element introduced** for `/admin/tournament/matches`.
- No in-app "deprecated" runtime warning (the project has no such pattern; the route is
  still valid during the deprecation release).

## 7. Permission preservation

- **No permissions added/removed/re-mapped.**
- The legacy route's guards are unchanged (`admin-tournaments.view` page gate,
  `tournament.manage` / `tournament.result.manage` row actions) because the route remains
  reachable during this release.
- `sidebar.tournament-matches` permission definition and the `admin.sidebar.tournament_matches`
  translation key are **left registered** as dormant artifacts until the route itself is
  removed (evidence-safe; per audit 125 §6/G).

## 8. Tests

New file `frontend/src/pages/admin/tournament/__tests__/AdminTournamentMatchesDeprecation.spec.tsx`
(6 tests, full-App harness consistent with the Step 5D redirect spec):

1. legacy sidebar item is no longer in admin navigation (no `nav.admin.tournament-matches`
   id, no `/admin/tournament/matches` path);
2. Tournament Hub/List navigation remains (canonical `/admin/tournament/list`);
3. other admin navigation unchanged (dashboard/list/bracket-types + match-results + matches);
4+5+6. route still exists, `TournamentMatchesPage` renders on direct navigation
   (heading "Tournament Matches"), and **no redirect** was introduced (pathname unchanged);
7a. `/admin/tournaments` still redirects to `/admin/tournament/list` (Step 5D intact);
7b. Tournament Hub canonical URL still renders.

Results: focused specs **6 + 5 + 2 = 11/11 pass**; relevant tournament + navigation +
org-journal suite **19 files / 314 tests → 307 passed, 7 failed**, and the 7 failures are
the **same pre-existing** `parity.test.ts` drifts (org-sidebar/player-nav locale) verified
unchanged from the Step 5D baseline — none touch tournaments.

TypeScript: `tsc --noEmit` exit 0.

## 9. Build

`npm run build` (frontend) ✅ — `tsc -b` + vite + PWA, `✓ built in 10.24s`.

## 10. Docker

- `docker compose build frontend` ✅ (image rebuilt from the new nav registry + tests).
- `docker compose up -d` ✅ (frontend recreated; mysql + redis healthy).

## 11. Health

- `GET /health` → ok (database/redis/memory).
- `GET /health/database` → connected · `GET /health/redis` → connected.
- SPA `GET /` → **200**.
- `/admin/tournament/matches` and `/admin/tournament/list` deep links behave identically
  under the pre-existing nginx `/admin/` classification (unchanged, symmetric); the route
  is reachable via in-app/SPA navigation.

## 12. Database confirmation

**No DB changes.** No migrations, seeds, baseline, or permission-table edits.

## 13. Git commit

`3de93862` — `refactor(tournaments): deprecate legacy matches navigation`

## 14. Git push

Pushed to `origin/master` (`5ce934d8..`).

## 15. Release deprecation window

**Active now (one release).** The legacy route remains registered, renderable and
URL-reachable; only new sidebar navigation to it is stopped. Existing bookmarks and direct
URLs keep working. No redirect during this window.

## 16. Next step: redirect after one release

After the deprecation window (release N+1, Step 5G):

1. add `<Route path="tournament/matches" element={<Navigate to="/admin/tournament/list" replace />} />`;
2. optionally delete `TournamentMatchesPage.tsx` + its `App.tsx` lazy import;
3. later cleanup of the dormant `sidebar.tournament-matches` permission key and
   `admin.sidebar.tournament_matches` translation key, plus historical doc references.

A direct redirect to a specific Hub route is **not** viable (global route, no tournament id)
— the canonical fallback is `/admin/tournament/list` (audit 125 §5).
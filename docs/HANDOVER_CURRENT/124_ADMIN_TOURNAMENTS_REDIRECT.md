# 124 — `/admin/tournaments` → `/admin/tournament/list` redirect

**Step 5D** of the Tournament Architecture/Navigation Cleanup.
Branch: `master` · Date: 2026-10-08
Feature commit: `70291092`

---

## 1. Reason for redirect

Audit `docs/HANDOVER_CURRENT/123_TOURNAMENT_LEGACY_NAVIGATION_AUDIT.md` confirmed
`/admin/tournaments` (`TournamentAdminPage`) is a **smaller duplicate** of the canonical
workbench list `/admin/tournament/list`:

- Both expose the same tournament API/data (`GET /admin/tournaments` + lifecycle).
- The old screen has no live callers — the admin sidebar already points to
  `/admin/tournament/list` (`navigation/admin.registry.ts` `nav.admin.tournament-list`).
- The old screen lacks search, lifecycle state actions, detail navigation, and create —
  the canonicaal screen is a strict superset.
- No unique functionality, no backend/API/DB/permission change is required.

## 2. Old route

`/admin/tournaments` → previously rendered `pages/admin/tournaments/TournamentAdminPage.tsx`.

## 3. Canonical route

`/admin/tournament/list` → `pages/admin/tournament/TournamentListPage.tsx` (`mode="admin"`),
the shared admin/org workbench list.

## 4. Exact file(s) changed

| File | Change |
|---|---|
| `frontend/src/App.tsx` | • Route `path="tournaments"` element changed from `<TournamentAdminPage />` to `<Navigate to="/admin/tournament/list" replace />` (the project's established redirect convention — same as `ui-permissions`, `settlements`, `withdrawal-requests`).<br>• Removed the now-unused `TournamentAdminPage` lazy import (kept the `TournamentDashboardPage` import and all other routes). **The component file was NOT deleted** — it is unreachable at runtime; safe cleanup is tracked for a future step. |
| `frontend/src/pages/admin/tournament/__tests__/AdminTournamentsRedirect.spec.tsx` | **New** — full-App routing tests mirroring the `OrgJournalRedirect.test.tsx` convention (real router + real i18n): redirect, non-admin guard, no-loop, unchanged destination, sidebar parity. |
| `frontend/src/pages/admin/tournament/__tests__/TournamentListPage.spec.tsx` | **Extended** — destination page-level permission gate tests (list content hidden without `admin-tournaments.view`; full render once granted). |

No other files changed. Backend, database, nginx, permissions registry, sidebar
registries, player routes, org routes, Hub, matches, schedule, monitoring, results,
realtime, accounting/payment — all untouched.

## 5. Permission behavior

- The redirect uses `<Navigate replace>` — it only performs path substitution; it does
  **not** perform authorization.
- Authorization remains entirely with the existing guards:
  - `AdminRoute` (`App.tsx`) requires an authenticated admin role — a non-admin hitting
    `/admin/tournaments` is bounced before any destination content renders (verified by
    test 2).
  - The destination screen keeps its page-level `Can permission="admin-tournaments.view"`
    gate (`TournamentListPage`), and its row actions stay gated (`tournaments.edit` /
    `tournaments.delete` / lifecycle keys). A redirect cannot bypass these (verified by
    the new `TournamentListPage.spec` tests).
- **No permissions added, none removed, none re-mapped.**

## 6. Test results

Focused (new + extended):

- `AdminTournamentsRedirect.spec.tsx` — **5 tests pass**:
  1. `/admin/tournaments` → `/admin/tournament/list` for an admin (path + heading + search rendered).
  2. destination stays protected — a non-admin is blocked by the admin guard (pathname ≠ `/admin/tournament/list`, list never renders).
  3. no redirect loop — destination does not bounce back.
  4. existing `/admin/tournament/list` behavior unchanged.
  5. sidebar navigation unchanged (canonical list path present; no legacy `/admin/tournaments` nav item).
- `TournamentListPage.spec.tsx` — **2 new tests pass** (destination page gate without/with `admin-tournaments.view`).
- Full relevant suite (`src/pages/admin/tournament`, `src/pages/admin/tournaments`,
  `src/pages/tournaments`, `src/navigation`, `OrgJournalRedirect.test.tsx`):
  **18 files / 308 tests → 301 pass**, 7 failures in `src/navigation/parity/parity.test.ts`
  which were **verified pre-existing** (same 7 fail on the clean baseline via `git stash`)
  — org-sidebar/player-nav locale drift, untouched by this step.
- `npx tsc --noEmit` → clean (exit 0).

## 7. Build result

- `npx tsc --noEmit` ✅
- `npm run build` (frontend) ✅ — `tsc -b` + vite + PWA, `✓ built in 8.29s`.

## 8. Docker result

- `docker compose build frontend` ✅ (image rebuilt from the new code).
- `docker compose up -d` ✅ (frontend container recreated with `up -d`; mysql + redis
  remain healthy).

## 9. Health result

- `GET /health` → `status: ok` (database ok, redis ok, memory ok).
- `GET /health/database` → connected.
- `GET /health/redis` → connected.
- SPA `GET /` → HTTP **200**.

## 10. Database confirmation

**No DB changes.** No migrations, no seeds, no baseline edits, no data touched.

## 11. Git commit

`70291092` — `refactor(tournaments): redirect legacy admin tournament list`

## 12. Git push

Pushed to `origin/master` (`89ec5098..`), auto-deploying via the existing
pipeline.

## 13. Remaining legacy routes

Still to handle in later steps (from audit 123 — **not** touched here):

- `/admin/tournament/matches` — deprecate (remove sidebar entry after a parity soak
  release), then redirect to the Hub.
- Consumer/player surfaces (`/tournaments`, `/tournaments/:id`, `/my/tournaments`,
  `/tournaments/public*`) — confirmed KEEP (not legacy).
- `TournamentAdminPage.tsx` component — now unreachable; candidate for file removal in a
  future cleanup (nothing breaks if deleted later).
- Old inline edit/archive UX on the legacy screen — fully covered by the canonical list.
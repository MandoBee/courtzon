# Player Result Permission Gate Fix

> Step 5A — align the player-facing Tournament Detail "Enter Score" gate with the authoritative backend permission. Repository state: `40557e54` + this step.

## 1. Root Cause

The consumer player Tournament Detail page (`pages/tournaments/TournamentDetailPage.tsx`) rendered an **Enter Score** button gated by the frontend-only key `tournaments.enter_scores` — a permission that does not exist in the backend and was never the guard for the action it triggers. The button navigates to the **shared result page** `/matches/:matchId/result`, whose authoritative backend permission for submission is `matches.result.submit` (routes `POST /matches/:id/result` → `requirePermission(['matches.result.submit'])`; the destination `MatchResultPage` gates its own submit with `matches.result.submit`). This meant players could see the button without being authorized to submit, or be hidden from a flow they were authorized for.

## 2. Exact File Changed

`frontend/src/pages/tournaments/TournamentDetailPage.tsx` — both footer renderings (lines 372 and 390).

## 3. Previous Permission

`can('tournaments.enter_scores')` — frontend-only registry key, never a backend route guard.

## 4. Correct Permission

`can('matches.result.submit')` — the authoritative backend permission for submitting a result on the shared Match Result flow (`POST /matches/:id/result`), which is exactly the destination of this button. It matches the gate the destination page itself uses.

## 5. Why the Permission Is Authoritative

- Player-facing flow → shared session submission → backend route guard `matches.result.submit` (verified in `backend/src/modules/match-result/presentation/match-result.routes.ts`).
- `MatchResultPage` already gates its submit controls with `Can permission="matches.result.submit"`.
- This mirrors the Hub's own alignment (Step 3E): the Hub uses `tournament.result.manage`/`org.tournaments.result.manage`; the **player flow correctly uses the shared submission permission**, not the admin/org manage key. No new permission introduced.

## 6. Exact Behavior Change

- A player holding `matches.result.submit` now **sees** Enter Score (previously hidden unless the nonexistent key was granted).
- A player without it no longer **sees** the button at all (previously could see it and then fail on the backend).
- Button behavior unchanged: navigates to `/matches/${match.match_id}/result`; lifecycle guard `status !== 'completed'` and `match_id != null` preserved; no API changes; no realtime/backend/DB changes.

## 7. Other `tournaments.enter_scores` Occurrences

Classified:
- **Fixed in this step:** the two gates in `pages/tournaments/TournamentDetailPage.tsx`.
- **Stale/unused (do not modify now — future cleanup):** `frontend/src/permissions/registry.ts:728`; DB seed/snapshot artifacts (`database/seeds/001_baseline.sql`, `database/seed/003_baseline_snapshot.sql`, archive SQL); generated docs exports (`docs/enterprise-library/exports/*`, `docs/rbac-permission-matrix.csv`).
- **Archival/unrelated:** `docs/enterprise-library/TECH-MOD-35_activities.md` (references the long-removed `POST /matches/:matchId/score` legacy endpoint); historical handover/audit docs referencing the old key.
- No other runtime UI usage remains.

## 8. Tests

Added to `frontend/src/pages/tournaments/__tests__/TournamentDetailPage.spec.tsx` (harness extended so `can()` reads the acting user's permissions + a `/matches/:id/result` route):
1. authorized (`matches.result.submit`) sees Enter Score for an in-progress match and navigates to the shared result page;
2. unauthorized → button hidden;
3. completed matches never show the button (lifecycle guard intact);
4. source regression guard: no `can('tournaments.enter_scores')` remains in the consumer detail flow.

Results: consumer spec **31/31**, full tournament frontend suite **337 passed / 28 files**, `npm run build` green.

## 9. Build

`tsc -b + vite build` success (only standard warnings).

## 10. Docker

Frontend image rebuilt; `docker compose up -d frontend` container started/healthy.

## 11. Health

SPA HTTP 200; backend `/health` ok (db ok, redis ok); mysql/redis healthy.

## 12. Database Confirmation

**No database changes** — no migrations/schema/seeds.

## 13. Git Commit

`bbe1998d` — "fix(tournaments): align player result permission gate".

## 14. Git Push

Pushed to `origin/master` (`40557e54..bbe1998d`). Working tree clean.

## 15. Remaining Limitations

- The now-unused `tournaments.enter_scores` permission key remains registered (registry + seed artifacts). Removing it is a separate cleanup that must stay in sync with role templates/seed exports; explicitly out of scope here.
- Only the player-facing flow was changed; admin/org hub flows already use `tournament.result.manage` / `org.tournaments.result.manage` (unchanged).
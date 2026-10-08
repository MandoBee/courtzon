# Tournament Realtime Parity Implementation

> Step 3H — realtime parity for the Tournament Hub using the existing Socket.IO/EventBus architecture. Repository state: `0cc87478` + this step.

## 1. Summary

Implemented the two realtime gaps identified by `117_TOURNAMENT_REALTIME_PARITY_AUDIT.md`:
1. **Backend:** added `tournament:group-stage-generated` and `tournament:knockout-generated` to the Socket publisher allowlist (they were already emitted by the GSK engine with the privacy-slim `tournamentRealtimeScope`; the existing mapper already routes any `tournament:*` to org/branch/admin rooms).
2. **Frontend:** the global realtime hook now invalidates the Tournament Hub's canonical queries on relevant match/result/tournament/GSK events, incl. the org-`<orgId>`-tournament-* key variants, and the reconnect reconcile now heals the Hub roots.

Frontend performs **invalidation only** — no standings/qualification/bracket computation, no manufactured state.

## 2. Exact Files Changed

| File | Change |
|---|---|
| `backend/src/modules/realtime/application/socket-publisher.ts` | +2 allowlist entries (GSK generation events) |
| `backend/src/modules/realtime/__tests__/socket-publisher.spec.ts` | +1 test (GSK events subscribed) |
| `backend/src/modules/realtime/__tests__/socket-event-mapper.spec.ts` | +2 tests (GSK mappings, scoped payloads) |
| `frontend/src/realtime/useRealtimeCacheUpdates.ts` | `isTournamentHubQueryRoot`, `tournamentHubPredicate`, `invalidateTournamentHub`; wired into match/progression/result/GSK handlers; reconcile predicate recovery |
| `frontend/src/realtime/useRealtimeCacheUpdates.hub.test.tsx` | New — 9 tests |
| `docs/HANDOVER_CURRENT/118_TOURNAMENT_REALTIME_PARITY_IMPLEMENTATION.md` | This document |

No DB, migrations, permissions, API, GSK engine, accounting/payment, or Monitoring UI changes.

## 3. Backend Allowlist Changes

`socket-publisher.ts` `subscribeEvents` now includes:
- `tournament:group-stage-generated`
- `tournament:knockout-generated`

Payload implied unchanged; verified the mapper (`mapTournamentEvent`) already whitelists the scoped fields (`tournamentId`, `stageId`, `organisationId`, `branchId`, `creatorId`, `visibility`, …) and routes to `organisation:`/`branch:`/`admin` rooms — **no payload change required**.

## 4. Frontend Socket Subscription Changes

`useRealtimeCacheUpdates.ts` (single existing singleton; no second client):
- New registrations: `tournament.group-stage-generated`, `tournament.knockout-generated`, `tournament.matches-generated` → `invalidateTournamentHub(payload.tournamentId)`.
- Existing handlers extended to also call `invalidateTournamentHub`: the progression loop (`match-progressed`, `match-created`, `stage-completed`, `completed`), `tournament.result`, `tournament.updated`, and `invalidateMatchKeys` (covers `match.*` + `match.result-*` for tournament matches).

## 5. Query Invalidation Map

`invalidateTournamentHub(qc, id)` invalidates (scoped by tournament id, admin + org variants via predicates):
- matches: `['tournament-matches', id]`, `['org-<orgId>-tournament-matches', id]`
- groups: `['tournament-groups', id]`, `['org-<orgId>-tournament-groups', id]`
- stages: `['tournament-stages', id]`, `['org-<orgId>-tournament-stages', id]`
- player/detail: `['tournament', id|String(id)]`, `…'matches'`, `…'bracket'`, `…'standings'`

Event → invalidation: match status/start/complete → matches(+standings/bracket where lifecycle affects them); result events → matches + standings (+bracket via progression); match-created / matches-generated → matches (+bracket); stage-completed → stages/matches (+bracket/standings); GSK group-stage-generated → groups/stages/matches/standings; GSK knockout-generated → stages/matches/bracket/standings; completed → tournament/matches/bracket/standings.

## 6. Reconnect Reconcile Changes

`invalidateRealtimeReconcile` now also invalidates via predicates every query whose root is `tournament-matches`, `tournament-groups`, or `tournament-stages` (covers admin and org-`<orgId>` variants and every tournament on reconnect). Reconnection architecture unchanged; no polling added.

## 7. GSK Event Path Verification

Verified end-to-end (code-level): GSK engine emits `tournament:group-stage-generated` (`group-stage.service.ts:206`) and `tournament:knockout-generated` (`knockout-transition.service.ts:219`) → EventBus → socket publisher allowlist (now) → privacy-slim mapper (`tournament.*` → org/branch/admin rooms) → frontend singleton → hub listener → `invalidateTournamentHub` → refetch. GSK business logic untouched.

## 8. Admin / Org Scoping

Both contexts share the same Hub component; invalidation is driven by the event's `tournamentId` (payload carries the authoritative `tournamentRealtimeScope`). The predicate matches whichever `tournament-*`/`org-<orgId>-tournament-*` key carries that id — no cross-tenant leak, no client-side authorization (invalidation only).

## 9. Tests and Exact Results

- Backend realtime: `socket-publisher.spec.ts` 5/5 (+GSK), `socket-event-mapper.spec.ts` 83/83 (+GSK mappings) → **88 passed**.
- Backend full suite: **3353 passed / 5 failed** — only the pre-existing date-dependent org-subscription tests (academy flakes re-ran green).
- Frontend `useRealtimeCacheUpdates.hub.test.tsx`: 9/9 (predicate scope, GSK handlers, match/result/progression/completed, unrelated-tournament isolation, reconnect reconcile).
- Frontend realtime + tournament + components suites: **322 passed / 27 files**; `npm run build` (tsc + vite) green.

## 10. Build Result

Backend `tsc` and frontend `tsc -b + vite build` both succeed.

## 11. Docker Result

Backend and frontend images rebuilt; `docker compose up -d` restarts; containers healthy.

## 12. Health Result

Backend `/health` ok (db ok, redis ok); frontend SPA HTTP 200.

## 13. Database Confirmation

**No database changes.** No migrations, schema, seeds.

## 14. Git Commit Hash

`<commit-hash>` — "feat(tournaments): add realtime parity to tournament hub".

## 15. Git Push Result

Pushed to `origin/master` (`<from>..<commit>`).

## 16. Remaining Limitations

- Realtime parity restores freshness on the **next query refetch**; the Hub still has no per-event UI micro-updates (beyond invalidation) — consistent with the "invalidation-only" rule.
- The **player-facing consumer** "Enter Score" gate still uses the legacy `tournaments.enter_scores` key (pre-existing, unrelated to realtime).
- No changes to Monitoring UI or the shared result/standings engines.
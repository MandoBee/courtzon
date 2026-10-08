# Tournament Realtime Parity Audit

> Read-only realtime architecture audit — repository state at `0cc87478` (Step 3F). No files other than this document were created or modified.

## 1. Executive Summary

The realtime pipeline is **fully functional** for shared match sessions and most tournament lifecycle events: events are emitted on the EventBus, mapped to socket types with privacy-slim payloads, routed to `user:`/`organisation:`/`branch:`/`admin`/`finance`/`player` rooms, and the frontend singleton subscribes + invalidates queries. **Two real gaps remain:**

1. The **Tournament Hub’s canonical queries are not invalidated by any socket event** — the Hub (`MatchesManager`) has zero socket subscriptions and its query keys (`['tournament-matches', <id>]`, `['org-<orgId>-tournament-matches', <id>]`, stage/group keys) are not touched by `invalidateTournament`/`invalidateMatchKeys`/`invalidateRealtimeReconcile`. So Live/Results/Matches in the Hub stay stale until manual refetch — the actionable realtime work.
2. **GSK generation events are not published** — `tournament:group-stage-generated` and `tournament:knockout-generated` ARE emitted on the EventBus (`group-stage.service.ts:206`, `knockout-transition.service.ts:219`) but are **absent from the socket-publisher allowlist**, and the frontend has no listener — so passive viewers never refresh groups/knockout.

No DB, API, or permission change is required to fix either.

## 2. Socket Architecture

- Server: `attachSocketPublisher(io)` (`infrastructure/socket-gateway.ts:29`) — middleware assigns rooms from `socket.data.userId`, then `socketPublisher.setIO(io)` + `socketPublisher.start()` (subscribes EventBus → publishes to rooms).
- Client: **single singleton** `realtime/socket-client.ts` (state machine UNINITIALIZED → CONNECTING → CONNECTED / RECONNECTING / AUTH_FAILED; `onSocketStateChange` flush of queued handlers). `services/socket.ts` is a facade that re-registers handlers on reconnect.

## 3. Authentication / Authorization

- JWT authenticated at handshake (`socket.data.userId`); middleware rejects with `Authentication required` if absent (`socket-gateway.ts:31-50`).
- There is **no per-event socket authorization** — authorization is by **room membership** (+ server-side event emission decisions). Payloads are privacy-slim at the mapper.

## 4. Rooms

`socket-room-manager.ts` `resolveRoomsForUser`: `user:<id>`, `organisation:<id>`, `branch:<id>`, `marketplace:seller:<org>`, and role rooms `superadmin`/`admin`/`finance`/`player`. **There are no tournament-specific rooms** — tournament events fan out to `organisation:<orgId>` / `branch:<branchId>` / `admin` / creator `user:` / participant `user:` rooms, plus `player` for public-discovery events.

## 5. Event Publisher Architecture

`socket-publisher.ts` `start()` subscribes to a hard-coded **allowlist** (`subscribeEvents`, lines ~60-123 [25-36 + 93-117]) on the EventBus; `publish()` (line 134) calls `mapDomainEvent` → drops if unmapped or zero rooms → `io.to(mapped.rooms).emit(mapped.type, mapped.payload)` (single emit to the union; no per-room duplicates).

## 6. Event Inventory

| # | Event (domain) | Published where | Emitter file:line |
|---|---|---|---|
| Match status | `match:status_changed`, `match:created/updated/available/pending/cancelled/completed/removed` | match module (`match-event-publisher.ts`); allowlisted | match module |
| Session | `session.started`, `session.completed`, `participant.*`, `join_request.*` | match module | match module |
| Result | `match:result-submitted/approved/auto-approved/disputed/rejected/resolved/corrected/no-result/withdrawn` | shared match-result module; allowlisted (25-36) | match-result service |
| Tournament lifecycle | `tournament:created/updated/started/registration-open/registration-closed/standings-finalized/cancelled/archived/result/…` | tournament module (via `eventBusV2.emit`/`emitTournamentScoped`) | `tournament.service.ts` |
| Tournament progression | `tournament:match-scheduled`, `tournament:bracket-generated`, `tournament:match-created`, `tournament:match-progressed`, `tournament:stage-completed`, `tournament:completed`, `tournament:matches-generated`, `tournament:schedule-updated`, `tournament:court-reserved/released`, `tournament:draw-generated/updated` | tournament module | various services |
| **GSK generation** | **`tournament:group-stage-generated`** | **`group-stage.service.ts:206`** | group-stage service |
| **GSK generation** | **`tournament:knockout-generated`** | **`knockout-transition.service.ts:219`** | knockout-transition service |

## 7. Event Payloads

- Tournament (`socket-event-mapper.ts` `mapTournamentEvent` ~635): whitelist `{tournamentId, matchId, userId, creatorId, name, result, winnerId, stageId, stageCompleted, tournamentCompleted, organisationId, branchId, visibility, participantId, status, generated, byes, resourceId, date, startTime, endTime, bookingId, scheduled, skipped, standings, bracket}` — the same slim envelope for every `tournament:*`.
- Match (`mapMatchEvent` ~770): `{matchId, bookingId, tournamentId, userId, creatorId, fromStatus, toStatus, status, reason, role, position, startedAt, durationMinutes, winnerId, timestamp}`.
- Result (`mapResultEvent` ~740-768): includes `disputedBy, status, outcome, resolution, timestamp`.
- `tournamentRealtimeScope` (`tournament-realtime-scope.ts:15`) injects `organisationId/branchId/creatorId/participantUserIds/visibility` at the source.

## 8. Event Allowlist

`socket-publisher.ts` allowlist contains match lifecycle set, all `match:result-*`, and the tournament events listed above (93-117). **`tournament:group-stage-generated` and `tournament:knockout-generated` are NOT in the allowlist** → subscribers never receive them (blocked at the publisher layer).

## 9. Frontend Socket Architecture

- `socket-client.ts` singleton with reconnect; `SocketService.flushHandlers` re-attaches after connect.
- `useRealtimeCacheUpdates.ts` (`useSocketEvent` capture + `invalidateQueries`) is the single global subscription layer; individual pages (incl. Hub/Monitoring) add **no** socket listeners.

## 10. Current Tournament Hub Integration

**None.** `MatchesManager.tsx` and `TournamentDetailPage.tsx` do not import `useSocket`/`useSocketEvent`. The Hub refreshes only via:
- mutation `onSuccess` → `invalidate()` (matches/standings/bracket keys, steps 3C/3F),
- query refetch on mount,
- and — only for key `['tournament-matches', <id>]` — the **reconnect** full reconcile (below).

## 11. Current Monitoring Integration

**None.** `AdminMatchesPage`/`OrgMatchesPage` have no socket subscriptions; they rely on query refetch on navigation.

## 12. GSK Realtime Path

`group-stage.service.generateGroupStage` → `eventBusV2.emit('tournament:group-stage-generated', {…tournamentRealtimeScope})`; `knockout-transition.service.introduceKnockoutStage` → `eventBusV2.emit('tournament:knockout-generated', …)`. Because they are absent from the publisher allowlist, nothing reaches Socket.IO; because there is no frontend handler, nothing invalidates groups/stages. **End-to-end: NOT implemented** (emitted, not delivered).

## 13. Query Invalidation Map

`useRealtimeCacheUpdates.ts`:
- `TOURNAMENT_REALTIME_EVENTS` (194-200): `bracket-generated, match-created, match-progressed, stage-completed, completed` → `invalidateTournamentForOrg` + `['tournament', id, 'bracket'|'standings']`.
- `tournament.result` (1168) → invalidate standings.
- `tournament.updated` with `standings`/`bracket` flags (1216-1225) → standings / bracket+matches (`['tournament', id, 'bracket']`, `['tournament', id, 'matches']`).
- `matches.*` + `match.result-*` (818-834, 1426) → `invalidateMatchKeys` (155-357): match list/detail/result keys, `admin-matches`, `org-matches`, `admin|org-match-results`, and via `invalidateTournament` (354-356) → `['tournament', id]`, `['tournaments']`, `['tournament-admin-matches']`, `['admin-tournaments']`.
- Reconnect full reconcile `invalidateRealtimeReconcile` (364+): includes `['tournament-matches']` prefix (covers admin Hub key) but **not** `org-<orgId>-tournament-*` keys or `['…-stages']`/`['…-groups']`.

**Gap:** per-event handlers invalidate `['tournament-admin-matches']` (the standalone page’s key) but **not** the Hub admin key `['tournament-matches', <id>]` nor the org Hub key `['org-<orgId>-tournament-matches', <id>]`; no event invalidates `[<root>-stages]` or `[<root>-groups]` (GSK), and `['tournament', id, 'matches']` (player page) is only refreshed by `tournament.updated bracket=true` or the standalone-named key — meaning the Hub cannot become a live surface without changes here.

## 14. Missing / Broken Events

| Gaps | Detail |
|---|---|
| Hub invalidation | No handler invalidates the Hub canonical query keys — Live/Results/Matches won’t refresh on `match:*`/`result-*`/`progression-*` events. |
| GSK generation | `tournament:group-stage-generated` / `tournament:knockout-generated`: allowed by the mapper (they would map like any `tournament:*`) but **blocked by the publisher allowlist**, and no frontend listener. |

## 15. Reconnect / Race / Duplicate Risks

- **Reconnect:** single singleton + handler flush on reconnect; full reconcile invalidates a broad key set on `reconnecting → connected`. Safe; but the reconcile list misses org-Hub/stage/group keys (see §13).
- **Duplicates:** a socket event reaches multiple rooms for the same actor (e.g., org + admin) but publisher emits once to the union; multiple tabs each invalidate idempotently (React Query refetch dedup) — no business-logic duplication.
- **Stale-UI race:** the Hub’s own mutations invalidate; actions in a second tab (or a referee via the shared lobby) go stale in the Hub until refetch — the concrete stale window realtime parity removes.

## 16. Backend Changes Required

Minimal and safe:
1. Add `tournament:group-stage-generated` and `tournament:knockout-generated` to the `socket-publisher` allowlist (they already route through `mapTournamentEvent` → org/admin/branch rooms). **No payload change** (the `tournamentRealtimeScope` fields are already carried).
2. No other backend change — events, rooms, and payloads already suffice.

## 17. Frontend Changes Required

1. Subscribe the Hub (or the global hook) to the already-published events and invalidate the Hub canonical keys:
   - `['tournament-matches', <id>]` and `['org-<orgId>-tournament-matches', <id>]` (admin/org Hub),
   - `['<root>-stages', <id>]`, `['<root>-groups', <id>]` (GSK),
   - `['tournament', id, 'matches'|'bracket'|'standings']` (player-facing).
   - Events to handle: `match.*`, `match.result-*`, `tournament.match-progressed/match-created/stage-completed/matches-generated/completed`, `tournament.group-stage-generated`, `tournament.knockout-generated`, `tournament.result`, `tournament.updated` (standings/bracket flags).
2. Extend `invalidateRealtimeReconcile` with the org-Hub + stage/group keys so reconnect heals them too.
3. No business logic in the frontend — only invalidations.

## 18. Database Impact

**No database change required.**

## 19. Permission Impact

**No new permission required.** Events route to existing rooms (`organisation`/`branch`/`admin`); room membership already encodes authorization; the Hub uses existing `tournament.*` keys.

## 20. Test Coverage

Existing:
- Backend: `socket-event-mapper.spec.ts` (tournament/match/result mappings incl. participant-only fan-out and privacy-slim payloads; drops unknown events; `t554/638/654-675` etc.), `socket-publisher.spec.ts` (allowlist: modern match lifecycle/result + Tier-B tournament events; single-union emit), `realtime-aggregate.spec.ts`.
- Frontend: `useRealtimeCacheUpdates.g11-10.test.tsx` captures handlers and asserts invalidation keys (lifecycle, refund/standings/prize, reconcile roots).
- **Missing:** any test for `tournament:group-stage-generated`/`knockout-generated` (no allowlist entry today); a Hub-specific test that a socket event invalidates `['tournament-matches', id]`/org key/stage/group keys; MatchesManager Live realtime test.

## 21. Implementation Plan

1. **Backend:** add the two GSK events to the publisher allowlist (one-line change each) — no payload change.
2. **Frontend (hook):** add handlers for `tournament.group-stage-generated` / `tournament.knockout-generated` and extend the tournament/`match result` handlers to invalidate the Hub canonical keys + stage/group keys; extend reconnect reconcile with org-Hub/stage/group keys.
3. **Tests:** mapper/publisher spec entries for the two GSK events; hook-spec assertions for Hub/stage/group invalidation; MatchesManager polling-free refresh test.
4. **Observe:** no DB/API/permission changes; run the full backend + frontend suites; docker build frontend (+backend only if backend touched) and health-check.

## 22. Risks / Non-Goals

- **Non-goals:** no frontend progression/standings computation, no new rooms, no Monitoring UI work, no accounting.
- **Risk (low):** adding events to the allowlist increases fan-out volume (bounded: 2 events, org-scope only).
- **Risk:** room membership for org staff is based on `user_organisations`; a staff user not in that table would not receive org-room events — pre-existing behavior, not changed here.

## 23. Final Verdict

**1. What is currently realtime-ready?** Shared match lifecycle/status/result events reach participants/org/admins and invalidate player+standalone-admin lists, match detail/result pages, and `admin-matches`/`match-results` keys; most `tournament.*` lifecycle/progression events are published and handled.

**2. What is currently stale?** The **Tournament Hub** (Live/Results/Matches segments) — its canonical keys are not invalidated by any event and it has no subscription; org Hub variants worst of all (not even on reconnect reconcile); **GSK groups/knockout** generation (events not published).

**3. Exact events to subscribe to (Hub):** `match.status_changed`, `match.completed`, `match.updated`, `match.result-*`, `tournament.match-progressed`, `tournament.match-created`, `tournament.stage-completed`, `tournament.matches-generated`, `tournament.result`, `tournament.completed`, `tournament.group-stage-generated`, `tournament.knockout-generated`.

**4. Exact events to publish/fix:** only `tournament:group-stage-generated` and `tournament:knockout-generated` — add to the publisher allowlist (already emitted, already mapper-compatible).

**5. Exact queries each event should invalidate:** see §17 — per event, the Hub key set: `['tournament-matches', id]`, `['org-<orgId>-tournament-matches', id]`, `['<root>-groups', id]`, `['<root>-stages', id]`, `['tournament', id, 'matches'|'bracket'|'standings']` (group-stage/knockout-generated → groups+stages; progression/result → matches+standings+bracket; match.*/match.result-* → matches+standings).

**6. Are payload changes necessary?** No — the existing slim payloads and `tournamentRealtimeScope` already carry everything (ids, stageId, group/competition via stages query, `status`, `result`, `standings`/`bracket` flags).

**7. Backend changes required?** Only the two allowlist additions (§16).

**8. Frontend changes required?** Yes — Hub/hook subscription + invalidation of the Hub canonical keys + stage/group keys + reconcile extension (§17).

**9. Database changes required?** No.

**10. New permissions required?** No.

**11. Can GSK generation be made realtime without changing the GSK engine?** Yes — the engine already emits the two events with full realtime scope; only the publisher allowlist and a frontend handler are needed.

**12. Safest implementation order:** (a) backend allowlist additions (+2 lines), (b) frontend hook handlers + Hub/stage/group invalidation + reconcile extension, (c) tests (mapper/publisher, hook invalidation, Live refresh), (d) docker build + health. All frontend logic stays invalidation-only; no business logic in the client.
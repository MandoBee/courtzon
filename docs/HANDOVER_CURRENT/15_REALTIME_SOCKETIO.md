# 15 — REALTIME / SOCKET.IO

**Audit:** 2026-10-04 · Sources: `backend/src/realtime/index.ts`, `modules/realtime/application/socket-publisher.ts`, `frontend/src/realtime/*`, `frontend/src/store`, `app.ts` `/health/socket`.

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL · ❌ ISSUE · ❓ UNVERIFIED

---

## 1. Server architecture (verified)

- ✅ Socket.IO server mounted on Fastify http server (`transports: ['websocket','polling']`).
- ✅ Auth middleware: cookie or `handshake.auth.token` → same `user_sessions` lookup → sets `socket.data.userId`, `role`, `organisationId`; rejects unauthenticated.
- ✅ Rooms joined on connection: `user:{id}`, `role:{slug}`, `org:{id}` (when mapped), `PLAYER_ROOM`; special `ADMIN_ROOM` for super_admin/admin.
- ✅ Client-requested joins with permission check: `join:booking|match|conversation|resource` (+ `leave:*`).
- ✅ `device:register` event → registers push device.
- ✅ Server emission centralized: `socket-publisher.ts` maps domain events → room + payload (`io.to(rooms).emit(type, payload)`).

## 2. Events / payloads

- Publisher mapping derives rooms from event metadata (entity type/ids, userId, orgId, role scopes).
- Frontend listens: `connect/disconnect/connect_error/reconnect` + app-level socket event handlers (`RealtimeCacheUpdater`, `useRealtimeCacheUpdates`, NotificationBell via store invalidation).

## 3. Frontend wiring (verified)

- `SocketContext.tsx` provides socket instance per authenticated session.
- `RealtimeCacheUpdater.tsx` subscribes to sets of events → calls `queryClient.invalidateQueries` for matching keys (tests exist: `useRealtimeCacheUpdates.test.ts(x)`, `g11-10`).
- `useResourceRoom.ts`/`useSocket.ts` for page-level room joining.
- Connection UI: `ConnectionStatus` component; retries exponential.

## 4. Stale UI risks (important)

| Scenario | Behavior | Risk |
|---|---|---|
| Page doesn't call `join:*` | no event → depends on refetch | 🟡 stale until refetch |
| Admin screens | rely on query invalidation scheduled by RealtimeCacheUpdater or manual refetch | 🟡 |
| Two windows same user | both receive same events → both update | ✅ |
| Reconnect after offline | reconnect + re-join rooms? (❓ room re-join on reconnect not confirmed in client code) | 🟡 |
| Multi-instance scaling | no Redis adapter → events lost across replicas | ❌ only single instance works |
| Payment updates | publisher emits to user:{id} (bookings room) — clients must be connected | 🟡 |

## 5. Scaling

- ❌ **No redis-adapter** — one live instance only. Horizontal scale requires `@socket.io/redis-adapter` + sticky sessions or WS gateway.

## 6. Security

- ✅ Room join requires permission (`canJoinRoom` checks org/branch/booking ownership).
- ❓ Payload size limits/validation on socket events.

## 7. Recommendations
1. Add room re-join on reconnect in client.
2. Decide multi-instance strategy (Redis adapter) before scaling.
3. Add socket-event E2E for two-window booking confirmation.
4. Audit that every page needing live updates actually joins the right room (map in `24_COMPLETE_TEST_MATRIX.md`).
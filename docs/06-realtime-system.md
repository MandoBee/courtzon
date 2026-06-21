# REALTIME SYSTEM DESIGN

## Current Architecture
**Polling-based** using MySQL `sync_events` table:
- Database triggers write events on INSERT/UPDATE
- Clients poll `GET /api/sync?since={last_event_id}` periodically
- `realtime_polling_tokens` stores per-user cursor position
- Stateless, simple, no persistent connections

## Target Architecture (Socket.IO)

```
                  ┌──────────────────┐
                  │   Socket.IO       │
                  │   Server (Node)   │
                  └──────┬───────────┘
                         │
     ┌───────────────────┼───────────────────┐
     │                   │                   │
  room:user:{id}   room:org:{id}    room:branch:{id}
     │                   │                   │
  Personal           Organization        Location
  Notifications      Broadcasts          Specific
```

## Connection Lifecycle
1. Client authenticates via REST → receives JWT
2. Opens Socket.IO connection with JWT in handshake
3. Server validates JWT → joins user to their rooms:
   - `user:{userId}` — personal notifications
   - `org:{orgId}` — if staff/admin of that org
   - `branch:{branchId}` — if assigned to branch
4. On disconnect → cleanup (no state loss, reconnect resumes)

## Event Definitions

| Channel | Event | Direction | Payload |
|---|---|---|---|
| `user:{id}` | `notification` | Server→Client | `{ id, type, title, body, payload }` |
| `user:{id}` | `booking:update` | Server→Client | `{ booking_id, status, message }` |
| `org:{id}` | `booking:new` | Server→Client | `{ booking_id, court, slots, player }` |
| `org:{id}` | `booking:cancelled` | Server→Client | `{ booking_id, reason }` |
| `org:{id}` | `checkin` | Server→Client | `{ booking_id, player_name }` |
| `org:{id}` | `tournament:update` | Server→Client | `{ tournament_id, status }` |
| `branch:{id}` | `resource:available` | Server→Client | `{ resource_id, date, slots[] }` |

## Fallback Strategy
- Socket.IO configured with HTTP long-polling as transport fallback
- On disconnect: client queues events locally, replays on reconnect
- On reconnection failure: client falls back to REST polling (`sync_events`)
- Redis adapter for horizontal scaling (multiple Socket.IO nodes)

## Rooms & Authorization
- Server-side room join (clients cannot self-join rooms)
- Room membership verified against JWT claims on each `connection`
- `org:{orgId}` rooms: only users with `org:{orgId}` scope in their roles
- Admin dashboard: joins all org rooms for Super Admin

# EVENT ARCHITECTURE

## Current State (MySQL-Driven)

```
Application Code
  └── INSERT into sync_events table (event_type, entity_type, entity_id)
        OR
  MySQL Triggers (AFTER INSERT on bookings, notifications, etc.)
  └── INSERT into sync_events + activity_logs

Client Side
  └── Polls: GET /api/sync?since={last_event_id}
  └── Returns pending events → client updates local state
  └── Uses realtime_polling_tokens for cursor-based tracking
```

## Target State (Socket.IO Real-time)

```
┌─────────┐     Socket.IO (WebSocket)     ┌─────────┐
│  Server  │ ◄──────────────────────────►  │  Client │
│          │     room: org_{id}            │          │
│          │     room: user_{id}           │          │
└─────────┘                               └─────────┘

Server Events:
  - booking.created    → room: org_{orgId}
  - booking.updated    → room: org_{orgId} + user_{creatorId}
  - notification.new   → room: user_{userId}
  - tournament.match   → room: tournament_{tournamentId}
  - marketplace.order  → room: user_{sellerId}
```

## Event Flow (Target)
1. Application performs business operation → commits transaction
2. Post-commit hook publishes Socket.IO event to relevant rooms
3. MySQL triggers remain for audit trail only (not real-time sync)
4. Clients receive push events — no polling needed
5. Fallback: On connection loss, client re-syncs via REST API since last known event

## Event Catalog

| Event | Trigger | Target Room | Payload |
|---|---|---|---|
| `booking:confirmed` | BookingController | org:{id} | booking_id, court_id, slots |
| `booking:cancelled` | BookingController | org:{id} + user:{id} | booking_id, refund_amount |
| `notification:new` | NotificationService | user:{id} | notification_id, title, body |
| `tournament:match_result` | TournamentService | tournament:{id} | match_id, winner, score |
| `marketplace:order_placed` | OrderController | user:{sellerId} | order_id, product, quantity |
| `community:event_created` | EventController | org:{id} | event_id, title, date |
| `ad:impression` | AdMiddleware | admin:dashboard | impression count |

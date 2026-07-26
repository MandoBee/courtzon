# ADR-0004: Socket.IO Realtime Architecture

## Status

Accepted

## Context

CourtZon requires real-time updates for:

- Live match status changes (match available, player joined, match cancelled)
- Booking notifications (confirmed, cancelled, reminder)
- Chat messages
- In-app notifications delivered instantly
- Presence tracking (online/offline)

The platform already had a REST API for all data operations, but polling would have been inefficient for time-sensitive features like matchmaking and chat. The team needed a realtime layer that integrated with the existing event bus and authentication system.

## Decision

Use **Socket.IO** as the realtime transport layer, integrated with:

**1. SocketPublisher**

A service that subscribes to `eventBusV2` events and maps them to Socket.IO broadcasts. The `socket-event-mapper.ts` transforms domain events into typed socket events:

```typescript
// Domain event → Socket event
booking:created  →  booking.created (broadcast to user:${userId} room)
match:available  →  match.available (broadcast to 'player' room)
notification:delivered → notification.new (broadcast to user:${userId} room)
```

**2. Room-based targeting**

- `user:${userId}` — private room for each authenticated user
- `booking:${bookingId}` — room for all participants of a booking
- `organisation:${organisationId}` — room for organisation members
- `player` — broadcast room for all connected players

**3. SocketGateway**

Manages Socket.IO server lifecycle, authenticates connections via session tokens, and handles connection/disconnection events.

**4. Presence tracking**

Online/offline presence is tracked through socket connection events and stored in Redis, enabling features like "user is typing" indicators and realtime availability.

## Consequences

**Benefits:**
- Instant delivery of time-sensitive events without polling
- Room-based targeting is efficient and scales well
- Socket.IO provides built-in reconnection, fallback transports, and room management
- Integration with EventBus V2 means any domain event can be transparently broadcast to connected clients
- The mapper pattern keeps socket event contracts decoupled from domain event shapes

**Trade-offs:**
- Socket.IO adds operational complexity (sticky sessions if scaling horizontally, or using Redis adapter)
- The `'player'` broadcast room sends events to every connected user — this scales linearly with connected clients
- Socket connections add memory overhead per connected user

**Alternatives rejected:**
- *Server-Sent Events (SSE)*: Simpler but lacks bidirectional communication (no client-to-server events needed for chat/presence); also lacking built-in room management
- *WebSocket (raw)*: No built-in reconnection, authentication, or room management — would require reimplementing Socket.IO's features
- *Polling (HTTP)*: Too slow for realtime features; wasteful for mostly-idle connections
- *Pusher/Firebase Realtime*: External dependencies; vendor lock-in; additional cost

**Future considerations:**
- For horizontal scaling, a Redis adapter for Socket.IO should be added to share connection state across instances
- The `'player'` broadcast room should be reviewed for efficiency — consider using per-user rooms and letting the frontend handle broadcast visibility
- Connection metrics (connected users, events per second) should be exposed via Prometheus

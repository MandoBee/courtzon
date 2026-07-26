# ADR-0002: Notification Deep Linking

## Status

Accepted

## Context

Notifications in CourtZon served two purposes: informing users of events (booking confirmed, match invitation received, payment processed) and enabling them to take action (view the booking, accept the invitation, review the payment).

Previously, the frontend contained all navigation logic for notifications via:

- A `ROUTE_MAP` that mapped `action_key` strings to route-building functions
- A `SCREEN_MAP` for screen-name-based routing
- A `routeFromEntityType` fallback based on `related_entity_type`
- Hardcoded action buttons for specific notification types (e.g., "Apply to match" for matchmaking bookings)

This approach had several problems:

- Frontend had to know about every notification type to navigate correctly
- Adding a new notification required changes in both backend (emit event) and frontend (add route mapping)
- Navigation logic was duplicated between the notification bell dropdown, the notifications page, and the detail modal
- Different notification types used different fields (`action_key`, `related_entity_type`, `action_payload`) inconsistently

## Decision

Make the **backend the single source of truth for notification navigation**. The backend generates a complete `NotificationAction` object for every notification:

```typescript
interface NotificationAction {
  route: string;       // e.g., "/bookings/42" or "/matches/7/applicants"
  tab?: string;        // e.g., "applicants" — specifies which tab to open
  params?: Record<string, string | number | boolean | null>;
  replace?: boolean;   // whether to replace history entry
  openInNewTab?: boolean;
}
```

**Frontend responsibility is reduced to:**

1. Mark notification as read (via API)
2. Validate `action.route` exists and starts with `/`
3. Call `navigate(route, { replace, state: { tab, params } })`

**All routing maps were removed from the frontend:**
- `SCREEN_MAP` — deleted
- `ROUTE_MAP` — deleted
- `routeFromEntityType` — deleted
- Hardcoded action buttons — deleted

**Backward compatibility:** The `action_payload` field still stores the `NotificationAction` object. Old notifications without a `route` fall through gracefully — the frontend does not navigate and logs a development warning.

## Consequences

**Benefits:**
- Frontend has zero notification-type awareness for navigation
- New notification types require only backend changes
- Single code path for all notification clicks (bell dropdown, notifications page, realtime)
- Strong typing via `NotificationAction` interface shared across the entire stack

**Trade-offs:**
- Backend handlers are slightly more verbose (each must construct a `NotificationAction`)
- The `action_payload` column in the database stores a structured object, making it harder to query directly — but it's JSON, so this was already the case

**Alternatives rejected:**
- *Frontend route map with action keys*: The previous approach, rejected because it required dual changes and duplicated logic
- *URL templates stored in the backend but resolved in the frontend*: Adds complexity without benefit — the backend can construct the complete URL from its domain data
- *Event-type-based routing in the frontend*: Violates the principle of keeping navigation knowledge out of the frontend

**Future considerations:**
- The `tab` field enables destination pages to restore context automatically (e.g., opening the "Applicants" tab when navigating from a join request notification)
- The `openInNewTab` field could be used for external links (e.g., payment gateway redirects)
- The shared `NotificationAction` type should be moved to `@courtzon/shared` if not already there

---
document_id: "GOV-ADR-014"
document_name: "Notification Multi-Channel — Pluggable Provider Architecture"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 7
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-ARCH-25", "TECH-MOD-14"]
  related: ["GOV-ADR-003"]
---

# ADR-014: Notification Multi-Channel — Pluggable Provider Architecture

## Status

Accepted

## Context

The platform must deliver notifications across multiple channels: in-app, push (mobile/desktop), email, SMS, WhatsApp, and webhook. Each channel has different delivery semantics (async push vs. synchronous in-app, rate-limited SMS vs. bulk email). The architecture must support adding new channels and providers without modifying core notification logic. Common approaches include:

1. **Monolithic notification service** — single service handles all channels; simple but tightly coupled; adding a channel requires modifying core code
2. **Pluggable provider architecture** — each channel has one or more providers implementing a common interface; providers are registered at startup
3. **Event-driven fan-out** — notification events published to a bus; separate listeners handle each channel

## Decision

**Use a pluggable provider architecture with a common `NotificationProvider` interface.** Each delivery channel has one or more providers registered via `registerProvider()`. The dispatcher iterates providers in priority order, attempting delivery until success or exhaustion.

### Architecture

```
Notification Engine
  └─ dispatcher.service.ts
       ├─ Determines channel from notification type preferences
       └─ Calls deliverToChannel(channel, job)
            └─ getProvidersForChannel(channel) — sorted by priority
                 ├─ in-app.provider.ts    (channel: in_app,  priority: 100)
                 ├─ push.provider.ts      (channel: push,    priority: 100)
                 ├─ email.provider.ts     (channel: email,   priority: 50)
                 ├─ sms.provider.ts       (channel: sms,     priority: 50)
                 ├─ whatsapp.provider.ts  (channel: whatsapp, priority: 50)
                 └─ webhook.provider.ts   (channel: webhook, priority: 100)
```

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| Provider interface | `NotificationProvider` — `slug`, `channel`, `priority`, `isAvailable()`, `deliver()` | `provider.interface.ts:16-22` |
| Provider registry | `Map<string, NotificationProvider>` with `registerProvider()` / `getProvider()` | `provider.interface.ts:24-33` |
| Channel routing | `getProvidersForChannel(channel)` — filters by channel, sorts by priority descending | `provider.interface.ts:35-39` |
| Delivery fallback | `deliverToChannel()` — iterates providers; returns on first success; logs failures | `provider.interface.ts:46-66` |
| Notification engine | Orchestrates preference resolution, rate limiting, quiet hours, and provider dispatch | `notification-engine.ts` |
| Dispatcher | Queue-based async processing via `ProcessNotificationJob` | `dispatcher.service.ts` |
| Rate limiter | Per-provider rate limiting with configurable thresholds | `rate-limiter.service.ts` |
| Quiet hours | Respects user-configured quiet hours per channel | `quiet-hours.service.ts` |

### Channel Characteristics

| Channel | Delivery Type | Provider Priority | Rate Limit Consideration |
|---------|--------------|-------------------|--------------------------|
| In-app | Synchronous (DB write) | 100 | None (immediate) |
| Push | Asynchronous (FCM/APNs) | 100 | Per-device throttling |
| Email | Asynchronous (SMTP/API) | 50 | Daily quota |
| SMS | Asynchronous (Twilio) | 50 | Regulatory limits |
| WhatsApp | Asynchronous (API) | 50 | Template approval |
| Webhook | Asynchronous (HTTP POST) | 100 | Per-endpoint |

### Provider Registration

```typescript
import { registerProvider } from './provider.interface';
import { InAppProvider } from './providers/in-app.provider';
import { PushProvider } from './providers/push.provider';
import { EmailProvider } from './providers/email.provider';

registerProvider(new InAppProvider());
registerProvider(new PushProvider());
registerProvider(new EmailProvider());
```

**Evidence:** `provider.interface.ts:24-33` — provider registration and lookup.

## Consequences

### Positive

- **Channel isolation**: Each provider is independently developed, tested, and deployed
- **Priority-based fallback**: If the primary push provider fails, the next priority provider attempts delivery
- **Easy extension**: New channel (e.g., Telegram bot) = implement `NotificationProvider` + `registerProvider()`
- **Per-channel semantics**: Rate limiting, quiet hours, and availability checks are provider-specific
- **Testing**: Mock providers can be registered in test suites

### Negative

- **No ordering guarantees**: Provider iteration order is priority-based, not deterministic for equal priorities
- **Provider explosion**: Many small provider files; each channel may have multiple providers (e.g., two email providers)
- **Cross-channel coordination**: Digest scheduling and cross-device sync require additional orchestration outside the provider pattern

## Evidence

- `provider.interface.ts:1-66` — `NotificationProvider` interface, `registerProvider()`, `deliverToChannel()`
- `notification-platform.impl.ts:1-97` — platform contract implementation using the provider system
- `providers/in-app.provider.ts`, `push.provider.ts`, `email.provider.ts`, `sms.provider.ts`, `whatsapp.provider.ts`, `webhook.provider.ts` — one file per channel
- `dispatcher.service.ts` — orchestrates preference check → rate limit → provider delivery → logging
- `notification-engine.ts` — core engine tying together templates, preferences, and dispatch

## Related Decisions

- GOV-ADR-003 (Event Composable Architecture): Notifications are dispatched via events

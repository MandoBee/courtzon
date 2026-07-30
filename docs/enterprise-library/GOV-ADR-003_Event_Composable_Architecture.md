---
document_id: "GOV-ADR-003"
document_name: "Event-Composable Architecture"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "advanced"
reading_time: 15
business_owner: "CTO"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
supersedes: []
related_decisions: ["GOV-ADR-002"]
---

# ADR-003: Event-Composable Architecture

**Status:** Accepted | **Date:** 2025-01-20

## Context

Cross-domain workflows require coordination between modules (e.g., booking → payment → wallet → notifications). Direct service calls create tight coupling and circular dependencies. Options:

1. **Direct service calls** — Simple but creates coupling
2. **Event Bus** — Publish/subscribe pattern with loose coupling
3. **Message Queue** — Persistent, replayable but adds infrastructure

## Decision

**Use `EventBusV2` for all cross-domain communication.** Events are emitted synchronously in-process (no external message broker) with typed metadata. Modules subscribe to events they need.

```
EventBusV2.emit(eventName, payload, { aggregateType, aggregateId, aggregateVersion })
```

### Implementation

| Aspect | Detail | Source |
|--------|--------|--------|
| Event bus | Singleton `eventBusV2` instance | `shared/event-bus/event-bus.v2.ts` |
| Metadata | `aggregateType`, `aggregateId`, `aggregateVersion` | Same |
| Subscription | `eventBusV2.on(eventName, handler)` | Each listener module |
| Typed payloads | Generic `Record<string, unknown>` with runtime validation | — |

### Examples

| Emitter | Event | Listener | Evidence |
|---------|-------|----------|----------|
| LedgerService | `ledger.entry.created` | Audit, Accounting | `ledger.service.ts:25-31` |
| PaymentService | `payment:succeeded`, `payment:failed` | Booking, Marketplace, Wallet | `payment.service.ts:571-622` |
| CouponService | `coupon:published` | Notifications | `coupon.service.ts:67-73` |
| SettlementService | `settlement.created` | Notifications | `settlement.service.ts:51-57` |
| SettlementService | `settlement:completed` | Notifications | `settlement.service.ts:403-408` |

### Command Pipeline (for State-Machine Operations)

For operations that require validation → execution → event emission, the `commandPipeline` pattern is used:

```typescript
const result = await commandPipeline.execute(command, {
  validate: async () => handler.validate(command),
  execute: async (cmd, conn) => handler.execute(cmd, conn),
  events: (cmd, res) => handler.events!(cmd, res),
});
```

**Evidence:** `settlement/application/settlement.service.ts:382-412` — `changeStatusV2()` uses the command pipeline for settlement status transitions.

## Consequences

**Positive:**
- Loose coupling between domains
- Easy to add new subscribers (open/closed principle)
- Command pipeline provides validation + execution + events in one flow
- No external broker needed (reduced infrastructure)
- SAGA compensation pattern works naturally with events

**Negative:**
- In-process events are lost on process crash (no persistence)
- Synchronous event handlers increase request latency
- Debugging event flows can be harder than direct calls
- Event contracts evolve — no schema registry

## Related

- `TECH-ARCH-04_Event_Architecture.md` — Detailed event architecture
- `BIZ-ARCH-06_Business_Event_Catalog.md` — Full event catalog

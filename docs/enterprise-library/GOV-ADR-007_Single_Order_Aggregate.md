---
document_id: "GOV-ADR-007"
document_name: "Single Order Aggregate"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 8
business_owner: "CTO"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
supersedes: []
related_decisions: ["GOV-ADR-002", "GOV-ADR-003"]
---

# ADR-007: Single Order Aggregate with State Machine

**Status:** Accepted | **Date:** 2025-06-01

## Context

The Marketplace order lifecycle spans 7 statuses: `pending → confirmed → processing → shipped → delivered → cancelled | refunded`. Orders can be created via multiple payment methods (cash/COD, card/gateway, wallet) and managed by three actor roles: buyer, seller, and admin.

The question: should we have separate order aggregates for different payment methods, or a single unified aggregate?

Options considered:
1. **Separate aggregates per payment method** — `CodOrderAggregate`, `CardOrderAggregate`, `WalletOrderAggregate` — each with its own state machine and rules
2. **Single aggregate with role-based transitions** — one `OrderAggregate` where allowed transitions depend on the actor's role

## Decision

**Use a single order aggregate (`order-aggregate.ts`) with role-based state transitions.** The aggregate defines allowed transitions as a `Record<OrderStatus, Record<OrderRole, OrderStatus[]>>` matrix.

### Implementation

```typescript
// order-aggregate.ts:5-37
const ALLOWED_TRANSITIONS: Record<OrderStatus, Record<OrderRole, OrderStatus[]>> = {
  pending: {
    buyer: ['cancelled'],
    seller: ['processing', 'cancelled'],
    admin: ['confirmed', 'cancelled'],
  },
  confirmed: {
    buyer: ['cancelled'],
    seller: ['processing', 'cancelled'],
    admin: ['processing', 'cancelled'],
  },
  // ...
};
```

The `assertValidTransition(from, to, role)` function throws for illegal transitions. The `planTransition(request)` function returns `{ newVersion, didTransition }` with optimistic concurrency via `aggregate_version`.

The service layer resolves the user's role dynamically via `_getUserRoleInOrder()`:
- **buyer** — the user who placed the order
- **seller** — the organisation that owns the products
- **admin** — any super admin user

### Key Design

- `order-constants.ts` defines `ORDER_STATUSES` array and `TERMINAL_STATUSES` (`cancelled`, `refunded`)
- The aggregate is pure (no side effects) — validation only
- The service layer handles side effects: financial recording, events, order history
- Optimistic concurrency via `aggregate_version` prevents race conditions

**Evidence:** `order-aggregate.ts:1-70`, `order-constants.ts:1-2`, `marketplace.service.ts:1065-1089`.

## Consequences

**Positive:**
- Consistent order lifecycle across all payment methods — one state machine to reason about
- Role-based transitions naturally encode business rules (e.g., buyer cannot ship, seller cannot confirm)
- Single source of truth for order state logic
- Easier to test — one aggregate with clear transition matrix
- New payment methods don't require new aggregates — just new checkout logic

**Negative:**
- Service layer must resolve roles dynamically (slightly more complex than static aggregates)
- Payment-method-specific logic (e.g., refund behavior) lives in service, not the aggregate
- The aggregate must be generic enough to accommodate all payment methods

## Rejected Alternative: Separate Aggregates

Separate aggregates per payment method (COD vs card) were rejected because:
- They would duplicate the transition matrix (most transitions are identical)
- Adding a new payment method would require a new aggregate
- Role-based logic would still be needed (buyer/seller/admin behavior differs regardless of payment method)
- Testing complexity would increase proportionally

Instead, payment-method-specific logic lives in the checkout handler and financial recording methods (`_recordOrderFinancials`, `_recordDeliveryFinancials`), while the state machine remains unified.

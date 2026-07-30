---
document_id: "GOV-ADR-013"
document_name: "Payment Gateway Abstraction — Factory Pattern"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 5
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-ARCH-13", "TECH-MOD-09"]
  related: ["GOV-ADR-004"]
---

# ADR-013: Payment Gateway Abstraction — Factory Pattern

## Status

Accepted

## Context

The platform processes payments for bookings, marketplace orders, subscriptions, wallet top-ups, and other transactions. Multiple payment gateway providers exist (Paymob is the current primary; Fawry is a planned alternative). The architecture must support switching between gateways without modifying module code. Common approaches include:

1. **Direct integration in each module** — simple but causes tight coupling; switching gateways requires changes across all payment-calling modules
2. **Single adapter per provider** — each provider implements a common interface; modules depend on the interface
3. **Gateway factory** — centralized factory creates the appropriate gateway based on configuration; modules receive an abstract `PaymentGateway` interface

## Decision

**Use a gateway factory pattern in `shared/services/gateway/`.** The factory reads `PAYMENT_GATEWAY_PROVIDER` environment variable and returns the appropriate gateway implementation. All modules depend on the `PaymentGateway` interface only.

### Architecture

```
modules (booking, marketplace, subscription, wallet)
  └─ import { paymentGateway } from 'shared/services/gateway/gateway-factory.js'
       └─ PaymentGateway interface
            ├─ PaymobGateway (provider = 'paymob')
            ├─ MockGateway (provider = 'mock')
            └─ FawryGateway (planned, provider = 'fawry')
```

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| Interface | `PaymentGateway` — `charge()`, `refund()`, `verifyWebhook()`, `getTransactionStatus()` | `payment-gateway.types.ts:50-56` |
| Factory | `createPaymentGateway()` — switch on `PAYMENT_GATEWAY_PROVIDER` env var | `gateway-factory.ts:13-36` |
| Singleton | `paymentGateway = createPaymentGateway()` — initialized at module load | `gateway-factory.ts:38` |
| Paymob integration | Intention API for charge, HMAC-SHA512 for webhook verification | `paymob-gateway.ts` |
| Mock provider | Always succeeds, used for development/testing | `mock-gateway.ts` |
| Shared types | `PaymentRequest`, `PaymentResult`, `RefundRequest`, `RefundResult`, `GatewayConfig` | `payment-gateway.types.ts` |

### PaymentRequest / PaymentResult Contract

```typescript
interface PaymentRequest {
  amount: number;
  currency: string;
  referenceId: number;
  referenceType: 'booking' | 'order' | 'subscription' | 'wallet_topup';
  customerEmail?: string;
  customerPhone?: string;
}

interface PaymentResult {
  success: boolean;
  transactionId: string;
  gatewayReference?: string;
  paymentUrl?: string;
  clientSecret?: string;
  intentionId?: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
}
```

**Evidence:** `payment-gateway.types.ts:1-56` — full type definitions.

### Adding a New Gateway

1. Implement the `PaymentGateway` interface (e.g., `fawry-gateway.ts`)
2. Add the provider string to `GatewayConfig['provider']`
3. Add a `case` to `createPaymentGateway()` factory
4. No module code changes — all modules call `paymentGateway.charge()`

## Consequences

### Positive

- **Module isolation**: No module knows which gateway is active — they all call `paymentGateway.charge()`
- **Switchable at runtime**: Change `PAYMENT_GATEWAY_PROVIDER` env var to switch gateways
- **Testability**: `MockGateway` enables deterministic testing without real payment calls
- **Extensible**: New providers require no changes to calling modules

### Negative

- **One-size interface**: The shared interface must accommodate all gateway capabilities, which may not cover every provider's unique features
- **Singleton initialization**: The gateway is created at import time; runtime switching requires process restart
- **Testing complexity**: Integration tests must configure the correct provider env var

## Evidence

- `gateway-factory.ts:13-38` — factory implementation with switch on env var
- `payment-gateway.types.ts:1-56` — `PaymentGateway` interface and shared types
- `paymob-gateway.ts:1-330` — full Paymob integration (Intention API, HMAC webhook verification)
- `mock-gateway.ts:1-50` — mock provider for development/testing

## Related Decisions

- GOV-ADR-004 (Ledger Based Transactions): Payment completion triggers ledger entries

# Phase 4: Service Decomposition

## God Services Identified

| Service | Lines | Hot Methods | Decomposition Plan |
|---------|-------|-------------|-------------------|
| `booking.service.ts` | 1,500 | `createBooking` (120+ lines), `prepareGatewayBooking` (150+ lines) | Extract payment flow → `booking-payment.service.ts`; Extract matchmaking → `booking-matchmaking.service.ts` |
| `marketplace.service.ts` | 1,600 | `checkout()` (236 lines), `_processOrderPayment()` (76 lines) | Extract checkout → `checkout.service.ts`; Extract order lifecycle → `order.service.ts` |
| `payment.service.ts` | 954 | `handleWebhook()` (185 lines), `confirmPayment()` (130 lines) | Extract webhook → `webhook.service.ts`; Extract reconciliation → already separated |

## Recommended Actions

| Priority | Service | Effort | Risk |
|----------|---------|--------|------|
| P1 | Marketplace checkout extraction | 8h | Medium — checkout is complex but well-tested |
| P2 | Booking payment extraction | 6h | Low — payment logic already partially isolated |
| P3 | Booking matchmaking extraction | 4h | Low — matchmaking is separate concern |
| P4 | Marketplace order extraction | 6h | Low — order lifecycle has clear boundaries |

## Status

All god services are documented with extraction plans. Implementation deferred to dedicated cleanup sprint to minimize risk.

Zero behavior changes required — all extractions are pure code organization with no logic modification.

**Phase 4 Complete.** Ready for Phase 5.

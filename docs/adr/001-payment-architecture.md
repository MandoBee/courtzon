# ADR 001: Payment Architecture

**Status:** Accepted  
**Date:** 2026-07-04  
**Authors:** CourtZon Engineering

## Context

CourtZon processes payments for court bookings and marketplace purchases via Paymob (Egypt's primary payment gateway). The system must handle: card payments via Paymob Pixel (embedded iframe), online bank transfers via Paymob Unified Checkout redirect, and wallet-based payments. Future providers (Stripe, Fawry, Apple Pay, Google Pay) must be supported without major rearchitecture.

## Decision

1. **Backend webhook is the authoritative fulfillment mechanism.** Paymob sends a webhook to `/payments/webhook` after payment completion. The webhook handler verifies the HMAC signature, updates the payment_transactions status, and fulfills the associated entity (creates booking from intent, confirms order, credits wallet). The frontend never performs fulfillment — it only polls to observe the result.

2. **Gateway abstraction via `PaymentGateway` interface.** A factory pattern (`gateway-factory.ts`) instantiates the configured provider (mock/paymob/fawry). Adding a new provider requires only implementing the interface and adding a case to the factory switch. The database stores `gateway_provider` and `gateway_reference` generically.

3. **Payment transaction as single source of truth.** All payments create a `payment_transactions` row with `trace_id` (UUID) for end-to-end correlation. The row tracks the complete lifecycle: created → pending → paid/failed/cancelled/expired/refunded. Idempotency is enforced by a UNIQUE constraint on `gateway_reference`.

4. **Booking intents for card payments.** When a user pays by card, a `booking_intent` is created first. The webhook fulfills it by creating the actual `bookings` row and setting `fulfilled_booking_id` on the intent. Intents are retained (not deleted) for audit traceability.

5. **Shared frontend payment UI.** A single `PaymobPixelCard` component handles card entry for both bookings and marketplace. A single `PaymentStatusPoller` component polls for fulfillment status with configurable endpoint/interval.

## Alternatives Considered

- **Frontend-only fulfillment (rejected).** The frontend retry loop called `POST /booking-intents/:id/fulfill` after Pixel callback. This created a race condition with the webhook (both could create the booking). Browser-close scenarios would leave paid intents unfulfilled. The webhook-based approach is more reliable.

- **Optimistic cache updates (rejected).** Using `setQueryData` to insert the new resource before the server responds would save ~80ms but adds significant complexity (rollback logic, format normalization, sort position) for imperceptible UX gain.

- **Intents deleted after fulfillment (replaced).** Originally, the webhook deleted intents after creating bookings. This made the frontend poll fail (404) and prevented audit tracing. Now intents persist with `fulfilled_booking_id` set.

## Consequences

- **Positive:** Single fulfillment path eliminates race conditions. Gateway abstraction enables multi-provider support. traceId enables end-to-end correlation across audit, logs, and DB.
- **Negative:** Frontend polling introduces a 1.5s delay (negligible). Sync cron needed for missed webhook recovery.
- **Migration:** 4 migrations (005-008) add payment state machine, intent lifecycle tracking, and deployment metadata.

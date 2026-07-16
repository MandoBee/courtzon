# ADR-002: Scheduling Engine as Pure Orchestrator

## Status
Accepted — July 2026

## Context
There was pressure to make the Scheduling Engine a "God Service" that owns booking creation, payment processing, notifications, and scheduling. This would have duplicated existing domain services (BookingService, PaymentService, NotificationService) and created a parallel domain model.

## Decision
The Scheduling Engine is a **pure orchestration layer**. It:
1. **Searches** — finds valid combinations of resources for a given request
2. **Cross-validates** — checks constraints between resource types (sport match, location match)
3. **Prices** — delegates pricing to a caller-provided function
4. **Ranks** — sorts candidates by score (cheaper = higher score)

The Engine **never**:
- Creates bookings (delegated to `BookingService.createBooking()`)
- Processes payments (handled by existing PaymentService)
- Sends notifications (handled by existing NotificationService)
- Owns business data (no direct DB writes)
- Contains domain logic for any specific resource type

## Consequences
- **+** Zero duplication of existing domain logic
- **+** Engine stays under 200 lines of code
- **+** Each domain (Booking, Pricing, Notifications) remains its own owner
- **+** Engine is trivially testable with mock providers and pricing functions
- **-** Callers must wire up providers and pricing — more setup code at the controller level
- **-** Engine cannot make decisions that require cross-domain context (by design)

## Architecture Principle
The Engine answers: *"What are the best valid combinations of resources for this request?"*

It does NOT answer: *"What happens after a booking is made?"* — that's the existing BookingService's responsibility.

## Pricing Decoupling
The Engine receives a `PricingFunction` callback from the caller, rather than importing pricing logic directly. This keeps the Engine decoupled from:
- `pricingEngine.calculatePrice()` (court pricing)
- `commissionService.calculate()` (platform commission)
- Coach hourly rate calculations

The controller builds the pricing function and passes it in. The Engine never knows which pricing strategy is used.

## Follow-Up
- `SchedulingEngine.search()` receives pricing as a callback (scheduling-engine.ts:6)
- Controller builds the pricing function (scheduling.controller.ts:14-31)
- Booking creation is delegated to `bookingService.createBooking()` (scheduling-booking.service.ts:63)

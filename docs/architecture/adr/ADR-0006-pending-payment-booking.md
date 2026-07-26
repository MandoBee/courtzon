# ADR-0006: Pending Payment Booking Flow

## Status

Accepted

## Context

CourtZon bookings go through a payment flow that involves a third-party payment gateway (Paymob). The flow must:

1. Block the selected time slot so no other user can book it
2. Redirect the user to Paymob's checkout page
3. Wait for the user to complete payment (or let it expire)
4. Confirm the booking only after successful payment
5. Release the slot if payment fails or expires

The challenge is that the time slot must be held exclusively while the user is on the payment gateway, which can take several minutes. A simple `INSERT ... COMMIT` followed by payment doesn't work because the slot would be released on rollback but the user would lose their payment.

## Decision

Implement a **two-phase booking flow** with a "prepare" step:

**Phase 1: Prepare (bookings/prepare)**

1. User selects time slot → backend validates availability
2. Creates a **payment intention** on Paymob (Paymob's Intention API)
3. Stores booking preparation data in **Redis** with a 10-minute TTL
4. Returns `prepareId`, `clientSecret`, and `paymentId` to the frontend
5. **Does NOT create a booking or block availability yet** — instead acquires a Redis lock on the slot

**Phase 2: Confirm (bookings/confirm)**

1. Frontend calls the confirm endpoint with the `prepareId`
2. Backend retrieves the preparation data from Redis
3. Uses a database transaction:
   a. `SELECT ... FOR UPDATE` on the time slot to check availability
   b. `INSERT INTO bookings` with `booking_status = 'pending_payment'`
   c. `INSERT INTO booking_slots` to mark the slot as taken
   d. Links the payment transaction (`payment_transactions`) to the booking
4. If the payment was already completed via webhook, immediately transition to `confirmed`
5. If payment is still pending, the booking expires in 3 minutes (enforced by `cancel_expired_bookings` cron job)

**Webhook path (alternative to Phase 2 confirm):**

1. Paymob sends webhook to `/payments/webhook`
2. Backend verifies HMAC signature
3. Updates `payment_transactions` status
4. Dispatches `payment:succeeded` event
5. `booking-payment.listener` receives the event
6. Executes `ConfirmBooking` command via the command pipeline
7. Match is created, notifications are sent

## Consequences

**Benefits:**
- Slots are held in Redis (fast, distributed lock) during the prepare phase, not in the database
- The 10-minute prepare TTL gives users ample time to complete payment
- The 3-minute pending_payment TTL prevents abandoned bookings from blocking slots indefinitely
- Two parallel confirmation paths (confirm endpoint + webhook) handle all scenarios:
  - User closes browser before redirect → webhook still confirms the booking
  - Webhook delayed → confirm endpoint can finalise
  - Both arrive → idempotency ensures only one confirmation takes effect

**Trade-offs:**
- Two-phase flow adds complexity compared to a simple booking creation
- Redis locks are not as strong as database locks — if Redis goes down, locks are lost
- The prepare/confirm split means the frontend must manage two API calls
- The `pending_payment` TTL (3 min) must be shorter than the prepare TTL (10 min) to avoid orphaned bookings

**Alternatives rejected:**
- *Direct booking + payment redirect*: If the user never returns from Paymob, the slot is stuck in `pending` forever
- *Payment-first flow*: Create payment before checking availability; if the slot is taken, the user has a paid but useless payment
- *Database-level slot lock during payment*: Locks the row for minutes, blocking other users

**Future considerations:**
- The Redis lock mechanism could be replaced with a database-based advisory lock for stronger guarantees
- Payment gateway timeout configuration should be exposed as a per-venue setting
- The prepare/confirm flow could be extended to support wallet payments and other payment methods

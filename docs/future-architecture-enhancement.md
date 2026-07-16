# Future Architecture Enhancement: Optional Transaction Participation

> **Status:** Future consideration — not required for production
> **Current architecture:** Compensation Pattern (approved, production-quality)
> **No refactoring required. No implementation required.**

---

## Current State

`SchedulingBookingService.bookSession()` uses a **Compensation Pattern** for atomic reservation:

1. Booking is committed first (own transaction via `BookingService.createBooking()`)
2. Coach session is created second (own transaction)
3. If step 2 fails, compensation runs: booking is cancelled, court slot released, wallet refunded

This is correct, production-safe, and well-isolated. The Compensation Pattern is a valid architectural choice — not a workaround.

## Future Enhancement

In a future version, `BookingService.createBooking()` could optionally accept an existing database connection, allowing the scheduling engine to orchestrate a single atomic transaction:

```
BEGIN TRANSACTION
  BookingService.createBooking(conn)   ← uses caller's connection
  Create Coach Session                 ← same transaction
  Link Booking                         ← same transaction
COMMIT
```

If any step fails, a simple `ROLLBACK` undoes everything — no compensation needed.

## Why This Is a Future Enhancement (Not Technical Debt)

| Dimension | Assessment |
|-----------|------------|
| Current correctness | Compensation pattern is correct and tested |
| Current isolation | Scheduling engine depends on Booking via service interface only |
| Shared transaction benefit | Simplifies rollback logic, eliminates compensation handler |
| Shared transaction cost | Adds internal coupling between Scheduling and Booking connection lifecycle |
| Maturity required | Should wait until scheduling engine is battle-tested in production |
| Scope | Moderate refactor — `createBooking` gains optional `conn?` parameter, all existing callers unaffected |

## Existing Precedent

The pattern already exists in `BookingService.fulfillBookingIntent()`:

```typescript
async fulfillBookingIntent(intentId: number, connArg?: mysql.PoolConnection) {
    const ownsTx = !connArg;
    // ... uses connArg if provided, else creates own connection + transaction
```

The payment service already uses it: `bookingService.fulfillBookingIntent(intentId, conn)` — passing an external connection so the payment callback and booking fulfillment share one transaction.

This proves the idiom works. Extending it to `createBooking()` is a known pattern, not an experiment.

## When to Implement

Implement when:

- The scheduling engine has been in production for several months
- Compensation failures have been documented and analyzed
- A single developer can do the refactor in one focused session
- The benefit (simpler rollback) clearly outweighs the cost (increased coupling)

---

*Documented: July 2026*
*Scheduling Engine Milestones 1–6 complete*
*326/326 tests passing, 0 TypeScript errors*

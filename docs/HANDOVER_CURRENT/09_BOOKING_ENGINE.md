# 09 — BOOKING ENGINE DEEP AUDIT

**Audit:** 2026-10-04 · Sources: `module/booking/{}` (service, domain, workers), `bookings` schema (live), `server.ts` cron.

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL · ⏳ NOT IMPLEMENTED · ❌ ISSUE · ❓ UNVERIFIED

---

## 1. Lifecycle & statuses (verified)

`bookings.booking_status` ENUM:
`pending` → `pending_payment` → `confirmed` → `checked_in` → `completed` ; alternatives `cancelled`, `expired`, `no_show`.

`bookings.payment_status` ENUM:
`pending`, `paid`, `refunded`, `partially_refunded`, `failed`, `penalty`.

`CANCELLABLE_BOOKING_STATUSES` (`booking-constants.ts`): `pending`, `pending_payment`, `confirmed`, `checked_in`.

## 2. Lifecycle step-by-step (code refs)

| Step | Entry point | Code |
|---|---|---|
| Availability | getAvailability, getResourceSlots | `booking.service.ts:1393/1397` |
| Slot calculation | `domain/slot-generator.ts` (has unit tests) | production |
| Booking window | `domain/booking-window.policy.ts` + `assertPlayerBookingWindow` (branch TZ) | `:200` |
| Pricing | `domain/pricing-engine.ts` + `computeBookingEconomics` | `:3151` |
| Create | `createBooking(input,userId)` | `:265` |
| Gateway prepare | `prepareGatewayBooking`, `confirmBookingFromPrepare` | `:613/:609` |
| Payment link | payment module (`/payments/charge`) → listener `booking-payment.listener.ts` | server.ts |
| Check-in | `checkIn` | `:2372` |
| Status update | `updateBookingStatus`, `updatePaymentStatus` | `:2412/:2771` |
| Cancel (player) | `cancelBooking` | `:975` |
| Cancel (provider) | `cancelBookingByProvider` | `:1093` |
| Compensation | `compensateFailedBooking` | `:1061` |
| Availability for org users | `canAccessOrganisation`, `getOrganisationBookings` | `:1175/:965` |
| Matchmaking | `startMatchmaking`, applyToBooking, respondToApplicant | `:2816+` |
| Recurring series | `createRecurringSeries`, preview, list, cancel | `:1795/:1573/:2255/:2309` |

## 3. Booking → payment transitions (verified flow)

1. `createBooking` → `pending` (unpaid).
2. If gateway: `prepareGatewayBooking` → `pending_payment`; payment created in `payment_transactions` with `reference_type='booking'`, `reference_id=booking.id`.
3. Webhook `payment:succeeded` → `booking-payment.listener.ts` marks booking `paid`/`confirmed`; emits events; entitlement-booking worker releases `financial_entitlements` (`bull:entitlement-booking-confirmed` observed in Redis).
4. Failure → `payment:failed` → `compensateFailedBooking` (cancel + conditional refund).
5. Expiry: `cancel_expired_bookings` worker (2-min) expires `pending_payment` bookings older than 15 min (payment timeout 15-min by `expireStalePayments`).
6. Completion: `auto_complete_bookings` worker (5-min) → `completed`.
7. Cancellation: `booking_cancellations` row (UNIQUE booking_id), `refund_status pending|processed|skipped`; cancellation policies from org/branch `cancellation_*` config snapshots.

## 4. Concurrency & double-booking prevention

- **Detected behavior:** availability check reads `booking_slots.is_available`; booking insert under application transaction. 
- **Verified:** `bookings.series_id+booking_date+start_time` UNIQUE only for recurring occurrences; no explicit `SELECT … FOR UPDATE` was found in the inspected booking service path (❓ — I audited method names, not every SQL line).
- Concurrency mitigation present: optimistic `bookings.version`/`aggregate_version`.
- **Risk:** two simultaneous non-series bookings for the same resource+slot could both see the slot free and both insert. **The schema has no unique constraint on (resource_id, booking_date, slot_start) for standalone bookings** — rely on app-layer lock that I could not prove.
- **Recommended (Phase 2):** add `FOR UPDATE` on slot row during create; add DB unique guard (resource_id, booking_date, start_time, status NOT IN cancelled/expired) or an intent-lock table.

## 5. Time zones & DST

- `bookings.start_at_utc/end_at_utc` are source-of-truth; branch timezone via scheduling; `getLocalBusinessDate` utility; slot generation in branch tz converted to UTC.
- Cron is **UTC by explicit design comment** (BE-6): Cairo DST handled by comparing stored UTC, not by local-time cron.
- ⚠️ No dedicated DST unit suite found (❓) — recommend tests for Cairo DST boundary.

## 6. Workers that touch bookings (verified in server.ts)

- `cancel_expired_bookings` (2 min) — expires pending payments.
- `expire_stale_payments` (2 min, 15-min timeout) — payment side.
- `auto_complete_bookings` (5 min).
- `booking_settlement_eligibility` (5 min) — marks eligible for settlement.
- `saga_repair` (5 min) — orphaned coach bookings cleanup.
- `complaint_*` for marketplace only (not booking).

## 7. Realtime updates

- Socket rooms `booking:{id}` + `user:{id}`; server emission via `socket-publisher.ts` when events map to booking category; frontend `RealtimeCacheUpdater` invalidates booking queries.
- ⚠️ Only pages that call `join:booking` receive realtime updates → MyBookings listing updates via refetch/invalidation (no room); acceptable but leads to small latency.

## 8. Handled vs unhandled edge cases

**Handled (✅):** stale payment expiry; failed payment compensation; abandoned order cleanup (marketplace); recurring occurrence conflicts (alternative court/time suggestions); player booking window; coach-session saga repair; academy holds expiry; cancellation window w/ policy snapshot; refund skip when no charge.

**Unhandled / requires attention (❌/❓):**
- Concurrent standalone double-booking (no verified lock).
- Payment-success arrives **after** booking already expired: ordering not guarded here (circuit via payment status check — ❓).
- Simultaneous cancel + check-in (writes race on `version`).
- Reschedule: `booking:rescheduled` exists in notifications but no reschedule endpoint verified in booking service inventory (🔎 — confirm).
- Late cancellation fee post-payment (fee deposit into booking_cancellations) — logic depends on `cancellation_fee_*` configs (❓ verified columns exist).
- Refund-after-settlement (booking_settlements) — see settlement files.

## 9. Status transition map

```
pending ──payment/confirm──▶ confirmed ──check-in──▶ checked_in ──auto/completed──▶ completed
pending_payment ──paid──▶ confirmed
pending_payment ──expire(15m)──▶ expired
pending / pending_payment / confirmed / checked_in ──cancel──▶ cancelled
confirmed ──no-show(worker?)──▶ no_show
confirmed ──late-cancel──▶ cancelled (+ refund/policy)
paid booking ──refund──▶ payment_status refunded (booking stays completed/cancelled)
```

`no_show` transition source: worker or manual — ❓ not located precisely.

## 10. Open questions for the owner
1. Double-booking protection policy (DB hard guarantee vs app check).
2. Late-cancellation fee business rule (fee %/fixed from `cancellation_fee_*`?).
3. `no_show` behavior (auto-detected?).
4. Is rescheduling an intended feature (event name exists)?
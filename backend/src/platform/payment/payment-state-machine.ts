/**
 * Payment State Machine Specification
 *
 * Statuses:
 *   created     — Payment transaction record created
 *   pending     — Payment initiated with gateway (awaiting confirmation)
 *   processing  — Gateway is processing the payment
 *   paid        — Payment confirmed successfully
 *   failed      — Payment rejected by gateway or expired
 *   cancelled   — Payment cancelled by user or system
 *   expired     — Payment intent expired (timeout)
 *   refunded    — Payment refunded after being paid
 *
 * Allowed transitions:
 *   (none)      → created        createPayment / charge()
 *   created     → pending        gateway initiated (redirect to Paymob)
 *   created     → cancelled      user cancels before payment
 *   pending     → processing     gateway confirms processing
 *   pending     → paid           webhook confirms payment
 *   pending     → failed         gateway rejects payment
 *   pending     → expired        payment timeout / expiry worker
 *   processing  → paid           gateway confirms payment
 *   processing  → failed         gateway rejects payment
 *   paid        → refunded       admin initiates refund
 *   pending     → cancelled      user cancels pending payment
 *
 * Forbidden transitions:
 *   created     → paid           (must go through pending)
 *   created     → refunded       (cannot refund unpaid)
 *   failed      → paid           (cannot un-fail)
 *   cancelled   → paid           (cannot un-cancel)
 *   expired     → paid           (cannot un-expire)
 *   paid        → paid           (no double-payment)
 *   refunded    → paid           (cannot un-refund)
 *   refunded    → failed         (refund is terminal)
 *
 * Validation rules per transition:
 *   pending → paid:
 *     - gateway_reference must match gateway response
 *     - amount must match expected amount
 *     - duplicate webhook must be rejected (idempotency)
 *     - booking must still be in 'pending' status
 *
 *   paid → refunded:
 *     - refund must be initiated by authorized user
 *     - refund amount must not exceed paid amount
 *     - wallet must be credited if wallet payment
 *     - booking cancellation must be coordinated
 *
 *   pending → failed:
 *     - failure reason must be recorded
 *     - associated booking/intent must be cancelled
 *
 *   pending → expired:
 *     - payment timeout exceeded
 *     - associated booking/intent must be expired
 */

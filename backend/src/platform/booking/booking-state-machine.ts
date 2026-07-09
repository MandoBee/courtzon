/**
 * Booking State Machine Specification
 *
 * Statuses:
 *   pending       — Booking created, awaiting payment or confirmation
 *   confirmed     — Booking confirmed (payment received or COD accepted)
 *   completed     — Booking finished (past end time)
 *   cancelled     — Booking cancelled (by user, admin, or expiry)
 *   cancelled_with_fee — Booking cancelled with penalty fee
 *   no_show       — User did not show up
 *   checked_in    — User checked in at venue
 *   expired       — Booking expired (payment-first intent timed out)
 *
 * Allowed transitions:
 *   (none)        → pending       createBooking / fulfillBookingIntent
 *   pending       → confirmed     payment received / admin confirms / COD accepted
 *   pending       → cancelled     user cancels / admin cancels / expiry worker
 *   pending       → expired       payment-first intent timeout
 *   confirmed     → completed     auto-complete worker / admin completes
 *   confirmed     → cancelled     user cancels (within window) / admin cancels
 *   confirmed     → cancelled_with_fee  user cancels (fee applies)
 *   confirmed     → checked_in    user checks in at venue
 *   confirmed     → no_show       admin marks no-show
 *   checked_in    → completed     auto-complete / admin completes
 *   cancelled     → (terminal)
 *   cancelled_with_fee → (terminal)
 *   no_show       → (terminal)
 *   completed     → (terminal)
 *   expired       → (terminal)
 *
 * Forbidden transitions:
 *   pending       → completed     (must go through confirmed first)
 *   pending       → checked_in    (must go through confirmed first)
 *   cancelled     → confirmed     (cannot un-cancel)
 *   cancelled     → completed     (cannot complete a cancelled booking)
 *   no_show       → confirmed     (cannot un-no-show)
 *   completed     → confirmed     (cannot un-complete)
 *   expired       → confirmed     (cannot un-expire)
 *
 * Required validations per transition:
 *   pending → confirmed:
 *     - payment_status must be 'paid' OR payment_method is 'cash'/'cod'
 *     - booking must not be already confirmed
 *
 *   pending → cancelled:
 *     - cancellation reason required
 *     - if payment was made, refund must be initiated
 *
 *   confirmed → cancelled:
 *     - cancellation window check
 *     - cancellation fee calculation
 *     - refund processing if payment_status is 'paid'
 *
 *   confirmed → completed:
 *     - booking end time must be in the past
 *     - payment must be settled
 *
 *   confirmed → checked_in:
 *     - must be within valid check-in window
 */

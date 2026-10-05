# 20 — BUSINESS RULES MASTER DOCUMENT

**Audit:** 2026-10-04 · Each rule is traceable to code/schema. ⚖️ = needs business-owner clarification.

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL/AMBIGUOUS · ⚖️ DECISION REQUIRED · ❌ NOT IMPLEMENTED

---

## R1 — Booking window per branch
- Current: `booking-window.policy.ts` + `assertPlayerBookingWindow` (branch timezone; player/org windows).
- DB: `bookings.start_at_utc`, `resources`/`branches` config.
- Status: ✅.

## R2 — Pricing & commission
- Current: `pricing-engine.ts` computes total/tax/commission/net/club; commission rate from org/branch config snapshot on booking.
- DB: `bookings.commission_rate/commission_amount/net_amount/club_amount`.
- ⚖️ Q: commission % source of truth (org-setting vs product vs default).

## R3 — Cancellation policy + fee
- Current: `cancellation_policy_snapshot` JSON on booking; org/branch `cancellation_before_hours`, `cancellation_fee_percentage`, `cancellation_fee_fixed`, `cancellation_policy_level (organisation|branch)`.
- Workers/servicer apply on cancel (`cancelBooking`, `cancelBookingByProvider`).
- ⚖️ Q: exact precedence + refund basis (amount charged vs gross).

## R4 — Payment expiry (15 min)
- Current: `expireStalePayments` timeoutMinutes=15 (`payment-cron.worker`), `cancel_expired_bookings` (2-min sweep) for pending_payment.
- DB: `payment_transactions.expired_at`.
- Status: ✅.

## R5 — Booking completion (auto + manual)
- Current: `auto_complete_bookings` worker 5-min.
- ⚖️ Q: definition of completion (time passed vs check-in).

## R6 — Membership plan versioning
- New G11.22: plan→version→activity→supersede/archive; snapshot on subscription; branch scope ALL/SELECTED; renewal anniversary|fixed_date.
- ⚖️ Q: can a player subscribe to a superseded version? (code supports multiple active? confirm UI).

## R7 — Membership installments
- P2: first installment paid+finalized ⇒ active; overdue doesn't deactivate; one invoice covers full; cancellation voids future unpaid; refund separate op.
- DB: `organisation_membership_settings.cancellation_refund_policy` JSON.
- Status: ✅ implemented; ⚖️ Q: overdue→grace→deactivation policy.

## R8 — Entitlements release timing
- Booking: on payment success (AVAILABLE immediately). Tournament: card after gateway settlement; cash after draw lock (`tournament_entitlement_activation`). Marketplace: on confirmed. Membership: on paid installment.
- Status: ✅ implemented; 🟡 settlement release (0 rows) unproven.

## R9 — Settlement direction & fees
- `settlement_direction` courtzon_to_org / org_to_courtzon; fees: courtzon_fee, COD fee total, online net, shipping.
- ⚖️ Q: who pays shipping refunds? who bears gateway fees on refunds?

## R10 — Marketplace cash custody
- `orders.cash_holder` ENUM org|courtzon; default org when cash/COD.
- ⚖️ Q: consistent per-org policy?

## R11 — Refere costs
- `accounting_event_mapping_lines` for settlement_paid both directions; refund expense mapping exists.
- Status: ✅ seeded; 🟡 unexecuted.

## R12 — Wallet withdrawal workflow
- Multi-state: pending → under_review → approved/rejected/processing/completed/cancelled; SLA fields.
- Status: ✅.

## R13 — Organisation access model
- `organisations.access_model` PUBLIC_CLUB|MEMBERSHIP_CLUB; `branch_player_access`.
- ⚖️ Q: does MEMBERSHIP_CLUB restrict VIEWING or only booking? (columns exist; enforce site?)

## R14 — No-shows
- `booking_status` includes `no_show`.
- ❌ Auto-detection worker not found; manual setting only? (❓ verify UI action).

## R15 — Late-cancel & refund policy (G11.22)
- JSON policy `{"cancellation":{"void_future_unpaid":true},"refund":{"type":"none|full|proportional|before_start_only","window_days_before_start":0}}`.
- Status: ✅ schema; enforcement in P2 services.

## Rules requiring owner decisions (⚖️ — explicit)
1. R2 commission source; R3 refund basis; R4 confirm 15-min; R6 superseded-version purchase; R7 overdue policy; R9 fee allocation; R10 cash custody; R13 MEMBERSHIP_CLUB semantics; R14 no-show detection; R-

## Rules NOT implemented (❌)
- Org-subscription trial period & failed-payment grace (only expire/remind).
- Marketplace free-listing enforcement (`seller_profiles.max_free_listings` default 5) — enforce at create?
- CSRF (technical policy, not business).
- 2FA (event exists; no flow).
- Phone OTP verification.

## How to use this document
Treat as the **source-of-truth rule index**; each row is traceable. When business changes a rule, edit here + the code/DTO/schema per row.
# 13 — SUBSCRIPTIONS & MEMBERSHIPS AUDIT

**Audit:** 2026-10-04 · Sources: `modules/membership/*`, `modules/organisations/*` (org subscription), schema M190–194, live counts.

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL · ⏳ NOT RUN/❌ GAP · ❓ UNVERIFIED · ⚖️ BUSINESS DECISION

---

## 1. Two membership domains

### 1.1 Legacy memberships
- ✅ Tables: `membership_plans`, `membership_benefits`, `memberships`, `user_memberships`, `membership_history`.
- ✅ Workers: `expire_memberships` (00:30 UTC), `send_membership_reminders` (08:30 UTC); events: `membership:expiring|expired|renewed|upgraded|activated` etc. (notification engine).
- ⚠️ Coexists with G11.22 — which is canonical? (⚖️ business decision).

### 1.2 NEW G11.22 (P1–P3) — the versioned commercial model
- ✅ **Plans/versions:** `membership_plans` + `membership_plan_versions` (status draft/active/superseded/archived; `renewal_model` anniversary|fixed_date; `duration_type` monthly/quarterly/semi_annual/annual; `branch_scope` ALL/SELECTED; `grace_days`; `initial_charge_type` full|percentage; `installments_enabled`).
- ✅ **Components:** `membership_plan_components`, `membership_plan_branches`, `organisation_membership_settings` (enabled durations, allowed payment methods, `cancellation_refund_policy` JSON).
- ✅ **Subscription (immutable snapshot):** `membership_subscriptions` — `*_snapshot` columns, `total_amount`, commission snapshots, `payment_status` unpaid/paid/partially_paid/refunded, `payment_method`, `invoice_id`, `renewal_of_subscription_id`.
- ✅ **Installments (P2):** `membership_plan_installment_templates` + `membership_installments` (seq, amount, commission, due_date, status pending/paid/overdue/voided/refunded, `payment_transaction_id`).
- ✅ **Entitlements (P3):** `financial_entitlements.source_type='membership'` + entitlement-membership listener/worker.
- ✅ **Lifecycle services:** subscription, installment, renewal, cancel/refund, eligibility, lifecycle sweeps.
- ✅ **Workers:** `membership_subscription_expiry` (00:40), `membership_installment_overdue` (00:45), `membership_subscription_reminders` (08:45).
- ✅ **API:** `membership-p1.routes.ts` (settings, plans, versions, activate/archive, subscriptions list, confirm-cash, complete-card, P2 installments/eligibility/renew/cancel/refund) + player endpoints (`/organisations/:orgId/membership/plans-active`, `POST /organisations/:orgId/membership/subscriptions`, `/my/membership/subscriptions*`).
- ✅ **Realtime events** defined in notification engine for membership (expiring/installment-due/overdue/grace/renewal/cancelled/refunded, etc.).
- ⏳ **LIVE STATUS: not exercised** — `membership_plan_versions` 0, `membership_subscriptions` 0, `membership_installments` 0.

## 2. Org subscriptions (billing of the org itself)

- ✅ `organisation_subscriptions` (billing_cycle monthly/yearly; status active/suspended/pending/expired/cancelled; auto_renew; plan_snapshot).
- ✅ Workers: `expire_subscriptions` (00:15 UTC), `send_subscription_reminders` (08:00 UTC).
- ⏳ **No trial periods, no failed-payment grace, no downgrade path** — only expire/remind. (⚖️ owner decision.)
- ✅ Notification events: `organisation:subscription-expiring|expired|renewed`, `subscription:request-*`.

## 3. Lifecycle gaps

| Area | Status |
|---|---|
| Activation on payment | ✅ P1 listener (`membership-p1.listeners.ts`) finalizes on `payment:succeeded` refType=membership_subscription |
| Renewal | ✅ `renewSubscriptionHandler` + renewal service |
| Grace | ✅ `grace_until` + `membership_subscription_expiry` worker |
| Failed payment | ✅ overdue marked; ⚠️ business policy on grace after overdue (⚖️) |
| Cancellation | ✅ `cancelSubscription` voids future unpaid installments |
| Refund | ✅ `refundInstallmentsHandler` separate from cancel (P2 rule) |
| Entitlement release | ✅ via financial_entitlements (P3) — **never run** |
| Accounting | ✅ payment→ledger mapping exists (`membership` source_type), **1715 legacy rows unexplained** (see 11-A3) |
| App UI | 🟡 org membership settings/plans/subscriptions pages + player storefront + my subscriptions pages exist — **never validated live** |

## 4. Business rules requiring owner confirmation
1. Canonical membership domain (legacy vs G11.22) for the platform going forward.
2. Commission: membership plans carry commission? Where collected (upfront vs per installment)?
3. Grace period default days & whether late installments extend entitlement.
4. Refund window rules after cancellation (P2: cancel-and-refund are separate ops — policy?).
5. Fixed-date renewal alignment in leap years / 29-30-31 (see 20/22).
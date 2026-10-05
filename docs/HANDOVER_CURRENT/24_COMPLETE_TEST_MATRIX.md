# 24 — COMPLETE TEST MATRIX

**Audit:** 2026-10-04 · Master testing plan. Priorities: P0 critical, P1 high, P2 medium, P3 low. Column "Status" = currently covered by tests? (A=Automated exists, M=Manual required, N=None).

Format per row: **ID | Module | Scenario | Precondition | Steps | Expected | DB Exp | Accounting Exp | Event Exp | Realtime Exp | Priority | Automatable | External?**

---

## A. Booking

| ID | Scenario | Steps (key) | Expected | DB | Acct | Events/RT | Prio | Auto? | Ext? |
|---|---|---|---|---|---|---|---|---|---|
| BK-01 | Availability load + slot calc | GET slots for date | slots match schedule tz | booking_slots | — | — | P0 | A | N |
| BK-02 | Single booking cash | create→confirm-cash | booking confirmed | status confirmed | posting booking | booking:confirmed + RT | P0 | A | N |
| BK-03 | Single booking card (mock gateway) | create→charge(mock)→webhook | paid→confirmed | paid | posting card | payment:succeeded | P0 | A | M (mock) |
| BK-04 | Payment expiry | charge pending→wait 15m | expired | expired | none | booking:expired | P0 | A | N |
| BK-05 | Late webhook after expiry | delay webhook>15m | reconcile/refund decision | status | reversal | — | P0 | M | M |
| BK-06 | Duplicate webhook | send twice | single confirm | 1 paid | single posting | dedup | P1 | A | M |
| BK-07 | Double-booking race | 2 parallel same slot | one wins | 1 active | — | — | P0 | M(race) | N |
| BK-08 | Cancel within window | cancel→refund | cancelled+refund | booking_cancellations processed | reversal | booking:cancelled | P0 | A | N |
| BK-09 | Late cancel fee | fee config | fee retained | fee col | fee posting | — | P1 | M | N |
| BK-10 | No-show | mark | no_show | status | — | booking:no-show | P2 | M | N |
| BK-11 | Check-in → auto-complete | worker | completed | status | — | booking:completed | P2 | A | N |
| BK-12 | Recurring series weekly | create → occurrences pay | occurrences + allocations | booking_series + payment_allocations | allocation posting | — | P1 | A | N |

## B. Payments

| ID | Scenario | Steps | Expected | DB | Acct | Events/RT | Prio | Auto? | Ext? |
|---|---|---|---|---|---|---|---|---|---|
| PY-01 | Wallet charge | charge wallet | balance debited | wallet_transactions | wallet | payment:succeeded | P0 | A | N |
| PY-02 | Insufficient wallet | charge > balance | 4xx | none | none | — | P0 | A | N |
| PY-03 | Card intent + webhook | mock gateway | processing→paid | payment_transactions | card posting | — | P0 | A | M |
| PY-04 | Webhook bad HMAC | wrong signature | rejected | none | none | — | P0 | M | M |
| PY-05 | Refund full | refund | refunded | payment status | reversal | payment:refunded | P0 | A | M |
| PY-06 | Refund partial | partial amount | partial refunded | status partial | partial reversal | — | P1 | M | M |
| PY-07 | Refund twice | refund again | blocked | no double | no double | — | P1 | A | N |
| PY-08 | Reconciliation run | /payments/reconciliation/run | matches | no mismatch logs | — | — | P1 | M | M |
| PY-09 | Expire stale | 15-min timeout | expired | status | none | — | P1 | A | N |
| PY-10 | Recover payment | recover gatewayReference | reconciled | status | — | — | P2 | M | M |

## C. Accounting / Ledger

| ID | Scenario | Steps | Expected | DB | Acct | Events/RT | Prio | Auto? | Ext? |
|---|---|---|---|---|---|---|---|---|---|
| AC-01 | Booking posting balance | create+pay+cancel | debits=credits | ledger_entries | balance | — | P0 | A | N |
| AC-02 | Marketplace posting | checkout+pay+refund | entries incl. fee/tax | marketplace_ledger_entries | fee/tax | — | P0 | M | N |
| AC-03 | Membership posting | subscribe+pay+refund | entries source membership | ledger_entries | — | — | P0 | M | N |
| AC-04 | Replay completeness | trigger accounting-replay | no dupes | uk_dedup | — | — | P1 | M | N |
| AC-05 | GL projection | after posting | general_ledger row | GL | — | — | P1 | A | N |
| AC-06 | Trial balance report | query reports | sums to 0 | — | — | — | P1 | M | N |

## D. Membership G11.22

| ID | Scenario | Steps | Expected | DB | Acct | Events/RT | Prio | Auto? | Ext? |
|---|---|---|---|---|---|---|---|---|---|
| MS-01 | Create plan + version + activate | org admin flow | active version | plan_versions | — | — | P0 | M | N |
| MS-02 | Purchase cash | subscribe→confirm-cash | subscription active | subscriptions + installments | — | membership:payment-received | P0 | M | N |
| MS-03 | Purchase card | complete-card | active | same | posting | payment:succeeded | P0 | M | M |
| MS-04 | Installments schedule | n=2 dues | 2 installments | installments | — | installment-due | P1 | M | N |
| MS-05 | Overdue sweep | day passes | overdue | status | — | installment-overdue | P1 | M | N |
| MS-06 | Grace + expiry | end date | grace → expired | status | — | grace/expiry | P1 | M | N |
| MS-07 | Cancel (void future) | cancel | cancelled | future voided | — | membership:cancelled | P1 | M | N |
| MS-08 | Refund installments | refund | refunded | status | reversal | membership:refunded | P1 | M | N |
| MS-09 | Entitlement release P3 | installment paid | entitlement AVAILABLE | financial_entitlements | — | — | P1 | M | N |
| MS-10 | Fixed-date renewal / leap | fixed_date 31 | correct | — | — | — | P2 | M | N |

## E. Marketplace

| ID | Scenario | Steps | Expected | DB | Acct | Events/RT | Prio | Auto? | Ext? |
|---|---|---|---|---|---|---|---|---|---|
| MP-01 | Product CRUD | seller | Publish | products status | — | — | P0 | A | N |
| MP-02 | Cart reservation + expiry | add→wait reserved_until | released | cart_items | — | — | P1 | M | N |
| MP-03 | Checkout split per seller | 2 sellers | 2 orders | orders/order_items | — | marketplace:order-* | P0 | M | N |
| MP-04 | Stock race (2 buyers) | parallel checkout | 1 fulfilled | stock | — | — | P0 | M | N |
| MP-05 | Cash order custody | COD | cash_holder org | orders | — | — | P1 | M | N |
| MP-06 | Order refund + settlement status | refund | settlement_status updated | order_items | reversal | order-refunded | P1 | M | N |
| MP-07 | Complaint flow + escalation | submit→…→decision | resolved/refund | complaints | — | complaint-* | P2 | M | N |
| MP-08 | Seller settlement request | after delivered | settlement created | settlements (first live) | — | — | P0 | M | N |

## F. Tournaments

| ID | Scenario | Steps | Expected | DB | Acct | Events/RT | Prio | Auto? | Ext? |
|---|---|---|---|---|---|---|---|---|---|
| TN-01 | Create + public discovery | public tournament | visible | tournaments.is_public | — | — | P1 | A | N |
| TN-02 | Register + pay | member-only free/paid | registration paid | registrations | posting | registration-paid | P0 | A | N |
| TN-03 | Duplicate registration | same player twice | blocked | unique | — | — | P0 | A | N |
| TN-04 | Entitlement activation timing | card vs cash | PENDING→AVAILABLE | entitlements | — | tournament_entitlement_activation | P1 | A | N |
| TN-05 | Prize payout (2nd/3rd) | create awards | correct | prize_awards | posting | prize-awarded | P1 | A | N |
| TN-06 | Refund request + decision | before draw | refunded | refund_requests | reversal | refunded | P1 | M | N |

## G. Subscriptions (org) & Wallet

| ID | Scenario | Steps | Expected | DB | Acct | Events/RT | Prio | Auto? | Ext? |
|---|---|---|---|---|---|---|---|---|---|
| SU-01 | Org subscription + expire | create→expire | suspended/expired | org_subscriptions | — | subscription-expired | P2 | M | N |
| WL-01 | Wallet deposit card | topup | balance+tx | wallet | wallet topup posting | wallet:deposit | P0 | A | M |
| WL-02 | Withdrawal workflow | request→approve→complete | completed | withdrawal_requests | withdrawal posting | wallet:withdrawal-* | P1 | M | N |
| WL-03 | Withdrawal reject | reject | reversed | status | reversal | rejected | P1 | M | N |

## H. Security / Tenancy / RBAC

| ID | Scenario | Steps | Expected | DB | Acct | Events/RT | Prio | Auto? | Ext? |
|---|---|---|---|---|---|---|---|---|---|
| SE-01 | Cross-org read | user A reads org B booking | 403 | — | — | — | P0 | A | N |
| SE-02 | Rate limit brute-force | 6 bad logins | locked | login_attempts | — | security:account-locked | P0 | A | N |
| SE-03 | Permission denial | role without perm | 403 | — | — | — | P0 | A | N |
| SE-04 | Frontend/backend mismatch | admin nav w/o perm | hidden + blocked | — | — | — | P1 | M | N |
| SE-05 | Webhook HMAC invalid | bad signature | rejected | none | none | — | P0 | M | M |
| SE-06 | Suspicious login detection | flagged login | alert | user_sessions.suspicious | — | security:suspicious-login | P2 | M | N |

## I. Notifications / Realtime / PWA

| ID | Scenario | Steps | Expected | DB | Acct | Events/RT | Prio | Auto? | Ext? |
|---|---|---|---|---|---|---|---|---|---|
| NT-01 | Payment notification | pay → receive | in-app notify | notifications/delivery | — | socket user:{id} | P0 | A | N |
| NT-02 | Two-window booking update | book in A, see in B | live update | — | — | socket booking | P0 | M | N |
| NT-03 | Reconnect re-join rooms | drop socket | resubscribed | — | — | reconnect | P2 | M | N |
| NT-04 | Digest run | trigger digest | digest rows | delivery | — | trigger_digest | P2 | A | N |
| NT-05 | Push mock delivery | push event | "delivered" mock | delivery | — | — | P3 | M | N |
| NT-06 | Offline banner + PWA | offline simulate | banner + shell | — | — | — | P3 | M | N |

## J. Data consistency sweeps

| ID | Scenario | Steps | Expected | DB | Acct | Events/RT | Prio | Auto? | Ext? |
|---|---|---|---|---|---|---|---|---|---|
| CS-01 | GL balance nightly check | run checker | zero imbalance | ledger | — | — | P0 | A | N |
| CS-02 | Entitlement ↔ settlement audit | availability vs settlements | consistency | entitlements | — | — | P0 | M | N |
| CS-03 | Payment ↔ ledger reconcile | gateway vs postings | match | transactions | — | — | P0 | M | M |

**Notes:** A-column means a test exists today; M = mandatory manual UAT (see 00 final / 36 roadmap). Replace M with A as suites are built.
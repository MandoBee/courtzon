# 34 — ACCOUNTING EVENT MATRIX

**Audit:** 2026-10-04 · Master financial event matrix (verified against code & seeds; where exact CoA code unknown → semantic account + ❓).

Status: ✅ verified path · 🟡 implemented-but-unexecuted · ❌ missing.

---

| # | Business Event | Trigger | DEBIT | CREDIT | Amount source | When posted | Tables | Reversal / Refund | Settlement | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| E01 | Booking payment (card/cash) | `payment:succeeded` (ref booking) | Clearing (bank/cash) | Platform commission + Org earning | booking snapshots (total, tax, commission, net, club) | confirm | `ledger_entries`,`general_ledger`,`financial_entitlements` | refund reverses itemized | entitlement AVAILABLE | ✅ |
| E02 | Booking refund | `payment:refunded` / cancel | Org earning + commission reversal | Clearing | booking_cancellations.refund_amount | process refund | same + `booking_cancellations` | idempotent dedup | entitlement CANCELLED | ✅ |
| E03 | Booking failure | `payment:failed` | none (no posting) | — | — | — | `ledger_entries` (payment_failure map) | — | — | ✅ |
| E04 | Wallet topup (card) | `payment:succeeded` (ref wallet_topup) | Clearing | Wallet liability | wallet_transactions.amount | confirm | `ledger_entries`+`wallet_transactions` | refund→wallet debit | — | ✅ |
| E05 | Wallet payment (booking via wallet) | `payment:succeeded` (method wallet) | wallet debit; booking posting | Clearing + commission + earning | amount | confirm | ledger | — | — | ✅ |
| E06 | Marketplace order confirmed | `payment:succeeded` (ref order) | Clearing | Tax liability + Shipping payable + Org net (2202) + Platform fee + commission | OrderEconomics (gross−discount−commission; tax; shipping) | confirm | `marketplace_ledger_entries`,`ledger_entries`,`financial_entitlements` | refund calc reverses | order settlement_status pending | ✅ (0 live) |
| E07 | Marketplace refund | refund decision | reverse fee/commission/net | Clearing | marketplace-refund-calc | refund | same | — | in_dispute → wait | 🟡 |
| E08 | Marketplace complaint / collection | escalation workers | fee recovery | org payable/refund hold | complaint config | decision | `platform_accounts` (refund_hold) | — | — | 🟡 |
| E09 | Withdrawal request | `wallet:withdrawal-*` | Wallet liability | Bank/Payout (approved→completed) | withdrawal_requests.amount | approval/execution | `wallet_transactions`,`withdrawal_requests` | reject reverses | — | ✅ |
| E10 | Membership subscription paid | `payment:succeeded` (ref membership_subscription) | Clearing | Membership revenue (platform share) + org/entitlement | subscription snapshot (total, commission, org_net) | finalize | `ledger_entries` (source_type membership) | refund separate op; void future | entitlement P3 | 🟡 (0 live) |
| E11 | Membership installment overdue | sweep 00:45 | none | — | — | — | `membership_installments` status | void on cancel | — | 🟡 |
| E12 | Settlement paid | settlement approved/paid | Org payable | Clearing/bank | settlement.final_amount | paid | `settlements`,`settlement_transfers`,`ledger_entries` (settlement source) | correction service | SETTLED | 🟡 (0 live) |
| E13 | Gateway settlement batch | batch created/confirmed | org net arrears → clearing bank | gateway net | gateway_settlement_transactions | batch | `gateway_settlements`,`transactions` | reversal | — | 🟡 (0 live) |
| E14 | Invoice issue / paid | invoice issued/paid | A/R receivable / Cash | Revenue | invoices | issue/paid | `invoices`,`invoice_items`,`ledger_entries` (invoice) | credit note | — | 🟡 (0 live) |
| E15 | Year close | year close | income→equity, balances | — | fiscal | close | `year_closings`,`year_close_cycles` | reopen | — | ❓ no flow found |
| E16 | Tax on order | tax resolution service | Tax liability asset/liability per rate | Tax | tax_amount | confirm | `ledger_entries`,`tax_rates` | refund reversal | — | 🟡 |

**Posting path (all rows):** EventBus → `accounting-event.listener.ts` (per-entity mutex + `uk_dedup`) → `accounting-engine.service.ts` → `ledger_entries` (debit+credit, balance validated) → `gl-projection.service.ts` → `general_ledger`. Durable replay via `accounting-replay` queue.

**Gaps / confirmations needed**
- E05 wallet-payment double-posting? (booking E01 + wallet topup E04) — verify single coalescing.
- E12 settlement mapping uses seeded `settlement_paid` + `settlement_org_receipt` lines — confirm target CoA codes with accountant.
- E15 year-close unused (❓).
- `financial_journal_entries` never written — all rows above use `ledger_entries`.

**Owner/accountant decisions**
1. Confirm CoA account codes for E01/E10/E12 (platform vs org split).
2. Refund direction for gateway fees (org bears? platform reimburses?).
3. Settlement cadence (period vs on-demand).
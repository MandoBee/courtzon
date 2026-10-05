# 11 — ACCOUNTING SYSTEM DEEP AUDIT

**Audit:** 2026-10-04 · Sources: `modules/financial/*`, `modules/accounting/*`, `database/seeds/004–006`, live ledger counts.

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL · ⏳ UNUSED/NOT RUN · ❌ ISSUE · ❓ UNVERIFIED

---

## 1. Chart of Accounts (verified)

- Table `chart_of_accounts` (141 rows live): `code`, `name`, `type` ENUM(asset, liability, equity, revenue, expense, contra_*), `normal_side` ENUM(debit,credit), `parent_id`, `org_code_scope` auto UNIQUE trigger, `uk_org_code`.
- Seeds:
  - `004_chart_of_accounts.sql` — structural + posting accounts (REVENUE-COURT, EXPENSES-GENERAL, ASSETS-CASH, LIABILITIES-PAYABLES).
  - `005_accounting_defaults.sql` — `accounting_event_mapping_lines` for wallet_topup, card_payment, wallet_payment, card_refund, wallet_refund, cod_payment, marketplace_delivery, marketplace_reversal, withdrawal_request/completion, settlement_paid, payment_failure, invoice_issue/invoice_payment, settlement_org_receipt.
  - `006_account_templates.sql` — 3 templates (`sports_club`, `sports_club_academy`, `sports_club_marketplace`) + 26 lines.

## 2. Ledger model (verified)

- `ledger_entries` — event-sourced posting: `source_type` ENUM (booking, academy, membership, marketplace, wallet, subscription, settlement, invoice, tournament, …), `source_id`, `event_type`, `chart_account_id`, `account_type`, `side` debit/credit, `amount`, UNIQUE `uk_dedup(source_type,source_id,event_type,chart_account_id,side)` — **the idempotency backbone**.
- `general_ledger` — projection per period/entry (UNIQUE `uk_gl_ledger_entry`).
- `financial_journal_entries` — **0 rows; unused** (legacy table). ⚠️ Reports/views must not read this.
- `transactions`/`transaction_entries` — platform-account double-ledger (860/1646 rows live).
- `marketplace_ledger_entries` — marketplace-specific postings.

## 3. Accounting engine (verified architecture)

- `accounting-engine.service.ts` orchestrates `createLedgerLines` + `validateLedgerBalance`.
- `accounting-event.listener.ts`: per-entity in-process mutex (`accountingEntityLocks`) to serialize duplicate triggers (payment:succeeded AND booking:paid) → deterministic idempotency, cross-process safety via `uk_dedup`.
- `booking-accounting.service.ts` (bookings), `marketplace-entitlement-calc.ts`/`marketplace-refund-calc.ts`, `tax-resolution.service.ts`, `gl-projection.service.ts`, `position.service.ts`, `wallet-withdrawal-reconciliation.service.ts`, `settlement-correction.service.ts`.
- Durable replay: `registerAccountingReplaySubscribers()` + `createAccountingReplayWorkers()` — `bull:accounting-replay*` queues observed live.

## 4. Posting matrix (central financial events)

| Event | Debit | Credit | Amount source | When | Reversal/refund | Code |
|---|---|---|---|---|---|---|
| Booking card/cash paid | Clearing (bank/cash) | + Commission(platform revenue) + Org earning(payable/entitlement) | booking.commission_amount/ net_amount snapshots | on `payment:succeeded` | payment:refunded reverses itemized | `booking-accounting.service.ts` |
| Booking refund | Org earning + commission reversed | Clearing | booking_cancellations.refund_amount | post cancel | idempotent dedup | refund path |
| Wallet topup | Clearing | Wallet liability | wallet_transactions.amount | on `payment:succeeded` (wallet_topup) | refund → wallet debit | `wallet` source |
| Marketplace order | Clearing | Tax liability + Shipping payable + Org merchendise net (2202) + Commission | OrderEconomics (subtotal−discount−commission; tax; shipping) | after order confirmation | marketplace-refund-calc | `OrderEconomics` in listener |
| Withdrawal completion | Wallet liability | Bank/Payout | withdrawal_requests | approval/execution | reject reverses | wallet-withdrawal-reconciliation |
| Settlement paid | Org payable (entitlements) | Clearing/bank | settlement.final_amount | settlement approved/paid | reversal w/ correction service | `settlement_paid` mapping |
| Payment failure | — (no posting) | — | — | — | — | payment_failure mapping (no-op) |
| Invoice issue/payment | A/R (receivable) / Cash | Revenue | invoices | issue/paid | credit note | invoice mappings |

> Exact account codes come from the seeded CoA + `accounting_event_mapping_lines`. **The matrix above uses semantic accounts (verified); exact DEBIT/CREDIT GL code pairs should be validated by running one flow (accounting reconciliation UAT) — see 34 file for the full event matrix.**

## 5. Trial balance / Income statement / Balance sheet

- ✅ UI exists: OrgAccountingDashboard, OrgFinancialReportsPage, OrgTaxSummaryPage, ReportCenterPage, LedgerViewerPage, ReconciliationPage.
- ❓ Exact report queries vs `ledger_entries` not fully audited; **because `financial_journal_entries` is empty while reports may have been built for it, verify each report's source of truth.**

## 6. Live accounting evidence

- `ledger_entries` 34,816 rows: booking 18,042; marketplace 6,493; settlement 5,600; invoice 2,892; membership 1,715; subscription 74.
- `general_ledger` 45,890.
- `transactions`/`transaction_entries` 860/1,646.
- `financial_entitlements` 33 (booking AVAILABLE org earning 8 + commission 8 + cancelled pair 1+1; tournament PENDING org adjustment 15).
- **`settlements` / `settlement_entitlements` / `gateway_settlements` = 0** → settlement accounting never ran.

## 7. Issues found

| # | Issue | Severity |
|---|---|---|
| A1 | `financial_journal_entries` dormant duplicate — reports must not use it | 🟡 MED |
| A2 | Settlement/clearing postings never produced (0 settlements) | 🟡 HIGH (validation gap) |
| A3 | `membership` ledger entries (1,715) exist without any `membership_subscriptions` → source unclear (possibly legacy paths) — needs reconciliation | 🔴 HIGH investigation |
| A4 | Double-entry balance validated in code (`validateLedgerBalance`) but no automated financial balance test found | 🟡 MED |
| A5 | Marketplace ledger separate (`marketplace_ledger_entries`) vs generic ledger — duplication to reconcile | 🟡 MED |
| A6 | Tax handling seeded but `invoices`=0 → unproven | 🟡 MED |

## 8. Business decisions required
1. Single source of truth for reports: `ledger_entries`+`general_ledger` (recommended) vs `financial_journal_entries`.
2. Settlement accounting target accounts (CoA codes) — confirm with accountant.
3. Membership→ledger historical rows: audit & trace (1715 rows).
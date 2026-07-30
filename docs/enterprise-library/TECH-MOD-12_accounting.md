---
document_id: "TECH-MOD-12"
document_name: "Accounting Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 20
business_owner: "Finance Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-09"]
  related: ["TECH-MOD-10", "TECH-MOD-13"]
---

# Accounting Module (TECH-MOD-12)

**Source:** `backend/src/modules/accounting/` (2 entries: index.ts, presentation/)

## 1. Purpose

Double-entry accounting: chart of accounts with hierarchical codes, accounting periods, general ledger (immutable journal entries), trial balance, income statement, balance sheet, invoice lifecycle, tax rate management. 23 routes.

## 2. Architecture

```
presentation/
  accounting.routes.ts      — 23 endpoints (44 lines)
  accounting.controller.ts  — Request handlers
index.ts                    — Barrel export
```

**Evidence:** `accounting.routes.ts` (44 lines) defines all 23 routes.

## 3. Routes (23)

Defined in `accounting.routes.ts:9-44`:

**Chart of Accounts (3):**
- `GET /admin/accounting/accounts` — List (`accounting.coa.view`)
- `POST /admin/accounting/accounts` — Create (`accounting.coa.manage`)
- `PUT /admin/accounting/accounts/:id` — Update (`accounting.coa.manage`)

**Accounting Periods (4):**
- `GET /admin/accounting/periods` — List (`accounting.periods.view`)
- `POST /admin/accounting/periods/generate` — Generate (`accounting.periods.manage`)
- `POST /admin/accounting/periods/:id/close` — Close (`accounting.periods.manage`)
- `POST /admin/accounting/periods/:id/open` — Open (`accounting.periods.manage`)

**Reports (4):**
- `GET /admin/accounting/trial-balance` — Trial balance (`accounting.gl.view`)
- `GET /admin/accounting/income-statement` — Income statement (`accounting.gl.view`)
- `GET /admin/accounting/balance-sheet` — Balance sheet (`accounting.gl.view`)
- `GET /admin/accounting/ledger/:accountId` — Account ledger (`accounting.gl.view`)

**Journal Entries (2):**
- `POST /admin/accounting/journal` — Create (`accounting.journal.create`)
- `GET /admin/accounting/journal` — List (`accounting.journal.view`)

**Invoices (6):**
- `GET /admin/accounting/invoices` — List (`accounting.invoices.view`)
- `POST /admin/accounting/invoices` — Create (`accounting.invoices.manage`)
- `GET /admin/accounting/invoices/:id` — Get (`accounting.invoices.view`)
- `POST /admin/accounting/invoices/:id/issue` — Issue (`accounting.invoices.manage`)
- `POST /admin/accounting/invoices/:id/record-payment` — Record payment (`accounting.invoices.manage`)
- `POST /admin/accounting/invoices/:id/cancel` — Cancel (`accounting.invoices.manage`)

**Tax Rates (3):**
- `GET /admin/accounting/tax-rates` — List (`accounting.tax.view`)
- `POST /admin/accounting/tax-rates` — Create (`accounting.tax.manage`)
- `PUT /admin/accounting/tax-rates/:id` — Update (`accounting.tax.manage`)

**Processing (1):**
- `POST /admin/accounting/process-events` — Process pending events (`accounting.journal.create`)

## 4. Permissions

`accounting.coa.view`, `accounting.coa.manage` — Chart of Accounts
`accounting.periods.view`, `accounting.periods.manage` — Periods
`accounting.gl.view` — General ledger reports
`accounting.journal.create`, `accounting.journal.view` — Journal
`accounting.invoices.view`, `accounting.invoices.manage` — Invoices
`accounting.tax.view`, `accounting.tax.manage` — Tax rates

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Account | `chart_of_accounts` | `id, code (hierarchical), name, type (asset/liability/equity/income/expense), parent_id, is_active` |
| Period | `accounting_periods` | `id, name, start_date, end_date, status (open/closed/locked)` |
| Journal Entry | `journal_entries` | `id, period_id, entry_date, description, reference_type, reference_id, is_posted` |
| Journal Line | `journal_entry_lines` | `id, entry_id, account_id, debit, credit` |
| Invoice | `invoices` | `id, number, customer_id, status, issue_date, due_date, total, tax_total, grand_total` |
| Tax Rate | `tax_rates` | `id, name, rate_percent, type, is_active` |

## 6. Invoice Lifecycle

```
draft → issued → paid → cancelled
```

- `draft`: Editable, not yet official
- `issued`: Sent to customer, no longer editable
- `paid`: Payment recorded
- `cancelled`: Voided

**Evidence:** `accounting.routes.ts:30-36` has issue, record-payment, cancel endpoints.

## 7. Accounting Periods

States: `open | closed | locked`

- `open`: Transactions can be posted
- `closed`: No new transactions, reports frozen
- `locked`: Final, immutable

**Evidence:** `accounting.routes.ts:16-17` has close/open period endpoints.

## 8. Events

- `accounting:journal_entry_created` — Journal entry posted
- `accounting:period_closed` — Period closed
- `accounting:invoice_issued` — Invoice issued
- `accounting:invoice_paid` — Payment recorded
- `accounting:invoice_cancelled` — Invoice cancelled

## 9. Audit Events

All accounting operations record audit logs via `recordAudit()`.
- `FINANCIAL.TRANSACTION` — When journal entries are created

---
document_id: "TECH-MOD-11"
document_name: "Financial Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 30
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-09", "TECH-MOD-10"]
  related: ["TECH-MOD-12", "TECH-MOD-30"]
---

# Financial Module (TECH-MOD-11)

**Source:** `backend/src/modules/financial/` (6 directories, ~20 files)

## 1. Purpose

Financial ledger management, commission calculation, withdrawal request lifecycle, settlement batch processing. Implements double-entry accounting via `createLedgerPair()`. Integrates with the marketplace settlement module for dispute handling and the wallet module for transactions.

## 2. Architecture

```
domain/
  financial-aggregate.ts   — Withdrawal state machine (5 statuses)
  ledger-aggregate.ts      — LedgerEntry, SettlementBatch, CommissionRule, createLedgerPair()
application/
  ledger.service.ts        — Record transactions, get revenue/settlements
  commission.service.ts    — Commission rate lookup & calculation
  settlement.service.ts    — Settlement batch generation (daily/weekly/monthly)
  transaction.service.ts   — Transaction processing
  financial-admin.service.ts
infrastructure/
  repositories/
    ledger.repository.ts   — Ledger entry CRUD, settlement batches
  transaction.repository.ts — Transaction & entry CRUD
presentation/
  ledger.routes.ts         — 5 admin endpoints (super_admin only)
  transaction.routes.ts    — 3 user-facing endpoints
  financial-admin.routes.ts — Withdrawal mgmt + transaction listing
```

**Evidence:** Directory structure at `modules/financial/`.

## 3. Ledger Service — Double-Entry

`ledger.service.ts:17-34` — `LedgerService.recordTransaction()`:
1. Calls `createLedgerPair()` from `ledger-aggregate.ts:58-74` to create debit/credit pair
2. Validates balance via `validateLedgerBalance()` (both sides must equal)
3. Inserts entries via `ledgerRepository.createEntries()`
4. Emits `ledger.entry.created` event

**Evidence:** `ledger.service.ts:17-34`, `ledger-aggregate.ts:58-74`.

## 4. Withdrawal Request Lifecycle

Defined in `financial-aggregate.ts:1-33`:

```
pending → approved → completed → [terminal]
  ↓          ↓
  └→ rejected → [terminal]
  └→ cancelled → [terminal]
```

| Transition | Allowed From |
|------------|-------------|
| `approved` | `pending` |
| `rejected` | `pending` |
| `completed` | `approved` |
| `cancelled` | `pending`, `approved` |

**Evidence:** `financial-aggregate.ts:9-15` defines `ALLOWED_WITHDRAWAL_TRANSITIONS`. `financial-admin.routes.ts:9-13` exposes approve/reject/complete endpoints.

## 5. Commission Service

`commission.service.ts:67-117` — `CommissionService.calculate()`:
1. Resolves `branchOrOrgId` to organisation ID
2. Gets current subscription plan via `getCurrentSubscription()`
3. Looks up commission rate from `subscription_plan_rates` table using `commissionEntityLookupKeys()`
4. Calculates `commissionAmount = grossAmount * rate / 100` (percentage) or `rate` (fixed)
5. Returns `{ rate, rateType, commissionAmount, netAmount, planName, planId }`

**Evidence:** `commission.service.ts:47-65` (`getRate()`), `:67-117` (`calculate()`).

## 6. Financial Settlement Batches

`settlement.service.ts` — `FinancialSettlementService.generateBatch()`:
1. Retrieves ledger entries within period range
2. Groups by `accountType`/`side` to compute gross, discounts, commissions, refunds
3. Creates `settlement_batches` record
4. Emits `settlement.created` event

Batch types: `'daily' | 'weekly' | 'monthly' | 'manual'`

**Evidence:** `settlement.service.ts:8-61`.

## 7. Transaction Repository

`transaction.repository.ts` provides:
- `createTransaction()` + `createEntries()` — atomic writes
- `updateTransactionStatus()` — status updates
- `findById()` — transaction with entries
- `findBySource()` — lookup by source type/id
- `getUserEntries()` — paginated user wallet entries
- `getBranchEntries()` — paginated branch entries
- `getAllEntries()` — admin filterable list (type, org, branch, settlement status, date range)

**Evidence:** `transaction.repository.ts:35-195`.

## 8. Routes

**Ledger routes** (`ledger.routes.ts:10-14`):
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/admin/financial/revenue` | super_admin | Revenue summary |
| 2 | GET | `/admin/financial/ledger` | super_admin | Ledger entries |
| 3 | GET | `/admin/financial/settlements` | super_admin | List settlement batches |
| 4 | POST | `/admin/financial/settlements` | super_admin | Create settlement batch |
| 5 | GET | `/admin/financial/entries/:sourceType/:sourceId` | super_admin | Get entries by source |

**Transaction routes** (`transaction.routes.ts:6-8`):
| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/transactions` | User transactions |
| 2 | GET | `/transactions/:id` | Transaction detail |
| 3 | GET | `/branches/:branchId/transactions` | Branch transactions |

**Withdrawal routes** (`financial-admin.routes.ts:9-18`):
| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 1 | GET | `/admin/withdrawal-requests` | `financial.view` | List requests |
| 2 | GET | `/admin/withdrawal-requests/:id` | `financial.view` | Get request detail |
| 3 | POST | `/admin/withdrawal-requests/approve` | `financial.process_payouts` | Approve |
| 4 | POST | `/admin/withdrawal-requests/reject` | `financial.process_payouts` | Reject |
| 5 | POST | `/admin/withdrawal-requests/complete` | `financial.process_payouts` | Complete |

## 9. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Ledger Entry | `ledger_entries` | `id, transaction_id, source_type, source_id, account_type, side, amount, currency, description, reference_id, recorded_at` |
| Settlement Batch | `settlement_batches` | `id, batch_type, period_start, period_end, gross_amount, discount_amount, tax_amount, commission_amount, refund_amount, net_amount, status, organisation_id` |
| Commission Rule | `subscription_plan_rates` | `id, plan_id, applicable_entity, amount, rate_type` |
| Transaction | `transactions` | `id, type, source_type, source_id, total_amount, status, metadata` |
| Transaction Entry | `transaction_entries` | `id, transaction_id, side, entity_type, entity_id, amount, branch_id, organisation_id, description` |

## 10. Account Types (Ledger)

Defined in `ledger-aggregate.ts:1-4`:
`platform_revenue`, `club_revenue`, `wallet_liability`, `customer_balance`, `tax`, `discount`, `commission`, `receivable`, `payable`, `refund`

## 11. Source Types

Defined in `ledger-aggregate.ts:8-11`:
`booking`, `academy`, `membership`, `marketplace`, `wallet`, `subscription`, `adjustment`, `refund`, `coupon`, `commission`, `settlement`

## 12. Events

- `ledger.entry.created` — Emitted by `ledger.service.ts:25-31`
- `settlement.created` — Emitted by `settlement.service.ts:51-57`

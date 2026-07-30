---
document_id: "TECH-MOD-10"
document_name: "Wallet Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 15
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-09"]
  related: ["TECH-MOD-07", "TECH-MOD-12"]
---

# Wallet Module (TECH-MOD-10)

**Source:** `backend/src/modules/wallet/` (6 entries: domain/, application/, commands/, infrastructure/, presentation/, __tests__/)

## 1. Purpose

Per-user digital wallet with optimistic locking. Supports deposit, withdrawal, payment, refund, commission, settlement, due, and penalty transaction types. Withdrawal request lifecycle with admin approval workflow. Low balance threshold detection.

## 2. Architecture

```
domain/
  wallet-aggregate.ts        — Balance validation, optimistic locking (57 lines)
  wallet-constants.ts        — LOW_BALANCE_THRESHOLD=50, DEFAULT_CURRENCY='EGP'
  version-contract.spec.ts   — Version contract tests
application/
  wallet.service.ts          — 283 lines, use-case orchestrator
commands/
  deposit-wallet.command.ts
  withdraw-wallet.command.ts
infrastructure/
  repositories/
    wallet.repository.ts
    withdrawal-request.repository.ts  — Withdrawal request management
presentation/
  wallet.routes.ts           — 4 endpoints
  wallet.controller.ts       — Request handlers (56 lines)
  wallet.dto.ts              — Zod schemas
```

**Evidence:** `wallet.routes.ts` (12 lines, 4 routes), `wallet.controller.ts` (56 lines), `domain/wallet-aggregate.ts` (57 lines), `wallet.service.ts` (283 lines).

## 3. Routes (4)

Defined in `wallet.routes.ts:8-12`:

| # | Method | Path | Auth | Purpose |
|---|--------|------|------|---------|
| 1 | GET | `/wallets/me` | Yes | Get own wallet |
| 2 | POST | `/wallets/deposit` | Yes | Deposit funds |
| 3 | POST | `/wallets/withdraw` | Yes+`financial.withdraw` | Request withdrawal |
| 4 | GET | `/wallets/transactions` | Yes | List transactions |

## 4. Permissions

- `financial.withdraw` — Required for withdrawal requests

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Wallet | `user_wallets` | `id, user_id, balance, currency_code, is_locked, aggregate_version` |
| Transaction | `wallet_transactions` | `id, wallet_id, type, direction, amount, balance_before, balance_after, reference_type, reference_id` |
| Withdrawal Request | `withdrawal_requests` | `id, user_id, wallet_id, amount, status, branch_financial_details_id, reviewed_by, admin_notes` |

## 6. Transaction Types

Defined in `wallet-aggregate.ts:3`: `deposit | withdrawal | payment | refund | commission | settlement | due | penalty`

**Directions:** `credit` (add funds) | `debit` (remove funds)

## 7. Optimistic Locking

`wallet-aggregate.ts:18-53`:
- `aggregate_version` field on wallets
- `assertValidBalanceUpdate()`: validates amount > 0, wallet not locked, sufficient balance for debits
- `planBalanceUpdate()`: computes new balance, increments version
- Throws on insufficient balance or locked wallet

**Evidence:** `wallet-aggregate.ts:33-53` contains all validation and plan logic.

## 8. Withdrawal Request Lifecycle

Managed via `withdrawal-request.repository.ts:7-56`:

```
pending → approved | rejected | cancelled
approved → completed
rejected → (terminal)
cancelled → (terminal)
completed → (terminal)
```

States: `pending`, `approved`, `rejected`, `completed`, `cancelled`

**Evidence:** `withdrawal-request.repository.ts:48-55` has `updateStatus()` method. `wallet.service.ts:118` creates requests with status `'pending'`.

## 9. Low Balance Threshold

`wallet-constants.ts:1`: `LOW_BALANCE_THRESHOLD = 50` (currency units)
`wallet-aggregate.ts:55-57`: `isLowBalance()` helper function

## 10. Events

- `wallet:deposit` — Deposit processed
- `wallet:withdrawal` — Withdrawal requested
- `wallet:payment` — Payment deducted from wallet
- `wallet:refund` — Refund credited to wallet
- `wallet:balance_low` — Balance below threshold

**Evidence:** `wallet.service.ts:131` emits `wallet:withdrawal` events.

## 11. Audit Events

- `WALLET.CREATE` — Wallet created
- `WALLET.CREDIT` — Funds added
- `WALLET.DEBIT` — Funds removed
- `WALLET.ADJUST` — Manual adjustment

**Evidence:** `audit-log.types.ts` lines 19-22.

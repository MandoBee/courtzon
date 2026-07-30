---
document_id: "TECH-ARCH-14"
document_name: "Wallet Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 25
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-MOD-10", "TECH-MOD-09", "TECH-ARCH-02"]
  related: ["TECH-MOD-12", "TECH-MOD-30", "TECH-MOD-07"]
---

# Wallet Architecture (TECH-ARCH-14)

## 1. Overview

CourtZon implements a per-user digital wallet using optimistic locking with a `version` column. The wallet supports 8 transaction types with credit/debit direction semantics. Withdrawal requests follow an admin approval lifecycle. Balance changes are atomic with surrounding business operations via database transactions.

**Source files referenced:**
- `backend/src/modules/wallet/application/wallet.service.ts` (~283 lines, orchestrator)
- `backend/src/modules/wallet/domain/wallet-aggregate.ts` (balance validation, 57 lines)
- `backend/src/modules/wallet/domain/wallet-constants.ts` (thresholds, 2 lines)
- `backend/src/modules/wallet/presentation/wallet.routes.ts` (12 lines)
- `backend/src/modules/wallet/presentation/wallet.controller.ts` (56 lines)
- `backend/src/modules/wallet/presentation/wallet.dto.ts` (Zod schemas, 31 lines)
- `backend/src/modules/wallet/infrastructure/repositories/wallet.repository.ts` (122 lines)
- `backend/src/modules/wallet/infrastructure/repositories/withdrawal-request.repository.ts` (56 lines)
- `backend/src/modules/wallet/commands/deposit-wallet.command.ts` (74 lines)
- `backend/src/modules/wallet/commands/withdraw-wallet.command.ts` (76 lines)
- `database/baseline/001_courtzon_v3.sql` (`user_wallets`: lines 3385-3398, `wallet_transactions`: lines 3466-3485, `withdrawal_requests`: lines 3503-3525)

## 2. Domain Model

### 2.1 Wallet Record

From `wallet-aggregate.ts:9-16`:

```typescript
interface WalletRecord {
  id: number;               // PK
  user_id: number;          // FK to users (1:1)
  balance: number;          // Current balance (decimal 14,2)
  currency_code: string;    // e.g. 'EGP'
  is_locked: boolean;       // Administrative lock
  aggregate_version: number; // Optimistic concurrency version
}
```

**Source:** `database/baseline/001_courtzon_v3.sql:3388-3398` (`user_wallets` table).

### 2.2 Transaction Types

Defined in `wallet-aggregate.ts:3`:

```typescript
type TransactionType = 'deposit' | 'withdrawal' | 'payment' | 'refund'
                       | 'commission' | 'settlement' | 'due' | 'penalty';
```

### 2.3 Direction Model

```typescript
type TransactionDirection = 'credit' | 'debit';
```

- **credit**: Funds added to wallet (deposit, refund, commission, settlement)
- **debit**: Funds removed from wallet (withdrawal, payment, due, penalty)

**Source:** `wallet-aggregate.ts:5`.

## 3. Optimistic Locking (Version Column)

The wallet uses optimistic concurrency control via a `version` (alias `aggregate_version`) column.

### 3.1 Balance Update Flow

```
wallet-aggregate.ts:33-53 → planBalanceUpdate(request)
├── assertValidBalanceUpdate():
│   ├── amount must be positive
│   ├── wallet must not be locked
│   └── debit requires currentBalance >= amount
├── Compute: newBalance = currentBalance + (direction === 'credit' ? amount : -amount)
└── Return: { newBalance, newVersion: currentVersion + 1, didUpdate: true }
```

### 3.2 Repository Layer

```
wallet.repository.ts:57-65 → lockAndGetBalance(walletId, conn?)
├── SELECT balance, version FROM user_wallets WHERE id=? AND is_locked=FALSE FOR UPDATE
└── Returns { balance, version } or null if locked

wallet.repository.ts:71-78 → updateBalance(walletId, newBalance, version, conn?)
├── UPDATE user_wallets SET balance=?, version=version+1 WHERE id=? AND version=?
├── Returns affectedRows > 0
└── If affectedRows === 0 → AggregateVersionConflict thrown
    └── Metric: aggregateVersionConflictsTotal.inc({ aggregate_type: 'wallet' })
```

### 3.3 Command Layer

The V2 pipeline (deposit-wallet.command.ts / withdraw-wallet.command.ts) uses `CommandHandler`:

```
deposit-wallet.command.ts:33-55
├── walletRepository.findById(walletId, conn)
├── planBalanceUpdate() with direction='credit'
├── walletRepository.persistBalanceUpdate(walletId, newBalance, currentVersion, conn)
│   └── UPDATE user_wallets SET balance=?, aggregate_version=aggregate_version+1
│       WHERE id=? AND aggregate_version=?
└── Emit event 'wallet.deposited'
```

**Source evidence:** `wallet.repository.ts:31-43` (persistBalanceUpdate), `wallet.repository.ts:57-78` (lockAndGetBalance + updateBalance), `deposit-wallet.command.ts:33-55`, `withdraw-wallet.command.ts:35-56`.

## 4. Deposit Flow

```
wallet.service.ts:41-100 → deposit(userId, amount, paymentMethod, returnUrl?)
├── getMyWallet(userId):
│   ├── walletRepository.findByUserId(userId)
│   ├── If not exists:
│   │   ├── SELECT default_currency FROM users JOIN countries
│   │   └── INSERT INTO user_wallets (balance=0, currency_code, aggregate_version=1)
│   └── Return { id, balance, currencyCode, isLocked }
├── Build paymentRequest → paymentGateway.charge()
├── If paymentResult.success && paid:
│   ├── withTransaction:
│   │   ├── walletRepository.lockAndGetBalance(wallet.id, conn) → FOR UPDATE
│   │   ├── Compute newBalance = state.balance + amount
│   │   ├── walletRepository.updateBalance(wallet.id, newBalance, state.version, conn)
│   │   └── transactionService.createWalletTopup() → INSERT wallet_transactions
│   ├── eventBusV2.emit('wallet:deposit', { walletId, userId, amount, balance, currency })
│   ├── If newBalance < 50 → eventBusV2.emit('wallet:low-balance', ...)
│   └── Return { success: true, balance, transactionId }
└── Else → Return { paymentUrl, clientSecret, status, message: 'redirect to gateway' }
```

### V2 Pipeline Path

```
wallet.service.ts:148-218 → depositV2()
├── paymentGateway.charge() → if not paid → return redirect info
├── Build Command { commandType: 'DepositWallet', payload }
├── commandPipeline.execute(command, { validate, execute, events })
│   ├── execute: depositWalletHandler.execute() → planBalanceUpdate() → persistBalanceUpdate()
│   └── events: depositWalletHandler.events() → 'wallet.deposited'
├── eventBusV2.emit('wallet:deposit', ...)
├── If newBalance < 50 → emit 'wallet:low-balance'
└── Return { success: true, balance, transactionId }
```

**Source evidence:** `wallet.service.ts:16-39` (getMyWallet auto-creation), `wallet.service.ts:41-100` (deposit), `wallet.service.ts:148-218` (depositV2), `deposit-wallet.command.ts:33-55`.

## 5. Withdrawal Flow

### 5.1 User-Initiated Withdrawal

```
wallet.service.ts:102-146 → withdraw(userId, amount, notes?, branchFinancialDetailsId?)
├── getMyWallet(userId) → check balance >= amount, else throw
├── withTransaction:
│   ├── walletRepository.lockAndGetBalance(wallet.id, conn) → FOR UPDATE
│   ├── newBalance = state.balance - amount
│   ├── walletRepository.updateBalance(wallet.id, newBalance, state.version, conn)
│   ├── INSERT INTO withdrawal_requests (status='pending')
│   └── transactionService.createWalletWithdraw() → wallet_transactions record
├── eventBusV2.emit('wallet:withdrawal', { walletId, userId, amount, balance, currency })
├── If newBalance < 50 → eventBusV2.emit('wallet:low-balance', ...)
└── Return { success: true, balance }
```

### 5.2 V2 Pipeline Path

```
wallet.service.ts:220-274 → withdrawV2()
├── Build Command { commandType: 'WithdrawWallet', payload }
├── commandPipeline.execute(command, { validate, execute, events })
│   ├── execute: withdrawWalletHandler.execute() → planBalanceUpdate(direction='debit') → persistBalanceUpdate()
│   ├── INSERT INTO withdrawal_requests (status='pending')
│   └── transactionService.createWalletWithdraw()
├── eventBusV2.emit('wallet:withdrawal', ...)
├── If newBalance < 50 → emit 'wallet:low-balance'
└── Return { success: true, balance }
```

### 5.3 Withdrawal Request Lifecycle

Managed via `withdrawal-request.repository.ts:7-56`:

```
pending → approved | rejected | cancelled
approved → completed
rejected → (terminal)
cancelled → (terminal)
completed → (terminal)
```

States: `pending`, `approved`, `rejected`, `completed`, `cancelled`

**Status transitions:**
```
withdrawal-request.repository.ts:48-55 → updateStatus(id, status, reviewedBy?, adminNotes?)
├── UPDATE withdrawal_requests SET status=?, reviewed_by=?, admin_notes=?, reviewed_at=NOW()
└── WHERE id=?
```

Repository methods:
| Method | Purpose | Source |
|--------|---------|--------|
| `findAll(filters)` | List with pagination, filters by status/date | `withdrawal-request.repository.ts:8-31` |
| `findById(id)` | Single request with user + bank details | `withdrawal-request.repository.ts:34-46` |
| `updateStatus(id, status, reviewedBy, adminNotes)` | Admin approval/rejection | `withdrawal-request.repository.ts:48-55` |

**Source evidence:** `wallet.service.ts:102-146` (withdraw), `wallet.service.ts:220-274` (withdrawV2), `withdrawal-request.repository.ts:48-55` (updateStatus), `withdrawal-request.repository.ts:8-31` (findAll).

## 6. Low Balance Threshold

```
wallet-constants.ts:1
├── LOW_BALANCE_THRESHOLD = 50  (currency units)

wallet-aggregate.ts:55-57
├── isLowBalance(balance, threshold = LOW_BALANCE_THRESHOLD): boolean
└── Returns true if balance < threshold

wallet.service.ts:81-87, 138-144
├── After every deposit/withdrawal:
│   └── if newBalance < 50 → eventBusV2.emit('wallet:low-balance', { userId, balance, currency })
```

**Source evidence:** `wallet-constants.ts:1`, `wallet-aggregate.ts:55-57`, `wallet.service.ts:81-87`.

## 7. Transaction History

```
wallet.service.ts:276-280 → getTransactions(userId, filters)
└── Delegates to transactionService.getUserTransactions()

wallet.repository.ts:94-112 → findTransactions(walletId, filters)
├── Filterable by: type, from date, to date
├── Paginated: page + limit
└── Ordered by: created_at DESC
```

**Source evidence:** `wallet.service.ts:276-280`, `wallet.repository.ts:94-112`.

## 8. Wallet Routes

Defined in `wallet.routes.ts:8-12`:

| Method | Path | Auth | Permission | Purpose | Source |
|--------|------|------|------------|---------|--------|
| GET | `/wallets/me` | Yes | — | Get own wallet with balance | `wallet.routes.ts:8` |
| POST | `/wallets/deposit` | Yes | — | Deposit funds via gateway | `wallet.routes.ts:9` |
| POST | `/wallets/withdraw` | Yes | `financial.withdraw` | Request withdrawal | `wallet.routes.ts:10` |
| GET | `/wallets/transactions` | Yes | — | List transactions | `wallet.routes.ts:11` |

## 9. Events Emitted

| Event | When | Payload | Source |
|-------|------|---------|--------|
| `wallet:deposit` | After deposit | `{ walletId, userId, amount, balance, currency }` | `wallet.service.ts:74-80` |
| `wallet:withdrawal` | After withdraw | `{ walletId, userId, amount, balance, currency }` | `wallet.service.ts:131-137` |
| `wallet:low-balance` | Balance < 50 | `{ userId, balance, currency }` | `wallet.service.ts:82-87, 139-144` |
| `wallet.deposited` | Command pipeline | `{ walletId, userId, amount, balance, aggregateVersion }` | `deposit-wallet.command.ts:57-74` |
| `wallet.withdrawn` | Command pipeline | `{ walletId, userId, amount, balance, aggregateVersion }` | `withdraw-wallet.command.ts:59-76` |

## 10. Key Configuration

| Config | Default | Location | Purpose |
|--------|---------|----------|---------|
| `LOW_BALANCE_THRESHOLD` | 50 | `wallet-constants.ts:1` | Low balance warning threshold |
| `DEFAULT_CURRENCY` | EGP | `wallet-constants.ts:2` | Default wallet currency |
| `WALLET_V2_DEPOSIT` | off | `isFeatureEnabled()` | Feature flag for V2 deposit pipeline |
| `WALLET_V2_WITHDRAW` | off | `isFeatureEnabled()` | Feature flag for V2 withdraw pipeline |

**Source evidence:** `wallet-constants.ts:1-2`, `wallet.service.ts:42, 103`.

## 11. Database Schema

### user_wallets

**Source:** `database/baseline/001_courtzon_v3.sql:3388-3398`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `user_id` | `bigint(20) unsigned` | NO | — | FK to users (1:1) |
| `balance` | `decimal(14,2)` | YES | 0.00 | Current wallet balance |
| `currency_code` | `varchar(10)` | YES | 'EGP' | Wallet currency |
| `is_locked` | `tinyint(1)` | YES | 0 | Admin lock flag |
| `version` | `int(11)` | YES | 1 | Optimistic concurrency version |
| `created_at` | `timestamp` | NO | current_timestamp() | Creation timestamp |

**Indexes:** UNIQUE `uk_wallet_user` (`user_id`)

### wallet_transactions

**Source:** `database/baseline/001_courtzon_v3.sql:3469-3485`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `bigint(20) unsigned` | NO | auto_increment | Primary key |
| `public_id` | `char(36)` | YES | NULL | UUID for external reference |
| `wallet_id` | `bigint(20) unsigned` | NO | — | FK to user_wallets |
| `transaction_type` | `enum('deposit','withdrawal','payment','refund','commission','settlement','due','penalty')` | NO | — | Transaction category |
| `amount` | `decimal(14,2)` | NO | — | Transaction amount |
| `direction` | `enum('credit','debit')` | NO | — | Credit (add) or debit (remove) |
| `reference_type` | `varchar(100)` | YES | NULL | Business reference type |
| `reference_id` | `bigint(20) unsigned` | YES | NULL | Business reference ID |
| `description` | `text` | YES | NULL | Free-text description |
| `created_at` | `timestamp` | NO | current_timestamp() | Creation timestamp |

**Indexes:**
| Name | Columns | Type |
|------|---------|------|
| PRIMARY | `id` | PK |
| `idx_wallet` | `wallet_id` | KEY |
| `idx_reference` | `reference_type`, `reference_id` | KEY |
| `idx_wallet_txn_wallet_created` | `wallet_id`, `created_at` | KEY |
| `idx_wallet_txn_type_created` | `wallet_id`, `transaction_type`, `created_at` | KEY |

### withdrawal_requests

**Source:** `database/baseline/001_courtzon_v3.sql:3506-3525`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | `int(10) unsigned` | NO | auto_increment | Primary key |
| `user_id` | `int(10) unsigned` | NO | — | FK to users |
| `wallet_id` | `int(10) unsigned` | NO | — | FK to user_wallets |
| `amount` | `decimal(10,2)` | NO | — | Withdrawal amount |
| `branch_financial_details_id` | `int(10) unsigned` | YES | NULL | FK for bank transfer details |
| `status` | `enum('pending','approved','rejected','completed','cancelled')` | NO | 'pending' | Lifecycle state |
| `admin_notes` | `text` | YES | NULL | Admin review notes |
| `reviewed_by` | `int(10) unsigned` | YES | NULL | FK to users (admin) |
| `reviewed_at` | `timestamp` | YES | NULL | When reviewed |
| `created_at` | `timestamp` | NO | current_timestamp() | Creation timestamp |

**Indexes:** KEY `reviewed_by`, `idx_withdrawal_user`, `idx_withdrawal_status`, `fk_wr_branch_financial`

**Foreign Keys:**
| Name | Child Cols | Parent Table | On Delete |
|------|-----------|-------------|-----------|
| `fk_wr_branch_financial` | `branch_financial_details_id` | `branch_financial_details` | SET NULL |
| `withdrawal_requests_ibfk_1` | `user_id` | `users` | CASCADE |
| `withdrawal_requests_ibfk_3` | `reviewed_by` | `users` | SET NULL |

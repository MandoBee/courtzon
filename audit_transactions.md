# ENTERPRISE TABLE AUDIT: `transactions`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Financial journal header — parent of transaction_entries |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌─────────────────────────────────────────────────────────────────────┐
│   transactions  —  EXECUTIVE SNAPSHOT                               │
├─────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Financial journal header                        │
│  HEALTH:         9/10 — Schema sound, code mostly aligned           │
│  QUALITY:        9/10 — Minor domain type enum discrepancy          │
│  PK:             id (bigint unsigned)                                │
│  FK:             1 — currencies                                       │
│  CHILDREN:       1 — transaction_entries CASCADE                     │
│  PRODUCTION ROWS: 0 (AUTO_INCREMENT=10)                             │
│  BACKEND REFS:   30+ across 10+ files                                │
│  FRONTEND REFS:  10+ pages + permissions + i18n                     │
│  FINDINGS:       1 — TRX-001 (Low)                                  │
│  RECOMMENDATION: Align TransactionType enum with production ENUM    │
│  CONFIDENCE:     95%                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — financial journal headers for double-entry accounting |
| Evidence | Repository CRUD; service layer (createBookingPayment, createWalletTopup, createRefund, createWalletWithdraw); booking.service inserts; org portal reporting; 6 API routes; 4 frontend pages |

---

## 3. PRODUCTION SCHEMA (11 columns)

```
id              bigint unsigned AUTO_INCREMENT PK (AUTO_INCREMENT=10)
public_id       char(36) DEFAULT NULL
type            enum('booking_payment','wallet_topup','refund','payout','marketplace_order','withdrawal') NOT NULL
source_type     enum('booking','academy','marketplace','admin','wallet') DEFAULT NULL
source_id       bigint unsigned DEFAULT NULL
currency_id     tinyint unsigned DEFAULT NULL         → currencies(id)
total_amount    decimal(14,2) NOT NULL
status          enum('pending','completed','reversed') NOT NULL DEFAULT 'pending'
metadata        longtext DEFAULT NULL                  CHECK(json_valid)
created_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

Indexes: idx_type, idx_source, idx_status, fk_txn_currency, idx_transactions_type_status
```

---

## 4. MIGRATION HISTORY

| Migration | Action | Detail |
|---|---|---|
| Baseline | DDL | Present at `001_courtzon_v3.sql:3141-3160` |

No migration files in `database/migrations/` reference this table.

---

## 5. CHILD TABLES

| Table | FK Column | Constraint |
|---|---|---|
| `transaction_entries` | `transaction_id` | `fk_entry_txn` CASCADE |

---

## 6. APPLICATION CODE REFERENCES

### Backend

**Domain Types** (`backend/src/modules/financial/domain/financial-aggregate.ts:3`):
```ts
type TransactionType = 'booking_payment' | 'wallet_topup' | 'refund' | 'payout'
                     | 'marketplace_order' | 'withdrawal' | 'settlement_payout';
```
`settlement_payout` is NOT in the production ENUM.

**Repository** (`backend/src/modules/financial/infrastructure/transaction.repository.ts`):
- `createTransaction()` — INSERT with 7 columns: all match production ✅
- `updateTransactionStatus()` — UPDATE status by id ✅
- `findById()` — SELECT * ✅
- `findBySource()` — SELECT by source_type + source_id ✅

**Booking Service** (`backend/src/modules/booking/application/booking.service.ts`):
- Lines 312-313, 1117-1118 — INSERT with columns matching production ✅

**All JOIN queries** reference `transactions` with correct column names.

### Frontend

4 pages consuming transaction data via API:
- `WalletPage.tsx` (player + profile) — wallet transactions
- `OrgFinancePage.tsx` — org transactions tab
- `OrgSubscriptionPage.tsx` — recent financial activity table
- `CoachRevenuePage.tsx` — coach revenue transactions

---

## 7. FINDINGS

---

### TRX-001: Domain type `TransactionType` includes value not in production ENUM

| Field | Value |
|---|---|
| **Severity** | Low |
| **Classification** | Finding |
| **Confidence** | B (85%) |

**Evidence:**
1. Production ENUM: `'booking_payment', 'wallet_topup', 'refund', 'payout', 'marketplace_order', 'withdrawal'`
2. Domain type: adds `'settlement_payout'` beyond the production ENUM values

**Root Cause:**
Not determined. This may represent a planned addition that has not been applied to the DB, or an unreferenced value that was added to the domain during development.

**Impact:**
- Fact: If `createTransaction()` is invoked with a value that is not permitted by the production ENUM, the database is expected to reject the insert.
- Expected: 0 production rows were observed. No evidence of `settlement_payout` being used in any INSERT statement.

**Recommendation:**
1. Either add `'settlement_payout'` to the production ENUM via a migration
2. Or remove it from the domain type if not needed

---

## 8. OBSERVATIONS

- **Two separate transaction systems** coexist in the codebase: `transactions` + `transaction_entries` (double-entry journal) and `payment_transactions` (gateway-facing) and `wallet_transactions` (wallet event log). Each serves a distinct purpose.
- **AUTO_INCREMENT=10 with 0 rows** — the review did not establish the reason for that difference.
- **`public_id` is nullable and has no unique constraint** — it is set programmatically (UUID) but the DB does not enforce uniqueness.
- **`metadata` uses `longtext` with `CHECK (json_valid)`** rather than native `json` type — functionally equivalent but may affect indexing and validation performance.
- **All INSERT/SELECT statements use correct column names** — no column mismatch issues unlike the `tournaments/` module tables.

---

## 9. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 10. RECOMMENDATIONS

| # | Action | Priority | Tied To |
|---|---|---|---|
| 1 | Resolve `settlement_payout` domain-vs-DB discrepancy | Low | TRX-001 |

---

## 11. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (11 cols, 1 FK, 5 indexes) |
| Baseline match | ✅ (identical to production) |
| Application code verified | ✅ (all INSERT/SELECT column names correct) |
| FK integrity verified | ✅ (currencies) |
| Child tables verified | ✅ (1: transaction_entries CASCADE) |
| Code vs schema alignment | ✅ (minor exception — TRX-001) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `transactions` ✅

**Next table alphabetically: `translation_keys` — proceed?**

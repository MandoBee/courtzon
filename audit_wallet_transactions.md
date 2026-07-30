# ENTERPRISE TABLE AUDIT: `wallet_transactions`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Wallet transaction ledger (wallet-level journal) |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   wallet_transactions  —  EXECUTIVE SNAPSHOT                         │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Financial ledger entity                          │
│  HEALTH:         8/10 — Schema sound, most code correct; CRM         │
│                  controller references non-existent `user_id` column  │
│  QUALITY:        8/10                                                  │
│  PK:             id (bigint unsigned)                                  │
│  FK:             0 (wallet_id is soft ref)                            │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 0                                                    │
│  BACKEND REFS:   12+ SQL across 5 files                                │
│  FRONTEND REFS:  0                                                     │
│  FINDINGS:       1 — WLT-001 (Critical)                               │
│  RECOMMENDATION: Fix CRM controller queries                           │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — wallet-level transaction journal for deposits, withdrawals, payments, refunds, commissions, settlements, penalties |
| Evidence | Repository (INSERT, SELECT); reports (revenue aggregation); CRM (customer 360); RBAC (dashboard revenue); booking (COD penalties); payment (reconciliation) |

---

## 3. PRODUCTION SCHEMA (10 columns)

```
id                bigint unsigned AUTO_INCREMENT PK
public_id         char(36) DEFAULT NULL
wallet_id         bigint unsigned NOT NULL              (soft ref to user_wallets)
transaction_type  enum('deposit','withdrawal','payment','refund','commission','settlement','due','penalty') NOT NULL
amount            decimal(14,2) NOT NULL
direction         enum('credit','debit') NOT NULL
reference_type    varchar(100) DEFAULT NULL
reference_id      bigint unsigned DEFAULT NULL
description       text DEFAULT NULL
created_at        timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP

Indexes: uq_wallet_txn_ref (UNIQUE) [M002], idx_wallet, idx_reference,
         idx_wallet_txn_wallet_created, idx_wallet_txn_type_created
```

---

## 4. APPLICATION CODE REFERENCES

**Wallet repository** (`wallet.repository.ts`):
| Method | SQL | Correct? |
|---|---|---|
| `createTransaction()` | `INSERT INTO wallet_transactions (public_id, wallet_id, transaction_type, amount, direction, reference_type, reference_id, description)` | ✅ All 8 columns exist |
| `findTransactions()` | `SELECT * FROM wallet_transactions WHERE wallet_id = ?` | ✅ |

**Reports** (`reports.repository.ts`): 3 aggregation queries — reference existing columns ✅

**RBAC** (`rbac.repository.ts`): 2 revenue queries — reference existing columns ✅

**Payment reconciliation** (`reconciliation.service.ts`): SELECT + entityType ✅

**Booking service** (`booking.service.ts`): Calls `walletRepository.createTransaction()` ✅

**CRM controller** (`crm.controller.ts`):
| Line | SQL | Issue |
|---|---|---|
| 74 | `FROM wallet_transactions WHERE user_id = ?` | `user_id` column does not exist |
| 128 | `FROM wallet_transactions WHERE user_id = ?` | `user_id` column does not exist |

---

## 5. FINDINGS

---

### WLT-001: CRM controller queries non-existent `user_id` column on wallet_transactions

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:**
1. Production schema has `wallet_id` — NOT `user_id`
2. `crm.controller.ts:74` — `SELECT COALESCE(SUM(...)) FROM wallet_transactions WHERE user_id = ?`
3. `crm.controller.ts:128` — `SELECT ... FROM wallet_transactions WHERE user_id = ?` (in UNION ALL timeline)

**Root Cause:**
The CRM controller assumes `wallet_transactions` has a `user_id` column, but the production schema uses `wallet_id` referencing `user_wallets(id)`. To filter by user, a JOIN through `user_wallets` is required.

**Impact:**
- Fact: The reviewed SQL statements reference a column that is not present in the reviewed production schema. If those statements are executed, the database is expected to reject the queries.
- Expected: The review did not establish whether these code paths are executed in production.

**Recommendation:**
Fix both queries to JOIN through `user_wallets`:
```sql
SELECT ... FROM wallet_transactions wt
JOIN user_wallets uw ON uw.id = wt.wallet_id
WHERE uw.user_id = ?
```

---

## 6. OBSERVATIONS

- **UNIQUE INDEX `uq_wallet_txn_ref` on (reference_type, reference_id)** — prevents duplicate wallet transactions for the same reference, added by M002.
- **No FK constraints** — `wallet_id` is a soft reference to `user_wallets`; `reference_type`/`reference_id` is a polymorphic soft reference pattern.
- **The reviewed archived migration 123 adds the `due` and `penalty` values** to the `transaction_type` ENUM. The review did not establish whether that migration represents the deployment history of the reviewed production schema.

---

## 7. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 8. RECOMMENDATIONS

| # | Action | Priority | Tied To |
|---|---|---|---|
| 1 | Fix CRM controller queries to JOIN user_wallets | Critical | WLT-001 |

---

## 9. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (10 cols, 0 FK, 5 indexes) |
| Baseline match | ✅ (M002 UNIQUE index applied) |
| Wallet repo code verified | ✅ (INSERT/SELECT correct) |
| Reports/RBAC/Booking/Recon code verified | ✅ (all correct) |
| CRM controller code verified | ⚠️ (2 broken queries — WLT-001) |
| FK integrity verified | ✅ (0 FKs — soft references) |
| Code vs schema alignment | ⚠️ Partial — CRM controller broken |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `wallet_transactions` ✅

**Next table alphabetically: `warehouses` — proceed?**

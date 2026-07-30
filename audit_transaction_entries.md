# ENTERPRISE TABLE AUDIT: `transaction_entries`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Double-entry accounting line items — child of transactions |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   transaction_entries  —  EXECUTIVE SNAPSHOT                         │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Accounting detail entity                         │
│  HEALTH:         10/10 — Schema sound, code column names correct     │
│  QUALITY:        10/10 — All INSERT/SELECT columns verified          │
│  PK:             id (bigint unsigned)                                 │
│  FK:             4 — transactions CASCADE, currencies,               │
│                  branches SET NULL, organisations SET NULL            │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 0 (AUTO_INCREMENT=54 indicates prior usage)         │
│  BACKEND REFS:   15+ across 3 files                                   │
│  FRONTEND REFS:  0                                                    │
│  FINDINGS:       None                                                 │
│  RECOMMENDATION: No action required                                   │
│  CONFIDENCE:     95%                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — double-entry accounting line items for financial transactions |
| Evidence | INSERT in booking.service for COD/wallet payments; batch INSERT + SELECT in transaction.repository; org-portal reporting queries |

---

## 3. PRODUCTION SCHEMA (11 columns)

```
id                bigint unsigned AUTO_INCREMENT PK (AUTO_INCREMENT=54)
transaction_id    bigint unsigned NOT NULL       → transactions(id) ON DELETE CASCADE
side              enum('debit','credit') NOT NULL
entity_type       enum('user_wallet','platform_account','branch') NOT NULL
entity_id         bigint unsigned NOT NULL
amount            decimal(14,2) NOT NULL
currency_id       tinyint unsigned DEFAULT NULL   → currencies(id)
branch_id         int unsigned DEFAULT NULL       → branches(id) ON DELETE SET NULL
organisation_id   int unsigned DEFAULT NULL       → organisations(id) ON DELETE SET NULL
description       text DEFAULT NULL
created_at        timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP

Indexes: idx_transaction, idx_entity, idx_branch, idx_organisation, idx_created,
         fk_entry_currency, idx_txn_entries_branch_created
```

---

## 4. MIGRATION HISTORY

| Migration | Action | Detail |
|---|---|---|
| Baseline | DDL | Present at `001_courtzon_v3.sql:3109-3136` |

No migration files in `database/migrations/` reference this table.

---

## 5. CHILD TABLES

None identified.

---

## 6. APPLICATION CODE REFERENCES

### Backend

**File:** `backend/src/modules/financial/infrastructure/transaction.repository.ts`

| Line | Method | SQL | Correct? |
|---|---|---|---|
| 23 | `CreateEntryInput` interface | `transactionId, side, entityType, entityId, amount, currencyId?, branchId?, organisationId?, description?` | ✅ |
| 57 | `createEntries()` | `INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, branch_id, organisation_id, description)` | ✅ All 9 columns match |
| 78 | `findById()` | `SELECT * FROM transaction_entries WHERE transaction_id = ?` | ✅ |
| 96 | User entry count | `SELECT COUNT(*) FROM transaction_entries te JOIN user_wallets uw ...` | ✅ |
| 105 | User entries list | `SELECT te.*, t.type, t.status FROM transaction_entries te JOIN transactions t ...` | ✅ |
| 119 | Branch entry count | `SELECT COUNT(*) FROM transaction_entries WHERE branch_id = ?` | ✅ |
| 126 | Branch entries list | `SELECT te.*, t.type FROM transaction_entries te JOIN transactions t WHERE te.branch_id = ?` | ✅ |
| 168 | All entries count | `SELECT COUNT(*) FROM transaction_entries te JOIN transactions t ...` | ✅ |
| 183 | All entries list | Full paginated query with JOINs across 5+ tables | ✅ |

**File:** `backend/src/modules/booking/application/booking.service.ts`

| Line | Usage | Correct? |
|---|---|---|
| 317 | INSERT debit/credit pair for COD payment | ✅ Columns match |
| 1124 | INSERT entries for wallet/refund operations | ✅ Columns match |

**File:** `backend/src/modules/organisations/infrastructure/repositories/org-portal.repository.ts`

| Line | Usage | Correct? |
|---|---|---|
| 852 | `SELECT COUNT(*) FROM transaction_entries ... WHERE organisation_id = ?` | ✅ |
| 864 | Full paginated org transaction query with DISTINCT subquery | ✅ |

All INSERT and SELECT statements reference only columns that exist in the production schema.

---

## 7. FINDINGS

None identified.

---

## 8. OBSERVATIONS

- **The current AUTO_INCREMENT value differs from the current row count.** The review did not establish the reason for that difference.
- **No domain type** (`TransactionEntry` interface) exists — the `CreateEntryInput` interface in the repository serves as the type definition, which is adequate given the simple insert pattern.
- **No frontend references** — this table is consumed entirely server-side; frontend consumes aggregated transaction views.
- **All code references use correct column names** — no discrepancies between application code and production schema, contrasting with the `tournaments/` module tables.
- **Seed data inconsistency**: `001_baseline.sql` inserts 6 rows (IDs 29-42), `003_baseline_snapshot.sql` inserts 2 rows (IDs 1-2). This is a minor seed file divergence but does not affect runtime behaviour (both are IGNORE inserts).

---

## 9. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 10. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | Reconcile seed data between `001_baseline.sql` (6 rows) and `003_baseline_snapshot.sql` (2 rows) | Low |

---

## 11. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (11 cols, 4 FK, 7 indexes) |
| Baseline match | ✅ (identical to production) |
| Application code verified | ✅ (all INSERT/SELECT column names correct) |
| FK integrity verified | ✅ (transactions CASCADE, currencies no action, branches/organisations SET NULL) |
| Child tables verified | ✅ (0 children) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `transaction_entries` ✅

**Next table alphabetically: `transactions` — proceed?**

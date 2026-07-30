# ENTERPRISE TABLE AUDIT: `user_wallets`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | User wallet balance with optimistic locking |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   user_wallets  —  EXECUTIVE SNAPSHOT                                │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Financial entity                                 │
│  HEALTH:         6/10 — Dual optimistic lock column names; one set   │
│                  references non-existent `aggregate_version`          │
│  QUALITY:        6/10 — Two locking methods, one broken               │
│  PK:             id (bigint unsigned)                                  │
│  FK:             0 (user_id is soft ref)                              │
│  CHILDREN:       0 (wallet_transactions references this softly)       │
│  PRODUCTION ROWS: 7 (AUTO_INCREMENT=18)                                │
│  BACKEND REFS:   12+ SQL across 4 files                                │
│  FRONTEND REFS:  0                                                     │
│  FINDINGS:       1 — UWL-001 (Critical)                               │
│  RECOMMENDATION: Unify optimistic locking to use single column name   │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — user wallet balance management with optimistic concurrency control |
| Evidence | Repository with 2 optimistic-lock methods + 1 pessimistic lock; auto-create on first access; used by auth, player dashboard, financial transactions |

---

## 3. PRODUCTION SCHEMA (7 columns)

```
id              bigint unsigned AUTO_INCREMENT PK (AUTO_INCREMENT=18)
user_id         bigint unsigned NOT NULL UNIQUE
balance         decimal(14,2) DEFAULT 0.00
currency_code   varchar(10) DEFAULT 'EGP'
is_locked       tinyint(1) DEFAULT 0
version         int DEFAULT '1'
created_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP

Indexes: uk_wallet_user (UNIQUE on user_id)
```

---

## 4. APPLICATION CODE REFERENCES

**`wallet.repository.ts`:**
| Method | Line | SQL | Column Used | Correct? |
|---|---|---|---|---|
| `findById()` | 25 | `SELECT * FROM user_wallets WHERE id = ?` | — | ✅ |
| `persistBalanceUpdate()` | 34 | `UPDATE ... SET balance = ?, aggregate_version = aggregate_version + 1, updated_at = NOW() WHERE id = ? AND aggregate_version = ?` | `aggregate_version` | ✗ not in prod |
| | 38 | `SELECT aggregate_version FROM user_wallets WHERE id = ?` | `aggregate_version` | ✗ not in prod |
| `findByUserId()` | 47 | `SELECT * FROM user_wallets WHERE user_id = ?` | — | ✅ |
| `lockAndGetBalance()` | 60 | `SELECT balance, version FROM user_wallets WHERE id = ? AND is_locked = FALSE FOR UPDATE` | `version` | ✅ |
| `updateBalance()` | 74 | `UPDATE ... SET balance = ?, version = version + 1 WHERE id = ? AND version = ?` | `version` | ✅ |

**`wallet.service.ts`:**
| Line | SQL | Correct? |
|---|---|---|
| 28 | `INSERT INTO user_wallets (user_id, balance, currency_code, aggregate_version) VALUES (?, 0, ?, 1)` | ✗ `aggregate_version` not in prod |

**`user.repository.ts:163-165`:** INSERT with `user_id, balance, currency_code` — correct ✅

---

## 5. FINDINGS

---

### UWL-001: Repository and service reference non-existent `aggregate_version` column

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:**
1. Production schema has `version int DEFAULT 1` — NOT `aggregate_version`
2. `wallet.repository.ts:34` — `persistBalanceUpdate()` UPDATE references `aggregate_version`
3. `wallet.repository.ts:38` — `SELECT aggregate_version FROM user_wallets`
4. `wallet.service.ts:28` — `INSERT INTO user_wallets (...) aggregate_version ... VALUES (..., 1)`
5. `wallet.repository.ts:74` — `updateBalance()` correctly uses `version` column ✅
6. `wallet.repository.ts:60` — `lockAndGetBalance()` correctly uses `version` column ✅

**Root Cause:**
Two optimistic-locking strategies coexist in the same repository. The `persistBalanceUpdate()` method and the wallet auto-create INSERT use column name `aggregate_version` (consistent with a domain-driven pattern used elsewhere), while `updateBalance()` and `lockAndGetBalance()` use the production column `version`. The `aggregate_version` column was likely renamed to `version` at some point but not all code paths were updated.

**Impact:**
- Fact: The reviewed SQL statements reference a column that is not present in the reviewed production schema. If those statements are executed, the database is expected to reject the queries.
- Expected: 7 production rows were observed during the review. Whether the `persistBalanceUpdate()` and auto-create INSERT code paths are executed in production was not established.

**Recommendation:**
1. Replace `aggregate_version` with `version` in `persistBalanceUpdate()` and the auto-create INSERT
2. Remove the `readAggregateVersion()` fallback query (line 38)
3. Consider consolidating the two optimistic-lock methods into a single approach

---

## 6. OBSERVATIONS

- **7 rows, AUTO_INCREMENT=18** — the review did not establish the reason for that difference.
- **No FK constraint on `user_id`** — referential integrity to `users` is not enforced at the DB level.
- **No FK from `wallet_transactions`** — The review identified references from `wallet_transactions` to `wallet_id` without a corresponding foreign key constraint in the reviewed production schema.
- **UNIQUE constraint on `user_id`** enforces one wallet per user.
- **Optimistic locking via `version`** — CAS pattern (`SET balance = ?, version = version + 1 WHERE id = ? AND version = ?`) prevents concurrent overwrites.
- **Pessimistic locking via `FOR UPDATE`** — `lockAndGetBalance()` with `is_locked = FALSE` guard for special operations.

---

## 7. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 8. RECOMMENDATIONS

| # | Action | Priority | Tied To |
|---|---|---|---|
| 1 | Fix `persistBalanceUpdate()` and auto-create INSERT to use `version` instead of `aggregate_version` | Critical | UWL-001 |
| 2 | Consolidate dual optimistic-lock methods into one | Medium | UWL-001 |

---

## 9. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (7 cols, 0 FK, 1 index) |
| Baseline match | ✅ (identical to production) |
| Repository code verified | ✅ (partial — `updateBalance()` works, `persistBalanceUpdate()` broken — UWL-001) |
| Wallet service verified | ✅ (auto-create INSERT broken — UWL-001) |
| Auth module verified | ✅ (INSERT correct) |
| FK integrity verified | ✅ (0 FKs — soft references) |
| Child tables verified | ✅ (0 formal children) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `user_wallets` ✅

**Next table alphabetically: `users` — proceed?**

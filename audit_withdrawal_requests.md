# ENTERPRISE TABLE AUDIT: `withdrawal_requests`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Wallet withdrawal request lifecycle |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   withdrawal_requests  —  EXECUTIVE SNAPSHOT                         │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Financial workflow entity                        │
│  HEALTH:         10/10 — Schema sound, all code column names correct │
│  QUALITY:        9/10 — Domain type has unreferenced `aggregate_version`  │
│  PK:             id (int unsigned)                                    │
│  FK:             3 — users CASCADE, branch_financial_details SET NULL,│
│                  users SET NULL (reviewed_by)                         │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 0                                                    │
│  BACKEND REFS:   30+ across 8 files                                    │
│  FRONTEND REFS:  8 files (page, routes, permissions, sidebar)         │
│  FINDINGS:       None                                                  │
│  RECOMMENDATION: No action required                                   │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — wallet withdrawal request lifecycle (pending→approved→completed or rejected) |
| Evidence | Repository with admin CRUD; wallet service (INSERT); financial command (state transitions); admin service (approve/reject/complete); lifecycle state machine; 5 API routes; admin UI page; reception dashboard; sidebar; 3 permission keys |

---

## 3. PRODUCTION SCHEMA (10 columns)

```
id                          int unsigned AUTO_INCREMENT PK
user_id                     int unsigned NOT NULL           → users(id) ON DELETE CASCADE
wallet_id                   int unsigned NOT NULL           (soft ref to user_wallets)
amount                      decimal(10,2) NOT NULL
branch_financial_details_id int unsigned DEFAULT NULL       → branch_financial_details(id) ON DELETE SET NULL
status                      enum('pending','approved','rejected','completed','cancelled') NOT NULL DEFAULT 'pending'
admin_notes                 text DEFAULT NULL
reviewed_by                 int unsigned DEFAULT NULL       → users(id) ON DELETE SET NULL
reviewed_at                 timestamp NULL DEFAULT NULL
created_at                  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP

Indexes: reviewed_by, idx_withdrawal_user, idx_withdrawal_status, fk_wr_branch_financial
```

---

## 4. APPLICATION CODE REFERENCES

| Layer | SQL | Correct? |
|---|---|---|
| Repository findAll | `SELECT wr.*, u.full_name ... FROM withdrawal_requests wr JOIN users u ...` | ✅ |
| Repository findById | `SELECT wr.*, u.full_name ... WHERE wr.id = ?` | ✅ |
| Repository updateStatus | `UPDATE withdrawal_requests SET status = ?, reviewed_by = ?, admin_notes = ?, reviewed_at = NOW() WHERE id = ?` | ✅ |
| Wallet service INSERT | `INSERT INTO withdrawal_requests (user_id, wallet_id, amount, branch_financial_details_id, status, created_at) VALUES (?, ?, ?, ?, 'pending', NOW())` | ✅ All 6 columns exist |
| Command UPDATE | `UPDATE withdrawal_requests SET status = ?, admin_notes = COALESCE(?, admin_notes), reviewed_at = NOW() WHERE id = ? AND status = ?` | ✅ |
| RBAC cancel on user delete | `UPDATE withdrawal_requests SET status = 'cancelled' WHERE user_id = ? AND status = 'pending'` | ✅ |

All SQL statements reference only columns that exist in production. ✅

---

## 5. FINDINGS

None identified.

---

## 6. OBSERVATIONS

- **`wallet_id` has no FK constraint** — soft reference to `user_wallets`, no referential integrity enforcement.
- **State machine** (`financial-aggregate.ts`) defines allowed transitions: pending→approved/rejected/cancelled, approved→completed/cancelled.
- **`aggregate_version` field** in `WithdrawalRequestRecord` domain interface does not correspond to any production column — unused dead field.
- **Full admin lifecycle:** approve, reject, complete with review tracking (reviewed_by, reviewed_at, admin_notes).

---

## 7. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 8. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | Remove unused `aggregate_version` from `WithdrawalRequestRecord` domain interface | Low |

---

## 9. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (10 cols, 3 FK, 4 indexes) |
| Baseline match | ✅ (identical to production) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (users CASCADE, users SET NULL, branch_financial SET NULL) |
| Child tables verified | ✅ (0 children) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `withdrawal_requests` ✅

**Next table: `workflow_branch_instances` — proceed?**

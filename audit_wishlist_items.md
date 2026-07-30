# ENTERPRISE TABLE AUDIT: `wishlist_items`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Marketplace wishlist (user saves products) |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   wishlist_items  —  EXECUTIVE SNAPSHOT                              │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           3 — Junction table (user ↔ product)                  │
│  HEALTH:         10/10 — Schema sound, all code column names correct │
│  QUALITY:        10/10 — Clean, well-integrated                      │
│  PK:             id (int unsigned)                                    │
│  FK:             2 — users CASCADE, products CASCADE                  │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 0 (AUTO_INCREMENT=4)                                │
│  BACKEND REFS:   4 SQL queries + service DELETE + audit logging       │
│  FRONTEND REFS:  3 pages + 1 route + wishlist badge                  │
│  FINDINGS:       None                                                 │
│  RECOMMENDATION: No action required                                   │
│  CONFIDENCE:     95%                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — marketplace wishlist for saving products |
| Evidence | Repository CRUD (list, add, remove, check); service cascade delete on product removal; 3 API routes; 3 frontend pages with heart-icon toggle and badge count |

---

## 3. PRODUCTION SCHEMA (4 columns)

```
id          int unsigned AUTO_INCREMENT PK (AUTO_INCREMENT=4)
user_id     int unsigned NOT NULL       → users(id) ON DELETE CASCADE
product_id  int unsigned NOT NULL       → products(id) ON DELETE CASCADE
created_at  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP

Indexes: uk_user_product_wish (UNIQUE), idx_user, fk_wish_product
```

---

## 4. APPLICATION CODE REFERENCES

| Layer | SQL | Correct? |
|---|---|---|
| `findWishlist` | `SELECT wi.*, p.name, p.price ... FROM wishlist_items wi JOIN products p ... WHERE wi.user_id = ?` | ✅ |
| `addWishlist` | `INSERT IGNORE INTO wishlist_items (user_id, product_id) VALUES (?, ?)` | ✅ |
| `removeWishlist` | `DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?` | ✅ |
| `isInWishlist` | `SELECT 1 FROM wishlist_items WHERE user_id = ? AND product_id = ?` | ✅ |
| Service | `DELETE FROM wishlist_items WHERE product_id = ?` (cascade on product deletion) | ✅ |

All SQL statements reference only columns that exist in production. ✅

---

## 5. FINDINGS

None identified.

---

## 6. OBSERVATIONS

- **UNIQUE constraint on (user_id, product_id)** prevents duplicate wishlist entries.
- **`INSERT IGNORE`** handles duplicate gracefully.
- **Cascade delete** both ends: deleting a user or product removes wishlist entries.
- **Audit logging** with `entityType: 'wishlist'` on add/remove.
- **Frontend wishlist badge** shows count (capped at 99+) across marketplace listing and detail pages.

---

## 7. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 8. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | (None required) | — |

---

## 9. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (4 cols, 2 FK, 3 indexes) |
| Baseline match | ✅ (identical to production) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (users CASCADE, products CASCADE) |
| Child tables verified | ✅ (0 children) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `wishlist_items` ✅

**Next table: `withdrawal_requests` — proceed?**

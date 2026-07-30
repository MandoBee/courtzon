# ENTERPRISE TABLE AUDIT: `user_addresses`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | User shipping/billing addresses (marketplace) |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   user_addresses  —  EXECUTIVE SNAPSHOT                              │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — User profile detail entity                       │
│  HEALTH:         10/10 — Schema sound, code column names correct     │
│  QUALITY:        10/10 — Clean, well-integrated                      │
│  PK:             id (int unsigned)                                    │
│  FK:             1 — users CASCADE                                    │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 3 (AUTO_INCREMENT=7)                                │
│  BACKEND REFS:   7 SQL queries + service/controller/routes (4 API)   │
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
| Classification | Operational — user delivery addresses for marketplace orders |
| Evidence | Full CRUD in marketplace repository; 4 API routes; Zod validation; audit logging on create/update/delete; used in checkout shipping |

---

## 3. PRODUCTION SCHEMA (16 columns)

```
id              int unsigned AUTO_INCREMENT PK (AUTO_INCREMENT=7)
user_id         int unsigned NOT NULL              → users(id) ON DELETE CASCADE
label           varchar(100) DEFAULT NULL           Home, Work, etc.
full_name       varchar(200) NOT NULL
phone           varchar(50) NOT NULL
street_address  text NOT NULL
city            varchar(200) NOT NULL
state           varchar(200) DEFAULT NULL
province_id     int unsigned DEFAULT NULL
city_id         int unsigned DEFAULT NULL
postal_code     varchar(20) DEFAULT NULL
country         varchar(100) NOT NULL DEFAULT 'Egypt'
address_type    enum('shipping','billing','both') NOT NULL DEFAULT 'both'
is_default      tinyint(1) NOT NULL DEFAULT 0
created_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

Indexes: idx_user, idx_province, idx_city
```

---

## 4. MIGRATION HISTORY

| Migration | Action | Detail |
|---|---|---|
| Baseline | DDL | Present at `001_courtzon_v3.sql:3220-3245` |

---

## 5. CHILD TABLES

None identified.

---

## 6. APPLICATION CODE REFERENCES

**Repository** (`marketplace.repository.ts`):
| Method | SQL | Correct? |
|---|---|---|
| `findAddresses()` | `SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC` | ✅ |
| `findAddressById()` | `SELECT * FROM user_addresses WHERE id = ? AND user_id = ?` | ✅ |
| `createAddress()` | `INSERT INTO user_addresses (user_id, label, full_name, phone, street_address, city, state, postal_code, country, province_id, city_id, is_default, address_type) VALUES (...)` | ✅ All 13 columns exist |
| `updateAddress()` | `UPDATE user_addresses SET ... WHERE id = ? AND user_id = ?` (dynamic fields) | ✅ |
| `deleteAddress()` | `DELETE FROM user_addresses WHERE id = ? AND user_id = ?` | ✅ |

All INSERT columns match production. All SELECT queries use existing columns.

**Service/Controller/Routes:** CRUD with Zod validation, audit logging (ADDRESS.CREATE, ADDRESS.UPDATE, ADDRESS.DELETE), and shipping checkout integration.

---

## 7. FINDINGS

None identified.

---

## 8. OBSERVATIONS

- **3 rows, AUTO_INCREMENT=7** — the review did not establish the reason for that difference.
- **`province_id` and `city_id` are nullable int REFERENCES (no FK)** — soft reference to provinces/cities lookup tables, no referential integrity enforcement.
- **Default `country = 'Egypt'`** — reflects the primary deployment market.
- **Before setting a new default address**, the repository unsets existing defaults (`UPDATE ... SET is_default = FALSE WHERE user_id = ?`) — correct pattern ensuring only one default per user.
- **Full audit trail** — all address state changes are logged with entity type, ID, and diff.

---

## 9. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 10. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | (None required) | — |

---

## 11. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (16 cols, 1 FK, 3 indexes) |
| Baseline match | ✅ (identical to production) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (users CASCADE) |
| Child tables verified | ✅ (0 children) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `user_addresses` ✅

**Next table alphabetically: `user_branches` — proceed?**

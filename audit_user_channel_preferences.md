# ENTERPRISE TABLE AUDIT: `user_channel_preferences`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Notification channel preferences per user per category |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   user_channel_preferences  —  EXECUTIVE SNAPSHOT                    │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — User preference detail                           │
│  HEALTH:         10/10 — Schema sound, code column names correct     │
│  QUALITY:        9/10 — Missing FK to users, charset inconsistency   │
│  PK:             id (bigint unsigned)                                  │
│  FK:             0 (no enforced FKs)                                  │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 0                                                    │
│  BACKEND REFS:   6 SQL queries across 3 files                         │
│  FRONTEND REFS:  0                                                     │
│  FINDINGS:       None                                                  │
│  RECOMMENDATION: No action required                                    │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — per-user notification channel routing and failover configuration |
| Evidence | UPSERT and SELECT in communication-preference service, failover service, and enterprise admin controller |

---

## 3. PRODUCTION SCHEMA (9 columns)

```
id               bigint unsigned AUTO_INCREMENT PK
user_id          int unsigned NOT NULL
category_slug    varchar(50) NOT NULL
channels         json NOT NULL
failover_enabled tinyint(1) NOT NULL DEFAULT 0
failover_chain   json DEFAULT NULL
is_active        tinyint(1) NOT NULL DEFAULT 1
created_at       timestamp NULL DEFAULT CURRENT_TIMESTAMP
updated_at       timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

Indexes: uk_user_category (UNIQUE user_id, category_slug), idx_channel_user
```

Created by M015 — not in baseline (SF-002 consistent).

---

## 4. CHILD TABLES

None identified.

---

## 5. APPLICATION CODE REFERENCES

### Backend

**`communication-preference.service.ts`:**
| Line | SQL | Correct? |
|---|---|---|
| 26 | `SELECT * FROM user_channel_preferences WHERE user_id = ?` | ✅ |
| 93 | `INSERT INTO user_channel_preferences (user_id, category_slug, channels, is_active) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE channels = VALUES(channels)` | ✅ All columns exist |

**`failover.service.ts`:**
| Line | SQL | Correct? |
|---|---|---|
| 13 | `SELECT failover_enabled, failover_chain FROM user_channel_preferences WHERE user_id = ? AND category_slug = ? AND is_active = TRUE` | ✅ |
| 39 | `SELECT channels, failover_enabled, failover_chain FROM user_channel_preferences WHERE user_id = ? AND category_slug = ? AND is_active = TRUE` | ✅ |

**`enterprise-admin.controller.ts`:**
| Line | SQL | Correct? |
|---|---|---|
| 216 | `SELECT * FROM user_channel_preferences WHERE user_id = ? ORDER BY category_slug` | ✅ |
| 228 | `INSERT INTO user_channel_preferences (user_id, category_slug, channels, failover_enabled, failover_chain) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE channels=VALUES(channels), failover_enabled=VALUES(failover_enabled), failover_chain=VALUES(failover_chain)` | ✅ All columns exist |

All INSERT and SELECT references use columns present in the production schema.

---

## 6. FINDINGS

None identified.

---

## 7. OBSERVATIONS

- **No FK constraint on `user_id`** — referential integrity to `users` is not enforced at the DB level. The application ensures user existence via service logic.
- **Charset `utf8mb4_0900_ai_ci`** differs from the majority of tables (`utf8mb4_unicode_ci`). This table was created by M015 with its own charset specification, while most baseline tables use `utf8mb4_unicode_ci`. No JOINs currently involve this table, so no practical impact.
- **JSON columns for `channels` and `failover_chain`** — flexible schema supporting channel routing (email, push, SMS, in_app) and ordered failover chains.
- **UNIQUE constraint on (user_id, category_slug)** ensures one preference row per user per notification category.
- **0 rows observed** — no users have configured channel preferences yet.
- **Not in baseline** — consistent with SF-002 (baseline drift).

---

## 8. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 9. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | Consider adding FK constraint `user_id → users(id)` for referential integrity | Low |

---

## 10. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (9 cols, 0 FK, 2 indexes) |
| Migration verified | ✅ (M015) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (0 FKs — soft reference to users) |
| Child tables verified | ✅ (0 children) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `user_channel_preferences` ✅

**Next table alphabetically: `user_devices` — proceed?**

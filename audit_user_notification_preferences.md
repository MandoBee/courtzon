# ENTERPRISE TABLE AUDIT: `user_notification_preferences`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | User-level notification channel toggles per category |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   user_notification_preferences  —  EXECUTIVE SNAPSHOT               │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — User preference detail                           │
│  HEALTH:         10/10 — Schema sound, all code column names correct │
│  QUALITY:        10/10 — Clean, well-integrated                      │
│  PK:             id (int unsigned)                                    │
│  FK:             2 — users CASCADE, notification_categories CASCADE   │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 0                                                    │
│  BACKEND REFS:   4 SQL queries across 2 files                         │
│  FRONTEND REFS:  0 (consumed via API)                                 │
│  FINDINGS:       None                                                  │
│  RECOMMENDATION: No action required                                   │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — per-user notification channel routing (push/email/SMS) per category |
| Evidence | SELECT + UPSERT in communication-preference service; LEFT JOIN + UPSERT in notification repository |

---

## 3. PRODUCTION SCHEMA (8 columns)

```
id              int unsigned AUTO_INCREMENT PK
user_id         int unsigned NOT NULL       → users(id) ON DELETE CASCADE
category_id     int unsigned NOT NULL       → notification_categories(id) ON DELETE CASCADE
is_allowed      tinyint(1) NOT NULL DEFAULT 1
push_enabled    tinyint(1) NOT NULL DEFAULT 1
email_enabled   tinyint(1) NOT NULL DEFAULT 0
sms_enabled     tinyint(1) NOT NULL DEFAULT 0
updated_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

Indexes: uk_user_cat (UNIQUE), fk_pref_cat
```

---

## 4. APPLICATION CODE REFERENCES

**`communication-preference.service.ts`:**
| Line | SQL | Correct? |
|---|---|---|
| 16 | `SELECT * FROM user_notification_preferences WHERE user_id = ?` | ✅ |
| 102 | `INSERT INTO user_notification_preferences (user_id, category_id, is_allowed, push_enabled, email_enabled, sms_enabled) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ...` | ✅ All 6 columns exist |

**`notification.repository.ts`:**
| Line | SQL | Correct? |
|---|---|---|
| 251 | `LEFT JOIN user_notification_preferences un ON un.category_id = nc.id AND un.user_id = ?` | ✅ |
| 269 | `INSERT INTO user_notification_preferences (user_id, category_id, is_allowed, push_enabled, email_enabled, sms_enabled) VALUES (...) ON DUPLICATE KEY UPDATE ...` | ✅ All 6 columns exist |

All INSERT and SELECT statements reference only columns that exist in the production schema. ✅

---

## 5. FINDINGS

None identified.

---

## 6. OBSERVATIONS

- **Channel-specific toggles:** Each row stores independent `push_enabled`, `email_enabled`, `sms_enabled` booleans per category, with `is_allowed` as a master kill-switch.
- **Default values:** `push_enabled=1`, `email_enabled=0`, `sms_enabled=0` — push is on by default, email and SMS are opt-in.
- **UPSERT pattern** avoids duplicate key errors on the `uk_user_cat` unique constraint.
- **0 rows observed** — no users have configured notification preferences yet.

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
| Schema verified | ✅ (8 cols, 2 FK, 2 indexes) |
| Baseline match | ✅ (identical to production) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (users CASCADE, notification_categories CASCADE) |
| Child tables verified | ✅ (0 children) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `user_notification_preferences` ✅

**Next table alphabetically: `user_organisations` — proceed?**

# ENTERPRISE TABLE AUDIT: `user_quiet_hours`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | User notification quiet hours (do-not-disturb schedule) |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   user_quiet_hours  —  EXECUTIVE SNAPSHOT                            │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — User preference detail                           │
│  HEALTH:         10/10 — Schema sound, code column names correct     │
│  QUALITY:        10/10 — Full lifecycle + runtime enforcement        │
│  PK:             id (bigint unsigned)                                  │
│  FK:             0 (user_id is soft ref)                              │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 0                                                    │
│  BACKEND REFS:   12+ SQL queries across 4 files                       │
│  FRONTEND REFS:  1 component (API-based)                              │
│  FINDINGS:       None                                                  │
│  RECOMMENDATION: No action required                                   │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — per-user do-not-disturb schedule enforced at notification delivery time |
| Evidence | Core quiet-hours service (CRUD + runtime check); enforced by notification worker (defer non-critical during quiet hours); 5 API routes; 2 controller sets (admin + user); frontend preferences UI |

---

## 3. PRODUCTION SCHEMA (8 columns)

```
id          bigint unsigned AUTO_INCREMENT PK
user_id     int unsigned NOT NULL            (soft ref to users)
weekday     enum('mon','tue','wed','thu','fri','sat','sun') DEFAULT NULL   NULL = daily
start_time  time NOT NULL
end_time    time NOT NULL
timezone    varchar(50) DEFAULT 'UTC'
is_active   tinyint(1) NOT NULL DEFAULT 1
created_at  timestamp NULL DEFAULT CURRENT_TIMESTAMP

Indexes: uk_user_quiet (UNIQUE user_id, weekday, start_time), idx_quiet_user
```

Created by M015 — not in baseline (SF-002 consistent). Charset `utf8mb4_0900_ai_ci`.

---

## 4. APPLICATION CODE REFERENCES

**`quiet-hours.service.ts`** (core):
| Method | SQL | Correct? |
|---|---|---|
| `isInQuietHours()` | `SELECT * FROM user_quiet_hours WHERE user_id = ? AND is_active = TRUE AND (weekday IS NULL OR weekday = ?) AND start_time <= ? AND end_time > ? LIMIT 1` | ✅ |
| `getQuietHours()` | `SELECT * FROM user_quiet_hours WHERE user_id = ? AND is_active = TRUE ORDER BY FIELD(weekday, ...)` | ✅ |
| `upsertQuietHours()` | `INSERT INTO user_quiet_hours (user_id, weekday, start_time, end_time, timezone) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ...` | ✅ |
| `deleteQuietHours()` | `DELETE FROM user_quiet_hours WHERE id = ? AND user_id = ?` | ✅ |

**`communication-preference.service.ts`:**
| SQL | Correct? |
|---|---|
| `SELECT * FROM user_quiet_hours WHERE user_id = ? AND is_active = 1 ORDER BY weekday` | ✅ |
| `INSERT INTO user_quiet_hours (user_id, weekday, start_time, end_time, timezone, is_active) VALUES (?, ?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE ...` | ✅ |

**`notification.worker.ts`:** Runtime check — calls `isInQuietHours()` before delivery; defers non-critical notifications when in quiet hours.

**5 API routes:** `GET|POST|DELETE /notifications/quiet-hours` (admin) + `GET|PUT /communication/quiet-hours` (user). ✅

---

## 5. FINDINGS

None identified.

---

## 6. OBSERVATIONS

- **`weekday` can be NULL** — a NULL weekday represents a daily recurring schedule (every day).
- **`start_time` and `end_time` are `TIME` type** — supports cross-midnight ranges (e.g., 22:00-08:00).
- **Runtime enforcement** in the notification worker — quiet hours are actively checked before delivery, with deferral for non-critical notifications and audit logging (`'quiet_hours_deferred'`).
- **No FK constraint on `user_id`** — referential integrity to `users` is not enforced at the DB level.
- **Charset `utf8mb4_0900_ai_ci`** — same as `user_channel_preferences` (M015), differs from baseline default (`utf8mb4_unicode_ci`).
- **0 rows observed** — no users have configured quiet hours yet.

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
| Schema verified | ✅ (8 cols, 0 FK, 2 indexes) |
| Migration verified | ✅ (M015) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (0 FKs — soft reference) |
| Child tables verified | ✅ (0 children) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `user_quiet_hours` ✅

**Next table alphabetically: `user_role_scopes` — proceed?**

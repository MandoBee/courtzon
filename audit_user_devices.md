# ENTERPRISE TABLE AUDIT: `user_devices`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | User device registry (auth sessions + push notifications) |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   user_devices  —  EXECUTIVE SNAPSHOT                                │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — User device detail                               │
│  HEALTH:         4/10 — Dual schema conflict; notification module    │
│                  references non-existent columns                     │
│  QUALITY:        4/10 — Auth module works, notify module broken      │
│  PK:             id (int unsigned)                                    │
│  FK:             1 — users CASCADE                                    │
│  CHILDREN:       1 — user_sessions                                    │
│  PRODUCTION ROWS: 0                                                    │
│  BACKEND REFS:   15+ across 5 files                                    │
│  FRONTEND REFS:  0                                                     │
│  FINDINGS:       1 — UDV-001 (Critical)                               │
│  RECOMMENDATION: Resolve dual schema conflict                        │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — device tracking for auth (sessions, fingerprints) and notifications (push tokens, providers) |
| Evidence | Auth device repository (CRUD by fingerprint); notification device service (register, push tokens, deactivate); push provider (token queries); player service (list/remove); security module (JOIN with user_sessions) |

---

## 3. PRODUCTION SCHEMA (13 columns)

```
id                  int unsigned AUTO_INCREMENT PK
user_id             int unsigned NOT NULL              → users(id) ON DELETE CASCADE
device_fingerprint  varchar(255) NOT NULL
device_name         varchar(255) DEFAULT NULL
device_type         enum('mobile','tablet','desktop','other') DEFAULT NULL
os                  varchar(100) DEFAULT NULL
browser             varchar(100) DEFAULT NULL
ip_address          varchar(45) NOT NULL
user_agent          text DEFAULT NULL
is_active           tinyint(1) NOT NULL DEFAULT 1
last_seen_at        timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
first_seen_at       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
created_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP

Indexes: idx_user, idx_fingerprint
```

---

## 4. MIGRATION HISTORY

| Migration | Action | Detail |
|---|---|---|
| Baseline | DDL | Present at `001_courtzon_v3.sql:3247-3268` (baseline schema) |
| M015 | CREATE TABLE IF NOT EXISTS | `015_notification_enterprise_platform.sql:26-45` — enterprise schema with `device_id`, `platform`, `push_token`, `push_provider`, `push_token_expires_at` — **skipped** in production because baseline table already exists |

**Critical context:** M015's `CREATE TABLE IF NOT EXISTS` was silently skipped because the table already existed from the baseline. The migration defined a completely different column set but never got to apply it because the table name was already taken.

---

## 5. CHILD TABLES

| Table | FK Column | Constraint |
|---|---|---|
| `user_sessions` | `device_id` | FK → `user_devices(id)` |

---

## 6. APPLICATION CODE REFERENCES

### 6a. Auth Module (WORKING — uses baseline columns)

**File:** `backend/src/modules/auth/infrastructure/repositories/device.repository.ts`

| Method | SQL | Correct? |
|---|---|---|
| `findByFingerprint()` | `SELECT id FROM user_devices WHERE user_id = ? AND device_fingerprint = ?` | ✅ |
| `touch()` | `UPDATE user_devices SET last_seen_at = NOW(), ip_address = ?, user_agent = ? WHERE id = ?` | ✅ |
| `create()` | `INSERT INTO user_devices (user_id, device_fingerprint, device_name, device_type, os, browser, ip_address, user_agent)` | ✅ All 8 columns exist |

### 6b. Player Service (WORKING — uses baseline columns)

**File:** `backend/src/modules/player-experience/application/player.service.ts`

| SQL | Correct? |
|---|---|
| `SELECT id, device_name, device_type, os, browser, last_seen_at AS last_active_at, created_at FROM user_devices WHERE user_id = ?` | ✅ |
| `DELETE FROM user_devices WHERE id = ? AND user_id = ?` | ✅ |

### 6c. Notification Device Service (BROKEN — uses M015 columns)

**File:** `backend/src/modules/notifications/application/device.service.ts`

| Method | Line | Issue |
|---|---|---|
| `registerDevice()` INSERT | 40-48 | References `device_id`, `platform`, `push_token`, `push_provider`, `push_token_expires_at` — none exist in production |
| `deactivateDevice()` | 88 | `WHERE user_id = ? AND device_id = ?` — `device_id` doesn't exist |
| `touchDevice()` | 99 | `WHERE user_id = ? AND device_id = ?` — `device_id` doesn't exist |
| `updatePushToken()` | 113 | `SET push_token = ?, push_provider = ?, push_token_expires_at = ?` — none exist; `WHERE device_id = ?` — doesn't exist |

### 6d. Push Provider (BROKEN — uses M015 columns)

**File:** `backend/src/modules/notifications/infrastructure/providers/push.provider.ts`

| Line | Issue |
|---|---|
| 20-22 | `SELECT push_token, push_provider FROM user_devices WHERE ...` — neither column exists in production |

---

## 7. FINDINGS

---

### UDV-001: Notification module device service references non-existent columns

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:**
1. Production schema has `device_fingerprint`, `device_type`, `first_seen_at` — NOT `device_id`, `platform`, `push_token`, `push_provider`, `push_token_expires_at`
2. M015 defines a different schema with those columns but used `CREATE TABLE IF NOT EXISTS` which was skipped because the baseline table already existed
3. `device.service.ts:40-42` — INSERT references `device_id`, `platform`, `push_token`, `push_provider`, `push_token_expires_at` — 5 columns that don't exist
4. `device.service.ts:88` — deactivate: `WHERE device_id = ?` — column doesn't exist
5. `device.service.ts:99` — touch: `WHERE device_id = ?` — column doesn't exist
6. `device.service.ts:113` — updatePushToken: `SET push_token = ?, push_provider = ?, push_token_expires_at = ?` — 3 columns that don't exist; `WHERE device_id = ?` — column doesn't exist
7. `push.provider.ts:20-22` — `SELECT push_token, push_provider FROM user_devices` — 2 columns that don't exist

**Root Cause:**
Migration M015 defined `user_devices` with a new enterprise schema, using `CREATE TABLE IF NOT EXISTS`. Since the baseline already created the table, the DDL was silently skipped. The notification module's device service and push provider were written against the M015 schema, which was never applied.

**Impact:**
- Fact: The reviewed SQL statements reference columns that are not present in the reviewed production schema. If those statements are executed against that schema, the database is expected to reject the queries.
- Expected: 0 production rows were observed during the review. No runtime evidence was identified demonstrating successful execution of these operations.

**Recommendation:**
1. Add the M015 columns to the production schema via a new ALTER TABLE migration: `device_id VARCHAR(255)`, `platform ENUM(...)`, `push_token VARCHAR(500)`, `push_provider ENUM(...)`, `push_token_expires_at TIMESTAMP`
2. Add UNIQUE KEY `uk_device` on `device_id`
3. Or, alternatively, rewrite the notification device service to use the existing baseline columns (`device_fingerprint` + `device_name`/`device_type` for platform detection)
4. Remove the `CREATE TABLE IF NOT EXISTS` from M015 to prevent future confusion

---

## 8. OBSERVATIONS

- **Dual schema ownership:** Auth module (baseline schema, working) vs Notification module (M015 schema, broken) — same pattern as tournaments/activities dual ownership (SF-003).
- **0 production rows were observed** during the review. The review did not establish whether these code paths have or have not been executed.
- **`user_sessions.device_id` FK references `user_devices(id)`** — this is the id column, not the device_id string. The FK is intact and functional for the auth module's usage.
- **The auth module correctly uses `device_fingerprint`**, inserts all required columns, and its queries match the production schema perfectly.
- **`first_seen_at` is set to `CURRENT_TIMESTAMP`** on insert and never updated — it correctly captures the device's first appearance.

---

## 9. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 10. RECOMMENDATIONS

| # | Action | Priority | Tied To |
|---|---|---|---|
| 1 | Add M015 columns to production schema via ALTER TABLE migration | Critical | UDV-001 |
| 2 | Or rewrite notification device service to use existing baseline columns | Critical | UDV-001 |
| 3 | Fix or remove M015's `CREATE TABLE IF NOT EXISTS` for `user_devices` | High | UDV-001 |

---

## 11. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (13 cols, 1 FK, 2 indexes) |
| Baseline match | ✅ (identical to production) |
| Migration M015 reviewed | ✅ (schema conflict identified) |
| Auth module code verified | ✅ (all INSERT/SELECT columns correct) |
| Notification module code verified | ✅ (write operations broken — UDV-001) |
| Player service code verified | ✅ (all SELECT/DELETE columns correct) |
| FK integrity verified | ✅ (users CASCADE) |
| Child tables verified | ✅ (1: user_sessions) |
| Code vs schema alignment | ⚠️ Partial — auth module aligned, notification module broken |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `user_devices` ✅

**Next table alphabetically: `user_follows` — proceed?**

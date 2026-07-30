# ENTERPRISE TABLE AUDIT: `user_sessions`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Auth session tracking |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   user_sessions  —  EXECUTIVE SNAPSHOT                               │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Auth / security entity                           │
│  HEALTH:         7/10 — Schema sound, but security module references │
│                  non-existent column                                 │
│  QUALITY:        7/10 — 3 security queries reference `suspicious`   │
│  PK:             id (int unsigned)                                    │
│  FK:             2 — users CASCADE, user_devices SET NULL             │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 337 (AUTO_INCREMENT=722)                            │
│  BACKEND REFS:   20+ SQL across 7 files                               │
│  FRONTEND REFS:  0                                                     │
│  FINDINGS:       1 — USR-001 (High)                                   │
│  RECOMMENDATION: Add `suspicious` column or remove security queries   │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — session management for auth, security monitoring, active-user reports, and WebSocket authentication |
| Evidence | Session CRUD in auth module; security dashboard (active/suspicious sessions); app.ts auth middleware; WebSocket auth; reports active-user trends; RBAC cascade session revoke; scheduled cleanup event |

---

## 3. PRODUCTION SCHEMA (13 columns)

```
id                       int unsigned AUTO_INCREMENT PK (AUTO_INCREMENT=722)
user_id                  int unsigned NOT NULL           → users(id) ON DELETE CASCADE
device_id                int unsigned DEFAULT NULL       → user_devices(id) ON DELETE SET NULL
refresh_token_hash       varchar(255) NOT NULL
ip_address               varchar(45) NOT NULL
ip_country               varchar(100) DEFAULT NULL
user_agent               text DEFAULT NULL
expires_at               timestamp NOT NULL
refresh_token_expires_at timestamp NULL DEFAULT NULL     [M030]
last_activity_at         timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
is_revoked               tinyint(1) NOT NULL DEFAULT 0
created_at               timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
session_token_hash       char(64) NOT NULL DEFAULT ''

Indexes: idx_user, idx_expires, fk_session_device, idx_sessions_active,
         idx_sessions_cleanup, idx_sessions_token_hash,
         idx_user_sessions_refresh_expires [M030]
```

Scheduled event: `ev_cleanup_expired_sessions` — periodic cleanup.

---

## 4. APPLICATION CODE REFERENCES

**Session repository** (`session.repository.ts`): Full CRUD (INSERT, SELECT by token hash, revoke by id/user/all, count active, enforce session limits, expire cleanup) ✅

**Auth middleware** (`app.ts:213`): `SELECT ... WHERE session_token_hash = ? AND is_revoked = FALSE AND expires_at > NOW()` ✅

**WebSocket auth** (`realtime/index.ts:68-71`): Same pattern ✅

**Security repository** (`security.repository.ts`):
| Line | SQL | Issue |
|---|---|---|
| 36-40 | `WHERE us.suspicious = TRUE AND us.is_revoked = FALSE AND us.expires_at > NOW()` | `suspicious` column does not exist |
| 149 | `SELECT COUNT(*) FROM user_sessions WHERE suspicious = TRUE AND is_revoked = FALSE` | `suspicious` column does not exist |
| 182-188 | `WHERE us.suspicious = TRUE AND us.is_revoked = FALSE` | `suspicious` column does not exist |

**Reports** (`reports.repository.ts`): Active-user trend aggregation ✅

**RBAC** (`rbac.service.ts:346`): Session revoke on user deletion ✅

---

## 5. FINDINGS

---

### USR-001: Security repository references non-existent `suspicious` column

| Field | Value |
|---|---|
| **Severity** | High |
| **Classification** | Finding |
| **Confidence** | A (95%) |

**Evidence:**
1. Production schema has 13 columns — no `suspicious` column (verified via `SHOW CREATE TABLE` and `information_schema.COLUMNS`)
2. `security.repository.ts:36-40` — `getSuspiciousSessions()`: `WHERE us.suspicious = TRUE`
3. `security.repository.ts:149` — `getSecurityDashboardStats()`: `WHERE suspicious = TRUE AND is_revoked = FALSE`
4. `security.repository.ts:182-188` — `getRecentSecurityAlerts()`: `WHERE us.suspicious = TRUE`

**Root Cause:**
Archived migration `030_session_device_fingerprint.sql` defined a `suspicious BOOLEAN DEFAULT FALSE` column, but this migration was never applied to production. The security module was written expecting this column to exist.

**Impact:**
- Fact: The reviewed SQL statements reference a column that is not present in the reviewed production schema. If those statements are executed against that schema, the database is expected to reject the queries.
- Expected: 337 production rows were observed during the review. The review identified SQL statements that reference a column not present in the reviewed production schema. Whether those code paths are executed in production was not established.

**Recommendation:**
1. Add the `suspicious` column via a new migration: `ALTER TABLE user_sessions ADD COLUMN suspicious TINYINT(1) NOT NULL DEFAULT 0 AFTER is_revoked`
2. Add index `idx_sessions_suspicious (suspicious, expires_at)`
3. Or, alternatively, remove the `suspicious` references from the security repository if the feature is not needed

---

## 6. OBSERVATIONS

- **337 rows, AUTO_INCREMENT=722** — the review did not establish the reason for that difference.
- **7 indexes** for query optimization across multiple access patterns (active sessions, cleanup, token lookup, user lookup).
- **Scheduled event `ev_cleanup_expired_sessions`** automatically marks expired sessions as revoked.
- **Session token hashing** (`session_token_hash CHAR(64)`, SHA-256) was a security improvement applied historically (archive migration 126) — plaintext tokens were replaced with hashed versions.
- **M030** added `refresh_token_expires_at` column and composite index — present in production.

---

## 7. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 8. RECOMMENDATIONS

| # | Action | Priority | Tied To |
|---|---|---|---|
| 1 | Add `suspicious` column or remove security queries | High | USR-001 |

---

## 9. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (13 cols, 2 FK, 7 indexes) |
| Baseline match | ✅ (identical to production; M030 applied) |
| Auth module code verified | ✅ (all column names correct) |
| Security module code verified | ⚠️ (`suspicious` column broken — USR-001) |
| FK integrity verified | ✅ (users CASCADE, devices SET NULL) |
| Child tables verified | ✅ (0 children) |
| Code vs schema alignment | ⚠️ Partial — auth aligned, security module broken |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `user_sessions` ✅

**Next table alphabetically: `user_wallets` — proceed?**

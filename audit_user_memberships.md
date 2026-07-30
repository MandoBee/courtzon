# ENTERPRISE TABLE AUDIT: `user_memberships`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | User membership assignment (membership plan lifecycle) |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   user_memberships  —  EXECUTIVE SNAPSHOT                            │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Membership lifecycle entity                      │
│  HEALTH:         10/10 — Schema sound, all code column names correct │
│  QUALITY:        10/10 — Full lifecycle management, clean            │
│  PK:             id (int unsigned)                                    │
│  FK:             1 — membership_plans CASCADE (user_id is soft ref)   │
│  CHILDREN:       1 — membership_history CASCADE                      │
│  PRODUCTION ROWS: 0                                                    │
│  BACKEND REFS:   10 SQL queries + 8 API routes + 7 handlers          │
│  FRONTEND REFS:  0                                                     │
│  FINDINGS:       None                                                  │
│  RECOMMENDATION: No action required                                   │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — user membership plan assignment and lifecycle (assign, freeze, resume, cancel, expire, renew) |
| Evidence | Full CRUD in user-membership service; 8 admin API routes; 7 controller handlers; domain type; Zod validation; audit logging |

---

## 3. PRODUCTION SCHEMA (12 columns)

```
id                  int unsigned AUTO_INCREMENT PK
user_id             int unsigned NOT NULL              (soft ref to users)
membership_plan_id  int unsigned NOT NULL              → membership_plans(id) ON DELETE CASCADE
status              enum('pending','active','frozen','expired','cancelled','completed') NOT NULL DEFAULT 'pending'
start_date          date NOT NULL
end_date            date DEFAULT NULL
renewal_type        enum('auto','manual','none') NOT NULL DEFAULT 'manual'
cancelled_at        timestamp NULL DEFAULT NULL
expired_at          timestamp NULL DEFAULT NULL
frozen_at           timestamp NULL DEFAULT NULL
created_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

Indexes: idx_user_membership_user, idx_user_membership_plan, idx_user_membership_status
```

Created by M020 — not in baseline (SF-002 consistent).

---

## 4. CHILD TABLES

| Table | FK Column | Constraint |
|---|---|---|
| `membership_history` | `user_membership_id` | `fk_history_membership` CASCADE |

---

## 5. APPLICATION CODE REFERENCES

**Service** (`user-membership.service.ts`):

| Method | SQL | Correct? |
|---|---|---|
| `assign()` | `SELECT id FROM user_memberships WHERE user_id = ? AND status IN ('active','frozen') LIMIT 1` | ✅ |
| | `INSERT INTO user_memberships (user_id, membership_plan_id, status, start_date, end_date, renewal_type) VALUES (?, ?, 'active', ?, ?, ?)` | ✅ All 6 columns exist |
| `getUserMemberships()` | `SELECT um.*, mp.code, mp.name, mp.category FROM user_memberships um LEFT JOIN membership_plans mp ...` | ✅ |
| `getById()` | `SELECT * FROM user_memberships WHERE id = ?` | ✅ |
| `freeze()` | `UPDATE user_memberships SET status = 'frozen', frozen_at = NOW() WHERE id = ?` | ✅ |
| `resume()` | `UPDATE user_memberships SET status = 'active', frozen_at = NULL WHERE id = ?` | ✅ |
| `cancel()` | `UPDATE user_memberships SET status = 'cancelled', cancelled_at = NOW() WHERE id = ?` | ✅ |
| `expire()` | `UPDATE user_memberships SET status = 'expired', expired_at = NOW() WHERE id = ?` | ✅ |
| `renew()` | `UPDATE user_memberships SET status = 'active', membership_plan_id = ?, start_date = ?, end_date = ?, renewal_type = 'auto', cancelled_at = NULL, expired_at = NULL, frozen_at = NULL WHERE id = ?` | ✅ |

**Plan service** (`membership-plan.service.ts:196`):
`SELECT COUNT(*) FROM user_memberships WHERE membership_plan_id = ? AND status = 'active'` — guard against deleting plan with active members ✅

**8 API routes** under `POST/GET /admin/membership/*` with audit logging. ✅

---

## 6. FINDINGS

None identified.

---

## 7. OBSERVATIONS

- **No FK constraint on `user_id`** — referential integrity to `users` is not enforced at the DB level. The application ensures user existence via service logic.
- **Lifecycle timestamps pattern:** Each status transition sets its corresponding timestamp (`frozen_at`, `cancelled_at`, `expired_at`) — the renew() method clears all three on reactivation.
- **`renewal_type` enum** controls auto-renewal behaviour: `auto`, `manual`, `none`.

---

## 8. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 9. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | (None required) | — |

---

## 10. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (12 cols, 1 FK, 3 indexes) |
| Migration verified | ✅ (M020) |
| Domain type verified | ✅ (matches production) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (membership_plans CASCADE) |
| Child tables verified | ✅ (1: membership_history CASCADE) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `user_memberships` ✅

**Next table alphabetically: `user_notification_preferences` — proceed?**

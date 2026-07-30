# ENTERPRISE TABLE AUDIT: `user_roles`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | RBAC — user-to-role assignment |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   user_roles  —  EXECUTIVE SNAPSHOT                                  │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           1 — Core RBAC entity                                 │
│  HEALTH:         10/10 — Schema sound, all code column names correct │
│  QUALITY:        10/10 — Heavily integrated, critical infrastructure │
│  PK:             id (int unsigned)                                    │
│  FK:             3 — users CASCADE + SET NULL, roles CASCADE          │
│  CHILDREN:       1 — user_role_scopes CASCADE                        │
│  PRODUCTION ROWS: 9 (AUTO_INCREMENT=120)                              │
│  BACKEND REFS:   114+ across 34+ files                                 │
│  FRONTEND REFS:  1 page (UserEditModal.tsx)                           │
│  FINDINGS:       None                                                  │
│  RECOMMENDATION: No action required                                   │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — core RBAC infrastructure linking users to roles with assignment metadata |
| Evidence | 114+ SQL references across 34+ files including app.ts route guards; auth, RBAC, org, marketplace, settlement, upload, reports, security, booking, notifications, design-tokens, and approvals modules |

---

## 3. PRODUCTION SCHEMA (7 columns)

```
id            int unsigned AUTO_INCREMENT PK (AUTO_INCREMENT=120)
user_id       int unsigned NOT NULL        → users(id) ON DELETE CASCADE
role_id       int unsigned NOT NULL        → roles(id) ON DELETE CASCADE
assigned_by   int unsigned DEFAULT NULL    → users(id) ON DELETE SET NULL
assigned_at   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
expires_at    timestamp NULL DEFAULT NULL
is_active     tinyint(1) NOT NULL DEFAULT 1

Indexes: uk_user_role (UNIQUE), fk_ur_role, fk_ur_assigner
```

---

## 4. CHILD TABLES

| Table | FK Column | Constraint |
|---|---|---|
| `user_role_scopes` | `user_role_id` | `fk_scope_userrole` CASCADE |

---

## 5. APPLICATION CODE REFERENCES

All INSERT/SELECT/UPDATE/DELETE statements reference only columns that exist in production. ✅

Key usage patterns:
- **Route guards** (`app.ts`): 9 inline SQL queries checking role slugs and permissions
- **RBAC service/repo**: Full CRUD (assign, remove, list, get permissions, manage scopes)
- **Auth service**: Role assignment during registration (seller, org-admin)
- **Org portal**: Staff role management (add, remove, list, deactivate)
- **Marketplace**: Order role resolution
- **Upload routes**: Access guards
- **Settlement**: Org role checks
- **Reports**: Aggregation queries
- **Security**: Metrics
- **Notifications**: Targeted dispatch
- **Socket.IO**: Real-time role resolution

---

## 6. FINDINGS

None identified.

---

## 7. OBSERVATIONS

- **Most heavily integrated table in the audit** — 114+ refs across 34+ files touching nearly every module.
- **9 rows, AUTO_INCREMENT=120** — the review did not establish the reason for that difference.
- **Unique constraint `uk_user_role`** prevents duplicate role assignments per user; the `ON DUPLICATE KEY UPDATE is_active = TRUE` pattern in marketplace ensures idempotent reactivation.
- **Soft deactivation via `is_active = FALSE`** rather than hard DELETE — used by rbac.service.removeUserRole and org portal staff removal.

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
| Schema verified | ✅ (7 cols, 3 FK, 3 indexes) |
| Baseline match | ✅ (identical to production) |
| Application code verified | ✅ (114+ refs, all column names correct) |
| FK integrity verified | ✅ (users CASCADE + SET NULL, roles CASCADE) |
| Child tables verified | ✅ (1: user_role_scopes CASCADE) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `user_roles` ✅

**Next table alphabetically: `user_sessions` — proceed?**

# ENTERPRISE TABLE AUDIT: `user_organisations`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Junction — user-to-organisation membership |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   user_organisations  —  EXECUTIVE SNAPSHOT                          │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           3 — Junction table                                    │
│  HEALTH:         10/10 — Schema sound, code column names correct     │
│  QUALITY:        10/10 — Clean, simple, fit for purpose              │
│  PK:             id (int unsigned)                                    │
│  FK:             2 — users CASCADE, organisations CASCADE             │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 2 (AUTO_INCREMENT=4)                                │
│  BACKEND REFS:   3 SQL queries across 3 files                         │
│  FRONTEND REFS:  1 component (uses derived user object)               │
│  FINDINGS:       None                                                  │
│  RECOMMENDATION: No action required                                   │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — user-to-org membership for socket room resolution, notification dispatch, player matching |
| Evidence | 3 SELECT queries in socket-room-manager, dispatcher, player-matching services; migration seed populates from existing data |

---

## 3. PRODUCTION SCHEMA (5 columns)

```
id                int unsigned AUTO_INCREMENT PK (AUTO_INCREMENT=4)
user_id           int unsigned NOT NULL       → users(id) ON DELETE CASCADE
organisation_id   int unsigned NOT NULL       → organisations(id) ON DELETE CASCADE
role_in_org       varchar(50) DEFAULT 'member'  owner, admin, member
created_at        timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP

Indexes: uk_user_org (UNIQUE), idx_org
```

Created by M060 — not in baseline (SF-002 consistent).

---

## 4. APPLICATION CODE REFERENCES

| File | Line | SQL | Correct? |
|---|---|---|---|
| `socket-room-manager.ts` | 13 | `SELECT organisation_id FROM user_organisations WHERE user_id = ?` | ✅ |
| `player-matching.service.ts` | 88-90 | `EXISTS (SELECT 1 FROM user_organisations uo JOIN branches b ... WHERE uo.user_id = u.id AND b.id = ?)` | ✅ |
| `dispatcher.service.ts` | 228-229 | `JOIN user_organisations uo ON u.id = uo.user_id WHERE uo.organisation_id = ?` | ✅ |

All 3 queries reference only columns that exist in production. ✅

---

## 5. FINDINGS

None identified.

---

## 6. OBSERVATIONS

- **Simple junction table** with UNIQUE constraint on (user_id, organisation_id) preventing duplicate memberships.
- **`role_in_org` is a freeform varchar(50)** (not an ENUM) with documented values 'owner', 'admin', 'member'. Flexibility allows future roles without DDL changes.
- **Migration M060 seeded** the table from existing data: `organisations.owner_id` → role 'owner', and `bookings.user_id` + `bookings.organisation_id` → role 'member'.
- **2 rows, AUTO_INCREMENT=4** — the review did not establish the reason for that difference.
- **`getUserOrganisations` in `rbac.repository.ts:655`** queries `organisations` on `owner_id`, NOT `user_organisations` — the method name implies org membership lookup but actually returns orgs the user owns. This is a naming inconsistency in the RBAC module, not a table-level issue.

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
| Schema verified | ✅ (5 cols, 2 FK, 2 indexes) |
| Migration verified | ✅ (M060) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (users CASCADE, organisations CASCADE) |
| Child tables verified | ✅ (0 children) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `user_organisations` ✅

**Next table alphabetically: `user_quiet_hours` — proceed?**

# ENTERPRISE TABLE AUDIT: `user_friends`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Social friendship relationship with request/accept flow |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   user_friends  —  EXECUTIVE SNAPSHOT                                │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Social relationship entity                       │
│  HEALTH:         10/10 — Schema sound, all code column names correct │
│  QUALITY:        9/10 — Minimal usage, flagged as dead feature       │
│  PK:             id (int unsigned)                                    │
│  FK:             2 — users CASCADE (requester + addressee)           │
│  CHILDREN:       0                                                    │
│  PRODUCTION ROWS: 0                                                    │
│  BACKEND REFS:   3 SQL queries across 1 file                          │
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
| Classification | Operational — friendship requests, acceptance, blocking |
| Evidence | 3 queries in community.repository.ts (send request, respond, list friends) |
| Inference | Historically flagged as "Dead social feature" in unused-tables audit, but 3 active queries suggest backend support exists even if UI is unexposed |

---

## 3. PRODUCTION SCHEMA (7 columns)

```
id              int unsigned AUTO_INCREMENT PK
requester_id    int unsigned NOT NULL       → users(id) ON DELETE CASCADE
addressee_id    int unsigned NOT NULL       → users(id) ON DELETE CASCADE
status          enum('pending','accepted','blocked') NOT NULL DEFAULT 'pending'
responded_at    timestamp NULL DEFAULT NULL
created_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

Indexes: uk_friendship (UNIQUE), idx_addressee
```

---

## 4. APPLICATION CODE REFERENCES

**File:** `backend/src/modules/community/infrastructure/repositories/community.repository.ts`

| Method | Line | SQL | Correct? |
|---|---|---|---|
| `sendFriendRequest()` | 30-32 | `INSERT IGNORE INTO user_friends (requester_id, addressee_id) VALUES (?, ?)` | ✅ |
| `respondToFriendRequest()` | 34-36 | `UPDATE user_friends SET status = ?, responded_at = NOW() WHERE requester_id = ? AND addressee_id = ?` | ✅ |
| `findFriends()` | 38-44 | `SELECT ... FROM user_friends uf JOIN users u ON ... WHERE (uf.requester_id = ? OR uf.addressee_id = ?) AND uf.status = 'accepted'` | ✅ |

All 3 queries reference only columns that exist in the production schema. ✅

---

## 5. FINDINGS

None identified.

---

## 6. OBSERVATIONS

- **Minimal backend integration:** The review identified 3 queries in `community.repository.ts`. No service layer, controller, or routes were identified during the review.
- **No frontend exposure:** 0 references in frontend. The UI for friend management does not appear to be rendered.
- **Cleanup script** (`cleanup-production.sql:106-107`) uses stale column names `user_id`/`friend_id` — would fail if executed against the production schema.
- **Audit docs** have historically recommended deletion as a "Dead social feature" (`archive/docs/phase1-task1-unused-tables.md:49`). The 3 active queries suggest the backend logic exists but the feature is unexposed.

---

## 7. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 8. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | Fix `cleanup-production.sql` to use correct column names `requester_id`/`addressee_id` | Low |
| 2 | Evaluate whether the friends feature should be completed or removed | Low |

---

## 9. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (7 cols, 2 FK, 2 indexes) |
| Baseline match | ✅ (identical to production) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (both users CASCADE) |
| Child tables verified | ✅ (0 children) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `user_friends` ✅

**Next table alphabetically: `user_memberships` — proceed?**

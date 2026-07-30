# ENTERPRISE TABLE AUDIT: `uploads`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | Media/file upload registry |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   uploads  —  EXECUTIVE SNAPSHOT                                     │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — Operational file registry                        │
│  HEALTH:         9/10 — Schema sound, code column names correct      │
│  QUALITY:        9/10 — Stale domain interface not in use            │
│  PK:             id (bigint unsigned)                                 │
│  FK:             0 (referenced BY 1 child table)                      │
│  CHILDREN:       1 — cms_contact_submission_attachments              │
│  PRODUCTION ROWS: 32 (AUTO_INCREMENT=50)                              │
│  BACKEND REFS:   30+ across 10+ files                                 │
│  FRONTEND REFS:  3 pages + sidebar + permissions + media utils       │
│  FINDINGS:       None                                                 │
│  RECOMMENDATION: No action required                                   │
│  CONFIDENCE:     95%                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — records all file uploads, tracks processing status, supports polymorphic entity attachment |
| Evidence | Full CRUD in upload repository; org portal direct queries; security module aggregate queries; CMS attachments JOIN; 3 API routes; 2 frontend pages |

---

## 3. PRODUCTION SCHEMA (14 columns)

```
id                  bigint unsigned AUTO_INCREMENT PK (AUTO_INCREMENT=50)
public_id           char(36) DEFAULT NULL
entity_type         varchar(100) NOT NULL          organisation, branch, resource, sport, user
entity_id           int unsigned NOT NULL
file_category       varchar(50) DEFAULT NULL       logo, cover, gallery, document, icon
original_name       varchar(500) NOT NULL
mime_type           varchar(100) NOT NULL
file_path           varchar(500) NOT NULL          Path relative to storage root
file_size           int unsigned DEFAULT NULL      Bytes
width               int unsigned DEFAULT NULL
height              int unsigned DEFAULT NULL
processing_status   enum('pending','processing','ready','failed') NOT NULL DEFAULT 'pending'
error_message       text DEFAULT NULL
created_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP

Indexes: idx_entity (entity_type, entity_id), idx_status, idx_created
```

---

## 4. MIGRATION HISTORY

| Migration | Action | Detail |
|---|---|---|
| Baseline | DDL | Present at `001_courtzon_v3.sql:3196-3218` |

---

## 5. CHILD TABLES

| Table | FK Column | Constraint |
|---|---|---|
| `cms_contact_submission_attachments` | `upload_id` | FK → `uploads(id)` |

---

## 6. APPLICATION CODE REFERENCES

### Backend

**Repository** (`upload.repository.ts`):
| Method | SQL | Correct? |
|---|---|---|
| `create()` | `INSERT INTO uploads (public_id, entity_type, entity_id, file_category, original_name, mime_type, file_path, file_size, width, height, processing_status)` | ✅ All 11 columns exist |
| `findByEntity()` | `SELECT * FROM uploads WHERE entity_type = ? AND entity_id = ?` | ✅ |
| `findById()` | `SELECT * FROM uploads WHERE id = ?` | ✅ |
| `updateStatus()` | `UPDATE uploads SET processing_status = ?, error_message = ? WHERE id = ?` | ✅ |
| `delete()` | `DELETE FROM uploads WHERE id = ?` | ✅ |
| `deleteByEntity()` | `DELETE FROM uploads WHERE entity_type = ? AND entity_id = ?` | ✅ |

**Security repository** (`security.repository.ts`):
| SQL | Correct? |
|---|---|
| `SELECT COUNT(*), SUM(file_size) FROM uploads WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)` | ✅ |
| `SELECT mime_type, COUNT(*), SUM(file_size) FROM uploads ... GROUP BY mime_type` | ✅ |
| `SELECT entity_type, COUNT(*) FROM uploads ... GROUP BY entity_type` | ✅ |
| `SELECT u.* FROM uploads u LEFT JOIN users up ON up.id = u.entity_id ORDER BY u.created_at DESC` | ✅ |

**Org portal controller** — Direct SQL SELECT/DELETE with correct column names ✅

**CMS repository** — JOIN `uploads` with `cms_contact_submission_attachments` ✅

### Frontend
- `UploadSecurityPage.tsx` — stats + recent uploads list
- `SecurityDashboard.tsx` — upload count display card
- 3 components check `/uploads/` URL prefix for rendering (BookingModal, UserEditModal, SportsPage)

---

## 7. FINDINGS

None identified.

---

## 8. OBSERVATIONS

- **`UploadRecord` domain interface** (`upload-aggregate.ts:3-12`) defines a different schema (`file_name`, `status` (3-state), `aggregate_version`) but is never imported or used by any code — it is dead code.
- **`UploadRow` interface** in the repository is the actual working type and matches production ✅.
- **Polymorphic entity design:** `entity_type` + `entity_id` allow any entity to have uploads without separate upload tables per entity. The `idx_entity` composite index supports this efficiently.
- **32 rows, AUTO_INCREMENT=50** — the review did not establish the reason for that difference.
- **18 seed rows** provide sport icons, org logos/covers, product images, and admin avatar.
- **`public_id` has no unique constraint** — set programmatically as UUID but not DB-enforced.
- **Processing pipeline:** `processing_status` (pending→processing→ready/failed) with `error_message` supports async image processing (resize, optimize, thumbnail generation).

---

## 9. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 10. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | Remove unused `UploadRecord` domain interface if confirmed dead code | Low |

---

## 11. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (14 cols, 0 FK, 3 indexes) |
| Baseline match | ✅ (identical to production) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (0 FKs enforced; 1 child table references this) |
| Child tables verified | ✅ (1: cms_contact_submission_attachments) |
| Code vs schema alignment | ✅ (no mismatch in active code) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `uploads` ✅

**Next table alphabetically: `user_addresses` — proceed?**

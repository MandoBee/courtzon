# ENTERPRISE TABLE AUDIT: `translations`

---

## 0. REVIEW METADATA

| Field | Value |
|---|---|
| **Database** | courtzon_v3 (production) |
| **Type** | CMS — i18n translation values per locale |
| **Overall Confidence** | 95% |

---

## 1. EXECUTIVE SNAPSHOT

```
┌──────────────────────────────────────────────────────────────────────┐
│   translations  —  EXECUTIVE SNAPSHOT                                │
├──────────────────────────────────────────────────────────────────────┤
│  TIER:           2 — CMS / i18n data entity                           │
│  HEALTH:         10/10 — Schema sound, code column names correct     │
│  QUALITY:        10/10 — Fully integrated, clean                     │
│  PK:             id (int unsigned)                                     │
│  FK:             0 (no enforced relationships)                        │
│  CHILDREN:       0                                                     │
│  PRODUCTION ROWS: 286 (AUTO_INCREMENT=308, Arabic locale data)        │
│  BACKEND REFS:   45+ across 7 files                                    │
│  FRONTEND REFS:  20+ across 5 files                                    │
│  FINDINGS:       None                                                  │
│  RECOMMENDATION: No action required                                    │
│  CONFIDENCE:     95%                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. CRITICALITY ASSESSMENT

| Factor | Detail |
|---|---|
| Classification | Operational — stores translated values per key per locale for the i18n system |
| Evidence | Full CRUD repository; service layer with locale pack management; 15+ API routes; admin translation manager UI; frontend bundle loader |

---

## 3. PRODUCTION SCHEMA (7 columns)

```
id          int unsigned AUTO_INCREMENT PK (AUTO_INCREMENT=308)
key         varchar(500) NOT NULL         Dot-notation key (e.g. auth.login.title)
locale      varchar(5) NOT NULL           Language code (e.g. 'ar', 'en')
value       text NOT NULL                 Translated text
is_auto     tinyint(1) NOT NULL DEFAULT 0 TRUE if machine-translated
created_at  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
updated_at  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP

Indexes: uk_translation (UNIQUE locale, key(191)), idx_key
```

---

## 4. MIGRATION HISTORY

| Migration | Action | Detail |
|---|---|---|
| Baseline | DDL | Present at `001_courtzon_v3.sql:3180-3194` |

---

## 5. CHILD TABLES (logical, no FK enforcement)

None — logically related to `translation_keys` by `key` naming convention, no FK constraint.

---

## 6. APPLICATION CODE REFERENCES

### Backend

**Repository** (`translations.repository.ts`):
| Method | SQL | Correct? |
|---|---|---|
| `list()` | `SELECT * FROM translations WHERE 1=1` | ✅ |
| `getById()` | `SELECT * FROM translations WHERE id = ?` | ✅ |
| `getByKeyAndLocale()` | `SELECT * FROM translations WHERE \`key\` = ? AND locale = ?` | ✅ |
| `create()` | `INSERT INTO translations (\`key\`, locale, value, is_auto) VALUES (?, ?, ?, ?)` | ✅ |
| `upsert()` | `INSERT ... ON DUPLICATE KEY UPDATE value = VALUES(value), is_auto = VALUES(is_auto)` | ✅ |
| `getValuesForKeys()` | `SELECT id, \`key\`, locale, value FROM translations WHERE \`key\` IN (...) AND locale IN (...)` | ✅ |
| `getValuesByLocale()` | `SELECT \`key\`, value FROM translations WHERE locale = ?` | ✅ |
| `createLocalePack()` | `INSERT IGNORE INTO translations (\`key\`, locale, value, is_auto) VALUES (?, ?, ?, 0)` | ✅ |
| `localeHasAnyTranslation()` | `SELECT 1 FROM translations WHERE locale = ? LIMIT 1` | ✅ |
| `listDistinctLocales()` | `SELECT DISTINCT locale FROM translations ORDER BY locale` | ✅ |
| `update()` | `UPDATE translations SET ... WHERE id = ?` | ✅ |
| `delete()` | `DELETE FROM translations WHERE id = ?` | ✅ |
| `exportAll()` | `SELECT * FROM translations ORDER BY \`key\`, locale` | ✅ |

All INSERT and SELECT statements reference only columns that exist in the production schema.

### Frontend
- `TranslationsPage.tsx` — Admin grid with inline editing per locale
- `LocalePackEditorModal.tsx` — Modal for editing a locale pack
- `i18n/index.ts` — Fetches `GET /public/translations/:locale` bundle
- 9 permission keys (view, create, edit, delete, sync, field-level)

---

## 7. FINDINGS

None identified.

---

## 8. OBSERVATIONS

- **286 rows, AUTO_INCREMENT=308** — the review did not establish the reason for that difference.
- **Arabic (`ar`) is the only locale with seed data** — English defaults come from the frontend registry (`translation-keys.registry.ts`), not from this table.
- **No FK constraint to `translation_keys`** — translations can exist for unregistered keys, and registered keys can have no translations. This is an intentional loose-coupling design.
- **`locale` is varchar(5)** — accommodates codes like `'en'`, `'ar'`, `'zh-CN'`.

---

## 9. OPTIMIZATION OPPORTUNITIES

None identified.

---

## 10. RECOMMENDATIONS

| # | Action | Priority |
|---|---|---|
| 1 | (None required) | — |

---

## 11. QUALITY GATE ✅

| Check | Status |
|---|---|
| Schema verified | ✅ (7 cols, 0 FK, 2 indexes) |
| Baseline match | ✅ (identical to production) |
| Application code verified | ✅ (all SQL column names correct) |
| FK integrity verified | ✅ (0 FKs — intentional) |
| Child tables verified | ✅ (none) |
| Code vs schema alignment | ✅ (no mismatch) |

---

# ENTERPRISE TABLE AUDIT COMPLETE: `translations` ✅

**Next table alphabetically: `uploads` — proceed?**

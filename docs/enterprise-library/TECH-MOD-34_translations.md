---
document_id: "TECH-MOD-34"
document_name: "Translations Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 15
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02"]
  related: []
---

# Translations Module (TECH-MOD-34)

**Source:** `backend/src/modules/translations/` (3 directories: presentation/, application/, infrastructure/)

## 1. Purpose

Internationalization (i18n) management: translation keys, locale packs, sync scripts, and export. Provides public endpoint for client-side locale loading and admin CRUD for managing translations.

## 2. Routes (16)

Defined in `translations.routes.ts:6-25`:

**Public (1):**
| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/public/translations/:locale` | Get translations for locale |

**Admin (15, all gated by `adminGuard`):**
| # | Method | Path | Purpose |
|---|--------|------|---------|
| 2 | GET | `/translations/grid` | Translation grid |
| 3 | GET | `/translations/modules` | List translation modules |
| 4 | GET | `/translations/element-types` | Element types |
| 5 | POST | `/translations/sync-keys` | Sync translation keys from codebase |
| 6 | POST | `/translations/locale-pack` | Create locale pack |
| 7 | POST | `/translations/locale-pack/sync` | Sync locale pack |
| 8 | GET | `/translations/locale-pack/:locale` | Get locale pack |
| 9 | GET | `/translations` | List translations |
| 10 | GET | `/translations/export` | Export translations |
| 11 | GET | `/translations/locales` | List locales |
| 12 | GET | `/translations/keys` | List translation keys |
| 13 | GET | `/translations/:id` | Get translation |
| 14 | POST | `/translations` | Create translation |
| 15 | POST | `/translations/upsert` | Upsert translation |
| 16 | PUT | `/translations/:id` | Update translation |
| 17 | DELETE | `/translations/:id` | Delete translation |

## 3. Services

`translations.service.ts` provides:
- `getPublicTranslations(locale)` — Client-facing endpoint
- `listTranslationsGrid()` — Admin grid view
- `listTranslationModules()` — Available modules
- `syncTranslationKeys()` — Scan codebase for `t()` calls
- `createLocalePack()` / `syncLocalePack()` — Locale pack management
- `exportTranslations()` — Export for external translation tools

## 4. Key Concepts

- **Translation keys**: String identifiers used in code (e.g., `booking.title`)
- **Locale packs**: Named collections of translations for a locale
- **Sync scripts**: Auto-detect new keys from codebase
- **Upsert**: Create or update a translation by key + locale

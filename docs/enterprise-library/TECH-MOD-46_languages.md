---
document_id: "TECH-MOD-46"
document_name: "Languages Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "beginner"
reading_time: 5
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-34"]
  related: []
---

# Languages Module (TECH-MOD-46)

**Source:** `backend/src/modules/languages/` (5 entries: presentation/, application/, infrastructure/)

## 1. Purpose

Language reference data for the platform's internationalization system. Provides the list of supported languages for UI translation locale selection.

## 2. Routes (6)

Defined in `languages.routes.ts:5-14`:

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/public/languages` | — | List active languages (public) |
| 2 | GET | `/languages` | auth | List all languages |
| 3 | GET | `/languages/:id` | auth | Get language |
| 4 | POST | `/languages` | adminGuard | Create language |
| 5 | PUT | `/languages/:id` | adminGuard | Update language |
| 6 | DELETE | `/languages/:id` | adminGuard | Delete language |

## 3. Services

`languages.service.ts` provides list (public and authenticated), get by ID, and admin CRUD.

## 4. Key Concepts

- Languages have locale code (e.g., `en`, `ar`), native name, direction (LTR/RTL), and active status
- Public endpoint `/public/languages` returns only active languages for client-side locale selection
- Integrated with the Translations module (TECH-MOD-34) for locale pack management

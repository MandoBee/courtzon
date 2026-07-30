---
document_id: "TECH-MOD-42"
document_name: "Countries Module"
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
  references: ["TECH-ARCH-02", "TECH-MOD-47"]
  related: ["TECH-MOD-45"]
---

# Countries Module (TECH-MOD-42)

**Source:** `backend/src/modules/countries/` (5 entries: presentation/, application/, infrastructure/)

## 1. Purpose

Country reference data with ISO codes, flags, and default currency associations. Used as the top-level of the geographical hierarchy (country → province → city).

## 2. Routes (5)

Defined in `countries.routes.ts:5-12`:

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/countries` | auth | List all countries |
| 2 | GET | `/countries/:id` | auth | Get country by ID |
| 3 | POST | `/countries` | adminGuard | Create country |
| 4 | PUT | `/countries/:id` | adminGuard | Update country |
| 5 | DELETE | `/countries/:id` | adminGuard | Delete country |

## 3. Services

`countries.service.ts` provides list, get by ID, and CRUD. Repository includes `findByIsoCode` used by the Geo module for currency detection.

## 4. Key Concepts

- Countries have ISO codes (alpha-2), flag images, default currency, phone code
- Used by the Geo module (`geo.service.ts`) for IP-based country → currency resolution
- Reference data seeded via `database/seeds/001_baseline.sql`

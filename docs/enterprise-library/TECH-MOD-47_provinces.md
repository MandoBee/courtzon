---
document_id: "TECH-MOD-47"
document_name: "Provinces Module"
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
  references: ["TECH-ARCH-02", "TECH-MOD-42"]
  related: ["TECH-MOD-41"]
---

# Provinces Module (TECH-MOD-47)

**Source:** `backend/src/modules/provinces/` (5 entries: presentation/, application/, infrastructure/)

## 1. Purpose

Province/state reference data by country. Forms the mid-tier of the geographical hierarchy (country → province → city).

## 2. Routes (6)

Defined in `provinces.routes.ts:5-13`:

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/provinces` | auth | List all provinces |
| 2 | GET | `/provinces/:id` | auth | Get province by ID |
| 3 | GET | `/countries/:countryId/provinces` | auth | List provinces by country |
| 4 | POST | `/provinces` | adminGuard | Create province |
| 5 | PUT | `/provinces/:id` | adminGuard | Update province |
| 6 | DELETE | `/provinces/:id` | adminGuard | Delete province |

## 3. Services

`provinces.service.ts` provides list, get by ID, list by country, and admin CRUD.

## 4. Key Concepts

- Provinces are reference data linked to countries via `country_id`
- Used for address fields across branches, organisations, and user profiles
- Writes require adminGuard; reads require authentication

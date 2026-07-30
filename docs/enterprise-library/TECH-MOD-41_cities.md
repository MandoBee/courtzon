---
document_id: "TECH-MOD-41"
document_name: "Cities Module"
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
  related: []
---

# Cities Module (TECH-MOD-41)

**Source:** `backend/src/modules/cities/` (5 entries: presentation/, application/, infrastructure/)

## 1. Purpose

City reference data lookup by province. Used throughout the platform for address fields, branch locations, and player profiles.

## 2. Routes (6)

Defined in `cities.routes.ts:5-13`:

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/cities` | auth | List all cities |
| 2 | GET | `/cities/:id` | auth | Get city by ID |
| 3 | GET | `/provinces/:provinceId/cities` | auth | List cities by province |
| 4 | POST | `/cities` | adminGuard | Create city |
| 5 | PUT | `/cities/:id` | adminGuard | Update city |
| 6 | DELETE | `/cities/:id` | adminGuard | Delete city |

## 3. Services

`cities.service.ts` provides list, get by ID, list by province, and CRUD with auto-return.

## 4. Key Concepts

- Cities are reference data linked to provinces
- All read operations require authentication; writes require admin

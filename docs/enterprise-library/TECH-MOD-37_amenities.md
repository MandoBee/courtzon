---
document_id: "TECH-MOD-37"
document_name: "Amenities Module"
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
  references: ["TECH-ARCH-02"]
  related: []
---

# Amenities Module (TECH-MOD-37)

**Source:** `backend/src/modules/amenities/` (5 entries: presentation/, application/, infrastructure/)

## 1. Purpose

CRUD management of branch amenities (e.g., parking, showers, locker rooms, cafe). Amenities are reference data that can be assigned to branches via pivot tables in the organisations module.

## 2. Routes (4)

Defined in `amenities.routes.ts:8-11`:

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/amenities/:id` | authMiddleware | Get amenity by ID |
| 2 | POST | `/amenities` | adminGuard | Create amenity |
| 3 | PUT | `/amenities/:id` | adminGuard | Update amenity |
| 4 | DELETE | `/amenities/:id` | adminGuard | Delete amenity |

## 3. Services

`amenities.service.ts` provides:
- `listAll()` — List all amenities
- `getById(id)` — Get single amenity
- `create(data)` — Create with auto-return
- `update(id, data)` — Update with auto-return
- `delete(id)` — Soft delete

## 4. Key Concepts

- Amenities are reference data managed by admins
- Branch-amenity assignment lives in the organisations module
- All write operations require `adminGuard`

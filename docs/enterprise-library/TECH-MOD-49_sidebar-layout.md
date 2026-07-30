---
document_id: "TECH-MOD-49"
document_name: "Sidebar Layout Module"
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
  references: ["TECH-ARCH-02", "TECH-MOD-02"]
  related: []
---

# Sidebar Layout Module (TECH-MOD-49)

**Source:** `backend/src/modules/sidebar-layout/` (4 entries: presentation/, application/, infrastructure/)

## 1. Purpose

User-specific sidebar navigation reordering. Each user can save a custom ordered layout of sidebar menu items, grouped by parent section.

## 2. Routes (2)

Defined in `sidebar-layout.routes.ts:5-7`:

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/sidebar/layout` | auth | Get saved sidebar layout |
| 2 | PUT | `/sidebar/layout` | `sidebar.layout.manage` | Save sidebar layout |

## 3. Services

`sidebar-layout.service.ts` provides:

- `getLayout(userId)` — Returns the user's saved sidebar layout (ordered menu keys by parent section)
- `saveLayout(userId, layout)` — Persists the ordered layout. Layout is an array of `{ parentKey, orderedKeys[] }`

## 4. Key Concepts

- **Layout Structure:** Each menu section (parentKey) has an ordered array of item keys
- **Per-User:** Layouts are stored per user ID, not per role
- **Frontend Integration:** Frontend reads the layout on mount to reorder navigation items

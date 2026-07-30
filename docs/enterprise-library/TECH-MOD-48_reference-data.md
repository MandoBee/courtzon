---
document_id: "TECH-MOD-48"
document_name: "Reference Data Module"
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
  references: ["TECH-ARCH-02", "TECH-MOD-42", "TECH-MOD-43", "TECH-MOD-46"]
  related: []
---

# Reference Data Module (TECH-MOD-48)

**Source:** `backend/src/modules/reference-data/` (1 entry: domain/)

## 1. Purpose

Shared reference data types and utilities used across all reference data modules (countries, currencies, languages, cities, provinces, amenities, banks, etc.).

## 2. Domain Model

`reference-data-aggregate.ts` defines:

### `ReferenceRecord` interface
```typescript
interface ReferenceRecord {
  id: number;
  code?: string;
  name: string;
  is_active: boolean;
  sort_order?: number;
}
```

### `isActiveReference(record)` utility
Returns `true` if the reference record's `is_active` flag is set.

## 3. Key Concepts

- **Standard Interface:** All reference data entities implement the `ReferenceRecord` interface for consistency
- **Soft Deactivation:** Reference data uses `is_active` flag rather than hard deletes, allowing historical data integrity
- **Sort Order:** Optional `sort_order` field for display ordering in dropdowns and selects

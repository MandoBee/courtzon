---
document_id: "TECH-MOD-43"
document_name: "Currencies Module"
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
  related: ["TECH-MOD-45"]
---

# Currencies Module (TECH-MOD-43)

**Source:** `backend/src/modules/currencies/` (5 entries: presentation/, application/, infrastructure/)

## 1. Purpose

Currency reference data with ISO codes, symbols, and decimal places. Used across the platform for pricing, wallet balances, and financial transactions.

## 2. Routes (5)

Defined in `currencies.routes.ts:5-12`:

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/currencies` | auth | List all currencies |
| 2 | GET | `/currencies/:id` | auth | Get currency by ID |
| 3 | POST | `/currencies` | adminGuard | Create currency |
| 4 | PUT | `/currencies/:id` | adminGuard | Update currency |
| 5 | DELETE | `/currencies/:id` | adminGuard | Delete currency |

## 3. Services

`currencies.service.ts` provides list, get by ID, and CRUD. Repository includes `findByCode` used by the Geo module.

## 4. Key Concepts

- Currencies have ISO code (e.g., EGP, USD), symbol (e.g., LE, $), decimal places
- Used by pricing engine, wallet, financial ledger, and Geo module for currency detection
- Platform default currency configured via `system_settings.platform.default_currency`

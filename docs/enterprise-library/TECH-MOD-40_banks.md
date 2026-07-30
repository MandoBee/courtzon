---
document_id: "TECH-MOD-40"
document_name: "Banks Module"
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

# Banks Module (TECH-MOD-40)

**Source:** `backend/src/modules/banks/` (5 entries: presentation/, application/, infrastructure/)

## 1. Purpose

CRUD management of banks and bank branches for financial reference data. Used by the financial module for bank account details on payouts and payment methods.

## 2. Routes (10)

Defined in `banks.routes.ts:5-16`:

### Banks (5)
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/banks` | auth | List banks |
| 2 | GET | `/banks/:id` | auth | Get bank |
| 3 | POST | `/banks` | adminGuard | Create bank |
| 4 | PUT | `/banks/:id` | adminGuard | Update bank |
| 5 | DELETE | `/banks/:id` | adminGuard | Delete bank |

### Bank Branches (5)
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 6 | GET | `/bank-branches` | auth | List branches |
| 7 | GET | `/bank-branches/:id` | auth | Get branch |
| 8 | POST | `/bank-branches` | adminGuard | Create branch |
| 9 | PUT | `/bank-branches/:id` | adminGuard | Update branch |
| 10 | DELETE | `/bank-branches/:id` | adminGuard | Delete branch |

## 3. Services

`banks.service.ts` provides standard CRUD for both banks and bank branches with auto-return on create/update.

## 4. Key Concepts

- Banks and branches are reference data managed by admins
- Used by financial payout configuration (vendor bank accounts)

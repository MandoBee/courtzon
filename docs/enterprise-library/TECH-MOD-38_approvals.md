---
document_id: "TECH-MOD-38"
document_name: "Approvals Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 10
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-02", "TECH-MOD-13"]
  related: ["TECH-MOD-35"]
---

# Approvals Module (TECH-MOD-38)

**Source:** `backend/src/modules/approvals/` (4 entries: presentation/, application/)

## 1. Purpose

Handles admin approval/rejection of marketplace seller upgrade requests. When a player registers as a seller (organisation upgrade), the request enters `organisation_upgrade_requests` table with `status = 'pending'`. Admin reviews and approves or rejects.

## 2. Routes (3)

Defined in `approval.routes.ts:5-10`:

| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/admin/approvals` | adminGuard | List pending approvals |
| 2 | POST | `/admin/approvals/:requestId/approve` | adminGuard | Approve registration |
| 3 | POST | `/admin/approvals/:requestId/reject` | adminGuard | Reject registration |

## 3. Services

`approval.service.ts` provides:

- `listPendingRegistrations(filters)` — List with pagination, status/type filters. Joins with organisations, org types, users, subscription plans.
- `approveRegistration(adminUserId, requestId)` — Approves by: (1) activating organisation, (2) activating subscription with start/end dates, (3) for player→seller upgrades: switching org type to `shop`, cloning `shop-admin` role for the org, assigning to owner
- `rejectRegistration(adminUserId, requestId, reason?)` — Marks request as rejected with optional reason

## 4. Key Concepts

- **Registration Types:** Player→seller upgrades use `regType = 'player'` with `planId`
- **Role Cloning:** On approval, `shop-admin` template role is cloned and scoped to the org
- **Event Emissions:** `organisation:approved` and `organisation:rejected` via `eventBusV2`
- **Request Statuses:** `pending` → `approved` | `rejected`

---
document_id: "TECH-MOD-30"
document_name: "Settlement Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 25
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-07", "TECH-MOD-11"]
  related: ["TECH-MOD-09", "TECH-MOD-10"]
---

# Settlement Module (TECH-MOD-30)

**Source:** `backend/src/modules/settlement/` (11 files: domain/, application/, commands/, presentation/, infrastructure/)

## 1. Purpose

Marketplace settlement lifecycle management. Calculates per-seller financials (gross, commission, shipping, net), creates settlement records, tracks transfers, supports approve/pay/reject/cancel with order rollback. Uses command pipeline for V2 status transitions. 9 routes, 8-state lifecycle.

## 2. Architecture

```
domain/
  settlement-aggregate.ts   — SettlementStatus (8 states), transition validation
  settlement-constants.ts   — CANCELABLE_STATUSES, REJECTABLE_STATUSES
application/
  settlement.service.ts     — 429 lines: request, approve, pay, complete, reject, cancel
commands/
  change-settlement-status.command.ts
presentation/
  settlement.routes.ts      — 9 endpoints
  settlement.controller.ts
  settlement.dto.ts
infrastructure/
  repositories/
    settlement.repository.ts
```

**Evidence:** Directory structure, `settlement.service.ts` (429 lines).

## 3. Settlement Lifecycle (8 states)

Defined in `settlement-aggregate.ts:1` and `:7-16`:

```
requested → calculating → pending_approval → approved → paid → completed
  ↓            ↓               ↓                ↓
  └──── ── cancelled ──────────────────────────┘
                                ↓
                             rejected
```

| From | To |
|------|----|
| `requested` | `calculating`, `pending_approval`, `cancelled` |
| `calculating` | `pending_approval`, `cancelled` |
| `pending_approval` | `approved`, `rejected`, `cancelled` |
| `approved` | `paid`, `rejected` |
| `paid` | `completed` |
| `completed` | *(terminal)* |
| `rejected` | *(terminal)* |
| `cancelled` | *(terminal)* |

**Evidence:** `settlement-aggregate.ts:7-16`.

## 4. Settlement Request Flow

`settlement.service.ts:19-196` — `requestSettlement()`:
1. Locks unsettled delivered orders for the seller (`FOR UPDATE`)
2. Calculates per-order financials: subtotal, shipping, fee, net
3. Computes settlement direction: `courtzon_to_org` or `org_to_courtzon` (netting)
4. Creates settlement record with `pending_approval` status (skips calculating)
5. Creates `settlement_orders` entries
6. Marks order items as `settled`
7. Marks orders as `settled` only when ALL items settled
8. Creates `settlement_transfers` record

## 5. Approve → Pay → Complete Flow

- **Approve** (`settlement.service.ts:200-217`): Validates `pending_approval`, sets status + `approved_at`
- **Pay** (`:221-271`): Validates `approved`, snaps bank account, sets `paid_at`, creates transaction + transaction_entries
- **Complete** (`:275-288`): Validates `paid`, sets `completed_at`

## 6. Reject with Rollback

`rejectSettlement()` (`:292-333`):
1. Reverts `settlement_orders` items back to `pending`
2. Reverts orders back to `pending` settlement status
3. Sets settlement to `rejected` with reason

## 7. Cancel with Rollback

`cancelSettlement()` (`:337-378`):
- Same rollback pattern as reject
- Only allowed from `requested`, `calculating`, `pending_approval`

**Evidence:** `settlement-constants.ts:1` defines `CANCELABLE_STATUSES`.

## 8. Routes (9)

Defined in `settlement.routes.ts:8-51`:

| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 1 | POST | `/settlements/request` | `settlements.request` | Request settlement |
| 2 | POST | `/settlements/:id/approve` | `settlements.approve` | Approve |
| 3 | POST | `/settlements/:id/pay` | `settlements.pay` | Mark as paid |
| 4 | POST | `/settlements/:id/complete` | `settlements.complete` | Complete |
| 5 | POST | `/settlements/:id/reject` | `settlements.reject` | Reject |
| 6 | POST | `/settlements/:id/cancel` | `settlements.cancel` | Cancel |
| 7 | GET | `/settlements/:id` | `settlements.view` | Get detail |
| 8 | GET | `/settlements` | `settlements.view` | List all |
| 9 | GET | `/settlements/organisation/:organisationId` | `settlements.view` | List by org |

## 9. V2 Command Pipeline

`changeStatusV2()` (`:382-412`) implements settlement status transitions via the command pipeline:
1. Creates `ChangeSettlementStatus` command
2. Executes via `commandPipeline.execute()` with validate/execute/events handlers
3. On completion/rejection, emits `settlement:completed` event

## 10. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Settlement | `settlements` | `id, organisation_id, branch_id, settlement_status, gross_amount, shipping_amount, courtzon_fee, organization_net, cod_fee_total, online_net_total, settlement_direction, final_amount, requested_by, approved_at, paid_at, completed_at, rejected_at, rejected_reason` |
| Settlement Order | `settlement_orders` | `id, settlement_id, order_id, products_price, shipping_price, gross_amount, courtzon_fee, organization_net, payment_method` |
| Settlement Transfer | `settlement_transfers` | `id, settlement_id, transfer_direction, amount, transfer_status` |
| Bank Account | `bank_accounts` | Snapshotted at pay time into `settlements.bank_account_snapshot` |

## 11. Permissions

- `settlements.request` / `settlements.approve` / `settlements.pay`
- `settlements.complete` / `settlements.reject` / `settlements.cancel`
- `settlements.view`

## 12. Events

- `settlement:completed` — Emitted on settlement completion/rejection (`:403-408`)

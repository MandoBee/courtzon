---
document_id: "TECH-MOD-31"
document_name: "Coupon Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 15
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02"]
  related: ["TECH-MOD-07", "TECH-MOD-11"]
---

# Coupon Module (TECH-MOD-31)

**Source:** `backend/src/modules/coupon/` (3 directories: presentation/, application/, infrastructure/)

## 1. Purpose

Coupon creation, validation, and usage tracking. Supports percentage and fixed discount types. Assignable to specific entities (organisations, sports). Publishes coupons with notification events.

## 2. Routes (6)

Defined in `coupon.routes.ts:9-14`:

| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 1 | GET | `/admin/coupons` | `financial.view` | List coupons |
| 2 | GET | `/admin/coupons/:id` | `financial.view` | Get coupon |
| 3 | POST | `/admin/coupons` | `financial.process_payouts` | Create coupon |
| 4 | PUT | `/admin/coupons/:id` | `financial.process_payouts` | Update coupon |
| 5 | DELETE | `/admin/coupons/:id` | `financial.process_payouts` | Delete coupon |
| 6 | POST | `/admin/coupons/:id/publish` | `financial.process_payouts` | Publish coupon |

All routes gated by `authMiddleware` + `financial.view` at hook level.

## 3. Coupon Service

`coupon.service.ts` — CRUD + publish:

**Create** (`:17-34`):
- Validates unique code
- Supports optional assignments (entity_type + entity_id)
- Creates coupon and optionally upserts assignments

**Publish** (`:56-76`):
- Sets `is_active = true`
- Gets assigned organisation IDs
- Emits `coupon:published` event with coupon details and org IDs

## 4. Coupon Schema

| Field | Description |
|-------|-------------|
| `code` | Unique coupon code |
| `discount_type` | `'percentage' \| 'fixed'` |
| `discount_value` | Discount amount |
| `activity_type` | Optional: activity scope filter |
| `sport_id` | Optional: sport scope filter |
| `min_order_amount` | Minimum order threshold |
| `max_uses` | Global usage limit |
| `max_uses_per_user` | Per-user usage limit |
| `starts_at` / `expires_at` | Validity window |
| `is_active` | Published status |

## 5. Events

- `coupon:published` — Emitted by `coupon.service.ts:67-73` with `couponId`, `code`, `discountValue`, `discountType`, `organisationIds`

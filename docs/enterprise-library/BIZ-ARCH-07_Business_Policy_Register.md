---
document_id: "BIZ-ARCH-07"
document_name: "Business Policy Register"
family: "BIZ-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["product", "architect"]
difficulty: "intermediate"
reading_time: 15
business_owner: "Product Manager"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Draft"
---

# Business Policy Register (BIZ-ARCH-07)

## 1. Booking Policies

| Policy | Rule | Source |
|--------|------|--------|
| **Cancellation Window** | Bookings in `pending`, `pending_payment`, `confirmed`, `checked_in` statuses are cancellable | `booking/domain/booking-constants.ts:1-6` |
| **Cancellation Fee** | Determined by pricing rules and membership tier | `booking/domain/pricing-engine.ts` |
| **Expiration** | Pending bookings expire after `BOOKING_EXPIRY_MINUTES` (default 15) | `booking/application/booking.service.ts` |
| **Advance Booking Limit** | Max `BOOKING_MAX_FUTURE_DAYS` (default 30) | Env var |
| **Check-In Required** | Booking must be checked in to proceed to completed | State machine |

## 2. Marketplace Policies

| Policy | Rule | Source |
|--------|------|--------|
| **Order Cancellation** | Only `pending` and `confirmed` orders can be cancelled | `marketplace/domain/order-constants.ts:1-2` |
| **Settlement Eligibility** | Only delivered orders with paid/cash payment are eligible | `settlement/application/settlement.service.ts:42-52` |
| **Settlement Direction** | Netting between online revenue and COD fees determines direction | `settlement/application/settlement.service.ts:110-111` |
| **Purchase Order Edit** | Only `draft` POs can be edited | `inventory.controller.ts:266` |

## 3. Membership Policies

| Policy | Rule | Source |
|--------|------|--------|
| **Freeze Eligibility** | Only `active` memberships can be frozen | `user-membership.service.ts:87` |
| **Resume Eligibility** | Only `frozen` memberships can be resumed | `:100` |
| **Cancel Eligibility** | `cancelled` or `expired` memberships cannot be cancelled again | `:113-114` |
| **Renewal** | Creates new period from current date, resets status to active | `:136-165` |
| **Plan Deletion** | Cannot delete plan with active memberships | `membership-plan.service.ts:195-201` |

## 4. Financial Policies

| Policy | Rule | Source |
|--------|------|--------|
| **Double-Entry** | Every transaction must have equal debits and credits | `ledger-aggregate.ts:76-80` |
| **Positive Amount** | Ledger entries must have positive amount | `ledger-aggregate.ts:68` |
| **Withdrawal Transitions** | See 5-state lifecycle in financial-aggregate.ts | `financial-aggregate.ts:9-15` |
| **Withdrawal Cancellation** | Can cancel from `pending` or `approved` | Same |
| **Settlement Transitions** | See 8-state lifecycle in settlement-aggregate.ts | `settlement-aggregate.ts:7-16` |

## 5. Match Policies

| Policy | Rule | Source |
|--------|------|--------|
| **Duplicate Prevention** | Cannot send duplicate invitation or join request | `match.entity.ts:107-113`, `:117-124` |
| **Duplicate Participant** | Cannot add same player twice | `:127-134` |
| **Duplicate Waiting List** | Cannot add to waiting list twice | `:145-152` |
| **Max Capacity** | Match transitions to `full` when participant limit reached | State machine |

## 6. HR / Payroll Policies

| Policy | Rule | Source |
|--------|------|--------|
| **Leave Balance** | Leave requests validated against remaining balance | `hr/application/leave.service.ts` |
| **Payroll Approval** | Payroll must be approved before processing | `hr/` |

## 7. Tournament Policies

| Policy | Rule | Source |
|--------|------|--------|
| **Registration Cutoff** | Registration closes before tournament start | `tournaments/domain/` |
| **Seeding** | Players seeded based on ranking/skill level | `tournaments/application/` |

## 8. Security Policies

| Policy | Rule | Source |
|--------|------|--------|
| **API Key Hashing** | Keys stored as SHA-256, never plaintext | `integration/middleware/api-key-auth.ts:9` |
| **File Upload** | MIME validation + magic byte verification + blocked extensions | `upload/application/upload.service.ts:37-95` |
| **Brute Force** | Rate limiting on auth endpoints | `brute-force/application/brute-force.service.ts` |

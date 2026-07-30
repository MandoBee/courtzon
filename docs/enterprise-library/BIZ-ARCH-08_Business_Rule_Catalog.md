---
document_id: "BIZ-ARCH-08"
document_name: "Business Rule Catalog"
family: "BIZ-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["architect", "developer"]
difficulty: "advanced"
reading_time: 25
business_owner: "CTO"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Draft"
---

# Business Rule Catalog (BIZ-ARCH-08)

## 1. Error Codes Reference

Source: `shared/errors/error-codes.ts`. Key error codes used across modules:

| ErrorCode | Module | Description |
|-----------|--------|-------------|
| `INVALID_MATCH_STATUS` | Match | Illegal state transition |
| `DUPLICATE_INVITATION` | Match | Player already invited |
| `DUPLICATE_JOIN_REQUEST` | Match | Active join request exists |
| `DUPLICATE_PARTICIPANT` | Match | Player already participant |
| `DUPLICATE_WAITING_LIST` | Match | Already on waiting list |
| `MEMBERSHIP_NOT_FOUND` | Membership | Plan or membership not found |
| `VALIDATION_INVALID_VALUE` | Membership | Invalid operation |
| `PUSH_TOKEN_NOT_FOUND` | Mobile | Push token not found |
| `APP_VERSION_NOT_FOUND` | Mobile | App version not found |

## 2. Rule Catalog by Module

### Auth Module
| Rule | Condition | Action |
|------|-----------|--------|
| Password strength | Length ≥ 8, mixed case, numbers | Reject weak passwords |
| Email uniqueness | Email not in users table | Reject duplicate |
| Session expiry | Token age > TTL | Require re-login |

### Booking Module
| Rule | Condition | Action | Source |
|------|-----------|--------|--------|
| Slot availability | Overlapping booking | Reject duplicate slot | `booking/domain/slot-generator.ts` |
| Concurrent booking | Redis lock held | 409 Conflict | `booking/infrastructure/redis/redis-lock.ts` |
| Version conflict | aggregate_version mismatch | Optimistic lock error | `booking/domain/booking-aggregate.ts:46-49` |
| Cancellable status | Status in CANCELLABLE_BOOKING_STATUSES | Allow cancel | `booking/domain/booking-constants.ts:1-6` |

### Match Module
| Rule | Condition | Action | Source |
|------|-----------|--------|--------|
| Status transition | `VALID_TRANSITIONS[from]` includes `to` | Allow or throw | `match/domain/match.entity.ts:10-18` |
| Eligibility | Player meets criteria | Allow join | `match/application/services/eligibility.service.ts:7-48` |
| Age filter | birth_date + minAge/maxAge | Include/exclude player | Same, `:60-66` |
| Sport interest | main_sport_id OR player_sport_interests | Include player | Same, `:77-82` |

### Financial Module
| Rule | Condition | Action | Source |
|------|-----------|--------|--------|
| Double-entry balance | sum(debits) === sum(credits) | Allow or throw | `ledger-aggregate.ts:76-80` |
| Commission rate lookup | plan_id + applicable_entity | Apply rate | `commission.service.ts:47-65` |
| Withdrawal transition | ALLOWED_WITHDRAWAL_TRANSITIONS[from] | Allow or throw | `financial-aggregate.ts:9-15` |

### Settlement Module
| Rule | Condition | Action | Source |
|------|-----------|--------|--------|
| Settlement transition | ALLOWED_TRANSITIONS[from] includes to | Allow or throw | `settlement/domain/settlement-aggregate.ts:7-16` |
| Terminal status | `completed`, `rejected`, `cancelled` | Block further transitions | `:41-43` |
| Rollback eligible | `requested`, `calculating`, `pending_approval` | Allow cancel | `:50-52` |

### Membership Module
| Rule | Condition | Action | Source |
|------|-----------|--------|--------|
| Active check | status === 'active' AND endDate > now | Valid membership | `membership-aggregate.ts:115-117` |
| Tier calculation | totalPoints >= minPoints | Assign tier | `:102-108` |
| Points calculation | amount * tierMultiplier * campaignMultiplier | Earn points | `:110-113` |

### Pricing Module
| Rule | Condition | Action | Source |
|------|-----------|--------|--------|
| Day-of-week match | rule.daysOfWeek includes current day | Apply rule | `pricing-aggregate.ts:89-93` |
| Time range match | rule.timeRange.start ≤ time < rule.timeRange.end | Apply rule | `:95-98` |
| Date range match | rule.dateRange.start ≤ date ≤ rule.dateRange.end | Apply rule | `:100-103` |
| Demand surge | occupancy ≥ rule.occupancyThreshold | Apply multiplier | `pricing-engine.ts:50-62` |

### Upload Module
| Rule | Condition | Action | Source |
|------|-----------|--------|--------|
| MIME allowed | mimeType in ALLOWED_MIME_TYPES | Accept or reject | `upload.service.ts:10-13` |
| Extension blocked | ext in BLOCKED_EXTENSIONS | Reject | `:15-24` |
| File size limit | buffer.length ≤ MAX_FILE_SIZE | Accept or reject | `:42-44` |
| Magic bytes match | header matches signatureMap[mimeType] | Accept or reject | `:58-95` |

### Coupon Module
| Rule | Condition | Action | Source |
|------|-----------|--------|--------|
| Code uniqueness | No existing coupon with same code | Allow create | `coupon.service.ts:24-25` |

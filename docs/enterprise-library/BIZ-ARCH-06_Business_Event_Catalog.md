---
document_id: "BIZ-ARCH-06"
document_name: "Business Event Catalog"
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

# Business Event Catalog (BIZ-ARCH-06)

## 1. Event Infrastructure

Events are emitted via `eventBusV2` (`shared/event-bus/event-bus.v2.ts`) with:
- `aggregateType`, `aggregateId`, `aggregateVersion` metadata
- Typed payloads
- Cross-domain publish/subscribe

## 2. Events by Domain

### Identity Domain
| Event | Publisher | Consumer(s) | Evidence |
|-------|-----------|-------------|----------|
| `user:registered` | Auth | Notifications, CRM | `auth/application/auth.service.ts` |
| `user:logged_in` | Auth | Audit Log | — |
| `user:password_changed` | Auth | Notifications | — |

### Booking Domain
| Event | Publisher | Consumer(s) | Evidence |
|-------|-----------|-------------|----------|
| `booking:created` | Booking | Match, Notifications | `booking/application/booking.service.ts` |
| `booking:cancelled` | Booking | Notifications, Match | Same file |
| `booking:confirmed` | Booking | Notifications, Match, CRM | VOLUME-03 |
| `booking:checked_in` | Booking | Notifications | — |
| `booking:matchmaking_started` | Booking | Match | — |
| `booking:applicant_applied` | Booking | Notifications | — |
| `booking:applicant_responded` | Booking | Notifications | — |

### Marketplace Domain
| Event | Publisher | Consumer(s) | Evidence |
|-------|-----------|-------------|----------|
| `marketplace:product_created` | Marketplace | Notifications | `marketplace/` |
| `marketplace:product_updated` | Marketplace | — | Same |
| `marketplace:product_deleted` | Marketplace | — | Same |
| `marketplace:order_created` | Marketplace | Notifications, Inventory | Same |
| `marketplace:order_status_changed` | Marketplace | Notifications | Same |
| `marketplace:settlement_requested` | Settlement | Notifications | `settlement/` |
| `marketplace:settlement_processed` | Settlement | Notifications | Same |
| `marketplace:review_created` | Marketplace | Notifications | — |
| `marketplace:seller_upgrade_requested` | Marketplace | Admin | — |

### Payment Domain
| Event | Publisher | Consumer(s) | Evidence |
|-------|-----------|-------------|----------|
| `payment:succeeded` | Payment | Booking, Marketplace, Wallet, Notifications | `payment/application/payment.service.ts:571-622` |
| `payment:failed` | Payment | Booking, Marketplace, Notifications | Same file |

### Wallet Domain
| Event | Publisher | Consumer(s) | Evidence |
|-------|-----------|-------------|----------|
| `wallet:deposit` | Wallet | Notifications, CRM | `wallet/` |
| `wallet:withdrawal` | Wallet | Notifications | Same |

### Financial / Ledger Domain
| Event | Publisher | Consumer(s) | Evidence |
|-------|-----------|-------------|----------|
| `ledger.entry.created` | Ledger Service | Accounting, Audit | `financial/application/ledger.service.ts:25-31` |
| `settlement:created` | Financial Settlement | Notifications | `financial/application/settlement.service.ts:51-57` |
| `settlement:completed` | Settlement | Notifications | `settlement/application/settlement.service.ts:403-408` |

### Membership Domain
| Event | Publisher | Consumer(s) | Evidence |
|-------|-----------|-------------|----------|
| `membership:expiring` | Membership | Notifications, CRM | VOLUME-03 |

### Tournament Domain
| Event | Publisher | Consumer(s) | Evidence |
|-------|-----------|-------------|----------|
| `tournament:created` | Tournament | Notifications, Sports Engine | VOLUME-03 |
| `tournament:status_changed` | Tournament | Notifications | — |

### Coaching / Scheduling Domain
| Event | Publisher | Consumer(s) | Evidence |
|-------|-----------|-------------|----------|
| `coaching:session_scheduled` | Scheduling | Notifications, Coach dashboard | `scheduling/` |
| `scheduling:search_completed` | Scheduling | — | Same |
| `scheduling:booking_created` | Scheduling | Notifications | Same |
| `scheduling:booking_compensated` | Scheduling | Audit | Same |

### Coupon Domain
| Event | Publisher | Consumer(s) | Evidence |
|-------|-----------|-------------|----------|
| `coupon:published` | Coupon Service | Notifications | `coupon/application/coupon.service.ts:67-73` |

### Notifications Domain
| Event | Publisher | Consumer(s) | Evidence |
|-------|-----------|-------------|----------|
| `notification:sent` | Notifications | Push Log | `notifications/` |
| `notification:failed` | Notifications | Dead Letter Queue | Same |

## 3. Event Flow Example: Booking → Payment → Wallet

```
1. User creates booking → booking:created
2. User pays → payment:succeeded
3. Payment emits payment:succeeded → Booking confirms, Wallet credits
4. Booking emits booking:confirmed → Notifications sends confirmation
5. Check-in → booking:checked_in
```

**Evidence:** `payment/application/payment.service.ts:571-622` shows `_processPaymentOutcome` emitting both events.

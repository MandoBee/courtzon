---
document_id: "BIZ-ARCH-10"
document_name: "Business Glossary"
family: "BIZ-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["all"]
difficulty: "beginner"
reading_time: 15
business_owner: "Product Manager"
technical_owner: "Lead Architect"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Draft"
---

# Business Glossary (BIZ-ARCH-10)

## Terms

| Term | Definition | Module | Reference |
|------|-----------|--------|-----------|
| **Booking** | A reservation of a court/resource for a time slot | Booking | `booking/` |
| **Resource** | A bookable entity (court, pitch, lane, studio) | Booking | `booking/` |
| **Slot** | A time window for a resource (e.g., 10:00-11:00) | Booking | `slot-generator.ts` |
| **Match** | A sports match created via public matchmaking | Match | `match/` |
| **Join Request** | A player's request to join a match | Match | `join-request.entity.ts` |
| **Waiting List** | Ordered queue of players waiting to join a full match | Match | `waiting-list-entry.entity.ts` |
| **Eligibility** | Criteria-based filter for match participation | Match | `eligibility.service.ts` |
| **Matchmaking** | Automated process of inviting eligible players to a match | Match | `matchmaking.service.ts` |
| **Program** | A structured academy training program | Academy | `academy/` |
| **Enrollment** | A student's registration in a program | Academy | `academy/` |
| **Tournament** | A competitive event with brackets and standings | Tournament | `tournaments/` |
| **League** | A season-based competition with fixtures and standings | League | `leagues/` |
| **Marketplace** | E-commerce platform for sports products | Marketplace | `marketplace/` |
| **Cart** | Temporary collection of items before checkout | Marketplace | `marketplace/` |
| **Variant** | A product variation (size, color, etc.) | Marketplace | `marketplace/` |
| **Purchase Order** | A procurement order to a supplier | Inventory | `inventory/` |
| **Warehouse** | Physical storage location for inventory | Inventory | `inventory/` |
| **Supplier** | A vendor providing products for resale | Inventory | `inventory/` |
| **Stock Transfer** | Movement of stock between warehouses | Inventory | `inventory/` |
| **Inventory Log** | Immutable audit trail of stock movements | Inventory | `inventory/` |
| **Ledger Entry** | A single debit or credit in the financial ledger | Financial | `ledger-aggregate.ts` |
| **Settlement Batch** | Aggregated financial settlement for a period | Financial | `settlement.service.ts` |
| **Withdrawal** | A user's request to withdraw wallet funds | Financial | `financial-aggregate.ts` |
| **Commission** | Platform fee on transactions | Financial | `commission.service.ts` |
| **Settlement** | Financial reconciliation between platform and org | Settlement | `settlement/` |
| **Membership Plan** | A subscription plan with duration and benefits | Membership | `membership/` |
| **Loyalty Tier** | A points-based tier (bronze→diamond) | Membership | `membership-aggregate.ts` |
| **Campaign** | A time-limited points multiplier promotion | Membership | `membership-aggregate.ts` |
| **Reward** | A redeemable item in the loyalty catalog | Membership | `membership-aggregate.ts` |
| **Pricing Rule** | A configurable price modification rule | Pricing | `pricing-aggregate.ts` |
| **Season Rule** | A seasonal multiplier on base prices | Pricing | `pricing-aggregate.ts` |
| **Demand Rule** | An occupancy-based surge pricing rule | Pricing | `pricing-aggregate.ts` |
| **Coupon** | A discount code for orders | Coupon | `coupon/` |
| **API Key** | An external integration authentication credential | Integration | `integration/` |
| **Push Token** | A device token for push notifications | Mobile | `mobile/` |
| **App Version** | A mobile app version record with forced upgrade | Mobile | `mobile/` |
| **Remote Config** | Platform-specific key-value config for mobile apps | Mobile | `mobile/` |
| **Scheduling Engine** | 5-phase pipeline for combined resource availability | Scheduling | `scheduling/` |
| **Coach Provider** | Scheduling provider for coach availability | Scheduling | `coach.provider.ts` |
| **Court Provider** | Scheduling provider for court availability | Scheduling | `court.provider.ts` |
| **Referee Provider** | Scheduling provider for referee availability | Scheduling | `referee.provider.ts` |
| **SAGA** | Compensation pattern for failed booking transactions | Scheduling | `scheduling-booking.service.ts` |
| **Feature Flag** | Runtime toggle for module-level features | Shared | `shared/utils/feature-flags.ts` |
| **Permission Key** | A unique identifier for a UI element permission | Permissions | `frontend/src/permissions/registry.ts` |
| **Event Bus** | Cross-module event publish/subscribe system | Shared | `shared/event-bus/event-bus.v2.ts` |
| **Command Pipeline** | A CQRS-style command execution pipeline | Shared | `shared/command/command-pipeline.ts` |

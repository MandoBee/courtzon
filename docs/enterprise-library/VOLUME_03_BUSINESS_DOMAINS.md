# CourtZon Enterprise Platform — Volume 03: Business Domains

## Domain Map

```
                    ┌─────────────────────────────────────────────┐
                    │              IDENTITY DOMAIN                │
                    │  Auth · RBAC · Users · Profiles            │
                    │  Global Identity — one user, many roles     │
                    └──────────┬──────────────────────────────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
       ▼                       ▼                       ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ SPORTS DOMAIN│    │  BUSINESS DOMAIN │    │  PLATFORM DOMAIN │
│              │    │                  │    │                  │
│ • Booking    │    │ • Marketplace    │    │ • Organisations  │
│ • Academy    │    │ • Inventory      │    │ • Notifications  │
│ • Tournament │    │ • Finance        │    │ • Security       │
│ • League     │    │ • Accounting     │    │ • Audit          │
│ • Matchmaking│    │ • CRM            │    │ • Support        │
│ • Membership │    │ • HR & Payroll   │    │ • Reports        │
│ • Coaching   │    │ • Pricing        │    │ • BI             │
│ • Refereeing │    │ • Coupons        │    │ • Sports Engine  │
│              │    │ • Settlements    │    │ • Integration    │
│              │    │ • Wallet         │    │ • Mobile         │
│              │    │ • Payment        │    │ • Realtime       │
└──────────────┘    └──────────────────┘    └──────────────────┘
```

## Domain Ownership Rules

| Domain | Owns | Does Not Own |
|--------|------|-------------|
| **Identity** | Users, roles, permissions, authentication, sessions | Organization hierarchy, business rules |
| **Organizations** | Org hierarchy, branches, resources, staff, members | User identities, payments, accounting |
| **Booking** | Court booking lifecycle, availability, check-in | Payments, wallet, accounting entries |
| **Academy** | Programs, groups, enrollments, attendance | Student identities, payments |
| **Tournament** | Tournament lifecycle, brackets, standings, seeding | Player rankings (delegated to Sports Engine), payments |
| **League** | Seasons, leagues, divisions, fixtures, standings | Player/team statistics engine |
| **Marketplace** | Products, orders, cart, reviews, shipping | Payments, inventory ledger, accounting |
| **Inventory** | Warehouses, suppliers, purchase orders, stock ledger | Product catalog (Marketplace owns this) |
| **Finance** | Payment gateway, wallet, transactions, reconciliation | Accounting entries (Accounting owns this) |
| **Accounting** | Chart of accounts, journal entries, GL, periods, tax | Payment processing (Finance owns this) |
| **Wallet** | Balance, deposits, withdrawals | Payment processing, accounting entries |
| **CRM** | Customer 360, segments, leads, campaigns, comms log | Business operations data |
| **HR** | Employees, contracts, leave, attendance, payroll calc | Payroll accounting (Accounting owns this) |
| **Notifications** | Delivery, templates, preferences, channels | Business logic that triggers notifications |
| **BI** | KPI aggregation, dashboards, exports | Business rules |
| **Sports Engine** | Rankings, match quality, recommendations | Tournament/league/match business logic |

## Domain Integration (Event-Driven)

| Event | Publisher | Consumers |
|-------|-----------|-----------|
| `booking:confirmed` | Booking | Notifications, Match (auto-create), CRM |
| `booking:cancelled` | Booking | Notifications, Match (cleanup) |
| `payment:succeeded` | Payment | Booking (confirm), Marketplace (fulfill), Wallet, Notifications |
| `payment:failed` | Payment | Booking (cancel), Marketplace (revert), Notifications |
| `marketplace:order-placed` | Marketplace | Notifications, Inventory (reserve), CRM |
| `marketplace:order-confirmed` | Marketplace | Notifications, Inventory (deduct) |
| `membership:expiring` | Membership | Notifications, CRM |
| `tournament:created` | Tournament | Notifications, Sports Engine (ranking) |
| `coaching:session-scheduled` | Scheduling | Notifications, Coach dashboard |
| `wallet:deposit` | Wallet | Notifications, CRM (update value) |
| `user:registered` | Auth | Notifications, CRM (create profile) |

**Evidence:** `backend/src/modules/payment/application/payment.service.ts:571-622` shows `_processPaymentOutcome` emitting `payment:succeeded` and `payment:failed`. `backend/src/modules/booking/application/booking.service.ts` listens for these events.

## Evidence Files

| Domain | Routes File | Service File | Auth Middleware |
|--------|-------------|-------------|----------------|
| Booking | `modules/booking/presentation/booking.routes.ts` | `booking.service.ts` | authMiddleware |
| Academy | `modules/academy/presentation/academy.routes.ts` | `program.service.ts` | authMiddleware |
| Tournament | `modules/tournaments/presentation/tournament.routes.ts` | `tournament.service.ts` | authMiddleware |
| League | `modules/leagues/presentation/league.routes.ts` | `league.service.ts` | authMiddleware |
| Marketplace | `modules/marketplace/presentation/marketplace.routes.ts` | `marketplace.service.ts` | authMiddleware |
| Finance | `modules/financial/presentation/ledger.routes.ts` | `ledger.service.ts` | authMiddleware |
| CRM | `modules/crm/presentation/crm.routes.ts` | `player.service.ts` (in controller) | authMiddleware |
| HR | `modules/hr/presentation/hr.routes.ts` | controller uses getPool() directly | authMiddleware |
| Notifications | `modules/notifications/presentation/notification.routes.ts` | `notification.service.ts` | authMiddleware |

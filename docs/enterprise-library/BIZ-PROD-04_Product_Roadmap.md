---
document_id: "BIZ-PROD-04"
document_name: "Product Roadmap"
family: "BIZ-PROD"
document_type: "PROD"
status: "Draft"
version: "0.1"
audience: ["product", "executive"]
difficulty: "beginner"
reading_time: 15
business_owner: "Product Director"
technical_owner: "CTO"
documentation_owner: "Product Management"
reviewer: "Architect"
approver: "Executive Team"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["BIZ-ARCH-01"]
  related: []
---

# Product Roadmap (BIZ-PROD-04)

## Development History

### Sprint 5: Core Auth & RBAC
- User registration (4 flows), login, JWT sessions, password reset
- Role-based access control, permission management, user management
- Feature flags framework

### Sprint 6: Booking Engine
- Resource/slot management, booking creation, cancellation, check-in
- Slot preparation with Redis locks, auto-expiry worker
- QR code generation for check-in

### Sprint 7: Payments & Wallet
- Payment gateway abstraction (Fatoora, PayPal, Cash)
- Wallet system: top-up, payouts, ledger transactions
- Booking payment integration

### Sprint 8: Tournament Engine
- Tournament CRUD, bracket generation, match/score management
- Player registration, state machine

### Sprint 9: Academy Engine
- Academy CRUD, curriculum management, enrollment
- Session scheduling, attendance tracking, player evaluation

### Sprint 10: League Engine
- League CRUD, season management, team registration
- Match scheduling, standings calculation

### Sprint 11: Scheduling Engine
- Recurring schedules, operating hours, resource capacity
- TimeEngine — timezone, DST, business day resolution

### Sprint 12: Marketplace
- Product listings, cart, checkout, order management
- Seller dashboard, vendor payouts

### Sprint 13: Inventory & Subscription
- Inventory tracking, stock management, purchase orders
- Subscription plans, organisation plan limits

### Sprint 14: CRM
- Lead management, campaign management
- Customer 360 view with aggregated data

### Sprint 15: HR & Payroll
- Employee management, leave requests, attendance
- Payroll runs, salary processing, pay slips

### Sprint 16: Notifications Engine
- Multi-channel (push, email, SMS, in-app)
- Templates, digests, rate limits, dead letter queue
- Broadcast infrastructure, A/B testing

### Sprint 17: Coach Module
- Coach profiles, availability, session booking
- Org agreements, commission splits, court booking
- Session state machine

### Sprint 18: Player Experience
- Player dashboard, search, favorites, achievements
- QR profiles, device management, rank history

### Sprint 19: Admin Infrastructure
- System settings, feature flag admin, health endpoint
- Cache management, queue monitoring, app branding

### Sprint 20: Design Studio
- Design tokens CRUD, theme publishing/versioning
- Role-based themes, personal appearance customization

## Future Evolution Strategy

### Phase 2 (Next)

| Area | Features |
|------|----------|
| **Recurring Engine** | Recurring booking schedules, subscription bookings |
| **Mobile Apps** | Native iOS/Android apps (currently web/PWA) |
| **BI & Analytics** | Advanced dashboards, KPI snapshots, export pipelines |
| **Community** | Player social feed, events, group challenges |
| **Integration Hub** | Webhook system, Zapier/ Make integration, public API |
| **Support** | Ticket system, live chat, knowledge base |
| **Gamification** | Badge system, leaderboards, challenges, XP |

### Phase 3 (Medium-term)

| Area | Features |
|------|----------|
| **AI/ML** | Smart scheduling suggestions, player matching, dynamic pricing |
| **IoT Integration** | Court sensors, automated check-in, smart lighting |
| **White Label** | Full white-label for enterprise clients |
| **Multi-Sport** | Expanded sport type support (tennis, squash, football, etc.) |
| **E-Sports** | Virtual tournaments, streaming integration |

### Phase 4 (Long-term)

| Area | Features |
|------|----------|
| **Global Expansion** | Multi-region deployment, regional compliance |
| **Franchise Management** | Multi-org franchise hierarchy |
| **Blockchain** | NFT ticketing, tokenized memberships |
| **Metaverse** | Virtual club experiences |

---
document_id: "BIZ-ARCH-01"
document_name: "Business Vision & Strategy"
family: "BIZ-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["executive", "product", "architect"]
difficulty: "beginner"
reading_time: 15
business_owner: "CEO"
technical_owner: "CTO"
documentation_owner: "Product Management"
reviewer: "Architect"
approver: "CEO"
lifecycle_status: "Draft"
---

# Business Vision & Strategy (BIZ-ARCH-01)

## 1. Mission

CourtZon is an Enterprise Sports ERP platform that digitizes and unifies sports facility, academy, tournament, league, and marketplace operations for clubs, academies, federations, and franchises across the Middle East and Africa.

## 2. Target Markets

| Market Segment | Description | Key Modules |
|---------------|-------------|-------------|
| **Sports Clubs** | Multi-court facilities managing bookings, memberships, coaching | Booking, Scheduling, Membership, HR |
| **Academies** | Training programs, student enrollment, attendance tracking | Academy, Scheduling, CRM |
| **Federations** | Governing bodies running tournaments, leagues, rankings | Tournaments, Leagues, Sports Engine, BI |
| **Franchises** | Multi-branch organisations with centralized management | Organisations, RBAC, Reports, Financial |
| **Marketplace Sellers** | Pro shops, equipment sellers, service providers | Marketplace, Inventory, Settlement |

## 3. Platform Differentiators

| Differentiator | Description | Evidence |
|---------------|-------------|----------|
| **Modular Monolith** | 30+ modules in a single deployable, strict domain boundaries via EventBusV2 | `TECH-ARCH-02`, event bus architecture |
| **Global Identity** | Single `users` table, role-based assignments, no separate actor tables | `modules/auth/`, `modules/rbac/` |
| **Double-Entry Ledger** | Every financial movement creates balanced debit/credit pairs | `modules/financial/domain/ledger-aggregate.ts:58-74` |
| **Sports Engine** | Rankings, match quality, recommendations | `modules/sports-engine/` |
| **Event-Composable** | Cross-domain communication via events, not direct calls | `shared/event-bus/event-bus.v2.ts` |
| **Unified Scheduling** | 5-phase pipeline combining court, coach, referee availability | `modules/scheduling/scheduling-engine.ts:12-39` |
| **Permission System** | Granular UI element gating via permission keys | `frontend/src/permissions/registry.ts` |
| **Enterprise Multi-Tenant** | Org hierarchy, branch management, role scoping | `modules/organisations/` |

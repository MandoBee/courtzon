# CourtZon Enterprise Platform — Volume 01: Executive Overview

## Platform Identity

**Product Name:** CourtZon Enterprise Platform  
**Version:** v2.2.0  
**Classification:** Enterprise Sports ERP  
**Architecture:** Modular Monolith (Fastify + React + MySQL + Redis)  
**Deployment:** Docker Compose (6 containers)  
**Repository:** github.com/MandoBee/courtzon (private)

## Platform Mission

CourtZon is an Enterprise Sports Operating System designed to manage sports clubs, academies, multi-branch organizations, federations, and franchise networks on a single unified architecture.

## Development History

| Phase | Sprints | Releases | Focus |
|-------|---------|----------|-------|
| A — Sports Platform | 5–9 | v1.5.0 → v1.9.0 | Membership, Academy, Tournament, League, Player |
| B — Club & Admin | 10–12 | v1.10.0 → v1.12.0 | Club, Coach, Referee, Super Admin |
| C — Business Platform | 13–16 | v1.13.0 → v1.16.0 | Marketplace, Finance, CRM, HR |
| D — Intelligence | 17–18 | v1.17.0 → v1.18.0 | BI, Advanced Sports Engine |
| E — Ecosystem | 19–20 | v2.1.0 → v2.2.0 | Integration, Mobile |

## Platform Scale

| Metric | Count |
|--------|-------|
| Backend Modules | 53 |
| Frontend Pages | 120+ |
| Database Migrations | 73 |
| API Routes | 619 |
| RBAC Permissions | 250+ |
| Audit Events | 100+ |
| Translation Keys | 500+ |
| Git Commits | 340+ |
| Docker Images | 6 |
| Production Releases | 17 |

## Architecture Principles (14, Frozen)

| # | Principle | Established |
|---|-----------|-------------|
| 1 | Global Identity | Phase A — One user, multiple roles, never duplicate |
| 2 | Domain Ownership | Phase A — Each domain owns its business rules |
| 3 | Event-Composable Architecture | Sprint 14 — Domains collaborate through events |
| 4 | Ledger-Based Transactions | Sprint 13 — Every movement is immutable |
| 5 | Finance Owns Financial Truth | Sprint 14 — Only Finance creates accounting records |
| 6 | Read Models Are Products, Not Queries | Sprint 15 — Pre-built projections for UI |
| 7 | Capabilities Own Policies | Sprint 15 — Controllers never implement business logic |
| 8 | Everything Has a Lifecycle | v2.1 — Explicit state machines everywhere |
| 9 | Configuration Over Customization | v2.2 — Tenant behavior via config, not code |
| 10 | Metadata Before Schema Changes | v2.2 — Extensible attributes first |
| 11 | Workflow Before Hardcoding | v2.2 — Approval chains as workflows |
| 12 | Observability By Design | v2.2 — Metrics, events, health by default |
| 13 | API First | v2.2 — Every capability through stable APIs |
| 14 | Security By Design | v2.2 — Auth, RBAC, audit from day one |

## Target Users

| Role | Description | Screens |
|------|-------------|---------|
| **Super Admin** | Platform-wide governance | 60+ admin screens |
| **Org Admin** | Club/organization management | 24 org screens |
| **Branch Manager** | Branch operations | Org screens (branch-scoped) |
| **Coach** | Session management, availability | 8 coach screens |
| **Referee** | Match assignments, availability | 6 referee screens |
| **Player** | Booking, marketplace, tournaments | 35+ player screens |
| **Receptionist** | Check-in, booking management | 1 reception screen |
| **Accountant** | Finance, settlements, reports | Org finance screens |

## Production Readiness

| Domain | Status | Evidence |
|--------|--------|----------|
| Identity & Auth | ✅ Complete | 17 routes, JWT sessions, brute-force protection |
| Organizations | ✅ Complete | 155 routes, full org/branch/resource lifecycle |
| Sports (Booking, Academy, Tournament, League) | ✅ Complete | 137 routes, 100% permission-gated |
| Commerce (Marketplace, Inventory) | ✅ Complete | 80 routes, inventory ledger |
| Finance (Payment, Wallet, Accounting) | ✅ Complete | 37 routes, double-entry ledger |
| People (CRM, HR, Payroll) | ✅ Complete | 70 routes, full employee/leave/payroll lifecycle |
| Intelligence (BI, Sports Engine) | ✅ Complete | 14 routes, ELO rankings, KPI dashboards |
| Ecosystem (Integration, Mobile) | ✅ Complete | 24 routes, API gateway, push notifications |

**Certification Result:** Codebase is production-ready. Documentation library is in progress.

## Key Strengths

1. **Architecture integrity** — 14 frozen principles never violated across all 20 sprints
2. **Domain ownership** — No duplicate business logic across 53 modules
3. **Complete lifecycles** — Every entity has explicit state machines
4. **Ledger compliance** — Wallet, inventory, finance, and payroll all use immutable transactions
5. **RBAC coverage** — 88% route-level permission coverage; sports and business modules at 100%

## Key Gaps

1. **Notification admin routes** — 25 routes lack permission guards (Critical)
2. **Documentation** — User manuals, test matrix, and RTM not yet complete
3. **Testing** — Unit tests exist for critical paths; integration/e2e coverage needs expansion

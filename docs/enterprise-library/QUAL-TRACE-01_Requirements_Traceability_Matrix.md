---
document_id: "QUAL-TRACE-01"
document_name: "Requirements Traceability Matrix"
family: "QUAL-TRACE"
document_type: "TRACE"
status: "Draft"
version: "0.1"
audience: ["qa", "developer", "architect"]
difficulty: "advanced"
reading_time: 30
business_owner: "QA Director"
technical_owner: "Architect"
documentation_owner: "QA"
reviewer: "Architect"
approver: "QA Director"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["BIZ-ARCH-01", "BIZ-PROD-02", "BIZ-PROD-03", "QUAL-TEST-01"]
  related: ["TECH-DEV-09", "TECH-DEV-11"]
---

# Requirements Traceability Matrix (QUAL-TRACE-01)

## How to Read This Matrix

Each business requirement traces through:
1. **Module** — The implementing module(s)
2. **API Endpoints** — REST route(s) fulfilling the requirement
3. **Permissions** — Required permission keys
4. **Test Coverage** — References to test cases
5. **Documentation** — User guides and reference docs

## Traceability Matrix

### Auth & Identity

| BR-ID | Business Requirement | Module | API Endpoints | Permissions | Tests | Docs |
|-------|---------------------|--------|--------------|-------------|-------|------|
| BR-AUTH-001 | User must register with email/phone | Auth | POST /auth/register | — | TC-AUTH-001 | TECH-MOD-01, USER-01 |
| BR-AUTH-002 | Player must register as player | Auth | POST /auth/register-player | — | TC-AUTH-002 | TECH-MOD-01, USER-01 |
| BR-AUTH-003 | User must login securely | Auth | POST /auth/login | — | TC-AUTH-003 | TECH-MOD-01 |
| BR-AUTH-004 | User must reset forgotten password | Auth | POST /auth/forgot-password, POST /auth/reset-password | — | TC-AUTH-004 | TECH-MOD-01 |
| BR-AUTH-005 | User must manage profile | Auth | PATCH /auth/profile | — | TC-AUTH-005 | TECH-MOD-01 |
| BR-AUTH-006 | System must prevent brute force | Auth | POST /auth/login | — | TC-AUTH-006 | TECH-MOD-01 |
| BR-AUTH-007 | User must manage sessions | Auth | POST /auth/refresh, POST /auth/logout | — | TC-AUTH-007 | TECH-MOD-01 |

### RBAC & Permissions

| BR-ID | Business Requirement | Module | API Endpoints | Permissions | Tests | Docs |
|-------|---------------------|--------|--------------|-------------|-------|------|
| BR-RBAC-001 | Admin must manage roles | RBAC | GET/POST/PUT/DELETE /roles | oles.* | TC-RBAC-001 | TECH-MOD-02 |
| BR-RBAC-002 | Admin must assign permissions | RBAC | PUT /roles/:id/permissions | oles.* | TC-RBAC-002 | TECH-MOD-02 |
| BR-RBAC-003 | Admin must manage users | RBAC | GET/PUT/DELETE /admin/users/:id | dmin.users.* | TC-RBAC-003 | TECH-MOD-02 |
| BR-RBAC-004 | Admin must toggle feature flags | RBAC | PATCH /feature-flags/:id/toggle | eature_flags.* | TC-RBAC-004 | TECH-MOD-36 |
| BR-RBAC-005 | System must gate UI elements | RBAC | POST /ui-permissions/sync | ui-permissions.* | TC-RBAC-005 | TECH-MOD-02, AGENTS.md |

### Booking

| BR-ID | Business Requirement | Module | API Endpoints | Permissions | Tests | Docs |
|-------|---------------------|--------|--------------|-------------|-------|------|
| BR-BOOK-001 | User must browse facilities | Booking, Org | GET /facilities | ranches.request-access | TC-BOOK-001 | TECH-MOD-03, USER-01 |
| BR-BOOK-002 | User must view resource slots | Booking | GET /resources/:id/slots | ookings.view | TC-BOOK-002 | TECH-MOD-03 |
| BR-BOOK-003 | User must create booking | Booking | POST /bookings | ookings.create | TC-BOOK-003 | TECH-MOD-03 |
| BR-BOOK-004 | User must cancel booking | Booking | POST /bookings/:id/cancel | ookings.cancel | TC-BOOK-004 | TECH-MOD-03 |
| BR-BOOK-005 | User must check in | Booking | POST /bookings/:id/check-in | ookings.check-in | TC-BOOK-005 | TECH-MOD-03 |
| BR-BOOK-006 | User must view my bookings | Booking | GET /my/bookings | ookings.view | TC-BOOK-006 | TECH-MOD-03 |
| BR-BOOK-007 | User must create matchmaking booking | Booking, Match | POST /bookings with match params | ookings.matchmaking | TC-BOOK-007 | TECH-MOD-03, TECH-MOD-17 |
| BR-BOOK-008 | Org admin must manage org bookings | Org, Booking | GET /org/:orgId/bookings | org.bookings.manage | TC-BOOK-008 | TECH-MOD-13 |
| BR-BOOK-009 | Super admin must view all bookings | Admin, Booking | GET /admin/bookings | dmin.bookings.view | TC-BOOK-009 | ADMIN-02 |

### Tournaments

| BR-ID | Business Requirement | Module | API Endpoints | Permissions | Tests | Docs |
|-------|---------------------|--------|--------------|-------------|-------|------|
| BR-TOUR-001 | Org must create tournaments | Activities | POST /tournaments | 	ournaments.create | TC-TOUR-001 | TECH-MOD-05 |
| BR-TOUR-002 | Admin must generate brackets | Activities | POST /tournaments/:id/generate-bracket | 	ournaments.manage_brackets | TC-TOUR-002 | TECH-MOD-05 |
| BR-TOUR-003 | Player must enter match scores | Activities | POST /matches/:id/score | 	ournaments.enter_scores | TC-TOUR-003 | TECH-MOD-05 |
| BR-TOUR-004 | Player must register for tournament | Activities | POST /tournaments/:id/register | — | TC-TOUR-004 | TECH-MOD-05 |

### Academies

| BR-ID | Business Requirement | Module | API Endpoints | Permissions | Tests | Docs |
|-------|---------------------|--------|--------------|-------------|-------|------|
| BR-ACA-001 | Org must create academy programs | Activities | POST /academies | cademies.create | TC-ACA-001 | TECH-MOD-04 |
| BR-ACA-002 | Org must manage curricula | Activities | POST /academies/:id/curriculums | cademies.edit | TC-ACA-002 | TECH-MOD-04 |
| BR-ACA-003 | Player must enroll in programs | Activities | POST /academies/:id/enroll | — | TC-ACA-003 | TECH-MOD-04 |
| BR-ACA-004 | Coach must mark attendance | Activities | POST /sessions/:id/attendance | — | TC-ACA-004 | TECH-MOD-04 |
| BR-ACA-005 | Coach must evaluate players | Activities | POST /academies/:id/evaluations | cademies.evaluate | TC-ACA-005 | TECH-MOD-04 |

### Coaching

| BR-ID | Business Requirement | Module | API Endpoints | Permissions | Tests | Docs |
|-------|---------------------|--------|--------------|-------------|-------|------|
| BR-COACH-001 | Coach must create profile | Activities | POST /coaches/profile | coaches.manage_profile | TC-COACH-001 | TECH-MOD-35, TECH-MOD-51 |
| BR-COACH-002 | Player must book coach | Activities | POST /coach-sessions/request | coaches.book | TC-COACH-002 | TECH-MOD-51 |
| BR-COACH-003 | Coach must manage availability | Activities | PUT /coaches/availability/me | coaches.availability.manage | TC-COACH-003 | TECH-MOD-35 |
| BR-COACH-004 | Player must review coach | Activities | POST /coaches/:id/reviews | — | TC-COACH-004 | TECH-MOD-35 |
| BR-COACH-005 | Coach must complete session lifecycle | Activities | Multiple endpoints | coaches.* | TC-COACH-005 | TECH-MOD-51 |

### Payments & Wallet

| BR-ID | Business Requirement | Module | API Endpoints | Permissions | Tests | Docs |
|-------|---------------------|--------|--------------|-------------|-------|------|
| BR-PAY-001 | User must top up wallet | Wallet | POST /wallet/top-up | — | TC-PAY-001 | TECH-MOD-10 |
| BR-PAY-002 | User must pay via wallet | Payment | POST /payments/wallet | — | TC-PAY-002 | TECH-MOD-09 |
| BR-PAY-003 | User must pay via gateway | Payment | POST /payments/gateway | — | TC-PAY-003 | TECH-MOD-09 |
| BR-PAY-004 | User must view transaction history | Wallet | GET /wallet/transactions | — | TC-PAY-004 | TECH-MOD-10 |
| BR-PAY-005 | Vendor must receive payouts | Settlement | POST /payouts | — | TC-PAY-005 | TECH-MOD-30 |

### Admin & Platform

| BR-ID | Business Requirement | Module | API Endpoints | Permissions | Tests | Docs |
|-------|---------------------|--------|--------------|-------------|-------|------|
| BR-ADM-001 | Admin must manage system settings | Admin | GET/PUT /admin/settings/:key | system_settings.* | TC-ADM-001 | TECH-MOD-36 |
| BR-ADM-002 | Admin must view system health | Admin | GET /admin/health | system_health.view | TC-ADM-002 | TECH-MOD-36 |
| BR-ADM-003 | Admin must manage cache | Admin | GET/POST /admin/cache | cache.manage | TC-ADM-003 | TECH-MOD-36 |
| BR-ADM-004 | Admin must monitor queues | Admin | GET /admin/queues | queue.view | TC-ADM-004 | TECH-MOD-36 |
| BR-ADM-005 | Admin must manage app branding | App Settings | PUT /admin/app-settings | pp-settings.edit | TC-ADM-005 | TECH-MOD-39 |
| BR-ADM-006 | Admin must manage design tokens | Design Tokens | POST /design-tokens/publish | design-tokens.* | TC-ADM-006 | TECH-MOD-44 |

### Player Experience

| BR-ID | Business Requirement | Module | API Endpoints | Permissions | Tests | Docs |
|-------|---------------------|--------|--------------|-------------|-------|------|
| BR-PLAY-001 | Player must view dashboard | Player Exp | GET /players/my/dashboard | player.dashboard.view | TC-PLAY-001 | TECH-MOD-52 |
| BR-PLAY-002 | Player must search other players | Player Exp | GET /players/search | player.search | TC-PLAY-002 | TECH-MOD-52 |
| BR-PLAY-003 | Player must favorite clubs/coaches | Player Exp | POST /players/my/favorites/clubs/:orgId | player.favorites.manage | TC-PLAY-003 | TECH-MOD-52 |
| BR-PLAY-004 | Player must view achievements | Player Exp | GET /players/my/achievements | player.achievements.view | TC-PLAY-004 | TECH-MOD-52 |
| BR-PLAY-005 | Player must view QR profile | Player Exp | GET /players/my/qr-profile | player.qr.view | TC-PLAY-005 | TECH-MOD-52 |

### Marketplace

| BR-ID | Business Requirement | Module | API Endpoints | Permissions | Tests | Docs |
|-------|---------------------|--------|--------------|-------------|-------|------|
| BR-MKT-001 | User must browse products | Marketplace | GET /marketplace/products | — | TC-MKT-001 | TECH-MOD-07 |
| BR-MKT-002 | User must manage cart | Marketplace | POST /marketplace/cart | — | TC-MKT-002 | TECH-MOD-07 |
| BR-MKT-003 | User must checkout | Marketplace | POST /marketplace/checkout | — | TC-MKT-003 | TECH-MOD-07 |
| BR-MKT-004 | Seller must manage orders | Marketplace | GET /seller/orders | — | TC-MKT-004 | TECH-MOD-07 |
| BR-MKT-005 | Seller must view dashboard | Marketplace | GET /seller/dashboard | — | TC-MKT-005 | TECH-MOD-07 |

### Reference Data

| BR-ID | Business Requirement | Module | API Endpoints | Permissions | Tests | Docs |
|-------|---------------------|--------|--------------|-------------|-------|------|
| BR-REF-001 | System must list countries | Countries | GET /countries | auth | — | TECH-MOD-42 |
| BR-REF-002 | System must list provinces by country | Provinces | GET /countries/:id/provinces | auth | — | TECH-MOD-47 |
| BR-REF-003 | System must list cities by province | Cities | GET /provinces/:id/cities | auth | — | TECH-MOD-41 |
| BR-REF-004 | System must list currencies | Currencies | GET /currencies | auth | — | TECH-MOD-43 |
| BR-REF-005 | System must list languages | Languages | GET /public/languages | — | — | TECH-MOD-46 |
| BR-REF-006 | System must detect geo currency | Geo | GET /public/geo/currency | — | — | TECH-MOD-45 |

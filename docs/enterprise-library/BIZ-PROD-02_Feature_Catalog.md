---
document_id: "BIZ-PROD-02"
document_name: "Feature Catalog"
family: "BIZ-PROD"
document_type: "PROD"
status: "Draft"
version: "0.1"
audience: ["product", "executive"]
difficulty: "beginner"
reading_time: 30
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Product Management"
reviewer: "Architect"
approver: "Product Director"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["BIZ-PROD-03", "TECH-MOD-01"]
  related: []
---

# Feature Catalog (BIZ-PROD-02)

## Module: Auth & Identity

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-AUTH-001 | Registration | General user registration | — | ✓ | ✓ | ✓ |
| F-AUTH-002 | Player Registration | Player-specific registration | — | ✓ | ✓ | ✓ |
| F-AUTH-003 | Seller Registration | Seller upgrade registration | — | ✓ | ✓ | ✓ |
| F-AUTH-004 | Org Registration | Organisation registration | — | ✓ | ✓ | ✓ |
| F-AUTH-005 | Login | Email/phone + password login | — | ✓ | ✓ | ✓ |
| F-AUTH-006 | Password Reset | Forgot/reset password flow | — | ✓ | ✓ | ✓ |
| F-AUTH-007 | Profile Management | Update profile, avatar | — | ✓ | ✓ | ✓ |
| F-AUTH-008 | Session Management | Multiple device sessions | — | ✓ | ✓ | ✓ |
| F-AUTH-009 | Brute Force Protection | Rate-limited login attempts | — | auto | auto | auto |
| F-AUTH-010 | Account Reactivation | Request account reactivation | — | ✓ | ✓ | ✓ |

## Module: RBAC & Permissions

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-RBAC-001 | Role Management | Create/edit/delete roles | `roles.*` | ✓ | — | — |
| F-RBAC-002 | Permission Management | Assign permissions to roles | `permissions.*` | ✓ | — | — |
| F-RBAC-003 | User Management | Admin user CRUD, password reset | `admin.users.*` | ✓ | — | — |
| F-RBAC-004 | Feature Flags | Toggle features on/off | `feature_flags.*` | ✓ | — | — |
| F-RBAC-005 | UI Permissions Sync | Sync permission registry from codebase | `ui-permissions.*` | ✓ | — | — |

## Module: Booking

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-BOOK-001 | Browse Facilities | Browse orgs and branches | `branches.request-access` | ✓ | ✓ | ✓ |
| F-BOOK-002 | View Resources & Slots | View courts with slot availability | `bookings.view` | ✓ | ✓ | ✓ |
| F-BOOK-003 | Create Booking | Book a court with payment | `bookings.create` | ✓ | ✓ | ✓ |
| F-BOOK-004 | Matchmaking Booking | Public match booking with criteria | `bookings.matchmaking` | ✓ | ✓ | ✓ |
| F-BOOK-005 | Private Booking | Invite-only booking | `bookings.create` | ✓ | ✓ | ✓ |
| F-BOOK-006 | Cancel Booking | Cancel with reason/refund | `bookings.cancel` | ✓ | ✓ | ✓ |
| F-BOOK-007 | Check In | Check in at facility | `bookings.check-in` | ✓ | ✓ | ✓ |
| F-BOOK-008 | My Bookings | List user bookings | `bookings.view` | ✓ | ✓ | ✓ |
| F-BOOK-009 | Booking Detail | Single booking with QR code | `bookings.view` | ✓ | ✓ | ✓ |
| F-BOOK-010 | Match Discovery | Browse public matches | `matches.view` | ✓ | ✓ | ✓ |

## Module: Tournaments

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-TOUR-001 | Create Tournament | Create tournament with format | `tournaments.create` | ✓ | ✓ | — |
| F-TOUR-002 | Bracket Generation | Auto-generate bracket | `tournaments.manage_brackets` | ✓ | ✓ | — |
| F-TOUR-003 | Enter Scores | Record match results | `tournaments.enter_scores` | ✓ | ✓ | ✓ |
| F-TOUR-004 | Player Registration | Register for tournaments | — | ✓ | ✓ | ✓ |
| F-TOUR-005 | Tournament List | Browse tournaments | — | ✓ | ✓ | ✓ |

## Module: Academies

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-ACA-001 | Create Academy | Create program/curriculum | `academies.create` | ✓ | ✓ | — |
| F-ACA-002 | Curriculum Management | Create/edit curricula | `academies.edit` | ✓ | ✓ | — |
| F-ACA-003 | Enrollment | Enroll players in programs | — | ✓ | ✓ | ✓ |
| F-ACA-004 | Session Attendance | Mark attendance | — | ✓ | ✓ | ✓ |
| F-ACA-005 | Player Evaluation | Evaluate player progress | `academies.evaluate` | ✓ | ✓ | — |

## Module: Leagues

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-LEA-001 | Create League | Create league with seasons | `leagues.create` | ✓ | ✓ | — |
| F-LEA-002 | Team Management | Register/manage teams | `leagues.manage_teams` | ✓ | ✓ | ✓ |
| F-LEA-003 | Match Scheduling | Schedule league matches | `leagues.schedule` | ✓ | ✓ | — |
| F-LEA-004 | Standings | View league standings | — | ✓ | ✓ | ✓ |

## Module: Marketplace

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-MKT-001 | Product Listings | Browse marketplace products | — | ✓ | ✓ | ✓ |
| F-MKT-002 | Shopping Cart | Cart management | — | ✓ | ✓ | ✓ |
| F-MKT-003 | Checkout | Order placement with payment | — | ✓ | ✓ | ✓ |
| F-MKT-004 | Order Management | Track/manage orders | — | ✓ | ✓ | ✓ |
| F-MKT-005 | Seller Dashboard | Seller sales/analytics | — | ✓ | ✓ | — |

## Module: Wallet & Payments

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-WAL-001 | Wallet Top-Up | Add funds to wallet | — | ✓ | ✓ | ✓ |
| F-WAL-002 | Wallet Payments | Pay via wallet balance | — | ✓ | ✓ | ✓ |
| F-WAL-003 | Payment Gateway | Credit/debit card payments | — | ✓ | ✓ | ✓ |
| F-WAL-004 | Transaction History | View ledger transactions | — | ✓ | ✓ | ✓ |
| F-WAL-005 | Payouts | Withdraw/vendor payouts | — | ✓ | ✓ | — |

## Module: Coaching

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-COACH-001 | Coach Profile | Create/manage coach profile | `coaches.manage_profile` | ✓ | ✓ | ✓ |
| F-COACH-002 | Session Booking | Book coaching sessions | `coaches.book` | ✓ | ✓ | ✓ |
| F-COACH-003 | Session Management | Start/complete/cancel sessions | `coaches.*` | ✓ | ✓ | ✓ |
| F-COACH-004 | Availability | Set weekly availability/blackouts | `coaches.availability.manage` | ✓ | ✓ | ✓ |
| F-COACH-005 | Reviews | Rate and review coaches | — | ✓ | ✓ | ✓ |

## Module: CRM

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-CRM-001 | Lead Management | Capture/track leads | `crm.leads.*` | ✓ | ✓ | — |
| F-CRM-002 | Campaign Management | Email/messaging campaigns | `crm.campaigns.*` | ✓ | ✓ | — |
| F-CRM-003 | Customer View | 360° customer profile | — | ✓ | ✓ | — |

## Module: HR & Payroll

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-HR-001 | Employee Management | Manage staff records | `hr.employees.*` | ✓ | ✓ | — |
| F-HR-002 | Leave Management | Request/approve leave | `hr.leaves.*` | ✓ | ✓ | ✓ |
| F-HR-003 | Attendance | Clock in/out tracking | `hr.attendance.*` | ✓ | ✓ | ✓ |
| F-HR-004 | Payroll Runs | Process payroll | `hr.payroll.*` | ✓ | ✓ | — |

## Module: Notifications

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-NOT-001 | Push Notifications | Mobile push alerts | — | ✓ | ✓ | ✓ |
| F-NOT-002 | Email Notifications | Transactional emails | — | ✓ | ✓ | ✓ |
| F-NOT-003 | SMS Notifications | SMS alerts | — | ✓ | ✓ | ✓ |
| F-NOT-004 | In-App Notifications | In-app notification center | — | ✓ | ✓ | ✓ |
| F-NOT-005 | Notification Preferences | Channel preferences | — | ✓ | ✓ | ✓ |

## Module: Player Experience

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-PLAY-001 | Player Dashboard | Aggregated activity dashboard | `player.dashboard.view` | ✓ | ✓ | ✓ |
| F-PLAY-002 | Player Search | Find other players | `player.search` | ✓ | ✓ | ✓ |
| F-PLAY-003 | Favorites | Favorite clubs and coaches | `player.favorites.manage` | ✓ | ✓ | ✓ |
| F-PLAY-004 | Achievements | Gamification achievements | `player.achievements.view` | ✓ | ✓ | ✓ |
| F-PLAY-005 | QR Profile | Shareable QR player profile | `player.qr.view` | ✓ | ✓ | ✓ |
| F-PLAY-006 | Device Management | Manage login devices | `player.devices.manage` | ✓ | ✓ | ✓ |

## Module: Admin

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-ADM-001 | System Settings | Manage platform settings | `system_settings.*` | ✓ | — | — |
| F-ADM-002 | System Health | View system health metrics | `system_health.view` | ✓ | — | — |
| F-ADM-003 | Cache Management | Redis cache operations | `cache.manage` | ✓ | — | — |
| F-ADM-004 | Queue Management | Bull queue monitoring | `queue.*` | ✓ | — | — |
| F-ADM-005 | App Branding | Logo/favicon/PWA icon upload | `app-settings.*` | ✓ | — | — |

## Module: Design Tokens

| ID | Feature | Description | Permission Key | Super Admin | Org Admin | Player |
|----|---------|-------------|---------------|:-----------:|:---------:|:------:|
| F-DT-001 | Theme Studio | Visual theme editor | `design-tokens.*` | ✓ | — | — |
| F-DT-002 | Theme Publishing | Publish/rollback themes | `design-tokens.publish` | ✓ | — | — |
| F-DT-003 | Role-Based Themes | Per-role theme overrides | `design-tokens.edit` | ✓ | — | — |
| F-DT-004 | Personal Appearance | Personal theme customization | `appearance.role-customize` | ✓ | ✓ | ✓ |

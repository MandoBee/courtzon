---
document_id: "BIZ-PROD-03"
document_name: "Feature Matrix"
family: "BIZ-PROD"
document_type: "PROD"
status: "Draft"
version: "0.1"
audience: ["product", "executive"]
difficulty: "beginner"
reading_time: 10
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Product Management"
reviewer: "Architect"
approver: "Product Director"
lifecycle_status: "Draft"
---

# Feature Matrix (BIZ-PROD-03)

## Booking Feature

| # | Feature ID | Feature Name | Description | Modules | Permissions | Super Admin | Org Admin | Player |
|---|-----------|-------------|-------------|---------|-------------|-------------|-----------|--------|
| 1 | F-BOOK-001 | Browse Facilities | Browse all organisations and branches with access-type badges (open/restricted/private), ratings, and location info | booking, organisations | `branches.request-access` | ✓ | ✓ | ✓ |
| 2 | F-BOOK-002 | View Resources & Slots | View branch resources/courts with real-time slot availability for a selected date | booking, resources, scheduling | `bookings.view` | ✓ | ✓ | ✓ |
| 3 | F-BOOK-003 | Create Booking | Select date, time, resource, payment method; submit booking with optional participants | booking, payment, wallet | `bookings.create`, `bookings.create.date`, `bookings.create.start-time`, `bookings.create.end-time`, `bookings.create.notes` | ✓ | ✓ | ✓ |
| 4 | F-BOOK-004 | Matchmaking Booking | Create a public match booking with target player criteria (age, gender, level), deadline, and auto-apply | booking, match | `bookings.create`, `bookings.matchmaking` | ✓ | ✓ | ✓ |
| 5 | F-BOOK-005 | Private Booking | Create a private booking (invite-only) with optional participant phones | booking | `bookings.create` | ✓ | ✓ | ✓ |
| 6 | F-BOOK-006 | Cancel Booking | Cancel a booking with required reason; triggers refund/cancellation fee calculation | booking, financial | `bookings.cancel` | ✓ | ✓ | ✓ |
| 7 | F-BOOK-007 | Check In | Check in to a confirmed booking at the facility | booking | `bookings.check-in` | ✓ | ✓ | ✓ |
| 8 | F-BOOK-008 | View My Bookings | List user's bookings with status filters, date/nearest sorting, pagination | booking | `bookings.view` | ✓ | ✓ | ✓ |
| 9 | F-BOOK-009 | Booking Detail | View single booking details including QR code for check-in | booking | `bookings.view` | ✓ | ✓ | ✓ |
| 10 | F-BOOK-010 | Booking Confirmation | Post-booking confirmation page with QR code, polling for pending payment status | booking | — | ✓ | ✓ | ✓ |
| 11 | F-BOOK-011 | Match Discovery | Browse public matches with discover/applied/joined/dismissed/history tabs, date filter, distance sort | booking, match | `matches.view`, `matches.apply` | ✓ | ✓ | ✓ |
| 12 | F-BOOK-012 | Match Lobby | View match details, participants, join/withdraw, manage applicants, close/cancel match | booking, match | `matches.view`, `matches.apply`, `matches.cancel` | ✓ | ✓ | ✓ |
| 13 | F-BOOK-013 | Apply to Match | Apply to join a public match (requires approval unless auto-accept) | booking, match | `matches.apply` | ✓ | ✓ | ✓ |
| 14 | F-BOOK-014 | Manage Applicants | Host can view applicants, accept/decline, set matchmaking criteria | booking | `bookings.manage-applicants` | ✓ | ✓ | ✓ |
| 15 | F-BOOK-015 | Start Matchmaking | Initiate matchmaking on an existing booking with player criteria | booking, match | `bookings.matchmaking` | ✓ | ✓ | ✓ |
| 16 | F-BOOK-016 | Org Booking Management | Organisation-scoped booking list with date/status filters for staff | org, booking | `org.bookings.manage`, `org.bookings.update-status` | ✓ | ✓ | — |
| 17 | F-BOOK-017 | Admin Booking Management | View all bookings across orgs with advanced filters (org, branch, resource, status, payment, date) | admin, booking | `admin.bookings.view`, `admin.bookings.update-status` | ✓ | — | — |
| 18 | F-BOOK-018 | Slot Preparation (Prepare) | Hold a slot with Redis lock while payment gateway processes (10-min TTL) | booking, payment, redis | `bookings.create` | ✓ | ✓ | ✓ |
| 19 | F-BOOK-019 | Automatic Expiry | Background worker expires `pending_payment` bookings past their `expires_at` | booking, infrastructure | — | auto | auto | auto |
| 20 | F-BOOK-020 | Automatic Completion | Background worker completes `confirmed` bookings past their start time | booking, infrastructure | — | auto | auto | auto |

**Evidence:** Routes in `booking.routes.ts:8-28`, registry in `frontend/src/permissions/registry.ts:190-206`, frontend pages in `frontend/src/pages/booking/`.

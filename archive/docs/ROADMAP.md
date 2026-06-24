# CourtZon-V2 Product Roadmap

> Last updated: May 17, 2026
> This is our master checklist — we stick with this until everything is done.

---

## Priority Legend
- 🔴 **P0** — Launch blocker (must do first)
- 🟡 **P1** — Core experience (high value)
- 🔵 **P2** — Enhancement (important but can wait)
- ⚪ **P3** — Future (nice to have)

---

## 🏗️ PLATFORM INFRASTRUCTURE

| Pri | Status | Task |
|-----|--------|------|
| 🔴 | ✅ DONE | P0: Fix stub pages — AcademyListPage, OrganisationTypesPage, TranslationsPage (enhanced with loading states) |
| 🔴 | ✅ DONE | P0: Fix duplicate route /admin/permissions pointing to RoleListPage (no duplicate found — routes are distinct: Roles CRUD vs Permission definitions CRUD) |
| 🔴 | ✅ DONE | P0: Implement email sending for password reset (queues send_email job via BullMQ; token returned only in dev mode) |
| 🔴 | ✅ DONE | P0: Fix AdminDashboard placeholder values (verified — backend returns real SQL aggregation queries; frontend uses proper fallbacks) |
| 🟡 | PENDING | P1: Socket.IO real-time notifications |
| 🟡 | PENDING | P1: Notification delivery engine — push, email, SMS |
| 🟡 | PENDING | P1: Analytics charts on admin dashboard (install chart library) |
| 🟡 | PENDING | P1: i18n coverage for all frontend pages (admin i18n manager built ✅) |
| 🟡 | PENDING | P1: Rate limiting + pagination standardization across all APIs |
| 🔵 | PENDING | P2: Email verification flow |
| 🔵 | PENDING | P2: PWA support — manifest, service worker, offline fallback |
| 🔵 | PENDING | P2: QR code check-in for venue bookings |
| 🔵 | PENDING | P2: Ads/CMS admin management UIs |
| 🔵 | PENDING | P2: Job queues + domain events |
| ⚪ | PENDING | P3: Community tournaments / social feed frontend |
| ⚪ | PENDING | P3: CI/CD pipeline (GitHub Actions) |
| ⚪ | PENDING | P3: Multi-tenancy + performance scaling |
| ⚪ | PENDING | P3: Production secrets management |

---

## 👤 PLAYER MODULE

| Pri | Status | Screen | CRUD |
|-----|--------|--------|------|
| ✅ | DONE | Home Dashboard | — |
| ✅ | DONE | Browse Branches | R |
| ✅ | DONE | Resource List (per branch) | R |
| ✅ | DONE | Booking Form | C, R |
| ✅ | DONE | My Bookings | R, D |
| ✅ | DONE | Booking Confirmation | R |
| ✅ | DONE | Marketplace Home | R |
| ✅ | DONE | Product Detail | R |
| ✅ | DONE | Cart | C, R, U, D |
| ✅ | DONE | My Orders | R |
| ✅ | DONE | Order Detail | R |
| ✅ | DONE | Seller Dashboard | R, U |
| 🟡 | PENDING | P1: Venue/Court Detail — photos, amenities, reviews, availability calendar, dynamic pricing | R |
| 🟡 | PENDING | P1: Booking Detail (+ QR) — QR code, countdown, manage (reschedule/cancel) | R, U |
| 🟡 | PENDING | P1: Check-in Screen — QR scanner / confirmation code for venue staff | U |
| 🟡 | PENDING | P1: Seller Profile/Store — seller's catalog, ratings, policies | R |
| 🟡 | PENDING | P1: Wallet — balance, top-up, transaction history, withdraw | R, C |
| 🔵 | PENDING | P2: Payment Methods — saved cards, Paymob integration | C, R, D |
| 🔵 | PENDING | P2: Tournament Browse — list, filters, register | R |
| 🔵 | PENDING | P2: Tournament Detail — brackets, schedule, teams | R, C |
| 🔵 | PENDING | P2: My Tournaments — registered, progress | R |
| 🔵 | PENDING | P2: Academy Browse — programs, filters | R |
| 🔵 | PENDING | P2: Academy Enrollment — view programs, enroll, track | R, C |
| 🔵 | PENDING | P2: Coach Booking — availability, session types, recurring | R, C |
| 🔵 | PENDING | P2: My Coach Sessions — upcoming/past | R, D |
| 🔵 | PENDING | P2: Notifications page — list, mark read, preferences | R, U |
| 🔵 | PENDING | P2: Social Feed — announcements, posts, likes, comments | R, C |
| 🔵 | PENDING | P2: Friends — add, remove, see activity | C, R, D |
| 🔵 | PENDING | P2: Messages/Chat — conversations with venues, coaches, support | C, R, D |
| ⚪ | PENDING | P3: Reviews & Ratings — write, edit, delete | C, R, U, D |
| ⚪ | PENDING | P3: Favorites — saved venues, courts | C, R, D |
| ⚪ | PENDING | P3: Help Center / Support — FAQ, ticket system | R, C |
| ⚪ | PENDING | P3: Personal Reports — spending summary, activity history | R |
| ⚪ | PENDING | P3: Referral Program — invite, rewards | R, C |

---

## 🛡️ ADMIN / MODERATOR MODULE

| Pri | Status | Screen | CRUD |
|-----|--------|--------|------|
| ✅ | DONE | Organisation Management | R, U |
| ✅ | DONE | Branch Management | C, R, U, D |
| ✅ | DONE | Resource/Court Management | C, R, U, D |
| ✅ | DONE | Booking List | R |
| ✅ | DONE | Role Assignment (staff) | R, U |
| ✅ | DONE | User List | R |
| 🟡 | PENDING | P1: Admin Dashboard — org stats, today's bookings, revenue, alerts | R |
| 🟡 | PENDING | P1: Schedule Management — hours, holidays, maintenance | C, R, U, D |
| 🟡 | PENDING | P1: Check-in Scanner — QR → mark arrived | U |
| 🟡 | PENDING | P1: Staff Management — add staff, limited permissions | C, R, U, D |
| 🟡 | PENDING | P1: Pricing Management — rates by time/day/sport | C, R, U, D |
| 🔵 | PENDING | P2: Coach Management — approve, agreements, sessions | C, R, U, D |
| 🔵 | PENDING | P2: Academy Management — programs, schedules, enrollments | C, R, U, D |
| 🔵 | PENDING | P2: Product Management — marketplace products | C, R, U, D |
| 🔵 | PENDING | P2: Order Management — process marketplace orders | R, U |
| 🔵 | PENDING | P2: Financial Dashboard — revenue, payout reports | R |
| 🔵 | PENDING | P2: Tournament Management — create/manage | C, R, U, D |
| 🔵 | PENDING | P2: Notification Broadcast — send to venue players | C |
| 🔵 | PENDING | P2: Review Moderation — approve/delete | R, D |
| 🔵 | PENDING | P2: Coupon Management — venue discount codes | C, R, U, D |
| ⚪ | PENDING | P3: Reports & Analytics — trends, popular times | R |
| ⚪ | PENDING | P3: Subscription View — plan, usage | R |

---

## 👑 SUPER ADMIN MODULE

| Pri | Status | Screen | CRUD |
|-----|--------|--------|------|
| ✅ | DONE | Users (all) | R, U |
| ✅ | DONE | Organisations | C, R, U |
| ✅ | DONE | Roles & Permissions | C, R, U, D |
| ✅ | DONE | Subscription Plans | C, R, U, D |
| ✅ | DONE | Settings (global) | R, U |
| ✅ | DONE | Translations | R, U |
| ✅ | DONE | Audit Logs | R |
| ✅ | DONE | Settlements | R, U |
| 🟡 | PENDING | P1: System Dashboard — global stats, health, revenue | R |
| 🟡 | PENDING | P1: Organisation Management — approve/suspend | C, R, U |
| 🟡 | PENDING | P1: Subscription Planner — full CRUD tiers | C, R, U, D |
| 🟡 | PENDING | P1: Audit Log Viewer — searchable, exportable | R |
| 🟡 | PENDING | P1: Role Builder — visual role/permission editor | C, R, U, D |
| 🟡 | PENDING | P1: Feature Flags — toggle per environment | R, U |
| 🟡 | ✅ DONE | P1: i18n Manager — admin UI for translations | C, R, U, D |
| 🟡 | PENDING | P1: CMS Manager — pages, blogs, banners | C, R, U, D |
| 🟡 | PENDING | P1: Ad Manager — placements, campaigns, reports | C, R, U, D |
| 🟡 | PENDING | P1: Settlement Engine — run cycles, approve | R, U |
| 🔵 | PENDING | P2: Coach Approval Queue | R, U |
| 🔵 | PENDING | P2: Academy Approval Queue | R, U |
| 🔵 | PENDING | P2: Dispute Resolution | R, U |
| 🔵 | PENDING | P2: Commission Rules | C, R, U, D |
| 🔵 | ✅ DONE | P2: Sports Manager | C, R, U, D |
| 🔵 | ✅ DONE | P2: Org Types Manager | C, R, U, D |
| 🔵 | ✅ DONE | P2: Countries / Currencies / Languages | C, R, U, D |
| 🔵 | PENDING | P2: Payment Gateway Config | R, U |
| 🔵 | PENDING | P2: System Health Dashboard | R |
| ⚪ | PENDING | P3: Design Tokens / Theming | R, U |
| ⚪ | PENDING | P3: Backup Manager | C, R |
| ⚪ | PENDING | P3: System Announcements | C, R |
| ⚪ | PENDING | P3: API Keys Manager | C, R, D |
| ⚪ | PENDING | P3: Scheduled Jobs Monitor | R, U |

---

## Stats

- **Total screens:** ~85 (30 Player + 22 Admin + 33 Super Admin)
- **Done:** ~41 (full implementation)
- **Thin/stub:** 0 ✅
- **Remaining:** ~44 new screens + infrastructure items

---
document_id: "TECH-UX-03"
document_name: "Navigation Architecture"
family: "TECH-UX"
document_type: "UX"
status: "Draft"
version: "1.0"
audience: ["developer", "designer"]
difficulty: "intermediate"
reading_time: 12
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Product Director"
lifecycle_status: "Draft"
---

# Navigation Architecture (TECH-UX-03)

## Navigation Hierarchy

Five distinct layouts serve different user types. Each layout provides its own navigation structure.

```
App.tsx Routes
  ├─ LandingLayout    (public marketing pages)
  ├─ AppLayout        (28 consumer routes) → BottomNav (mobile) + Navbar (desktop)
  ├─ AdminLayout      (60+ admin routes)   → AdminSidebar (collapsible, no BottomNav)
  ├─ OrgLayout        (24 org routes)      → OrgSidebar (collapsible, no BottomNav)
  ├─ CoachLayout      (6 coach routes)     → CoachBottomNav (mobile) + no sidebar
  └─ RefereeLayout    (a few referee routes) → No nav chrome
```

**Source:** `frontend/src/App.tsx`

## 1. AppLayout (Consumer)

**Component:** `App.tsx:427-441`

```
<AppLayout>
  <Navbar />           ← sticky top, visible on all screen sizes
  <main>               ← scrollable content area
    <Outlet />
  </main>
  <BottomNav />        ← fixed bottom, md:hidden (mobile only)
</AppLayout>
```

### Bottom Navigation (Mobile)

**Component:** `frontend/src/components/layout/BottomNav.tsx`

**Z-index:** `z-[60]` (above all modals and overlays)

**Core Tabs (always visible):**

| Tab | Icon | Path | Badge |
|-----|------|------|-------|
| Home | 🏠 | `/app` | — |
| Bookings | 📅 | `/bookings` | — |
| Marketplace | 🛒 | `/marketplace` | Cart count |
| More | ⋯ | (opens Modal sheet) | — |
| Profile | 👤 | `/profile` | — |

**Source:** `BottomNav.tsx:33-37,95-103`

**"More" Sheet Items (inside Modal with `variant="sheet"`):**

| Item | Icon | Path | Permission Key |
|------|------|------|----------------|
| Matches | 🎯 | `/matches` | — |
| Coaches | 🏆 | `/coaches` | `coaches.view` |
| Tournaments | 🥇 | `/tournaments` | `tournaments.view` |
| Academies | 🎓 | `/academies` | `academies.view` |
| Messages | 💬 | `/messages` | `community.chat.view` |
| Players | 👥 | `/players` | `player.search` |
| Favorites | ❤️ | `/my/favorites` | `player.favorites.manage` |
| Statistics | 📊 | `/my/statistics` | `player.statistics.view` |
| Achievements | 🏅 | `/my/achievements` | `player.achievements.view` |
| Wallet | 👛 | `/my/wallet` | `player.wallet.view` |
| Payments | 💳 | `/my/payments` | `player.payments.view` |
| Rank History | 📈 | `/my/rank-history` | `player.rank.history` |
| My Tournaments | 🥇 | `/my/tournaments` | `player.tournaments.register` |
| Notifications | 🔔 | `/notifications` | — |
| My Shop | 🏪 | `/marketplace/seller` | (seller-only, `isSeller` check) |

**Source:** `BottomNav.tsx:39-56`

Seller-specific item (`isSeller`) is shown via user property check, not permission key.

### Desktop Navigation

No BottomNav on desktop (`md:hidden`). Standard top Navbar provides:
- Logo
- Browse / Bookings / Marketplace links
- NotificationBell
- User profile dropdown
- Role switcher (if multiple roles)

### AppLayout Routes (28 consumer routes)

| Route | Page Component |
|-------|---------------|
| `/app` | PlayerDashboardPage |
| `/browse` | BrowseBranchesPage |
| `/organisations/:orgId` | OrgStorefrontPage |
| `/branches/:branchId/resources` | BookingResourceListPage |
| `/book/:resourceId` | BookingFormPage |
| `/bookings` | MyBookingsPage |
| `/bookings/:id/confirmation` | BookingConfirmationPage |
| `/matches` | MatchListPage |
| `/matches/:id` | MatchLobbyPage |
| `/marketplace` | MarketplacePage |
| `/marketplace/products/:id` | ProductDetailPage |
| `/marketplace/cart` | CartPage |
| `/marketplace/orders` | OrderListPage |
| `/marketplace/orders/:id` | OrderDetailPage |
| `/marketplace/seller` | SellerDashboardPage |
| `/marketplace/wishlist` | WishlistPage |
| `/tournaments` | TournamentListPage |
| `/tournaments/:id` | TournamentDetailPage |
| `/tournaments/new` | TournamentCreatePage |
| `/academies` | AcademyListPage |
| `/academies/:id` | AcademyDetailPage |
| `/coaches` | CoachDirectoryPage |
| `/coaches/:id` | CoachDetailPage |
| `/coaches/:id/book` | CoachBookingPage |
| `/profile` | ProfilePage |
| `/players` | PlayerSearchPage |
| `/players/:id` | PlayerPublicProfilePage |
| `/my/*` | Player sub-pages (favorites, wallet, etc.) |

**Source:** `App.tsx:511-544+`

## 2. AdminLayout

**Component:** `frontend/src/app/layouts/AdminLayout.tsx` (lazy loaded)

### AdminSidebar

**Component:** `frontend/src/components/layout/AdminSidebar.tsx`

**Structure:** Collapsible sidebar (`w-64` expanded, `w-16` collapsed) with:
- SiteLogo at top
- Navigation items organized in collapsible sections
- Profile, dark mode toggle, logout at bottom
- No BottomNav

**Z-index:** Standard sidebar (sticky, no z-index needed below content area)

### Admin Nav Items (25+ items, permission-gated)

**Source:** `AdminSidebar.tsx:22-217`

| Section / Item | Path | Permission Key |
|---------------|------|----------------|
| **Dashboard** | `/admin` | `sidebar.dashboard` |
| **Reports** | `/admin/reports` | `sidebar.reports` |
| **Organisations** | `/admin/organisations` | `sidebar.organisations` |
| ├ Branch Access | `/admin/branch-access` | `sidebar.branch-access` |
| ├ All Bookings | `/admin/bookings` | `sidebar.admin-bookings` |
| ├ Subscription Plans | `/admin/subscription` | `sidebar.subscription` |
| ├ Subscription Requests | `/admin/subscription/requests` | `sidebar.subscription-requests` |
| ├ Organisation Types | `/admin/organisation-types` | `sidebar.organisation-types` |
| └ Settlements | `/admin/settlements` | `sidebar.settlements` |
| **Roles & Permissions** | `/admin/roles` | `sidebar.roles` |
| ├ Roles | `/admin/roles` | `sidebar.roles` |
| └ Permissions | `/admin/permissions` | `sidebar.permissions` |
| **Marketplace** | `/admin/product-categories` | `sidebar.marketplace` |
| ├ Products | `/admin/marketplace/products` | `sidebar.marketplace-products` |
| ├ Orders | `/admin/marketplace/orders` | `sidebar.marketplace-orders` |
| ├ Sellers | `/admin/marketplace/sellers` | `sidebar.marketplace-sellers` |
| ├ Product Categories | `/admin/product-categories` | `sidebar.product-categories` |
| ├ Registrations | `/admin/approvals` | `sidebar.marketplace-approvals` |
| ├ Reviews | `/admin/marketplace/reviews` | `sidebar.marketplace-reviews` |
| ├ Brands | `/admin/brands` | `sidebar.brands` |
| └ Tags | `/admin/tags` | `sidebar.tags` |
| **BI** | `/admin/bi/dashboard` | `sidebar.bi` |
| ├ Dashboard | `/admin/bi/dashboard` | `sidebar.bi-dashboard` |
| └ Observability | `/admin/bi/observability` | `sidebar.bi-observability` |
| **Sports Engine** | `/admin/sports-engine` | `sidebar.sports-engine` |
| **Reception** | `/admin/reception` | `sidebar.reception` |
| **League** | `/admin/league/dashboard` | `sidebar.league` |
| ├ Dashboard | `/admin/league/dashboard` | `sidebar.league-dashboard` |
| ├ Seasons | `/admin/league/seasons` | `sidebar.league-seasons` |
| ├ Leagues | `/admin/league/list` | `sidebar.league-list` |
| └ Divisions | `/admin/league/divisions` | `sidebar.league-divisions` |
| **Tournament** | `/admin/tournament/dashboard` | `sidebar.tournament` |
| ├ Dashboard | `/admin/tournament/dashboard` | `sidebar.tournament-dashboard` |
| ├ Tournaments | `/admin/tournament/list` | `sidebar.tournament-list` |
| └ Matches | `/admin/tournament/matches` | `sidebar.tournament-matches` |
| **Academy** | `/admin/academy/dashboard` | `sidebar.academy` |
| ├ Dashboard | `/admin/academy/dashboard` | `sidebar.academy-dashboard` |
| ├ Programs | `/admin/academy/programs` | `sidebar.academy-programs` |
| ├ Groups | `/admin/academy/groups` | `sidebar.academy-groups` |
| ├ Enrollments | `/admin/academy/enrollments` | `sidebar.academy-enrollments` |
| └ Attendance | `/admin/academy/attendance` | `sidebar.academy-attendance` |
| **Coaches** | `/admin/coaches` | `sidebar.coaches-admin` |
| **Membership** | `/admin/membership/plans` | `sidebar.membership` |
| ├ Plans | `/admin/membership/plans` | `membership.plans` |
| ├ Campaigns | `/admin/membership/campaigns` | `membership.campaigns` |
| └ Rewards | `/admin/membership/rewards` | `membership.rewards` |
| **Pricing** | `/admin/pricing/rules` | `sidebar.pricing` |
| ├ Rules | `/admin/pricing/rules` | `pricing.rules` |
| └ Price Preview | `/admin/pricing/preview` | `pricing.preview` |
| **CRM** | `/admin/crm/dashboard` | `sidebar.crm` |
| ├ Dashboard | `/admin/crm/dashboard` | `sidebar.crm-dashboard` |
| ├ Customers | `/admin/crm/customers` | `sidebar.crm-customers` |
| ├ Segments | `/admin/crm/segments` | `sidebar.crm-segments` |
| ├ Leads | `/admin/crm/leads` | `sidebar.crm-leads` |
| ├ Campaigns | `/admin/crm/campaigns` | `sidebar.crm-campaigns` |
| └ Communications | `/admin/crm/communications` | `sidebar.crm-communications` |
| **HR** | `/admin/hr/dashboard` | `sidebar.hr` |
| ├ Dashboard | `/admin/hr/dashboard` | `sidebar.hr-dashboard` |
| ├ Employees | `/admin/hr/employees` | `sidebar.hr-employees` |
| ├ Departments | `/admin/hr/departments` | `sidebar.hr-departments` |
| ├ Leave | `/admin/hr/leave` | `sidebar.hr-leave` |
| ├ Attendance | `/admin/hr/attendance` | `sidebar.hr-attendance` |
| └ Payroll | `/admin/hr/payroll` | `sidebar.hr-payroll` |
| **Community Events** | `/admin/community-events` | `sidebar.community-admin` |
| **Notifications** | `/admin/notifications/broadcast` | `sidebar.notifications` |
| ├ Broadcast | `/admin/notifications/broadcast` | `notifications.broadcast` |
| ├ Analytics | `/admin/notifications/analytics` | `notifications.analytics` |
| ├ Dead Letters | `/admin/notifications/dead-letters` | `notifications.dead-letters` |
| ├ Templates | `/admin/templates` | `notification_templates.view` |
| └ Types | `/admin/notification-types` | `notification_types.view` |
| **Ads** | `/admin/ads` | `sidebar.ads` |
| **Admin Settings** | `/admin/sports` | `sidebar.admin-settings` |
| ├ Sports | `/admin/sports` | `sidebar.sports` |
| ├ **Finance** | `/admin/finance` | `sidebar.finance` |
| │ ├ Dashboard | `/admin/finance` | `sidebar.finance-dashboard` |
| │ ├ Ledger | `/admin/finance/ledger` | `sidebar.finance-ledger` |
| │ ├ Reports | `/admin/finance/reports` | `sidebar.finance-reports` |
| │ ├ Withdrawal Requests | `/admin/withdrawal-requests` | `sidebar.withdrawal-requests` |
| │ ├ Coupons | `/admin/coupons` | `sidebar.coupons` |
| │ ├ Finance (Legacy) | `/admin/financial-ops` | `sidebar.finance-transactions` |
| │ ├ Banks | `/admin/banks` | `sidebar.banks` |
| │ └ Bank Branches | `/admin/bank-branches` | `sidebar.bank-branches` |
| ├ **Payments Config** | `/admin/payment-methods` | `sidebar.payment-methods` |
| │ ├ Payment Methods | `/admin/payment-methods` | `sidebar.payment-methods` |
| │ └ Gateway Config | `/admin/payment-gateways` | `sidebar.payment-gateways` |
| ├ **Localization** | `/admin/countries` | `sidebar.countries` |
| │ ├ Countries | `/admin/countries` | `sidebar.countries` |
| │ ├ Currencies | `/admin/currencies` | `sidebar.currencies` |
| │ ├ Languages | `/admin/languages` | `sidebar.languages` |
| │ └ Translations | `/admin/translations` | `sidebar.translations` |
| ├ Amenities | `/admin/amenities` | `sidebar.amenities` |
| └ **App Settings** | `/admin/sidebar-layout` | `sidebar.app-settings-menu` |
|  ├ Sidebar Layout | `/admin/sidebar-layout` | `sidebar.layout.manage` |
|  ├ Branding | `/admin/app-settings` | `sidebar.app-settings` |
|  ├ Appearance Studio | `/admin/design-tokens` | `sidebar.design-tokens` |
|  └ CMS | `/admin/cms` | `sidebar.cms` |
| **Users** | `/admin/users` | `sidebar.users` |
| **Inventory** | `/admin/inventory/stock` | `sidebar.inventory` |
| ├ Stock Levels | `/admin/inventory/stock` | `sidebar.inventory-stock` |
| ├ Warehouses | `/admin/inventory/warehouses` | `sidebar.inventory-warehouses` |
| ├ Suppliers | `/admin/inventory/suppliers` | `sidebar.inventory-suppliers` |
| └ Purchase Orders | `/admin/inventory/purchase-orders` | `sidebar.inventory-purchase-orders` |
| **Mobile** | `/admin/mobile/dashboard` | `sidebar.mobile` |
| **Integration** | `/admin/integration/api-keys` | `sidebar.integration` |
| **Webhooks** | `/admin/webhooks` | `sidebar.webhooks` |
| **Security** | `/admin/security` | `sidebar.security-dashboard` |
| ├ Security Dashboard | `/admin/security` | `sidebar.security-dashboard` |
| ├ Active Sessions | `/admin/security/sessions` | `sidebar.active-sessions` |
| ├ Failed Logins | `/admin/security/failed-logins` | `sidebar.failed-logins` |
| ├ Upload Security | `/admin/security/uploads` | `sidebar.upload-security` |
| ├ System Health | `/admin/security/system-health` | `sidebar.system-health` |
| ├ System Admin | `/admin/system` | `system_settings.view` |
| ├ Membership | `/admin/membership` | `membership.view` |
| ├ Audit Log | `/admin/audit-logs` | `sidebar.audit` |
| ├ Feature Flags | `/admin/feature-flags` | `sidebar.feature-flags` |
| ├ Support Tickets | `/admin/support/tickets` | `support.tickets.view` |
| └ Queue Management | `/admin/queues` | `queue.view` |

**Sidebar Layout Persistence:** Admin can reorder sidebar items via `/admin/sidebar-layout`. Saved layout stored server-side and applied on page load.

**Source:** `AdminSidebar.tsx:21-248`

## 3. OrgLayout

**Component:** `frontend/src/app/layouts/OrgLayout.tsx` (lazy loaded)

### OrgSidebar

**Component:** `frontend/src/components/layout/OrgSidebar.tsx`

**24 Nav Items:**

| Item | Path | Permission Key |
|------|------|----------------|
| Dashboard | `/org/:orgId/dashboard` | `org.sidebar.dashboard` |
| Products | `/org/:orgId/marketplace` | `org.sidebar.marketplace` |
| Orders | `/org/:orgId/orders` | `org.sidebar.orders` |
| Bookings | `/org/:orgId/bookings` | `org.sidebar.bookings` |
| Staff | `/org/:orgId/staff` | `org.sidebar.staff` |
| Members | `/org/:orgId/members` | `org.sidebar.members` |
| Coaches | `/org/:orgId/coaches` | `org.sidebar.coaches` |
| Finance | `/org/:orgId/finance` | `org.sidebar.finance` |
| Announcements | `/org/:orgId/announcements` | `org.sidebar.announcements` |
| Documents | `/org/:orgId/documents` | `org.sidebar.documents` |
| Gallery | `/org/:orgId/gallery` | `org.sidebar.gallery` |
| Profile | `/org/:orgId/profile` | `org.sidebar.profile` |
| Branches | `/org/:orgId/branches` | `org.sidebar.branches` |
| Working Hours | `/org/:orgId/working-hours` | `org.sidebar.working-hours` |
| Payment Settings | `/org/:orgId/payment-settings` | `org.sidebar.payment` |
| Reviews | `/org/:orgId/reviews` | `org.sidebar.reviews` |
| Referees | `/org/:orgId/referees` | `org.sidebar.referees` |
| Academies | `/org/:orgId/academies` | `org.sidebar.academies` |
| Leagues | `/org/:orgId/leagues` | `org.sidebar.leagues` |
| Tournaments | `/org/:orgId/tournaments` | `org.sidebar.tournaments` |
| Verification | `/org/:orgId/verification` | `org.sidebar.verification` |
| Subscription | `/org/:orgId/subscription` | `org.sidebar.subscription` |
| Settings | `/org/:orgId/settings` | `org.sidebar.settings` |

**Source:** `OrgSidebar.tsx:24-50`

All items filtered by `org.sidebar.*` permission keys. Layout is collapsible (similar to AdminSidebar). No BottomNav.

## 4. CoachLayout

**Component:** `frontend/src/components/layout/CoachLayout.tsx`

```
<CoachLayout>
  <OfflineBanner />
  <main>
    <Outlet />
  </main>
  <CoachBottomNav />   ← fixed bottom, md:hidden
</CoachLayout>
```

### CoachBottomNav

**Component:** `frontend/src/components/layout/CoachBottomNav.tsx`

**6 Items (first 4 in bottom bar, all in nav data):**

| Item | Icon | Path | Permission |
|------|------|------|-----------|
| Dashboard | 🏠 | `/coach/dashboard` | — |
| Sessions | 📋 | `/coach/sessions` | — |
| Requests | 📥 | `/coach/requests` | — |
| Players | 👥 | `/coach/players` | — |
| Availability | ⏰ | `/coach/availability` | — |
| Profile | 👤 | `/coach/profile` | — |

**Source:** `CoachBottomNav.tsx` / `coach-nav.ts:8-15`

The main tabs are `COACH_NAV.slice(0, 4)` — Dashboard, Sessions, Requests, Players. The remaining items are accessible through other navigation (not "More" — coach nav is simpler than consumer).

## 5. RefereeLayout

**Component:** `frontend/src/components/layout/RefereeLayout.tsx`

```
<RefereeLayout>
  <OfflineBanner />
  <main>
    <Outlet />
  </main>
</RefereeLayout>
```

No BottomNav. No sidebar. Minimal chrome for referee-specific pages.

## Breadcrumbs and Back Navigation

### Back Navigation (Consumer)

- `/browse` → `/branches/:branchId/resources` → `/book/:resourceId` → `/bookings/:id/confirmation`
- Each page provides back buttons in the UI (not automatic breadcrumb)
- Mobile: standard browser back or in-app back button in Navbar

### No Global Breadcrumb Component

There is no shared breadcrumb component. Navigation is handled by:
- `<Link>` elements in page content
- Browser back button
- In-app back button in Navbar (when applicable)
- BottomNav tabs for top-level navigation

## Deep Links

Consumer routes are designed for deep linking:
- `/browse` — public facility listing
- `/branches/:branchId/resources` — specific branch resources
- `/book/:resourceId?date=...&startTime=...&endTime=...` — pre-filled booking form
- `/marketplace/products/:id` — direct product detail
- `/tournaments/:id` — tournament detail
- `/coaches/:id` — coach profile

Admin and org routes are not designed for external deep linking (require authentication + authorization).

## Source

- `frontend/src/App.tsx` — route definitions and layout wrapping
- `frontend/src/components/layout/BottomNav.tsx` — consumer bottom nav
- `frontend/src/components/layout/AdminSidebar.tsx` — admin sidebar
- `frontend/src/components/layout/OrgSidebar.tsx` — org sidebar
- `frontend/src/components/layout/CoachLayout.tsx` — coach layout
- `frontend/src/components/layout/CoachBottomNav.tsx` — coach bottom nav
- `frontend/src/components/layout/RefereeLayout.tsx` — referee layout
- `frontend/src/pages/coaches/coach-nav.ts` — coach nav item definitions

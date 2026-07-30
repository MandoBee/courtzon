---
document_id: "TECH-UX-04"
document_name: "Screen Flows"
family: "TECH-UX"
document_type: "UX"
status: "Draft"
version: "0.1"
audience: ["developer", "designer", "qa"]
difficulty: "beginner"
reading_time: 15
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Product Director"
lifecycle_status: "Draft"
---

# Screen Flows (TECH-UX-04)

## Booking Screen Flows

### 1. Browse Branches → Resource List → Booking Form → Confirmation

#### BrowseBranchesPage (`/browse`)

| Property | Value |
|----------|-------|
| **Component** | `pages/booking/BrowseBranchesPage.tsx` |
| **Purpose** | List all organisations and their branches with access-type badges (open/restricted/private), ratings, and city |
| **Navigation Source** | Navbar "Browse" link, BottomNav "Home" tab |
| **Navigation Destination** | Click a branch card → `/branches/:branchId/resources` |
| **APIs Used** | `GET /organisations`, `GET /organisations/:id/branches` |
| **Permissions** | None required (public listing) |
| **Empty State** | "No facilities available yet" — centered muted text |
| **Loading State** | No explicit skeleton; renders cards as data arrives via Promise.all |
| **Error State** | Not handled explicitly — React Query retries by default |

**Source:** `frontend/src/pages/booking/BrowseBranchesPage.tsx:7-87`

#### ResourceListPage (`/branches/:branchId/resources`)

| Property | Value |
|----------|-------|
| **Component** | `pages/booking/ResourceListPage.tsx` |
| **Purpose** | Display branch details and list resources/courts with per-date slot availability grid |
| **Navigation Source** | Click branch card on BrowseBranchesPage |
| **Navigation Destination** | Click a time slot → `/book/:resourceId?date=...&startTime=...&endTime=...` |
| **APIs Used** | `GET /branches/:branchId`, `GET /branches/:branchId/resources`, `GET /resources/:resourceId/slots?date=` |
| **Permissions** | None required |
| **Empty State** | "No resources available at this branch" — centered muted text |
| **Loading State** | Slot section shows "Loading slots..." with animate-pulse |
| **Error State** | Not handled explicitly |

**Source:** `frontend/src/pages/booking/ResourceListPage.tsx:45-118`

#### BookingFormPage (`/book/:resourceId`)

| Property | Value |
|----------|-------|
| **Component** | `pages/booking/BookingFormPage.tsx` |
| **Purpose** | Create a booking — select date, time slot, payment method, notes |
| **Navigation Source** | Click a time slot on ResourceListPage, or "New Booking" button on MyBookingsPage |
| **Navigation Destination** | On success → `/bookings/:id/confirmation` |
| **APIs Used** | `GET /resources/:resourceId`, `GET /resources/:resourceId/slots?date=`, `POST /bookings` |
| **Permissions** | `bookings.create`, `bookings.create.date` (field), `bookings.create.start-time` (field), `bookings.create.notes` (field) |
| **Empty State** | "No slots available" when no free slots for selected date |
| **Loading State** | Resources load via React Query; slot buttons render when data arrives |
| **Error State** | Inline error message: `{(bookingMutation.error as any)?.response?.data?.message || 'Booking failed'}` plus error toast |

**Source:** `frontend/src/pages/booking/BookingFormPage.tsx:22-190`

#### BookingConfirmationPage (`/bookings/:id/confirmation`)

| Property | Value |
|----------|-------|
| **Component** | `pages/booking/BookingConfirmationPage.tsx` |
| **Purpose** | Show booking confirmation with QR code (generated client-side via `qrcode`). Polls booking status every 3s while `pending` |
| **Navigation Source** | BookingFormPage on successful creation |
| **Navigation Destination** | "View My Bookings" → `/bookings`, "Book Another" → `/browse` |
| **APIs Used** | `GET /bookings/:id` (with 3s polling while pending) |
| **Permissions** | None required (but backend enforces owner-only on `GET /bookings/:id`) |
| **Empty State** | N/A (always has booking data from API) |
| **Loading State** | React Query loads booking data |
| **Error State** | Not handled explicitly; navigates back if booking not found via redirect |

**Source:** `frontend/src/pages/booking/BookingConfirmationPage.tsx:8-119`

---

### 2. MyBookingsPage → Booking Detail

#### MyBookingsPage (`/bookings`)

| Property | Value |
|----------|-------|
| **Component** | `pages/booking/MyBookingsPage.tsx` |
| **Purpose** | List user's bookings with status filter tabs, date/nearest sorting, pagination. Includes cancel flow inline and "Manage" button for public matches |
| **Navigation Source** | Navbar "Bookings" link, BottomNav "Bookings" tab |
| **Navigation Destination** | "Manage" button → ManageApplicantsPopup; QR link → `/bookings/:id/confirmation` |
| **APIs Used** | `GET /bookings?status=&page=&limit=&sortBy=`, `POST /bookings/:id/cancel` |
| **Permissions** | `bookings.view`, `bookings.cancel` (cancel button) |
| **Empty State** | "No bookings yet" (via `t('booking.empty')`) — centered muted text |
| **Loading State** | `<Skeleton width={200} height={28} />` + `<SkeletonList count={5} itemHeight={72} />` |
| **Error State** | Not handled explicitly |

**Source:** `frontend/src/pages/booking/MyBookingsPage.tsx:14-291`

---

### 3. MatchListPage → MatchLobbyPage

#### MatchListPage (`/matches`)

| Property | Value |
|----------|-------|
| **Component** | `pages/booking/MatchListPage.tsx` |
| **Purpose** | Public match discovery with tabs: Discover, Applied, Joined, Dismissed, History. Date filter and nearest/distance sort. Real-time updates via socket.io |
| **Navigation Source** | Navbar "Matches" link, BottomNav "More" → Matches |
| **Navigation Destination** | "View" button on joined matches → `/matches/:id` |
| **APIs Used** | `GET /matches?lat=&lng=&date=`, `POST /matches/:id/join`, `POST /matches/:id/withdraw` |
| **Permissions** | `matches.view`, `matches.apply` |
| **Empty State** | "No matches in this tab" — centered muted text |
| **Loading State** | "Loading matches..." — muted text |
| **Error State** | Toast notifications on join/withdraw errors via `showToast` |

**Source:** `frontend/src/pages/booking/MatchListPage.tsx:69-278`

#### MatchLobbyPage (`/matches/:id`)

| Property | Value |
|----------|-------|
| **Component** | `pages/booking/MatchLobbyPage.tsx` |
| **Purpose** | Match detail view — shows sport, venue, date/time, participants, status badge. Host can manage applicants, close applications, cancel match. Real-time updates via socket.io |
| **Navigation Source** | Click "View" on joined match in MatchListPage |
| **Navigation Destination** | Cancel → navigates back to `/matches` |
| **APIs Used** | `GET /matches/:id`, `POST /matches/:id/join`, `POST /matches/:id/withdraw`, `POST /matches/:id/close`, `POST /matches/:id/cancel` |
| **Permissions** | `matches.view`, `matches.apply` |
| **Empty State** | "No participants yet. Be the first to join!" when participant list empty |
| **Loading State** | "Loading..." — muted text while query loads |
| **Error State** | "Match not found" if query returns null; Toast errors on action mutations |

**Source:** `frontend/src/pages/booking/MatchLobbyPage.tsx:12-196`

---

**Evidence:** Routes in `frontend/src/App.tsx:517-520` (`/bookings`, `/bookings/:id/confirmation`, `/matches`, `/matches/:id`). Page components in `frontend/src/pages/booking/`.

---

## Payment Screen Flows

### 1. WalletPage (`/my/wallet`)

| Property | Value |
|----------|-------|
| **Component** | `pages/player/WalletPage.tsx` (270 lines) |
| **Purpose** | View wallet balance, deposit funds via payment gateway, view transaction history |
| **Navigation Source** | BottomNav "More" → Wallet, Profile page, Dashboard "Wallet Balance" card |
| **Navigation Destination** | Deposit opens iframe overlay for card payment; no page navigation on success |
| **APIs Used** | `GET /wallets/me`, `GET /public/payment-methods?context=wallet`, `POST /wallets/deposit`, `GET /wallets/transactions` |
| **Permissions** | `player.wallet.view` (page), `financial.wallet.deposit` (deposit form), `financial.wallet.deposit.payment-method` (payment method selector), `player.wallet.transactions` (history section) |
| **Empty State** | "No transactions yet." for empty history; "No payment methods available." if no methods returned |
| **Loading State** | "Loading..." text for wallet balance, payment methods, and transaction history; spinner overlay on iframe |
| **Error State** | Inline error message "Deposit failed. Please try again." on mutation error; error toast via `showToast` on failure; validation errors on amount/payment method form fields; `showToast(message, 'error')` on API error |

**States:**
- **Wallet auto-creation:** If no wallet exists for the user, `GET /wallets/me` auto-creates one with balance 0 and currency from user's country (`wallet.service.ts:16-39`)
- **Deposit success:** Balance card updates, transaction list refreshes, form resets, success toast shown
- **Gateway redirect:** Paymob iframe overlay (`z-[70]`, `fixed inset-0`, `bg-black/60`) with loading spinner until iframe loads
- **Card payment iframe:** Fixed modal with close button, `max-w-md`, max 90vh, spinner + "Loading secure payment form..."

**Source:** `frontend/src/pages/player/WalletPage.tsx:42-270` (also `pages/profile/WalletPage.tsx:41-264`), `frontend/src/App.tsx:549` (route `/my/wallet`).

---

### 2. PaymentsPage (`/my/payments`)

| Property | Value |
|----------|-------|
| **Component** | `pages/player/PaymentsPage.tsx` (115 lines) |
| **Purpose** | List user's payment transactions with status filter tabs, expandable detail rows, pagination |
| **Navigation Source** | BottomNav "More" → Payments, Profile page |
| **Navigation Destination** | None (inline detail expansion) |
| **APIs Used** | `GET /payments/transactions?page=&limit=&status=` |
| **Permissions** | `player.payments.view` (page) |
| **Empty State** | "No payments found." — centered muted text |
| **Loading State** | "Loading..." — muted text while query loads |
| **Error State** | Not handled explicitly (React Query retries) |

**Filter tabs:** All, Completed, Pending, Failed — restore page to 1 on tab change.

**Expandable rows:** Click a payment row to toggle detail view with `JSON.stringify(p.details, null, 2)` in a `<pre>` block.

**Source:** `frontend/src/pages/player/PaymentsPage.tsx:11-115`, `frontend/src/App.tsx:550` (route `/my/payments`).

---

### 3. Payment Gateway Iframe

| Property | Value |
|----------|-------|
| **Component** | Inline in `WalletPage.tsx:236-266` / `WalletPage.tsx:231-261` |
| **Purpose** | Secure card payment form hosted by Paymob |
| **Trigger** | `POST /wallets/deposit` returns `paymentUrl` (not immediately paid) |
| **Behaviors** | `fixed inset-0 z-[70]` overlay with iframe; spinner on iframe load; close button destroys overlay |
| **Error State** | Not handled explicitly on iframe failure |

**Source:** `frontend/src/pages/player/WalletPage.tsx:236-266`.

---

**Evidence:** Routes in `frontend/src/App.tsx:549-550` (`/my/wallet`, `/my/payments`). Page components in `frontend/src/pages/player/`. All APIs verified at `backend/src/modules/wallet/presentation/wallet.routes.ts:8-12` and `backend/src/modules/payment/presentation/payment.routes.ts:10-14`.

---

## Organisation Screens (OrgLayout)

All org screens live under `/org/:orgId/*` routes. They share the **OrgLayout** which provides a collapsible sidebar navigation and sits inside AppLayout (no BottomNav). Each page reads `orgId` from the URL params and queries the `/org/:orgId/*` API namespace.

### 1. OrgDashboardPage (`/org/:orgId`)

| Property | Value |
|----------|-------|
| **Component** | `pages/org/OrgDashboardPage.tsx` (185 lines, `frontend/src`) |
| **Purpose** | Dashboard with KPIs (today's bookings, revenue, branches, resources, members), booking trend chart, monthly revenue chart, top 5 resources by bookings, occupancy rate, pending actions (access requests, coach invites) |
| **Navigation Source** | OrgLayout sidebar "Dashboard" |
| **Navigation Destination** | Click pending action links → `/org/:orgId/members`, `/org/:orgId/coaches` |
| **APIs Used** | `GET /org/:orgId/info`, `GET /org/:orgId/dashboard` |
| **Permissions** | None specific (orgAccessGuard on routes) |
| **Empty State** | N/A — always has dashboard data from aggregates |
| **Loading State** | `<SkeletonRow count={4} />` for org info; `animate-pulse` on dashboard data via `SkeletonRow` |
| **Error State** | "Invalid organisation" if orgId missing |

**Source:** `frontend/src/pages/org/OrgDashboardPage.tsx:6-185`, backend at `org-portal.service.ts:328-446`

### 2. OrgStaffPage (`/org/:orgId/staff`)

| Property | Value |
|----------|-------|
| **Component** | `pages/org/OrgStaffPage.tsx` (424 lines) |
| **Purpose** | Staff management: list staff with roles, scopes, and permissions. Add staff (by email + role + branch/resource scope + custom permissions). Edit staff role, scopes, and permissions. Remove staff. Shows plan limit info via UpgradeRequestModal when staff limit reached |
| **Navigation Source** | OrgLayout sidebar "Staff" |
| **APIs Used** | `GET /org/:orgId/staff`, `POST /org/:orgId/staff`, `PUT /org/:orgId/staff/:userId`, `DELETE /org/:orgId/staff/:userId`, `GET /org/:orgId/staff/:userId/permissions`, `PUT /org/:orgId/staff/:userId/permissions`, `GET /org/:orgId/role-templates/:slug/permissions` |
| **Permissions** | `requireOrgManageAccess` (org owner/admin only) |
| **Empty State** | "No staff members added yet." — muted text |
| **Loading State** | Implicit via React Query data being undefined |
| **Error State** | Error toast on mutation failures via `showToast` |

**Source:** `frontend/src/pages/org/OrgStaffPage.tsx:1-424`

### 3. OrgMembersPage (`/org/:orgId/members`)

| Property | Value |
|----------|-------|
| **Component** | `pages/org/OrgMembersPage.tsx` (167 lines) |
| **Purpose** | List members (branch_player_access) with branch and status filters. Approve, reject, or ban member access. Status badges: pending (warning), approved (success), rejected (error), banned (muted) |
| **Navigation Source** | OrgLayout sidebar "Members" |
| **APIs Used** | `GET /org/:orgId/members?status=&branchId=`, `PUT /org/:orgId/members/:branchId/:playerId` |
| **Permissions** | `org.members.manage` for status changes |
| **Empty State** | "No members found matching your filters." — centered muted text |
| **Loading State** | `<div className="animate-pulse h-40 ... rounded-xl" />` |
| **Error State** | Error toast on mutation via `getErrorMessage` |

**Source:** `frontend/src/pages/org/OrgMembersPage.tsx:1-167`

### 4. OrgCoachesPage (`/org/:orgId/coaches`)

| Property | Value |
|----------|-------|
| **Component** | `pages/org/OrgCoachesPage.tsx` (191 lines) |
| **Purpose** | Coach agreements management. List all coaches with status, revenue split, hourly rate. Invite coaches from directory (sets coachSplitPct + orgSplitPct). Respond to coach-initiated agreements (accept/reject). Remove existing agreements |
| **Navigation Source** | OrgLayout sidebar "Coaches" |
| **APIs Used** | `GET /org/:orgId/coaches`, `GET /org/:orgId/coaches/directory`, `POST /org/:orgId/coaches/invite`, `PUT /org/:orgId/coaches/:coachId/respond`, `DELETE /org/:orgId/coaches/:coachId` |
| **Permissions** | `requireOrgManageAccess` (org owner/admin only) |
| **Empty State** | "No coaches associated with this organisation yet." |
| **Loading State** | Implicit via React Query |
| **Error State** | Error toast on mutation failures via `showToast` |

**Source:** `frontend/src/pages/org/OrgCoachesPage.tsx:1-191`

### 5. OrgBranchesPage (`/org/:orgId/branches`)

| Property | Value |
|----------|-------|
| **Component** | `pages/org/OrgBranchesPage.tsx` (96 lines) |
| **Purpose** | Branch listing with expandable details. Each branch shows: name, courts count, assigned sports, active/inactive badge. Expanded view shows address, phone, email, opening/closing times, managers, amenities list |
| **Navigation Source** | OrgLayout sidebar "Branches" |
| **APIs Used** | `GET /org/:orgId/branches/manage`, `GET /org/:orgId/branches/:branchId` |
| **Permissions** | None specific (orgAccessGuard) |
| **Empty State** | "No branches found." — muted text |
| **Loading State** | `<div className="animate-pulse h-40 ... rounded-xl" />` |
| **Error State** | None explicit |

**Source:** `frontend/src/pages/org/OrgBranchesPage.tsx:1-96`

### 6. OrgSubscriptionPage (`/org/:orgId/subscription`)

| Property | Value |
|----------|-------|
| **Component** | `pages/org/OrgSubscriptionPage.tsx` (241 lines) |
| **Purpose** | View current subscription plan with feature usage bars, billing cycle, status. View pending upgrade requests. View recent transactions. Open SubscriptionRequestModal to submit upgrade/downgrade requests |
| **Navigation Source** | OrgLayout sidebar "Subscription" |
| **APIs Used** | `GET /org/:orgId/subscription`, `GET /org/:orgId/subscription/requests`, `GET /org/:orgId/transactions?page=1&limit=10`, `POST /org/:orgId/subscription/request` |
| **Permissions** | None specific (orgAccessGuard) |
| **Empty State** | "No Plan" displayed when no active subscription |
| **Loading State** | "Loading..." — muted text, py-8 |
| **Error State** | Error card with retry button: "Failed to load subscription data" + error message |

**Source:** `frontend/src/pages/org/OrgSubscriptionPage.tsx:1-241`

### 7. OrgSettingsPage (`/org/:orgId/settings`)

| Property | Value |
|----------|-------|
| **Component** | `pages/org/OrgSettingsPage.tsx` (59 lines) |
| **Purpose** | Organisation settings with tabs: General (SubscriptionCard + OrganisationForm for editing basic info), Shipping Rates (permission-gated) |
| **Navigation Source** | OrgLayout sidebar "Settings" |
| **APIs Used** | `PUT /org/:orgId/info`, `GET /org/:orgId/info`, subscription endpoints |
| **Permissions** | `org.settings.shipping-rates-tab` for shipping rates tab |
| **Empty State** | N/A — always shows form |
| **Loading State** | N/A (SubscriptionCard and OrganisationForm handle their own loading) |
| **Error State** | "Invalid organisation" if orgId missing |

**Source:** `frontend/src/pages/org/OrgSettingsPage.tsx:1-59`

### 8. OrgFinancePage (`/org/:orgId/finance`)

| Property | Value |
|----------|-------|
| **Component** | `pages/org/OrgFinancePage.tsx` |
| **Purpose** | Financial overview: transactions list, settlements list, settlement detail view |
| **APIs Used** | `GET /org/:orgId/transactions`, `GET /org/:orgId/settlements`, `GET /org/:orgId/settlements/:settlementId` |
| **Permissions** | orgAccessGuard |
| **Empty State** | "No transactions found." / "No settlements found." |
| **Loading State** | Implicit via React Query |

**Source:** `frontend/src/pages/org/OrgFinancePage.tsx`, backend at `org-portal.service.ts:491-501`

### 9. Remaining Org Pages

All following screens follow the same pattern — they read `orgId` from URL params, query the `/org/:orgId/*` API namespace, and are gated by `orgAccessGuard`:

| Page | Route | Component File | API Endpoint(s) |
|------|-------|---------------|-----------------|
| **Bookings** | `/org/:orgId/bookings` | `OrgBookingsPage.tsx` | `GET /org/:orgId/bookings` |
| **Marketplace** | `/org/:orgId/marketplace` | `OrgMarketplacePage.tsx` | `GET /org/:orgId/products` |
| **Orders** | `/org/:orgId/orders` | `OrgOrdersPage.tsx` | Org orders endpoints |
| **Profile** | `/org/:orgId/profile` | `OrgProfilePage.tsx` | `GET/PUT /org/:orgId/profile` |
| **Working Hours** | `/org/:orgId/working-hours` | `OrgWorkingHoursPage.tsx` | `GET /org/:orgId/working-hours`, `PUT /org/:orgId/branches/:branchId/hours` |
| **Payment Settings** | `/org/:orgId/payment-settings` | `OrgPaymentSettingsPage.tsx` | `GET/PUT /org/:orgId/payment-settings` |
| **Reviews** | `/org/:orgId/reviews` | `OrgReviewsPage.tsx` | `GET /org/:orgId/reviews` |
| **Referees** | `/org/:orgId/referees` | `OrgRefereesPage.tsx` | `GET /org/:orgId/referees` |
| **Academies** | `/org/:orgId/academies` | `OrgAcademiesPage.tsx` | `GET /org/:orgId/academies` |
| **Leagues** | `/org/:orgId/leagues` | `OrgLeaguesPage.tsx` | `GET /org/:orgId/leagues` |
| **Tournaments** | `/org/:orgId/tournaments` | `OrgTournamentsPage.tsx` | `GET /org/:orgId/tournaments` |
| **Announcements** | `/org/:orgId/announcements` | `OrgAnnouncementsPage.tsx` | `GET/POST/PUT/DELETE /org/:orgId/announcements` |
| **Documents** | `/org/:orgId/documents` | `OrgDocumentsPage.tsx` | `GET/DELETE /org/:orgId/documents` |
| **Gallery** | `/org/:orgId/gallery` | `OrgGalleryPage.tsx` | `GET/POST/DELETE /org/:orgId/gallery` |
| **Reports** | `/org/:orgId/reports` | `OrgReportsPage.tsx` | `GET /org/:orgId/reports/bookings`, `/reports/revenue`, `/reports/members` |
| **Verification** | `/org/:orgId/verification` | `OrgVerificationPage.tsx` | `GET /org/:orgId/verification` |
| **Shipping Rates** | `/org/:orgId/shipping-rates` | `OrgShippingRatesPage.tsx` | Marketplace shipping endpoints |
| **Pending Approval** | `/org/:orgId/pending-approval` | `OrgPendingApprovalPage.tsx` | N/A (informational) |

**Source:** `frontend/src/pages/org/` — 26 page components. Backend API handlers at `org-portal.controller.ts` (980 lines). Routes at `org-portal.routes.ts` (128 lines, ~70 routes).

---

## Marketplace Screen Flows

All marketplace screens sit inside the **AppLayout** (consumer routes) and get the BottomNav on mobile. Routes are defined in `frontend/src/App.tsx`.

### 1. MarketplacePage (`/marketplace`)

| Property | Value |
|----------|-------|
| **Component** | `pages/marketplace/MarketplacePage.tsx` (330 lines) |
| **Purpose** | Product browsing with category/sport/brand/tag/gender filters, search, sort (newest, price asc/desc), tabbed view (All/Sellers/Players), wishlist heart toggle, cart badge |
| **Navigation Source** | BottomNav "More" → Marketplace, navbar link |
| **Navigation Destination** | Click product card → `/marketplace/products/:id` or `/marketplace/player-products/:id` |
| **APIs Used** | `GET /marketplace/products`, `GET /marketplace/wishlist`, `GET /marketplace/cart`, `GET /marketplace/player/status`, `POST/DELETE /marketplace/wishlist/:productId` |
| **Permissions** | None required for browsing; `marketplace.player-products.manage` for "My Products" link |
| **Empty State** | "No products found" with "Try adjusting your filters or search terms" — centered muted text with shopping bag emoji |
| **Loading State** | Grid of 8 animated pulse skeleton cards (aspect-square image placeholder + 3 text lines) |
| **Error State** | Not handled explicitly — `retry: false` on query but no `isError` branch |

**Source:** `frontend/src/pages/marketplace/MarketplacePage.tsx:18-330`

---

### 2. ProductDetailPage (`/marketplace/products/:id`)

| Property | Value |
|----------|-------|
| **Component** | `pages/marketplace/ProductDetailPage.tsx` (229 lines) |
| **Purpose** | Full product detail: image gallery, price (with discount), stock status, variant selectors (size/color), quantity picker, add to cart, wishlist toggle, description, video, reviews (list + submit) |
| **Navigation Source** | Click product card on MarketplacePage |
| **Navigation Destination** | Add to cart success → `/marketplace` |
| **APIs Used** | `GET /marketplace/products/:id`, `GET /marketplace/products/:id/reviews`, `GET /marketplace/wishlist`, `POST /marketplace/cart`, `POST/DELETE /marketplace/wishlist/:productId`, `POST /marketplace/products/:id/reviews` |
| **Permissions** | None (browsing), review submission requires auth |
| **Empty State** | "No reviews yet." in reviews section; "Product not found" if product query returns null |
| **Loading State** | "Loading..." — centered muted text while query loads |
| **Error State** | "Product not found" if product is null — centered muted text |

**Source:** `frontend/src/pages/marketplace/ProductDetailPage.tsx:10-228`

---

### 3. CartPage (`/marketplace/cart`)

| Property | Value |
|----------|-------|
| **Component** | `pages/marketplace/CartPage.tsx` (496 lines) |
| **Purpose** | Full checkout flow: cart items with qty controls, seller info (phone/WhatsApp for free-plan sellers), coupon application, address selection/creation, shipping validation (per-seller), payment method (Card/Cash), Paymob Pixel card iframe, payment polling |
| **Navigation Source** | Cart icon in MarketplacePage header |
| **Navigation Destination** | Successful checkout → `/marketplace/orders` |
| **APIs Used** | `GET /marketplace/cart`, `GET /marketplace/cart/seller-info`, `GET /marketplace/addresses`, `GET/POST/PUT /marketplace/addresses`, `GET /marketplace/provinces`, `GET /marketplace/provinces/:id/cities`, `POST /marketplace/coupons/validate`, `POST /marketplace/cart/check-shipping`, `PUT /marketplace/cart/:itemId`, `DELETE /marketplace/cart/:productId`, `POST /marketplace/orders` |
| **Permissions** | All authenticated |
| **Empty State** | "Your cart is empty" with "Browse products" link — centered muted text |
| **Loading State** | "Loading..." — centered muted text while query loads |
| **Error State** | Checkout failure toast via `showToast`; inline error "Checkout failed" under the checkout button; address save failure toast |

**Source:** `frontend/src/pages/marketplace/CartPage.tsx:99-496`

---

### 4. OrderListPage (`/marketplace/orders`)

| Property | Value |
|----------|-------|
| **Component** | `pages/marketplace/OrderListPage.tsx` (219 lines) |
| **Purpose** | List buyer's orders with status filter tabs (All, Pending, Confirmed, Processing, Shipped, Delivered, Cancelled), order counts badge, pagination, cancel/confirm delivery actions right on the list item |
| **Navigation Source** | Orders icon in MarketplacePage header, checkout success redirect |
| **Navigation Destination** | Click order → `/marketplace/orders/:id` |
| **APIs Used** | `GET /marketplace/orders`, `GET /marketplace/orders/counts`, `PUT /marketplace/orders/:id/status` |
| **Permissions** | Own orders only (backend-enforced) |
| **Empty State** | "No orders found." — centered muted text |
| **Loading State** | "Loading..." — muted text while query loads |
| **Error State** | Not handled explicitly — React Query retries |

**Source:** `frontend/src/pages/marketplace/OrderListPage.tsx:20-219`

---

### 5. OrderDetailPage (`/marketplace/orders/:id`)

| Property | Value |
|----------|-------|
| **Component** | `pages/marketplace/OrderDetailPage.tsx` (148 lines) |
| **Purpose** | Order detail: items list, shipping address snapshot, tracking info (carrier, number), payment summary (subtotal, discount, shipping, total), status badge, actions (cancel, confirm delivery, request refund) |
| **Navigation Source** | Click order in OrderListPage |
| **Navigation Destination** | Back button → previous page |
| **APIs Used** | `GET /marketplace/orders/:id`, `PUT /marketplace/orders/:id/status` |
| **Permissions** | Owner only (backend-enforced) |
| **Empty State** | "Order not found" if order null — centered muted text |
| **Loading State** | "Loading..." — centered muted text while query loads |
| **Error State** | "Update failed" inline text if status mutation fails |

**Source:** `frontend/src/pages/marketplace/OrderDetailPage.tsx:16-148`

---

### 6. WishlistPage (`/marketplace/wishlist`)

| Property | Value |
|----------|-------|
| **Component** | `pages/marketplace/WishlistPage.tsx` (113 lines) |
| **Purpose** | List wishlist items with product image, name, price (with discount), shop name, add-to-cart button, remove button |
| **Navigation Source** | Wishlist icon in MarketplacePage header |
| **Navigation Destination** | Click product → `/marketplace/products/:id` |
| **APIs Used** | `GET /marketplace/wishlist`, `DELETE /marketplace/wishlist/:productId`, `POST /marketplace/cart` |
| **Permissions** | All authenticated |
| **Empty State** | "Your wishlist is empty" with "Browse products" link — centered muted text with heart emoji |
| **Loading State** | "Loading..." — centered muted text while query loads |
| **Error State** | Toast notifications on remove and add-to-cart failures via `showToast` |

**Source:** `frontend/src/pages/marketplace/WishlistPage.tsx:8-113`

---

### 7. SellerDashboardPage (`/marketplace/seller`)

| Property | Value |
|----------|-------|
| **Component** | `pages/marketplace/SellerDashboardPage.tsx` (488 lines) |
| **Purpose** | Full seller management: activate free selling, stats cards, product CRUD (create/edit/delete via modal), order management (process, ship), shop settings (OrganisationForm), settlement balance and request |
| **Navigation Source** | BottomNav "More" → Sell, profile link |
| **Navigation Destination** | None (all inline) |
| **APIs Used** | `GET /marketplace/player/status`, `POST /marketplace/player/activate`, `GET /marketplace/seller/stats`, `GET /marketplace/seller/products`, `GET/POST/PUT/DELETE /marketplace/products/:id`, `GET /marketplace/seller/orders`, `PUT /marketplace/orders/:id/status`, `GET /marketplace/seller/settlements`, `GET /marketplace/seller/settlements/balance`, `POST /marketplace/seller/settlements`, `GET /marketplace/categories`, `GET /marketplace/brands`, `GET /marketplace/tags`, `GET /sports/marketplace` |
| **Permissions** | `marketplace.sell` for activation; `marketplace.seller.*` for tabs |
| **Empty State** | "No products yet" / "No orders yet." / "No settlements yet." per tab |
| **Loading State** | "Loading..." while profile loads; skeleton grid in products tab; implicit in other tabs |
| **Error State** | Toast notifications on all mutation failures (create/delete/update/request settlement) via `showToast` |

**Source:** `frontend/src/pages/marketplace/SellerDashboardPage.tsx:15-488`

---

### 8. PlayerProductsPage (`/marketplace/player/products`)

| Property | Value |
|----------|-------|
| **Component** | `pages/marketplace/PlayerProductsPage.tsx` (173 lines) |
| **Purpose** | Player seller's product management: list products (max 5), status filter tabs, add/edit via modal, mark as sold. Shows limit warning when at 5/5 |
| **Navigation Source** | MarketplacePage "My Products" link (gated by `marketplace.player-products.manage`) |
| **Navigation Destination** | None (all inline) |
| **APIs Used** | `GET /marketplace/player/status`, `GET /marketplace/player/products`, `PATCH /marketplace/player/products/:productId/sold` |
| **Permissions** | `marketplace.player-products.manage` |
| **Empty State** | "No products yet" with "Tap 'Add Product' to list your first item" — centered muted text |
| **Loading State** | Grid of 3 animated pulse skeleton cards |
| **Error State** | Toast notification on mark-as-sold failure via `showToast` |

**Source:** `frontend/src/pages/marketplace/PlayerProductsPage.tsx:22-173`

---

### 9. PlayerProductDetailPage (`/marketplace/player-products/:id`)

| Property | Value |
|----------|-------|
| **Component** | `pages/marketplace/PlayerProductDetailPage.tsx` (101 lines) |
| **Purpose** | Read-only product detail for player-listed items: image gallery, price, stock status, seller contact (Call/WhatsApp buttons), description, video. No cart/wishlist — direct contact only |
| **Navigation Source** | Click player product card on MarketplacePage (players tab) |
| **APIs Used** | `GET /marketplace/products/:id` |
| **Permissions** | None |
| **Empty State** | "Product not found" if null — centered muted text |
| **Loading State** | "Loading..." — centered muted text while query loads |
| **Error State** | "Product not found" if product is null |

**Source:** `frontend/src/pages/marketplace/PlayerProductDetailPage.tsx:8-101`

**Evidence:** All pages in `frontend/src/pages/marketplace/` (9 files). Routes in `frontend/src/App.tsx` (marketplace section). Backend routes at `marketplace.routes.ts:1-132`.

---

## Academy Screen Flows

### 1. Admin Academy Screen Flows (AdminLayout)

All admin academy screens live under `/admin/academy/*` and share the AdminLayout with sidebar navigation.

#### AcademyProgramsPage (`/admin/academy/programs`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/academy/AcademyProgramsPage.tsx` |
| **Purpose** | List all programs with search, category/status filters, pagination. Create/edit programs via modal. Transition status (publish, archive, transition) |
| **Navigation Source** | Admin sidebar "Academy" → "Programs" |
| **Navigation Destination** | Click program row → group management modal; status action buttons trigger inline mutations |
| **APIs Used** | `GET /admin/academy/programs`, `POST /admin/academy/programs`, `PUT /admin/academy/programs/:id`, `POST /admin/academy/programs/:id/publish`, `POST /admin/academy/programs/:id/archive`, `POST /admin/academy/programs/:id/transition` |
| **Permissions** | `academy.programs.*` |
| **Empty State** | "No academy programs found" — centered muted text |
| **Loading State** | Implicit via React Query; skeleton not implemented |
| **Error State** | Toast notifications via `showToast` on mutations |

#### AcademyGroupsPage (`/admin/academy/groups`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/academy/AcademyGroupsPage.tsx` |
| **Purpose** | List groups, filter by program/status, create/edit groups, assign/unassign coach, archive groups |
| **Navigation Source** | Admin sidebar "Academy" → "Groups" |
| **APIs Used** | `GET /admin/academy/groups`, `GET /admin/academy/programs/:programId/groups`, `POST /admin/academy/groups`, `PUT /admin/academy/groups/:id`, `POST /admin/academy/groups/:id/assign-coach`, `POST /admin/academy/groups/:id/archive` |
| **Permissions** | `academy.groups.*` |
| **Empty State** | "No groups found" |
| **Loading State** | Implicit via React Query |
| **Error State** | Toast notifications on mutation failures |

#### AcademyEnrollmentsPage (`/admin/academy/enrollments`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/academy/AcademyEnrollmentsPage.tsx` |
| **Purpose** | List enrollments with program/group/player/status filters. Create enrollment, cancel, complete, confirm, move to another group, view history |
| **Navigation Source** | Admin sidebar "Academy" → "Enrollments" |
| **APIs Used** | `GET /admin/academy/enrollments`, `POST /admin/academy/enrollments`, `POST /admin/academy/enrollments/:id/cancel`, `POST /admin/academy/enrollments/:id/complete`, `POST /admin/academy/enrollments/:id/confirm`, `POST /admin/academy/enrollments/:id/move`, `GET /admin/academy/enrollments/:id/history` |
| **Permissions** | `academy.enrollments.*` |
| **Empty State** | "No enrollments found" |
| **Loading State** | Implicit via React Query |
| **Error State** | Toast notifications on mutations |

#### AcademyAttendancePage (`/admin/academy/attendance`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/academy/AcademyAttendancePage.tsx` |
| **Purpose** | Record and view attendance for group sessions. Select session, see enrollment list, mark present/absent/excused/late per player. Bulk record support. View attendance summary |
| **Navigation Source** | Admin sidebar "Academy" → "Attendance" |
| **APIs Used** | `GET /admin/academy/attendance`, `POST /admin/academy/attendance`, `POST /admin/academy/attendance/bulk`, `GET /admin/academy/attendance/summary` |
| **Permissions** | `academy.attendance.*` |
| **Empty State** | "No sessions found. Create a group session first." |
| **Loading State** | Implicit via React Query |
| **Error State** | Toast on mutation failures; "Attendance already recorded" shown inline for duplicates |

#### AcademyDashboardPage (`/admin/academy/dashboard`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/academy/AcademyDashboardPage.tsx` |
| **Purpose** | KPIs: total programs, published, running, groups, enrolled players, waiting list size, capacity utilization %, attendance summary (present/absent/excused/late counts) |
| **Navigation Source** | Admin sidebar "Academy" → "Dashboard" |
| **APIs Used** | `GET /admin/academy/dashboard` |
| **Permissions** | `academy.dashboard.view` |
| **Empty State** | N/A — always shows data (zeroed if no programs exist) |
| **Loading State** | Implicit via React Query |
| **Error State** | Not handled explicitly |

**Source:** `frontend/src/pages/admin/academy/` (5 files). Routes at `backend/src/modules/academy/presentation/academy.routes.ts:9-59`.

### 2. Player Academy Screen Flows (AppLayout)

All player academy screens get the BottomNav on mobile and sit inside AppLayout.

#### AcademyListPage (`/player/academy`)

| Property | Value |
|----------|-------|
| **Component** | `pages/player/academy/AcademyListPage.tsx` |
| **Purpose** | Browse public programs with category filters, search, pagination. Each card shows: program name, category, level, capacity usage, price, status badge |
| **Navigation Source** | BottomNav "More" → Academy, or direct link |
| **Navigation Destination** | Click program card → `/player/academy/:id` |
| **APIs Used** | `GET /player/academy/programs`, `GET /player/academy/categories` |
| **Permissions** | None required for browsing |
| **Empty State** | "No programs available at this time" |
| **Loading State** | Skeleton cards while loading |
| **Error State** | Not handled explicitly |

#### AcademyDetailPage (`/player/academy/:id`)

| Property | Value |
|----------|-------|
| **Component** | `pages/player/academy/AcademyDetailPage.tsx` |
| **Purpose** | Program detail: description, level, season, capacity/progress bar, price, coach info (if available). Enroll button (gated by capacity). Shows "Enrolled" badge if already registered |
| **Navigation Source** | Click program card on AcademyListPage |
| **Navigation Destination** | Enroll success → `/player/academy/enrollments` |
| **APIs Used** | `GET /player/academy/programs/:id`, `POST /player/academy/enrollments` |
| **Permissions** | `academy.enroll` for enroll button |
| **Empty State** | "Program not found" if null |
| **Loading State** | Implicit via React Query |
| **Error State** | Toast on enroll failure (duplicate, program full, etc.) |

**Source:** Player academy pages at `frontend/src/pages/player/academy/`. Player routes at `academy.routes.ts`.

---

## Tournament Screen Flows

### 1. Admin Tournament Screen Flows (AdminLayout)

#### TournamentDashboardPage (`/admin/tournaments`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/tournament/TournamentDashboardPage.tsx` |
| **Purpose** | KPI cards: total, published, registration open, running, completed, cancelled. Quick-action buttons for creating new tournament |
| **Navigation Source** | Admin sidebar "Tournaments" |
| **Navigation Destination** | Click "Create Tournament" → create form; click tournament card → detail page |
| **APIs Used** | `GET /admin/tournaments/dashboard`, `GET /admin/tournaments` |
| **Permissions** | `tournament.dashboard.view` |
| **Empty State** | "No tournaments yet. Create your first tournament!" |
| **Loading State** | Implicit via React Query |
| **Error State** | Not handled explicitly |

#### TournamentListPage (`/admin/tournaments/list`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/tournament/TournamentListPage.tsx` |
| **Purpose** | Paginated list with search, status/format/sport filters. Status badges with color coding. Create, edit, manage registrations |
| **Navigation Source** | Admin sidebar "Tournaments" → "All Tournaments" |
| **Navigation Destination** | Click tournament → `/admin/tournaments/:id` |
| **APIs Used** | `GET /admin/tournaments`, `POST /admin/tournaments`, `PUT /admin/tournaments/:id` |
| **Permissions** | `tournament.view`, `tournament.create`, `tournament.update` |
| **Empty State** | "No tournaments found" — centered muted text |
| **Loading State** | Skeleton table while loading |
| **Error State** | Toast on mutation failures |

#### TournamentDetailPage (`/admin/tournaments/:id`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/tournament/TournamentDetailPage.tsx` |
| **Purpose** | Full tournament management: details card, status transition buttons (publish, open reg, close reg, start, complete, cancel, archive), registrations tab, bracket tab, matches tab, standings tab, groups tab |
| **Navigation Source** | Click tournament in TournamentListPage |
| **Navigation Destination** | Status actions inline; no page navigation |
| **APIs Used** | `GET /admin/tournaments/:id`, status endpoints, `GET /admin/tournaments/:id/registrations`, `GET /admin/tournaments/:id/bracket`, `GET /admin/tournaments/:id/matches`, `GET /admin/tournaments/:id/standings`, `GET /admin/tournaments/:id/groups`, `POST /admin/tournaments/:id/generate-groups`, `POST /admin/tournaments/:id/generate-fixtures`, `POST /admin/tournaments/:id/generate-bracket`, `POST /admin/tournaments/matches/:matchId/result`, `POST /admin/tournaments/matches/:matchId/assign-court`, `POST /admin/tournaments/matches/:matchId/assign-referee` |
| **Permissions** | `tournament.view`, `tournament.manage`, `tournament.delete` for archive |
| **Empty State** | "Tournament not found" if null |
| **Loading State** | Implicit via React Query with tab-level loading |
| **Error State** | Toast on all mutation failures |

#### TournamentMatchesPage (`/admin/tournaments/:id/matches`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/tournament/TournamentMatchesPage.tsx` |
| **Purpose** | Dedicated match management interface: list all matches with round, players, status, scores. Record results (winner, scores, score details). Assign court and referee per match |
| **Navigation Source** | Tournament detail page → "Matches" tab, or direct link |
| **APIs Used** | `GET /admin/tournaments/:id/matches`, `POST /admin/tournaments/matches/:matchId/result`, `POST /admin/tournaments/matches/:matchId/assign-court`, `POST /admin/tournaments/matches/:matchId/assign-referee` |
| **Permissions** | `tournament.view`, `tournament.manage` |
| **Empty State** | "No matches generated yet. Generate bracket or fixtures first." |
| **Loading State** | Implicit via React Query |
| **Error State** | Toast on result/court/referee mutations |

### 2. Player Tournament Screen Flows (AppLayout)

#### TournamentListPage (`/tournaments`)

| Property | Value |
|----------|-------|
| **Component** | `pages/tournaments/TournamentListPage.tsx` |
| **Purpose** | Browse public tournaments with search, status/sport/format filters. Each card shows: name, format, sport, dates, registration window, player count, fee, status badge. "Register" button on open tournaments |
| **Navigation Source** | BottomNav "More" → Tournaments |
| **Navigation Destination** | Click tournament card → `/tournaments/:id` |
| **APIs Used** | `GET /player/tournaments` |
| **Permissions** | None required for browsing |
| **Empty State** | "No tournaments available" |
| **Loading State** | Skeleton cards |
| **Error State** | Not handled explicitly |

#### TournamentDetailPage (`/tournaments/:id`)

| Property | Value |
|----------|-------|
| **Component** | `pages/tournaments/TournamentDetailPage.tsx` |
| **Purpose** | Full tournament view: info card (dates, format, fee, prize), registration section (register/cancel, waiting list position), bracket visualization, standings table, matches tab |
| **Navigation Source** | Click tournament card on TournamentListPage |
| **Navigation Destination** | Register success → updates view inline |
| **APIs Used** | `GET /player/tournaments/:id`, `POST /player/tournaments/:id/register`, `GET /player/tournaments/:id/standings`, `GET /player/tournaments/:id/matches`, `GET /player/tournaments/:id/bracket` |
| **Permissions** | Auth required for register |
| **Empty State** | "Tournament not found" |
| **Loading State** | Implicit via React Query |
| **Error State** | Toast on register/cancel mutations |

#### TournamentCreatePage (`/tournaments/create`)

| Property | Value |
|----------|-------|
| **Component** | `pages/tournaments/TournamentCreatePage.tsx` |
| **Purpose** | Multi-step tournament creation form: basic info (name, code, description), format selection, sport, dates, registration settings (type, max players, fee), rules/prize |
| **Navigation Source** | TournamentListPage "Create Tournament" button |
| **Navigation Destination** | On success → `/tournaments/:id` |
| **APIs Used** | `POST /player/tournaments` |
| **Permissions** | `tournament.create` for player-facing |
| **Empty State** | N/A |
| **Loading State** | Submit button shows spinner |
| **Error State** | Inline validation errors + toast on server error |

**Source:** Player pages at `frontend/src/pages/tournaments/` (3 files). Admin pages at `frontend/src/pages/admin/tournament/` (4 files) + `pages/admin/tournaments/TournamentAdminPage.tsx`. Backend routes at `tournament.routes.ts:10-50`.

---

## League Screen Flows

### 1. Admin League Screen Flows (AdminLayout)

#### LeagueDashboardPage (`/admin/leagues`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/league/LeagueDashboardPage.tsx` |
| **Purpose** | KPI cards: total leagues, open registrations, running, completed, total teams, total matches, completed matches. Quick action to create season/league |
| **Navigation Source** | Admin sidebar "Leagues" |
| **Navigation Destination** | Click league → `/admin/leagues/:id` |
| **APIs Used** | `GET /admin/leagues/dashboard`, `GET /admin/leagues` |
| **Permissions** | `league.dashboard.view` |
| **Empty State** | "No leagues yet. Create a season first!" |
| **Loading State** | Implicit via React Query |
| **Error State** | Not handled explicitly |

#### LeagueListPage (`/admin/leagues/list`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/league/LeagueListPage.tsx` |
| **Purpose** | Paginated list with search, status/sport/season filters. Create (with season association), edit, status transitions |
| **Navigation Source** | Admin sidebar "Leagues" |
| **Navigation Destination** | Click league → `/admin/leagues/:id` |
| **APIs Used** | `GET /admin/leagues`, `POST /admin/leagues`, `PUT /admin/leagues/:id` |
| **Permissions** | `league.*` |
| **Empty State** | "No leagues found" |
| **Loading State** | Skeleton list |
| **Error State** | Toast on mutations |

#### LeagueDetailPage (`/admin/leagues/:id`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/league/LeagueDetailPage.tsx` |
| **Purpose** | Full league management hub: details card, status actions (publish, open reg, close reg, start, complete, cancel, archive), divisions tab, teams tab (register/confirm/cancel), fixtures tab (generate, view), matches tab (assign court/referee, record results), standings tab, statistics tab (player + team, recalculate), promotion/relegation actions |
| **Navigation Source** | Click league in LeagueListPage or dashboard |
| **Navigation Destination** | All actions inline |
| **APIs Used** | `GET /admin/leagues/:id`, status endpoints, division CRUD, `POST /admin/leagues/:id/register-team`, `POST /admin/leagues/:id/generate-fixtures`, match/result endpoints, standing recalculate, stat recalculate, `POST /admin/leagues/divisions/:id/promote`, `POST /admin/leagues/divisions/:id/relegate` |
| **Permissions** | `league.*`, `league.divisions.*`, `league.teams.*`, `league.fixtures.*`, `league.matches.*`, `league.standings.*`, `league.statistics.*` |
| **Empty State** | "League not found" |
| **Loading State** | Tab-level loading |
| **Error State** | Toast on all mutations |

#### SeasonListPage (`/admin/seasons`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/league/SeasonListPage.tsx` |
| **Purpose** | Season CRUD: list, create, edit, publish, archive. Filter by status/sport. Used as a container for leagues |
| **Navigation Source** | Admin sidebar "Leagues" → "Seasons" |
| **APIs Used** | `GET /admin/seasons`, `POST /admin/seasons`, `PUT /admin/seasons/:id`, `POST /admin/seasons/:id/publish`, `POST /admin/seasons/:id/archive` |
| **Permissions** | `season.*` |
| **Empty State** | "No seasons found" |
| **Loading State** | Implicit via React Query |
| **Error State** | Toast on mutations |

#### DivisionManagePage (`/admin/leagues/:id/divisions`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/league/DivisionManagePage.tsx` |
| **Purpose** | Create/edit divisions within a league. Configure tier, capacity, advance_count, relegation_count. Execute promotion and relegation actions per division |
| **Navigation Source** | LeagueDetailPage → "Divisions" tab |
| **APIs Used** | Division CRUD, `POST /admin/leagues/divisions/:id/promote`, `POST /admin/leagues/divisions/:id/relegate` |
| **Permissions** | `league.divisions.*` |
| **Empty State** | "No divisions configured. Create one to start." |
| **Loading State** | Implicit via React Query |
| **Error State** | Toast on mutations |

**Source:** Admin pages at `frontend/src/pages/admin/league/` (5 files). Backend routes at `league.routes.ts:9-69`.

---

## CRM Screen Flows (AdminLayout)

All CRM screens sit under `/admin/crm/*` and share the AdminLayout with sidebar navigation. They are gated by `crm.*` permissions.

### 1. CRMDashboardPage (`/admin/crm`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/crm/CRMDashboardPage.tsx` (89 lines) |
| **Purpose** | Dashboard with KPI cards: total customers, active segments, lead counts by status (new/qualified/converted/lost), active campaigns. Quick-link cards for Customers, Segments, Leads, Campaigns, Communications |
| **Navigation Source** | Admin sidebar "CRM" → "Dashboard" |
| **Navigation Destination** | Click quick-link cards → respective CRM pages |
| **APIs Used** | `GET /admin/crm/dashboard` |
| **Permissions** | `crm.dashboard.view` |
| **Empty State** | Cards show zeroed stats |
| **Loading State** | `<Skeleton width={180} height={32} />` for stat cards |
| **Error State** | Not handled explicitly |

**Source:** `frontend/src/pages/admin/crm/CRMDashboardPage.tsx:1-89`

### 2. CustomerListPage (`/admin/crm/customers`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/crm/CustomerListPage.tsx` |
| **Purpose** | Paginated list of customers (users) with search by name/email/phone, showing aggregates (bookings, orders, enrollments) and last activity date. Pagination with page/limit |
| **Navigation Source** | CRM Dashboard quick-link, Admin sidebar |
| **Navigation Destination** | Click customer row → `/admin/crm/customers/:id` |
| **APIs Used** | `GET /admin/crm/customers?search=&page=&limit=` |
| **Permissions** | `crm.customers.view` |
| **Empty State** | "No customers found" |
| **Loading State** | Skeleton table rows |
| **Error State** | Not handled explicitly |

**Source:** `frontend/src/pages/admin/crm/CustomerListPage.tsx`, backend at `crm.controller.ts:10-50`

### 3. CustomerDetailPage (`/admin/crm/customers/:id`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/crm/CustomerDetailPage.tsx` |
| **Purpose** | Customer 360 profile: user details card, aggregate stats (bookings, orders, wallet, enrollments, tournaments, league teams), last activity timestamp, and timeline feed |
| **Navigation Source** | Click customer on CustomerListPage |
| **Navigation Destination** | None (all inline) |
| **APIs Used** | `GET /admin/crm/customers/:id`, `GET /admin/crm/customers/:id/timeline` |
| **Permissions** | `crm.customers.view` |
| **Empty State** | "Customer not found" if user ID invalid |
| **Loading State** | Profile card skeleton while loading |
| **Error State** | Not handled explicitly |

**Source:** `frontend/src/pages/admin/crm/CustomerDetailPage.tsx`, backend at `crm.controller.ts:52-137`

### 4. SegmentsPage (`/admin/crm/segments`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/crm/SegmentsPage.tsx` |
| **Purpose** | CRUD for customer segments: list with member counts, create/edit via modal (name, description, rules JSON), refresh segment members, delete |
| **Navigation Source** | CRM Dashboard quick-link, Admin sidebar |
| **APIs Used** | `GET /admin/crm/segments`, `POST /admin/crm/segments`, `PUT /admin/crm/segments/:id`, `POST /admin/crm/segments/:id/refresh`, `DELETE /admin/crm/segments/:id` |
| **Permissions** | `crm.segments.view`, `crm.segments.manage` |
| **Empty State** | "No segments created yet" |
| **Loading State** | Implicit via React Query |
| **Error State** | Toast on mutation failures via `showToast` |

**Source:** `frontend/src/pages/admin/crm/SegmentsPage.tsx`, backend at `crm.controller.ts:139-293`

### 5. LeadsPage (`/admin/crm/leads`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/crm/LeadsPage.tsx` |
| **Purpose** | Lead management: list with status/source/assignee filters, create lead via modal, update status/notes, convert lead to customer |
| **Navigation Source** | CRM Dashboard quick-link, Admin sidebar |
| **APIs Used** | `GET /admin/crm/leads`, `POST /admin/crm/leads`, `PUT /admin/crm/leads/:id`, `POST /admin/crm/leads/:id/convert` |
| **Permissions** | `crm.leads.view`, `crm.leads.manage` |
| **Empty State** | "No leads found" |
| **Loading State** | Implicit via React Query |
| **Error State** | Toast on mutation failures via `showToast` |

**Source:** `frontend/src/pages/admin/crm/LeadsPage.tsx`, backend at `crm.controller.ts:295-417`

### 6. CampaignsPage (`/admin/crm/campaigns`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/crm/CampaignsPage.tsx` |
| **Purpose** | Marketing campaign management: list with status/type filters, create/edit via modal, status actions (launch, pause, complete) |
| **Navigation Source** | CRM Dashboard quick-link, Admin sidebar |
| **APIs Used** | `GET /admin/crm/campaigns`, `POST /admin/crm/campaigns`, `PUT /admin/crm/campaigns/:id`, `POST /admin/crm/campaigns/:id/launch`, `POST /admin/crm/campaigns/:id/pause`, `POST /admin/crm/campaigns/:id/complete` |
| **Permissions** | `crm.campaigns.view`, `crm.campaigns.manage` |
| **Empty State** | "No campaigns created yet" |
| **Loading State** | Implicit via React Query |
| **Error State** | Toast on mutation failures via `showToast` |

**Source:** `frontend/src/pages/admin/crm/CampaignsPage.tsx`, backend at `crm.controller.ts:419-590`

### 7. CommunicationsPage (`/admin/crm/communications`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/crm/CommunicationsPage.tsx` |
| **Purpose** | Communication log viewer: filterable by user, channel, status, date range. Shows inbound/outbound messages with delivery status |
| **Navigation Source** | CRM Dashboard quick-link, Admin sidebar |
| **APIs Used** | `GET /admin/crm/communications?userId=&channel=&status=&from=&to=` |
| **Permissions** | `crm.communications.view` |
| **Empty State** | "No communications found" |
| **Loading State** | Implicit via React Query |
| **Error State** | Not handled explicitly |

**Source:** `frontend/src/pages/admin/crm/CommunicationsPage.tsx`, backend at `crm.controller.ts:592-618`

**Evidence:** All CRM page components at `frontend/src/pages/admin/crm/` (7 files). Backend routes at `crm.routes.ts:9-39`. Backend handlers at `crm.controller.ts:1-647`.

---

## HR Screen Flows (AdminLayout)

All HR screens sit under `/admin/hr/*` and share the AdminLayout with sidebar navigation. They are gated by `hr.*` permissions.

### 1. HRDashboardPage (`/admin/hr`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/hr/HRDashboardPage.tsx` (87 lines) |
| **Purpose** | Dashboard with KPI cards: total employees, active departments, pending leave requests, active payroll runs, today's attendance count. Quick-link cards for Employees, Departments, Leave Management, Attendance, Payroll |
| **Navigation Source** | Admin sidebar "HR" → "Dashboard" |
| **Navigation Destination** | Click quick-link cards → respective HR pages |
| **APIs Used** | `GET /hr/dashboard` |
| **Permissions** | `hr.dashboard.view` |
| **Empty State** | Cards show zeroed stats |
| **Loading State** | `<Skeleton width={180} height={32} />` for stat cards |
| **Error State** | Not handled explicitly |

**Source:** `frontend/src/pages/admin/hr/HRDashboardPage.tsx:1-87`

### 2. DepartmentListPage (`/admin/hr/departments`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/hr/DepartmentListPage.tsx` |
| **Purpose** | Department CRUD: list with hierarchy (parent name), department head, active/inactive status. Create/edit/soft-delete |
| **Navigation Source** | HR Dashboard quick-link, Admin sidebar |
| **APIs Used** | `GET /hr/departments`, `POST /hr/departments`, `PUT /hr/departments/:id`, `DELETE /hr/departments/:id` |
| **Permissions** | `hr.departments.view`, `hr.departments.manage` |
| **Empty State** | "No departments found" |
| **Loading State** | Implicit via React Query |
| **Error State** | Toast on mutation failures via `showToast` |

**Source:** `frontend/src/pages/admin/hr/DepartmentListPage.tsx`, backend at `hr.controller.ts:23-134`

### 3. EmployeeListPage (`/admin/hr/employees`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/hr/EmployeeListPage.tsx` |
| **Purpose** | Employee list with search, department/position/status filters. Create employee (link user to org), edit, change status via state machine |
| **Navigation Source** | HR Dashboard quick-link, Admin sidebar |
| **Navigation Destination** | Click employee row → `/admin/hr/employees/:id` |
| **APIs Used** | `GET /hr/employees`, `POST /hr/employees`, `PUT /hr/employees/:id`, `PATCH /hr/employees/:id/status` |
| **Permissions** | `hr.employees.view`, `hr.employees.manage` |
| **Empty State** | "No employees found" |
| **Loading State** | Skeleton table rows |
| **Error State** | Toast on mutation failures via `showToast` |

**Source:** `frontend/src/pages/admin/hr/EmployeeListPage.tsx`, backend at `hr.controller.ts:250-400`

### 4. EmployeeDetailPage (`/admin/hr/employees/:id`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/hr/EmployeeDetailPage.tsx` |
| **Purpose** | Employee profile: personal info, department/position, employment status badge, hire/termination dates, contracts tab, leave requests tab, attendance history tab, payroll entries tab |
| **Navigation Source** | Click employee on EmployeeListPage |
| **APIs Used** | `GET /hr/employees/:id`, `GET /hr/contracts?employeeId=`, `GET /hr/leave-requests?employeeId=`, `GET /hr/attendance?employeeId=`, `GET /hr/leave-balances?employeeId=` |
| **Permissions** | `hr.employees.view` |
| **Empty State** | "Employee not found" |
| **Loading State** | Profile card skeleton |
| **Error State** | Not handled explicitly |

**Source:** `frontend/src/pages/admin/hr/EmployeeDetailPage.tsx`, backend at `hr.controller.ts:289-304`

### 5. LeaveManagementPage (`/admin/hr/leave`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/hr/LeaveManagementPage.tsx` |
| **Purpose** | Central leave management: tabbed view — Leave Types (configurable types CRUD), Leave Requests (list with status filters, approve/reject/cancel actions), Leave Balances (view and adjust per employee per type) |
| **Navigation Source** | HR Dashboard quick-link, Admin sidebar |
| **APIs Used** | `GET/POST/PUT/DELETE /hr/leave-types`, `GET/POST /hr/leave-requests`, `POST /hr/leave-requests/:id/submit`, `POST /hr/leave-requests/:id/approve`, `POST /hr/leave-requests/:id/reject`, `POST /hr/leave-requests/:id/cancel`, `GET /hr/leave-balances`, `POST /hr/leave-balances/adjust` |
| **Permissions** | `hr.leaves.types.*`, `hr.leaves.requests.*`, `hr.leaves.balances.*` |
| **Empty State** | "No leave types configured" / "No leave requests found" |
| **Loading State** | Tab-level loading |
| **Error State** | Toast on mutation failures via `showToast` |

**Source:** `frontend/src/pages/admin/hr/LeaveManagementPage.tsx`, backend at `hr.controller.ts:533-956`

### 6. AttendancePage (`/admin/hr/attendance`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/hr/AttendancePage.tsx` |
| **Purpose** | Attendance tracking: date-range view, filter by employee, manual log entry, clock-in/out times, status badges (present/absent/late/early_leave/excused) |
| **Navigation Source** | HR Dashboard quick-link, Admin sidebar |
| **APIs Used** | `GET /hr/attendance`, `POST /hr/attendance/log`, `POST /hr/attendance/clock-in`, `POST /hr/attendance/clock-out` |
| **Permissions** | `hr.attendance.view`, `hr.attendance.manage` |
| **Empty State** | "No attendance records found for the selected date range" |
| **Loading State** | Implicit via React Query |
| **Error State** | Toast on mutation failures via `showToast` |

**Source:** `frontend/src/pages/admin/hr/AttendancePage.tsx`, backend at `hr.controller.ts:960-1084`

### 7. PayrollPage (`/admin/hr/payroll`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/hr/PayrollPage.tsx` |
| **Purpose** | Payroll management: tabbed view — Payroll Components (configurable earning/deduction types CRUD), Payroll Runs (list with status, create, calculate, approve, post to GL, mark paid, close). Run detail shows employee entries with component breakdown |
| **Navigation Source** | HR Dashboard quick-link, Admin sidebar |
| **APIs Used** | `GET/POST/PUT/DELETE /hr/payroll-components`, `GET/POST /hr/payroll-runs`, `GET /hr/payroll-runs/:id`, `POST /hr/payroll-runs/:id/calculate`, `POST /hr/payroll-runs/:id/approve`, `POST /hr/payroll-runs/:id/post`, `POST /hr/payroll-runs/:id/mark-paid`, `POST /hr/payroll-runs/:id/close` |
| **Permissions** | `hr.payroll.components.*`, `hr.payroll.runs.*` |
| **Empty State** | "No payroll components configured" / "No payroll runs found" |
| **Loading State** | Tab-level loading |
| **Error State** | Toast on mutation failures via `showToast` |

**Source:** `frontend/src/pages/admin/hr/PayrollPage.tsx`, backend at `hr.controller.ts:1088-1498`

**Evidence:** All HR page components at `frontend/src/pages/admin/hr/` (7 files). Backend routes at `hr.routes.ts:9-81`. Backend handlers at `hr.controller.ts:1-1544`.

---

## Reports & BI Screen Flows (AdminLayout)

All reports pages sit under `/admin/*` and share the AdminLayout with sidebar navigation.

### 1. ReportsPage (`/admin/reports`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/reports/ReportsPage.tsx` (247 lines) |
| **Purpose** | 30 report endpoints across 9 categories: Financial, Bookings, Users, Orgs, Marketplace, Tournaments, Ads, Audit. Each tab shows multiple endpoint blocks with date range filtering |
| **Navigation Source** | Admin sidebar "Reports" link |
| **Navigation Destination** | None (all inline — tab switching) |
| **APIs Used** | 28 report endpoints from `reports.routes.ts` |
| **Permissions** | `super_admin` role (or `reportGuard`) |
| **Empty State** | "No data" per endpoint block |
| **Loading State** | `<Spinner />` per endpoint block |
| **Error State** | Silently returns null on error (React Query) |

**Tabs:** Financial, Bookings, Users, Orgs, Marketplace, Tournaments, Ads, Audit

**Chart rendering:** Uses `recharts` (LineChart, BarChart, PieChart, ResponsiveContainer)
**Date filter:** `DateRangePicker` component

**Source:** `frontend/src/pages/admin/reports/ReportsPage.tsx:181-247`

### 2. ReportCenterPage (`/admin/finance/reports`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/finance/ReportCenterPage.tsx` |
| **Purpose** | Financial-specific reports: Revenue, Wallet, Settlements. Per-tab CSV export |
| **Navigation Source** | FinanceDashboardPage "Reports" link, Admin sidebar |
| **Navigation Destination** | None (inline) |
| **APIs Used** | `GET /reports/financial/summary`, wallet endpoints, settlement endpoints |
| **Permissions** | `super_admin` |
| **Empty State** | "No data found" per tab |
| **Loading State** | Implicit via React Query |

**Tabs:** Revenue, Wallet, Settlements

**Source:** `frontend/src/pages/admin/finance/ReportCenterPage.tsx:9-219`

### 3. BIDashboardPage (`/admin/bi/dashboard`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/bi/BIDashboardPage.tsx` (275 lines) |
| **Purpose** | Executive dashboard with KPI cards, trend charts (revenue, bookings, user growth), top orgs table, and org drill-down with branch/coach/court utilization metrics. Includes CSV export panel |
| **Navigation Source** | Admin sidebar (pending addition) |
| **Navigation Destination** | None (inline — org selector dropdown switches context) |
| **APIs Used** | `GET /bi/dashboard`, `GET /bi/dashboard/org/:orgId`, `GET /organisations?limit=200`, `GET /bi/export/:reportType` |
| **Permissions** | `bi.dashboard.view` (page), `bi.export` (export panel) |
| **Empty State** | "No data" per chart/table section |
| **Loading State** | Full-page spinner (`animate-spin`) |
| **Error State** | Inline error message: "Failed to load dashboard" with error text |

**Org selector:** Dropdown with all organisations. Switching to an org triggers the org-scoped dashboard API.

**Source:** `frontend/src/pages/admin/bi/BIDashboardPage.tsx:59-274`
**Backend:** `bi.controller.ts:21-112` (executive), `bi.controller.ts:114-229` (org)

### 4. ObservabilityPage (`/admin/bi/observability`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/bi/ObservabilityPage.tsx` (141 lines) |
| **Purpose** | Web Vitals monitoring (LCP, CLS, FCP trend charts) and client-side error viewer with frequency, first/last seen, and date range filter |
| **Navigation Source** | Admin sidebar (pending addition) |
| **Navigation Destination** | None (inline) |
| **APIs Used** | `GET /bi/web-vitals`, `GET /bi/client-errors` |
| **Permissions** | `bi.observability.view` |
| **Empty State** | "No data" per chart; "No errors reported" for errors table |
| **Loading State** | `Filter` button shows "Loading..." text |
| **Error State** | Not handled explicitly (Promise.all .catch silently resets loading) |

**Source:** `frontend/src/pages/admin/bi/ObservabilityPage.tsx:53-141`
**Backend:** `bi.controller.ts:327-359` (web vitals), `bi.controller.ts:361-393` (client errors)

### 5. AdminDashboard (`/admin`)

| Property | Value |
|----------|-------|
| **Component** | `pages/admin/AdminDashboard.tsx` |
| **Purpose** | Admin landing page with quick-link cards. "View Reports" card links to `/admin/reports` |
| **Navigation Source** | Admin root |
| **Navigation Destination** | "View Reports" → `/admin/reports` |
| **Perms Required** | `admin.dashboard.view` |

**Source:** `frontend/src/pages/admin/AdminDashboard.tsx:114,235`

---

**Evidence:** Routes in `frontend/src/App.tsx:589` (Reports), `624` (ReportCenter), `704-705` (BI/Observability). Sidebar entry at `SidebarLayoutPage.tsx:36`. All APIs verified against `reports.routes.ts:48-91`, `bi.routes.ts:8-18`.

# CourtZon Enterprise Platform — Volume 05: Screens Reference

## Player Screens (AppLayout)

| Route | Component | File | Purpose | Permissions |
|-------|-----------|------|---------|-------------|
| `/app` | DashboardPage | `pages/player/DashboardPage.tsx` | Main player dashboard with widgets | `player.dashboard.view` |
| `/browse` | BrowseBranchesPage | `pages/booking/BrowseBranchesPage.tsx` | Browse facilities | — |
| `/organisations/:orgId` | OrgStorefrontPage | `pages/organisations/OrgStorefrontPage.tsx` | Org public profile | — |
| `/branches/:branchId/resources` | ResourceListPage | `pages/booking/ResourceListPage.tsx` | Branch resources/courts | — |
| `/book/:resourceId` | BookingFormPage | `pages/booking/BookingFormPage.tsx` | Create booking | `bookings.create.*` |
| `/bookings` | MyBookingsPage | `pages/booking/MyBookingsPage.tsx` | My bookings list | `bookings.view` |
| `/bookings/:id/confirmation` | BookingConfirmationPage | `pages/booking/BookingConfirmationPage.tsx` | Booking confirmation + QR | — |
| `/matches` | MatchListPage | `pages/booking/MatchListPage.tsx` | Public match discovery | — |
| `/matches/:id` | MatchLobbyPage | `pages/booking/MatchLobbyPage.tsx` | Match detail + lobby | — |
| `/marketplace` | MarketplacePage | `pages/marketplace/MarketplacePage.tsx` | Product browsing | — |
| `/marketplace/products/:id` | ProductDetailPage | `pages/marketplace/ProductDetailPage.tsx` | Product detail | — |
| `/marketplace/cart` | CartPage | `pages/marketplace/CartPage.tsx` | Shopping cart | — |
| `/marketplace/orders` | OrderListPage | `pages/marketplace/OrderListPage.tsx` | Order history | — |
| `/marketplace/orders/:id` | OrderDetailPage | `pages/marketplace/OrderDetailPage.tsx` | Order detail | — |
| `/marketplace/wishlist` | WishlistPage | `pages/marketplace/WishlistPage.tsx` | Wishlist | — |
| `/marketplace/seller` | SellerDashboardPage | `pages/marketplace/SellerDashboardPage.tsx` | Seller portal | `marketplace.sell` |
| `/tournaments` | TournamentListPage | `pages/tournaments/TournamentListPage.tsx` | Tournament listings | `tournaments.view` |
| `/tournaments/:id` | TournamentDetailPage | `pages/tournaments/TournamentDetailPage.tsx` | Tournament detail | — |
| `/academies` | AcademyListPage | `pages/academies/AcademyListPage.tsx` | Academy listings | `academies.view` |
| `/academies/:id` | AcademyDetailPage | `pages/academies/AcademyDetailPage.tsx` | Academy detail | — |
| `/coaches` | CoachDirectoryPage | `pages/coaches/CoachDirectoryPage.tsx` | Coach directory | `coaches.view` |
| `/coaches/:id` | CoachDetailPage | `pages/coaches/CoachDetailPage.tsx` | Coach profile | — |
| `/profile` | ProfilePage | `pages/profile/ProfilePage.tsx` | User profile + wallet | — |
| `/players` | PlayerSearchPage | `pages/players/PlayerSearchPage.tsx` | Search players | `player.search` |
| `/players/:id` | PlayerPublicProfilePage | `pages/players/PlayerPublicProfilePage.tsx` | Player public profile | `player.profile.view` |
| `/my/favorites` | FavoritesPage | `pages/player/FavoritesPage.tsx` | Favorite clubs/coaches | `player.favorites.manage` |
| `/my/statistics` | StatisticsPage | `pages/player/StatisticsPage.tsx` | Player statistics | `player.statistics.view` |
| `/my/wallet` | WalletPage | `pages/player/WalletPage.tsx` | Wallet + transactions | `player.wallet.view` |
| `/my/payments` | PaymentsPage | `pages/player/PaymentsPage.tsx` | Payment history | `player.payments.view` |
| `/notifications` | NotificationsPage | `pages/notifications/NotificationsPage.tsx` | Notification inbox | — |
| `/messages` | MessagesPage | `pages/community/MessagesPage.tsx` | Chat/messaging | `community.chat.view` |
| `/membership` | MembershipDashboard | `pages/membership/MembershipDashboard.tsx` | Membership + loyalty | — |
| `/membership/plans` | PlansPage | `pages/membership/PlansPage.tsx` | Browse plans | — |
| `/membership/rewards` | RewardsPage | `pages/membership/RewardsPage.tsx` | Redeem rewards | — |

## Coach Screens (CoachLayout)

| Route | Component | File | Purpose |
|-------|-----------|------|---------|
| `/coach/dashboard` | CoachDashboard | `pages/coaches/CoachDashboard.tsx` | Coach dashboard |
| `/coach/sessions` | TodaySessions | `pages/coaches/TodaySessions.tsx` | Session list |
| `/coach/requests` | SessionRequests | `pages/coaches/SessionRequests.tsx` | Pending requests |
| `/coach/players` | CoachPlayersPage | `pages/coaches/CoachPlayersPage.tsx` | Player roster |
| `/coach/profile` | CoachProfilePage | `pages/coaches/CoachProfilePage.tsx` | Profile editor |
| `/coach/revenue` | CoachRevenuePage | `pages/coaches/CoachRevenuePage.tsx` | Revenue history |
| `/coach/attendance` | CoachAttendancePage | `pages/coaches/CoachAttendancePage.tsx` | Attendance stats |

## Referee Screens

| Route | Component | File | Purpose |
|-------|-----------|------|---------|
| `/referee/dashboard` | RefereeDashboardPage | `pages/referee/RefereeDashboardPage.tsx` | Referee dashboard |
| `/referee/profile` | RefereeProfilePage | `pages/referee/RefereeProfilePage.tsx` | Profile editor |
| `/referee/availability` | RefereeAvailabilityPage | `pages/referee/RefereeAvailabilityPage.tsx` | Availability management |
| `/referee/assignments` | RefereeAssignmentsPage | `pages/referee/RefereeAssignmentsPage.tsx` | Match assignments |
| `/referee/matches` | RefereeMatchHistoryPage | `pages/referee/RefereeMatchHistoryPage.tsx` | Match history |
| `/referee/statistics` | RefereeStatisticsPage | `pages/referee/RefereeStatisticsPage.tsx` | Performance stats |

## Admin Screens (AdminLayout)

Full list in `VOLUME_33_SUPER_ADMIN_MANUALS.md`. Key sections: Dashboard, Reports, Organisations, Roles, Marketplace, League, Tournament, Academy, Coaches, Membership, Pricing, Notifications, Security, Accounting, CRM, HR, Inventory, BI, Integration, Mobile, Support.

## Organisation Screens (OrgLayout)

Full list in `VOLUME_27_ORGANIZATION_MANUALS.md`. 24 screens covering: Dashboard, Marketplace, Orders, Bookings, Staff, Members, Coaches, Finance, Subscription, Settings, Announcements, Documents, Gallery, Reports, Profile, Branches, Working Hours, Payment Settings, Reviews, Referees, Academies, Leagues, Tournaments, Verification.

## Evidence

All screen components verified at `C:\Users\mniaz\Desktop\CourtZon-V2\frontend\src\pages\`. Routes verified in `frontend/src/App.tsx`.

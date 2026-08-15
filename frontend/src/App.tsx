import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import WithdrawalPage from './pages/player/WithdrawalPage';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { useAuthStore } from './store/auth.store';
import { useThemeStore } from './store/theme.store';
import { useFeatureFlagsStore } from './store/feature-flags.store';
import { useAppearanceStore } from './store/appearance.store';
import { useAppSettingsStore } from './store/app-settings.store';
import { useCurrencyStore } from './store/currency.store';
import { I18nProvider, useTranslation } from './i18n';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';
import BottomNav from './components/layout/BottomNav';
import LoginSplash from './components/auth/LoginSplash';
import InstallPrompt from './components/InstallPrompt';
import WelcomeModal from './components/welcome/WelcomeModal';
import SiteLogo from './components/branding/SiteLogo';
import { Can } from './permissions/Can';
import { useHaptics } from './hooks/useHaptics';
import { useCan } from './hooks/useCan';
import { FeatureFlagGuard } from './components/FeatureFlagGuard';
import { useFeatureFlag } from './hooks/useFeatureFlag';
import NotificationBell from './components/notifications/NotificationBell';
import OfflineBanner from './components/pwa/OfflineBanner';
import PWAUpdatePrompt from './components/pwa/PWAUpdatePrompt';
import { PENDING_RELOAD_KEY } from './constants/pwa-reload';
import { SocketProvider } from './realtime/SocketContext';
import { RealtimeCacheUpdater } from './realtime/RealtimeCacheUpdater';
import { ConnectionStatus } from './components/ConnectionStatus';
import CommandPalette from './components/search/CommandPalette';
import IOSInstallSheet from './components/pwa/IOSInstallSheet';
import SplashScreen from './components/SplashScreen';
import RoleSwitcher from './components/workspace/RoleSwitcher';
import CoachLayout from './components/layout/CoachLayout';
import RefereeLayout from './components/layout/RefereeLayout';
import { isOrganisationPendingApproval, orgPortalPath } from './utils/organisation';
import { resolveUserHome, useWorkspaceStore } from './store/workspace.store';

// Route-level code splitting: every page/layout below is lazily imported so the
// initial bundle only ships the shell (guards, navbar, stores). See G8.
const LandingLayout = lazy(() => import('./pages/landing/LandingLayout'));
const LandingPage = lazy(() => import('./pages/landing/LandingPage'));
const PreRegisterPage = lazy(() => import('./pages/landing/PreRegisterPage'));
const PlayerRegisterPage = lazy(() => import('./pages/landing/PlayerRegisterPage'));
const OrganizationRegisterPage = lazy(() => import('./pages/landing/OrganizationRegisterPage'));
const SellerRegisterPage = lazy(() => import('./pages/landing/SellerRegisterPage'));
const BlogDetailPage = lazy(() => import('./pages/landing/BlogDetailPage'));
const SubscriptionPlanDetailPage = lazy(() => import('./pages/subscription/SubscriptionPlanDetailPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const PaymentReturnPage = lazy(() => import('./pages/payment/PaymentReturnPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const TemporaryResetPasswordPage = lazy(() => import('./pages/auth/TemporaryResetPasswordPage'));
const BrowseBranchesPage = lazy(() => import('./pages/booking/BrowseBranchesPage'));
const OrgStorefrontPage = lazy(() => import('./pages/organisations/OrgStorefrontPage'));
const BookingResourceListPage = lazy(() => import('./pages/booking/ResourceListPage'));
const BookingFormPage = lazy(() => import('./pages/booking/BookingFormPage'));
const BookingConfirmationPage = lazy(() => import('./pages/booking/BookingConfirmationPage'));
const BookingDetailPage = lazy(() => import('./pages/booking/BookingDetailPage'));
const MyBookingsPage = lazy(() => import('./pages/booking/MyBookingsPage'));
const MarketplacePage = lazy(() => import('./pages/marketplace/MarketplacePage'));
const ProductDetailPage = lazy(() => import('./pages/marketplace/ProductDetailPage'));
const PlayerProductDetailPage = lazy(() => import('./pages/marketplace/PlayerProductDetailPage'));
const PlayerProductsPage = lazy(() => import('./pages/marketplace/PlayerProductsPage'));
const CartPage = lazy(() => import('./pages/marketplace/CartPage'));
const OrderListPage = lazy(() => import('./pages/marketplace/OrderListPage'));
const OrderDetailPage = lazy(() => import('./pages/marketplace/OrderDetailPage'));
const SellerDashboardPage = lazy(() => import('./pages/marketplace/SellerDashboardPage'));
const WishlistPage = lazy(() => import('./pages/marketplace/WishlistPage'));
const TournamentListPage = lazy(() => import('./pages/tournaments/TournamentListPage'));
const TournamentDetailPage = lazy(() => import('./pages/tournaments/TournamentDetailPage'));
const TournamentCreatePage = lazy(() => import('./pages/tournaments/TournamentCreatePage'));
const AcademyListPage = lazy(() => import('./pages/academies/AcademyListPage'));
const AcademyDetailPage = lazy(() => import('./pages/academies/AcademyDetailPage'));
const PlayerDashboardPage = lazy(() => import('./pages/player/DashboardPage'));
const PlayerSearchPage = lazy(() => import('./pages/players/PlayerSearchPage'));
const PlayerPublicProfilePage = lazy(() => import('./pages/players/PlayerPublicProfilePage'));
const PlayerFavoritesPage = lazy(() => import('./pages/player/FavoritesPage'));
const PlayerStatisticsPage = lazy(() => import('./pages/player/StatisticsPage'));
const PlayerAchievementsPage = lazy(() => import('./pages/player/AchievementsPage'));
const PlayerQRProfilePage = lazy(() => import('./pages/player/QRProfilePage'));
const PlayerDeviceManagementPage = lazy(() => import('./pages/player/DeviceManagementPage'));
const PlayerWalletPage = lazy(() => import('./pages/player/WalletPage'));
const PlayerPaymentsPage = lazy(() => import('./pages/player/PaymentsPage'));
const PlayerRankHistoryPage = lazy(() => import('./pages/player/RankHistoryPage'));
const PlayerTournamentsPage = lazy(() => import('./pages/player/TournamentsPage'));
const CoachDirectoryPage = lazy(() => import('./pages/coaches/CoachDirectoryPage'));
const CoachProfilePage = lazy(() => import('./pages/coaches/CoachProfilePage'));
const CoachDetailPage = lazy(() => import('./pages/coaches/CoachDetailPage'));
const CoachBookingPage = lazy(() => import('./pages/coaches/CoachBookingPage'));
const EngineCoachBookingPage = lazy(() => import('./pages/coaches/EngineCoachBookingPage'));
const CoachSessionsPage = lazy(() => import('./pages/coaches/CoachSessionsPage'));
const CoachDashboard = lazy(() => import('./pages/coaches/CoachDashboard'));
const TodaySessions = lazy(() => import('./pages/coaches/TodaySessions'));
const SessionRequests = lazy(() => import('./pages/coaches/SessionRequests'));
const CoachPlayersPage = lazy(() => import('./pages/coaches/CoachPlayersPage'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const RoleAppearancePage = lazy(() => import('./pages/settings/RoleAppearancePage'));
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'));
const MobileDashboardPage = lazy(() => import('./pages/admin/mobile/MobileDashboardPage'));
const ReportsPage = lazy(() => import('./pages/admin/reports/ReportsPage'));
const CommunityEventsPage = lazy(() => import('./pages/community/CommunityEventsPage'));
const MessagesPage = lazy(() => import('./pages/community/MessagesPage'));
const AdminLayout = lazy(() => import('./app/layouts/AdminLayout'));
const OrgLayout = lazy(() => import('./app/layouts/OrgLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const OrganisationListPage = lazy(() => import('./pages/admin/organisations/OrganisationListPage'));
const BranchListPage = lazy(() => import('./pages/admin/branches/BranchListPage'));
const ResourceListPage = lazy(() => import('./pages/admin/resources/ResourceListPage'));
const RoleListPage = lazy(() => import('./pages/admin/roles/RoleListPage'));
const UserListPage = lazy(() => import('./pages/admin/users/UserListPage'));
const OrganisationTypesPage = lazy(() => import('./pages/admin/organisation-types/OrganisationTypesPage'));
const SportsPage = lazy(() => import('./pages/admin/sports/SportsPage'));
const CountriesPage = lazy(() => import('./pages/admin/countries/CountriesPage'));
const CurrenciesPage = lazy(() => import('./pages/admin/currencies/CurrenciesPage'));
const LanguagesPage = lazy(() => import('./pages/admin/languages/LanguagesPage'));
const AppSettingsPage = lazy(() => import('./pages/admin/app-settings/AppSettingsPage'));
const TranslationsPage = lazy(() => import('./pages/admin/translations/TranslationsPage'));
const SubscriptionPage = lazy(() => import('./pages/admin/subscription/SubscriptionPage'));
const SubscriptionRequestsPage = lazy(() => import('./pages/admin/subscription/SubscriptionRequestsPage'));
const SettlementListPage = lazy(() => import('./pages/admin/settlements/SettlementListPage'));
const BookingSettlementPage = lazy(() => import('./pages/admin/settlements/BookingSettlementPage'));

const FinancialOpsDashboard = lazy(() => import('./pages/admin/finance/FinancialOpsDashboard'));
const ProductCategoriesPage = lazy(() => import('./pages/admin/product-categories/ProductCategoriesPage'));
const FeatureFlagsPage = lazy(() => import('./pages/admin/feature-flags/FeatureFlagsPage'));
const PaymentMethodsPage = lazy(() => import('./pages/admin/payment-methods/PaymentMethodsPage'));
const PaymentGatewaysPage = lazy(() => import('./pages/admin/payment-gateways/PaymentGatewaysPage'));
const WithdrawalRequestsPage = lazy(() => import('./pages/admin/financial/WithdrawalRequestsPage'));
const WithdrawalQueuePage = lazy(() => import('./pages/admin/WithdrawalQueuePage'));
const CouponListPage = lazy(() => import('./pages/admin/coupons/CouponListPage'));
const DesignTokensPage = lazy(() => import('./pages/admin/design-tokens/DesignTokensPage'));
const TournamentAdminPage = lazy(() => import('./pages/admin/tournaments/TournamentAdminPage'));
const TournamentDashboardPage = lazy(() => import('./pages/admin/tournament/TournamentDashboardPage'));
const TournamentListAdminPage = lazy(() => import('./pages/admin/tournament/TournamentListPage'));
const TournamentDetailAdminPage = lazy(() => import('./pages/admin/tournament/TournamentDetailPage'));
const TournamentMatchesAdminPage = lazy(() => import('./pages/admin/tournament/TournamentMatchesPage'));
const AcademyAdminPage = lazy(() => import('./pages/admin/academies/AcademyAdminPage'));
const AcademyDashboardPage = lazy(() => import('./pages/admin/academy/AcademyDashboardPage'));
const AcademyProgramsPage = lazy(() => import('./pages/admin/academy/AcademyProgramsPage'));
const AcademyGroupsPage = lazy(() => import('./pages/admin/academy/AcademyGroupsPage'));
const AcademyEnrollmentsPage = lazy(() => import('./pages/admin/academy/AcademyEnrollmentsPage'));
const AcademyAttendancePage = lazy(() => import('./pages/admin/academy/AcademyAttendancePage'));
const LeagueDashboardPage = lazy(() => import('./pages/admin/league/LeagueDashboardPage'));
const SeasonListPage = lazy(() => import('./pages/admin/league/SeasonListPage'));
const LeagueListPage = lazy(() => import('./pages/admin/league/LeagueListPage'));
const LeagueDetailPage = lazy(() => import('./pages/admin/league/LeagueDetailPage'));
const DivisionManagePage = lazy(() => import('./pages/admin/league/DivisionManagePage'));
const CoachAdminPage = lazy(() => import('./pages/admin/coaches/CoachAdminPage'));
const CommunityEventsAdminPage = lazy(() => import('./pages/admin/community/CommunityEventsAdminPage'));
const CmsPage = lazy(() => import('./pages/admin/cms/CmsPage'));
const AdsPage = lazy(() => import('./pages/admin/ads/AdsPage'));
const SidebarLayoutPage = lazy(() => import('./pages/admin/sidebar-layout/SidebarLayoutPage'));
const UIPermissionsPage = lazy(() => import('./pages/admin/ui-permissions/UIPermissionsPage'));
const AmenitiesPage = lazy(() => import('./pages/admin/amenities/AmenitiesPage'));
const BanksPage = lazy(() => import('./pages/admin/banks/BanksPage'));
const BankBranchesPage = lazy(() => import('./pages/admin/banks/BankBranchesPage'));
const MarketplaceProductsPage = lazy(() => import('./pages/admin/marketplace/ProductsPage'));
const AdminProductDetailPage = lazy(() => import('./pages/admin/marketplace/ProductDetailPage'));
const MarketplaceOrdersPage = lazy(() => import('./pages/admin/marketplace/OrdersPage'));
const MarketplaceSellersPage = lazy(() => import('./pages/admin/marketplace/SellersPage'));
const MarketplaceUpgradeRequestsPage = lazy(() => import('./pages/admin/marketplace/UpgradeRequestsPage'));
const AdminApprovalsPage = lazy(() => import('./pages/admin/marketplace/AdminApprovalsPage'));
const MarketplaceReviewsPage = lazy(() => import('./pages/admin/marketplace/ReviewsPage'));
const AdminShippingRatesPage = lazy(() => import('./pages/admin/marketplace/AdminShippingRatesPage'));
const BrandsPage = lazy(() => import('./pages/admin/brands/BrandsPage'));
const TagsPage = lazy(() => import('./pages/admin/tags/TagsPage'));
const SecurityDashboard = lazy(() => import('./pages/admin/security/SecurityDashboard'));
const SessionsPage = lazy(() => import('./pages/admin/security/SessionsPage'));
const FailedLoginsPage = lazy(() => import('./pages/admin/security/FailedLoginsPage'));
const UploadSecurityPage = lazy(() => import('./pages/admin/security/UploadSecurityPage'));
const SystemHealthPage = lazy(() => import('./pages/admin/security/SystemHealthPage'));
const OrganisationSecurityPage = lazy(() => import('./pages/admin/security/OrganisationSecurityPage'));
const RoleAuditPage = lazy(() => import('./pages/admin/security/RoleAuditPage'));
const AdminBranchAccessPage = lazy(() => import('./pages/admin/branch-access/BranchAccessPage'));
const AdminBookingsPage = lazy(() => import('./pages/admin/bookings/BookingsPage'));
const AdminBroadcastPage = lazy(() => import('./pages/admin/notifications/AdminBroadcastPage'));
const AdminAnalyticsPage = lazy(() => import('./pages/admin/notifications/AdminAnalyticsPage'));
const AdminDeadLettersPage = lazy(() => import('./pages/admin/notifications/AdminDeadLettersPage'));
const AdminTemplatesPage = lazy(() => import('./pages/admin/notifications/AdminTemplatesPage'));
const NotificationTypesPage = lazy(() => import('./pages/admin/notifications/NotificationTypesPage'));
const TemplatesPage = lazy(() => import('./pages/admin/notifications/TemplatesPage'));
const NotificationConfigPage = lazy(() => import('./pages/admin/notifications/NotificationConfigPage'));
const SystemAdminPage = lazy(() => import('./pages/admin/SystemAdminPage'));
const SupportTicketsPage = lazy(() => import('./pages/admin/support/SupportTicketsPage'));
const QueueManagementPage = lazy(() => import('./pages/admin/queues/QueueManagementPage'));
const MembershipPage = lazy(() => import('./pages/admin/MembershipPage'));
const OrgDashboardPage = lazy(() => import('./pages/org/OrgDashboardPage'));
const OrgBookingsPage = lazy(() => import('./pages/org/OrgBookingsPage'));
const OrgMarketplacePage = lazy(() => import('./pages/org/OrgMarketplacePage'));
const OrgOrdersPage = lazy(() => import('./pages/org/OrgOrdersPage'));
const OrgSettingsPage = lazy(() => import('./pages/org/OrgSettingsPage'));
const OrgStaffPage = lazy(() => import('./pages/org/OrgStaffPage'));
const OrgCoachesPage = lazy(() => import('./pages/org/OrgCoachesPage'));
const OrgMembersPage = lazy(() => import('./pages/org/OrgMembersPage'));
const OrgPendingApprovalPage = lazy(() => import('./pages/org/OrgPendingApprovalPage'));
const OrgFinancePage = lazy(() => import('./pages/org/OrgFinancePage'));
const OrgBookingSettlementsPage = lazy(() => import('./pages/org/OrgBookingSettlementsPage'));
const OrgAccountingDashboardPage = lazy(() => import('./pages/org/OrgAccountingDashboardPage'));
const OrgChartOfAccountsPage = lazy(() => import('./pages/org/OrgChartOfAccountsPage'));
const OrgJournalPage = lazy(() => import('./pages/org/OrgJournalPage'));
const OrgFinancialReportsPage = lazy(() => import('./pages/org/OrgFinancialReportsPage'));
const OrgTaxSummaryPage = lazy(() => import('./pages/org/OrgTaxSummaryPage'));
const OrgSubscriptionPage = lazy(() => import('./pages/org/OrgSubscriptionPage'));
const OrgAnnouncementsPage = lazy(() => import('./pages/org/OrgAnnouncementsPage'));
const OrgDocumentsPage = lazy(() => import('./pages/org/OrgDocumentsPage'));
const OrgGalleryPage = lazy(() => import('./pages/org/OrgGalleryPage'));
const OrgReportsPage = lazy(() => import('./pages/org/OrgReportsPage'));
const OrgProfilePage = lazy(() => import('./pages/org/OrgProfilePage'));
const OrgBranchesPage = lazy(() => import('./pages/org/OrgBranchesPage'));
const OrgReviewsPage = lazy(() => import('./pages/org/OrgReviewsPage'));
const OrgRefereesPage = lazy(() => import('./pages/org/OrgRefereesPage'));
const OrgAcademiesPage = lazy(() => import('./pages/org/OrgAcademiesPage'));
const OrgLeaguesPage = lazy(() => import('./pages/org/OrgLeaguesPage'));
const OrgTournamentsPage = lazy(() => import('./pages/org/OrgTournamentsPage'));
const OrgVerificationPage = lazy(() => import('./pages/org/OrgVerificationPage'));
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'));
const MembershipDashboard = lazy(() => import('./pages/membership/MembershipDashboard'));
const PlansPage = lazy(() => import('./pages/membership/PlansPage'));
const RewardsPage = lazy(() => import('./pages/membership/RewardsPage'));
const MembershipPlansPage = lazy(() => import('./pages/admin/membership/MembershipPlansPage'));
const CampaignsPage = lazy(() => import('./pages/admin/membership/CampaignsPage'));
const RewardsAdminPage = lazy(() => import('./pages/admin/membership/RewardsAdminPage'));
const PricingRulesPage = lazy(() => import('./pages/admin/pricing/PricingRulesPage'));
const PricePreviewPage = lazy(() => import('./pages/admin/pricing/PricePreviewPage'));
const WebhooksPage = lazy(() => import('./pages/admin/WebhooksPage'));
const APIDashboardPage = lazy(() => import('./pages/admin/integration/APIDashboardPage'));
const WarehousesPage = lazy(() => import('./pages/admin/inventory/WarehousesPage'));
const SuppliersPage = lazy(() => import('./pages/admin/inventory/SuppliersPage'));
const PurchaseOrdersPage = lazy(() => import('./pages/admin/inventory/PurchaseOrdersPage'));
const InventoryPage = lazy(() => import('./pages/admin/inventory/InventoryPage'));
const CRMDashboardPage = lazy(() => import('./pages/admin/crm/CRMDashboardPage'));
const CustomerListPage = lazy(() => import('./pages/admin/crm/CustomerListPage'));
const CustomerDetailPage = lazy(() => import('./pages/admin/crm/CustomerDetailPage'));
const SegmentsPage = lazy(() => import('./pages/admin/crm/SegmentsPage'));
const LeadsPage = lazy(() => import('./pages/admin/crm/LeadsPage'));
const CRMCampaignsPage = lazy(() => import('./pages/admin/crm/CampaignsPage'));
const CommunicationsPage = lazy(() => import('./pages/admin/crm/CommunicationsPage'));
const FinanceDashboardPage = lazy(() => import('./pages/admin/finance/FinanceDashboardPage'));
const ReceptionDashboard = lazy(() => import('./pages/admin/ReceptionDashboard'));
const LedgerViewerPage = lazy(() => import('./pages/admin/finance/LedgerViewerPage'));
const ReportCenterPage = lazy(() => import('./pages/admin/finance/ReportCenterPage'));
const AccountingDashboardPage = lazy(() => import('./pages/admin/accounting/AccountingDashboardPage'));
const ChartOfAccountsPage = lazy(() => import('./pages/admin/accounting/ChartOfAccountsPage'));
const AccountingPeriodsPage = lazy(() => import('./pages/admin/accounting/AccountingPeriodsPage'));
const GeneralLedgerPage = lazy(() => import('./pages/admin/accounting/GeneralLedgerPage'));
const JournalEntryPage = lazy(() => import('./pages/admin/accounting/JournalEntryPage'));
const InvoicesPage = lazy(() => import('./pages/admin/accounting/InvoicesPage'));
const TaxRatesPage = lazy(() => import('./pages/admin/accounting/TaxRatesPage'));
const EventMappingsPage = lazy(() => import('./pages/admin/accounting/EventMappingsPage'));
const AccountingTemplatesPage = lazy(() => import('./pages/admin/accounting/TemplatesPage'));
const TaxSummaryPage = lazy(() => import('./pages/admin/accounting/TaxSummaryPage'));
const SportsEnginePage = lazy(() => import('./pages/admin/sports/SportsEnginePage'));
const HRDashboardPage = lazy(() => import('./pages/admin/hr/HRDashboardPage'));
const DepartmentListPage = lazy(() => import('./pages/admin/hr/DepartmentListPage'));
const BIDashboardPage = lazy(() => import('./pages/admin/bi/BIDashboardPage'));
const ObservabilityPage = lazy(() => import('./pages/admin/bi/ObservabilityPage'));
const EmployeeListPage = lazy(() => import('./pages/admin/hr/EmployeeListPage'));
const EmployeeDetailPage = lazy(() => import('./pages/admin/hr/EmployeeDetailPage'));
const LeaveManagementPage = lazy(() => import('./pages/admin/hr/LeaveManagementPage'));
const AttendancePage = lazy(() => import('./pages/admin/hr/AttendancePage'));
const PayrollPage = lazy(() => import('./pages/admin/hr/PayrollPage'));
const MatchListPage = lazy(() => import('./pages/booking/MatchListPage'));
const MatchLobbyPage = lazy(() => import('./pages/booking/MatchLobbyPage'));
const RefereeDashboardPage = lazy(() => import('./pages/referee/RefereeDashboardPage'));
const RefereeProfilePage = lazy(() => import('./pages/referee/RefereeProfilePage'));
const RefereeAvailabilityPage = lazy(() => import('./pages/referee/RefereeAvailabilityPage'));
const RefereeAssignmentsPage = lazy(() => import('./pages/referee/RefereeAssignmentsPage'));
const RefereeMatchHistoryPage = lazy(() => import('./pages/referee/RefereeMatchHistoryPage'));
const RefereeStatisticsPage = lazy(() => import('./pages/referee/RefereeStatisticsPage'));
const CoachRevenuePage = lazy(() => import('./pages/coaches/CoachRevenuePage'));
const CoachAttendancePage = lazy(() => import('./pages/coaches/CoachAttendancePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));




function PageLoader() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
    </div>
  );
}

function BrandedSplash() {
  const [showApp, setShowApp] = useState(false);
  const isLoading = useAuthStore((s) => s.isLoading);
  const appSettingsLoaded = useAppSettingsStore((s) => s.loaded);

  if (showApp && appSettingsLoaded) return null;

  return <SplashScreen onFinish={() => { if (!isLoading && appSettingsLoaded) setShowApp(true); }} />;
}

function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const isAdmin = user?.roles?.some(r => r === 'super-admin' || r === 'admin' || r === 'super_admin' || r === 'accountant');
  if (isAdmin && !location.pathname.startsWith('/admin') && !location.pathname.startsWith('/org') && !location.pathname.startsWith('/notifications')) {
    return <Navigate to="/admin" replace />;
  }
  if (!isAdmin && location.pathname === '/app' && activeWorkspace !== 'player') {
    const home = resolveUserHome();
    if (home.workspace !== 'player' && home.path !== '/app') {
      return <Navigate to={home.path} replace />;
    }
  }
  return <Outlet />;
}

function LandingRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) {
    return <Navigate to={resolveUserHome().path} replace />;
  }
  return <Outlet />;
}

function AdminRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const isAdmin = user?.roles?.some(r => r === 'super-admin' || r === 'super_admin' || r === 'admin' || r === 'accountant');
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

function RefereeRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { can } = useCan();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!can('referee.dashboard.view')) return <Navigate to={resolveUserHome().path} replace />;
  return <RefereeLayout />;
}

function OrgRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const orgScopes = user?.organisations || [];
  if (orgScopes.length === 0) return <Navigate to="/" replace />;
  return <Outlet />;
}

function OrgApprovedGuard() {
  const { orgId } = useParams<{ orgId: string }>();
  const user = useAuthStore((s) => s.user);
  const org = user?.organisations?.find((o) => String(o.id) === orgId);
  if (org && isOrganisationPendingApproval(org)) {
    return <Navigate to={`/org/${orgId}/pending-approval`} replace />;
  }
  return <Outlet />;
}

function PublicRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to={resolveUserHome().path} replace />;
  return <Outlet />;
}

function Navbar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const chatEnabled = useFeatureFlag('community.chat_enabled');
  const { tap } = useHaptics();
  const { t } = useTranslation();

  const isActive = (path: string) => location.pathname === path || (path === '/app' && location.pathname === '/');

  const handleLogout = async () => {
    tap();
    await logout();
    navigate('/');
  };

  // Legacy org link — preserved for backward compatibility
  // TODO: Remove when legacy role-switching is fully deprecated
  const orgScopes = user?.organisations || [];
  const firstOrg = orgScopes[0];
  const orgNavPath = firstOrg ? orgPortalPath(firstOrg) : null;
  const orgNavLabel = firstOrg?.name?.trim() || t('nav.organization');
  void orgNavPath; void orgNavLabel;

  const navLinkClass = (path: string) =>
    `text-sm transition-colors ${
      isActive(path) ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]'
    }`;

  return (
    <nav className="bg-[var(--color-surface)] border-b border-[var(--color-border)] sticky top-0 z-50 cz-pt-safe cz-px-safe">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4 min-w-0">
            <SiteLogo to="/app" size="xl" variant="primary" className="mr-1 shrink-0" />
            <div className="hidden md:flex items-center gap-4">
              <Link to="/app" className={navLinkClass('/app')}>{t('nav.home')}</Link>
              <Link to="/bookings" className={navLinkClass('/bookings')}>{t('nav.bookings')}</Link>
              <Link to="/matches" className={navLinkClass('/matches')}>{t('nav.matches')}</Link>
              <Can permission="coaches.view">
                <Link to="/coaches" className={navLinkClass('/coaches')}>{t('nav.coaches')}</Link>
              </Can>
              <Can permission="tournaments.view">
                <Link to="/tournaments" className={navLinkClass('/tournaments')}>{t('nav.tournaments')}</Link>
              </Can>
              <Can permission="academies.view">
                <Link to="/academies" className={navLinkClass('/academies')}>{t('nav.academies')}</Link>
              </Can>
              {chatEnabled && (
                <Can permission="community.chat.view">
                  <Link to="/messages" className={navLinkClass('/messages')}>{t('nav.messages')}</Link>
                </Can>
              )}
              <Can permission="marketplace.view">
                <Link to="/marketplace" className={navLinkClass('/marketplace')}>{t('nav.marketplace')}</Link>
              </Can>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <RoleSwitcher />
            <NotificationBell />
            <Link to="/profile" className="text-sm text-[var(--color-text-muted)]">{user?.fullName || t('nav.profile')}</Link>
            <button onClick={handleLogout} className="text-sm text-[var(--color-text-muted)] hover:text-red-500">{t('nav.logout')}</button>
          </div>
          <div className="flex md:hidden items-center gap-1">
            <RoleSwitcher />
            <NotificationBell />
            <button
              type="button"
              onClick={handleLogout}
              aria-label={t('nav.logout')}
              title={t('nav.logout')}
              className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cz-no-select"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

function AppLayout() {
  return (
    <div className="flex flex-col h-dvh max-h-full bg-[var(--color-bg)]">
      <LoginSplash />
      <WelcomeModal />
      <OfflineBanner />
      <Navbar />
      <main className="flex-1 overflow-y-auto min-h-0 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20 md:pb-6 overflow-x-hidden cz-scrollbar-hide">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}

function AppContent() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const appSettingsLoaded = useAppSettingsStore((s) => s.loaded);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const initTheme = useThemeStore((s) => s.init);
  const fetchFlags = useFeatureFlagsStore((s) => s.fetch);
  const fetchAppearance = useAppearanceStore((s) => s.fetch);
  const fetchAppSettings = useAppSettingsStore((s) => s.fetch);
  const hydrateCurrency = useCurrencyStore((s) => s.hydrate);
  const loadSymbolRegistry = useCurrencyStore((s) => s.loadSymbolRegistry);
  const detectCurrency = useCurrencyStore((s) => s.detect);

  // True when the page was (re)loaded to apply a PWA update. The reload splash is
  // kept visible until the app is fully initialized, then hidden without flicker.
  const pendingReloadRef = useRef<boolean>(
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PENDING_RELOAD_KEY) === '1',
  );
  const pendingReload = pendingReloadRef.current;
  const [reloadSplashDismissed, setReloadSplashDismissed] = useState(false);
  const appReady = !isLoading && appSettingsLoaded;

  useEffect(() => {
    initTheme();
    hydrateCurrency();
    void loadSymbolRegistry();
    void checkAuth();
    void fetchFlags();
    void fetchAppSettings();
    void detectCurrency();
  }, []);

  useEffect(() => {
    if (!isLoading) void fetchAppearance();
  }, [isLoading, fetchAppearance]);

  // After a PWA reload: keep the persistent splash visible until boot completes,
  // then fade it out (`.hidden` triggers the inline CSS opacity transition) and
  // clear the pending flag so future reloads behave normally.
  useEffect(() => {
    if (!pendingReload || !appReady) return;
    const el = document.getElementById('cz-initial-splash');
    if (el) el.classList.add('hidden');
    try {
      sessionStorage.removeItem(PENDING_RELOAD_KEY);
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => setReloadSplashDismissed(true), 400);
    return () => clearTimeout(t);
  }, [pendingReload, appReady]);

  const navigate = useNavigate();
  useEffect(() => {
    const handler = () => navigate('/login', { replace: true });
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [navigate]);

  if (isLoading) {
    // During a pending PWA reload keep the inline splash (now showing the
    // spinner + "Loading latest version..." message) instead of the animated
    // startup splash, so there is no blank flash mid-reload.
    if (pendingReload && !reloadSplashDismissed) return null;
    return <BrandedSplash />;
  }

  return (
    <>
    <InstallPrompt />
    <IOSInstallSheet />
    <PWAUpdatePrompt />
    <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* Public landing first so `/` is the marketing site, not a protected redirect */}
      <Route element={<LandingRoute />}>
        <Route element={<LandingLayout />}>
          <Route path="register" element={<PreRegisterPage />} />
          <Route path="register/player" element={<PlayerRegisterPage />} />
          <Route path="register/organization" element={<OrganizationRegisterPage />} />
          <Route path="register/seller" element={<SellerRegisterPage />} />
          <Route path="blog/:blogSlug" element={<BlogDetailPage />} />
          <Route path="subscription-plans/:id" element={<SubscriptionPlanDetailPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path=":slug" element={<LandingPage />} />
          <Route index element={<LandingPage />} />
        </Route>
      </Route>
      <Route element={<PublicRoute />}>
        <Route path="/register" element={<FeatureFlagGuard flag="app.registration_enabled"><PreRegisterPage /></FeatureFlagGuard>} />
        <Route path="/register/player" element={<FeatureFlagGuard flag="player.registration_enabled"><PlayerRegisterPage /></FeatureFlagGuard>} />
        <Route path="/register/organization" element={<FeatureFlagGuard flag="organization.registration_enabled"><OrganizationRegisterPage /></FeatureFlagGuard>} />
        <Route path="/register/seller" element={<FeatureFlagGuard flag="seller.registration_enabled"><SellerRegisterPage /></FeatureFlagGuard>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/temporary-reset-password" element={<TemporaryResetPasswordPage />} />
      </Route>
      {/* Paymob redirect destination — reachable by both guests and authenticated users.
          Must NOT be inside ProtectedRoute/LandingRoute/PublicRoute (they redirect away);
          the page itself routes to the correct workspace home or /login. */}
      <Route path="/payments/return" element={<PaymentReturnPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/app" element={<PlayerDashboardPage />} />
          <Route path="/browse" element={<BrowseBranchesPage />} />
          <Route path="/organisations/:orgId" element={<OrgStorefrontPage />} />
          <Route path="/branches/:branchId/resources" element={<BookingResourceListPage />} />
          <Route path="/book/:resourceId" element={<BookingFormPage />} />
          <Route path="/bookings" element={<MyBookingsPage />} />
          <Route path="/bookings/:id/confirmation" element={<BookingConfirmationPage />} />
          <Route path="/bookings/:id" element={<BookingDetailPage />} />
          <Route path="/matches" element={<MatchListPage />} />
          <Route path="/matches/:id" element={<MatchLobbyPage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/marketplace/products/:id" element={<ProductDetailPage />} />
          <Route path="/marketplace/player-products/:id" element={<PlayerProductDetailPage />} />
          <Route path="/marketplace/cart" element={<CartPage />} />
          <Route path="/marketplace/orders" element={<OrderListPage />} />
          <Route path="/marketplace/orders/:id" element={<OrderDetailPage />} />
          <Route path="/marketplace/seller" element={<SellerDashboardPage />} />
          <Route path="/marketplace/player/products" element={<PlayerProductsPage />} />
          <Route path="/marketplace/wishlist" element={<WishlistPage />} />
          <Route path="/tournaments" element={<TournamentListPage />} />
          <Route path="/tournaments/new" element={<TournamentCreatePage />} />
          <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
          <Route path="/academies" element={<AcademyListPage />} />
          <Route path="/academies/:id" element={<AcademyDetailPage />} />
          <Route path="/coaches" element={<CoachDirectoryPage />} />
          <Route path="/coaches/profile" element={<CoachProfilePage />} />
          <Route path="/coaches/sessions/me" element={<CoachSessionsPage />} />
          <Route path="/coaches/:id" element={<CoachDetailPage />} />
          <Route path="/coaches/:id/book" element={<CoachBookingPage />} />
          <Route path="/coaches/book/session" element={<FeatureFlagGuard flag="coaching.engine_booking_enabled"><EngineCoachBookingPage /></FeatureFlagGuard>} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/players" element={<PlayerSearchPage />} />
          <Route path="/players/:id" element={<PlayerPublicProfilePage />} />
          <Route path="/my/favorites" element={<PlayerFavoritesPage />} />
          <Route path="/my/statistics" element={<PlayerStatisticsPage />} />
          <Route path="/my/achievements" element={<PlayerAchievementsPage />} />
          <Route path="/my/qr" element={<PlayerQRProfilePage />} />
          <Route path="/my/devices" element={<PlayerDeviceManagementPage />} />
          <Route path="/my/wallet" element={<PlayerWalletPage />} />
          <Route path="/wallet/withdraw" element={<WithdrawalPage />} />
          <Route path="/my/payments" element={<PlayerPaymentsPage />} />
          <Route path="/my/rank-history" element={<PlayerRankHistoryPage />} />
          <Route path="/my/tournaments" element={<PlayerTournamentsPage />} />
          <Route path="/settings/appearance" element={<RoleAppearancePage />} />
          <Route path="/community/events" element={<CommunityEventsPage />} />
          <Route path="/messages" element={<FeatureFlagGuard flag="community.chat_enabled"><MessagesPage /></FeatureFlagGuard>} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/membership" element={<MembershipDashboard />} />
          <Route path="/membership/plans" element={<PlansPage />} />
          <Route path="/membership/rewards" element={<RewardsPage />} />
        </Route>
        <Route path="/coach" element={<CoachLayout />}>
          <Route index element={<CoachDashboard />} />
          <Route path="dashboard" element={<CoachDashboard />} />
          <Route path="sessions" element={<TodaySessions />} />
          <Route path="requests" element={<SessionRequests />} />
          <Route path="players" element={<CoachPlayersPage />} />
          <Route path="availability" element={<CoachProfilePage />} />
          <Route path="profile" element={<CoachProfilePage />} />
          <Route path="revenue" element={<CoachRevenuePage />} />
          <Route path="attendance" element={<CoachAttendancePage />} />
        </Route>
        <Route path="/referee" element={<RefereeRoute />}>
          <Route index element={<RefereeDashboardPage />} />
          <Route path="dashboard" element={<RefereeDashboardPage />} />
          <Route path="profile" element={<RefereeProfilePage />} />
          <Route path="availability" element={<RefereeAvailabilityPage />} />
          <Route path="assignments" element={<RefereeAssignmentsPage />} />
          <Route path="matches" element={<RefereeMatchHistoryPage />} />
          <Route path="statistics" element={<RefereeStatisticsPage />} />
        </Route>
        <Route path="/admin" element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
          <Route path="organisations" element={<OrganisationListPage />} />
          <Route path="organisations/new" element={<OrganisationListPage />} />
          <Route path="organisations/:id" element={<OrganisationListPage />} />
          <Route path="organisations/:orgId/branches" element={<BranchListPage />} />
          <Route path="branches/:branchId/resources" element={<ResourceListPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="roles" element={<RoleListPage />} />
          <Route path="permissions" element={<UIPermissionsPage />} />
          <Route path="ui-permissions" element={<Navigate to="/admin/permissions" replace />} />
          <Route path="feature-flags" element={<FeatureFlagsPage />} />
          <Route path="cms" element={<CmsPage />} />
          <Route path="payment-methods" element={<PaymentMethodsPage />} />
          <Route path="payment-gateways" element={<PaymentGatewaysPage />} />
          <Route path="ads" element={<AdsPage />} />
          <Route path="amenities" element={<AmenitiesPage />} />
          <Route path="banks" element={<BanksPage />} />
          <Route path="bank-branches" element={<BankBranchesPage />} />
          <Route path="users" element={<UserListPage />} />
          <Route path="organisation-types" element={<OrganisationTypesPage />} />
          <Route path="sports" element={<SportsPage />} />
          <Route path="countries" element={<CountriesPage />} />
          <Route path="currencies" element={<CurrenciesPage />} />
          <Route path="languages" element={<LanguagesPage />} />
          <Route path="app-settings" element={<AppSettingsPage />} />
          <Route path="translations" element={<TranslationsPage />} />
          <Route path="sidebar-layout" element={<SidebarLayoutPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="audit-logs" element={<AuditLogPage />} />
          <Route path="subscription" element={<SubscriptionPage />} />
          <Route path="subscription/requests" element={<SubscriptionRequestsPage />} />
          <Route path="security" element={<SecurityDashboard />} />
          <Route path="security/sessions" element={<SessionsPage />} />
          <Route path="security/failed-logins" element={<FailedLoginsPage />} />
          <Route path="security/uploads" element={<UploadSecurityPage />} />
          <Route path="security/system-health" element={<SystemHealthPage />} />
          <Route path="security/organisations" element={<OrganisationSecurityPage />} />
          <Route path="security/role-audit" element={<RoleAuditPage />} />
            <Route path="settlements" element={<SettlementListPage />} />
            <Route path="settlements/bookings" element={<BookingSettlementPage />} />
            <Route path="finance" element={<FinanceDashboardPage />} />
            <Route path="finance/ledger" element={<LedgerViewerPage />} />
            <Route path="finance/reports" element={<ReportCenterPage />} />
            <Route path="financial-ops" element={<FinancialOpsDashboard />} />
            <Route path="withdrawal-requests" element={<WithdrawalRequestsPage />} />
            <Route path="withdrawals" element={<WithdrawalQueuePage />} />
            <Route path="coupons" element={<CouponListPage />} />
            <Route path="design-tokens" element={<DesignTokensPage />} />
            <Route path="tournaments" element={<TournamentAdminPage />} />
            <Route path="tournament/dashboard" element={<TournamentDashboardPage />} />
            <Route path="tournament/list" element={<TournamentListAdminPage />} />
            <Route path="tournament/list/:id" element={<TournamentDetailAdminPage />} />
            <Route path="tournament/matches" element={<TournamentMatchesAdminPage />} />
            <Route path="league/dashboard" element={<LeagueDashboardPage />} />
            <Route path="league/seasons" element={<SeasonListPage />} />
            <Route path="league/list" element={<LeagueListPage />} />
            <Route path="league/list/:id" element={<LeagueDetailPage />} />
            <Route path="league/divisions" element={<DivisionManagePage />} />
            <Route path="league/divisions/:leagueId" element={<DivisionManagePage />} />
            <Route path="academies" element={<AcademyAdminPage />} />
            <Route path="academy/dashboard" element={<AcademyDashboardPage />} />
            <Route path="academy/programs" element={<AcademyProgramsPage />} />
            <Route path="academy/groups" element={<AcademyGroupsPage />} />
            <Route path="academy/enrollments" element={<AcademyEnrollmentsPage />} />
            <Route path="academy/attendance" element={<AcademyAttendancePage />} />
            <Route path="membership/plans" element={<MembershipPlansPage />} />
            <Route path="membership/campaigns" element={<CampaignsPage />} />
            <Route path="membership/rewards" element={<RewardsAdminPage />} />
            <Route path="pricing/rules" element={<PricingRulesPage />} />
            <Route path="pricing/preview" element={<PricePreviewPage />} />
            <Route path="coaches" element={<CoachAdminPage />} />
            <Route path="community-events" element={<CommunityEventsAdminPage />} />
          <Route path="notifications/broadcast" element={<AdminBroadcastPage />} />
          <Route path="notifications/analytics" element={<AdminAnalyticsPage />} />
          <Route path="notifications/dead-letters" element={<AdminDeadLettersPage />} />
          <Route path="notifications/templates" element={<AdminTemplatesPage />} />
          <Route path="notification-types" element={<NotificationTypesPage />} />
          <Route path="notifications/config" element={<NotificationConfigPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="system" element={<SystemAdminPage />} />
          <Route path="membership" element={<MembershipPage />} />
          <Route path="product-categories" element={<ProductCategoriesPage />} />
            <Route path="marketplace/products" element={<MarketplaceProductsPage />} />
            <Route path="marketplace/products/:id" element={<AdminProductDetailPage />} />
            <Route path="marketplace/orders" element={<MarketplaceOrdersPage />} />
          <Route path="marketplace/sellers" element={<MarketplaceSellersPage />} />
          <Route path="marketplace/upgrade-requests" element={<MarketplaceUpgradeRequestsPage />} />
          <Route path="marketplace/reviews" element={<MarketplaceReviewsPage />} />
          <Route path="brands" element={<BrandsPage />} />
          <Route path="tags" element={<TagsPage />} />
          <Route path="marketplace/shipping-rates" element={<AdminShippingRatesPage />} />
          <Route path="approvals" element={<AdminApprovalsPage />} />
          <Route path="branch-access" element={<AdminBranchAccessPage />} />
          <Route path="bookings" element={<AdminBookingsPage />} />
          <Route path="reception" element={<ReceptionDashboard />} />
          <Route path="support/tickets" element={<SupportTicketsPage />} />
          <Route path="queues" element={<QueueManagementPage />} />
          <Route path="webhooks" element={<WebhooksPage />} />
          <Route path="integration/api-keys" element={<APIDashboardPage />} />
          <Route path="inventory/warehouses" element={<WarehousesPage />} />
          <Route path="inventory/suppliers" element={<SuppliersPage />} />
          <Route path="inventory/purchase-orders" element={<PurchaseOrdersPage />} />
            <Route path="inventory/stock" element={<InventoryPage />} />
            <Route path="accounting/dashboard" element={<AccountingDashboardPage />} />
            <Route path="accounting/accounts" element={<ChartOfAccountsPage />} />
            <Route path="accounting/periods" element={<AccountingPeriodsPage />} />
            <Route path="accounting/ledger" element={<GeneralLedgerPage />} />
            <Route path="accounting/journal" element={<JournalEntryPage />} />
            <Route path="accounting/invoices" element={<InvoicesPage />} />
            <Route path="accounting/tax-rates" element={<TaxRatesPage />} />
            <Route path="accounting/mappings" element={<EventMappingsPage />} />
            <Route path="accounting/templates" element={<AccountingTemplatesPage />} />
            <Route path="accounting/tax-report" element={<TaxSummaryPage />} />
            <Route path="crm/dashboard" element={<CRMDashboardPage />} />
            <Route path="crm/customers" element={<CustomerListPage />} />
            <Route path="crm/customers/:id" element={<CustomerDetailPage />} />
            <Route path="crm/segments" element={<SegmentsPage />} />
            <Route path="crm/leads" element={<LeadsPage />} />
            <Route path="crm/campaigns" element={<CRMCampaignsPage />} />
            <Route path="crm/communications" element={<CommunicationsPage />} />
            <Route path="hr/dashboard" element={<HRDashboardPage />} />
            <Route path="hr/departments" element={<DepartmentListPage />} />
            <Route path="hr/employees" element={<EmployeeListPage />} />
            <Route path="hr/employees/:id" element={<EmployeeDetailPage />} />
            <Route path="hr/leave" element={<LeaveManagementPage />} />
            <Route path="hr/attendance" element={<AttendancePage />} />
            <Route path="hr/payroll" element={<PayrollPage />} />
            <Route path="bi/dashboard" element={<BIDashboardPage />} />
            <Route path="bi/observability" element={<ObservabilityPage />} />
            <Route path="sports-engine" element={<SportsEnginePage />} />
            <Route path="mobile/dashboard" element={<MobileDashboardPage />} />
         </Route>
        </Route>

        {/* ── ORGANISATION MANAGEMENT ── */}
        <Route path="/org/:orgId" element={<OrgRoute />}>
          <Route path="pending-approval" element={<OrgPendingApprovalPage />} />
          <Route element={<OrgApprovedGuard />}>
          <Route element={<OrgLayout />}>
            <Route path="dashboard" element={<OrgDashboardPage />} />
            <Route path="bookings" element={<OrgBookingsPage />} />
            <Route path="marketplace" element={<OrgMarketplacePage />} />
            <Route path="orders" element={<OrgOrdersPage />} />
            <Route path="staff" element={<OrgStaffPage />} />
            <Route path="members" element={<OrgMembersPage />} />
            <Route path="coaches" element={<OrgCoachesPage />} />
            <Route path="finance" element={<OrgFinancePage />} />
            <Route path="finance/bookings" element={<OrgBookingSettlementsPage />} />
            <Route path="accounting" element={<Navigate to="accounting/dashboard" replace />} />
            <Route path="accounting/dashboard" element={<OrgAccountingDashboardPage />} />
            <Route path="accounting/coa" element={<OrgChartOfAccountsPage />} />
            <Route path="accounting/journal" element={<OrgJournalPage />} />
            <Route path="accounting/reports" element={<Navigate to="reports/trial-balance" replace />} />
            <Route path="accounting/reports/:reportType" element={<OrgFinancialReportsPage />} />
            <Route path="accounting/tax-summary" element={<OrgTaxSummaryPage />} />
            <Route path="subscription" element={<OrgSubscriptionPage />} />
            <Route path="announcements" element={<OrgAnnouncementsPage />} />
            <Route path="documents" element={<OrgDocumentsPage />} />
            <Route path="gallery" element={<OrgGalleryPage />} />
            <Route path="reports" element={<OrgReportsPage />} />
            <Route path="profile" element={<OrgProfilePage />} />
            <Route path="branches" element={<OrgBranchesPage />} />
            <Route path="working-hours" element={<Navigate to="branches" replace />} />
            <Route path="payment-settings" element={<Navigate to="branches" replace />} />
            <Route path="reviews" element={<OrgReviewsPage />} />
            <Route path="referees" element={<OrgRefereesPage />} />
            <Route path="academies" element={<OrgAcademiesPage />} />
            <Route path="leagues" element={<OrgLeaguesPage />} />
            <Route path="tournaments" element={<OrgTournamentsPage />} />
            <Route path="verification" element={<OrgVerificationPage />} />
            <Route path="shipping-rates" element={<OrgSettingsPage />} />
            <Route path="settings" element={<Navigate to="shipping-rates" replace />} />
          </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <SocketProvider>
            <ToastProvider>
              <I18nProvider>
                <ErrorBoundary>
                  <AppContent />
                  <RealtimeCacheUpdater />
                  <ConnectionStatus />
                  <CommandPalette />
                </ErrorBoundary>
              </I18nProvider>
            </ToastProvider>
          </SocketProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

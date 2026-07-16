import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { FeatureFlagGuard } from './components/FeatureFlagGuard';
import { useFeatureFlag } from './hooks/useFeatureFlag';
import NotificationBell from './components/notifications/NotificationBell';
import OfflineBanner from './components/pwa/OfflineBanner';
import PWAUpdatePrompt from './components/pwa/PWAUpdatePrompt';
import IOSInstallSheet from './components/pwa/IOSInstallSheet';
import RoleSwitcher from './components/workspace/RoleSwitcher';
import { isOrganisationPendingApproval, orgPortalPath } from './utils/organisation';

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
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('./pages/home/DashboardPage'));
const BrowseBranchesPage = lazy(() => import('./pages/booking/BrowseBranchesPage'));
const OrgStorefrontPage = lazy(() => import('./pages/organisations/OrgStorefrontPage'));
const BookingResourceListPage = lazy(() => import('./pages/booking/ResourceListPage'));
const BookingFormPage = lazy(() => import('./pages/booking/BookingFormPage'));
const BookingConfirmationPage = lazy(() => import('./pages/booking/BookingConfirmationPage'));
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
const CoachDirectoryPage = lazy(() => import('./pages/coaches/CoachDirectoryPage'));
const CoachProfilePage = lazy(() => import('./pages/coaches/CoachProfilePage'));
const CoachDetailPage = lazy(() => import('./pages/coaches/CoachDetailPage'));
const CoachBookingPage = lazy(() => import('./pages/coaches/CoachBookingPage'));
const EngineCoachBookingPage = lazy(() => import('./pages/coaches/EngineCoachBookingPage'));
const CoachSessionsPage = lazy(() => import('./pages/coaches/CoachSessionsPage'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const RoleAppearancePage = lazy(() => import('./pages/settings/RoleAppearancePage'));
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'));
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
const SubscriptionUpgradeRequestsPage = lazy(() => import('./pages/admin/subscription/SubscriptionUpgradeRequestsPage'));
const SettlementListPage = lazy(() => import('./pages/admin/settlements/SettlementListPage'));
const AdminFinancePage = lazy(() => import('./pages/admin/AdminFinancePage'));
const ProductCategoriesPage = lazy(() => import('./pages/admin/product-categories/ProductCategoriesPage'));
const FeatureFlagsPage = lazy(() => import('./pages/admin/feature-flags/FeatureFlagsPage'));
const PaymentMethodsPage = lazy(() => import('./pages/admin/payment-methods/PaymentMethodsPage'));
const PaymentGatewaysPage = lazy(() => import('./pages/admin/payment-gateways/PaymentGatewaysPage'));
const WithdrawalRequestsPage = lazy(() => import('./pages/admin/financial/WithdrawalRequestsPage'));
const CouponListPage = lazy(() => import('./pages/admin/coupons/CouponListPage'));
const DesignTokensPage = lazy(() => import('./pages/admin/design-tokens/DesignTokensPage'));
const TournamentAdminPage = lazy(() => import('./pages/admin/tournaments/TournamentAdminPage'));
const AcademyAdminPage = lazy(() => import('./pages/admin/academies/AcademyAdminPage'));
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
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'));
const MatchListPage = lazy(() => import('./pages/booking/MatchListPage'));
const MatchLobbyPage = lazy(() => import('./pages/booking/MatchLobbyPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000, refetchOnWindowFocus: false },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
      <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
    </div>
  );
}

function BrandedSplash() {
  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col items-center justify-center gap-6 cz-fade-enter cz-pt-safe">
      <SiteLogo size="lg" variant="primary" />
      <div className="animate-spin h-7 w-7 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
    </div>
  );
}

function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const isAdmin = user?.roles?.some(r => r === 'super-admin' || r === 'admin' || r === 'super_admin');
  if (isAdmin && !location.pathname.startsWith('/admin') && !location.pathname.startsWith('/org') && !location.pathname.startsWith('/notifications')) {
    return <Navigate to="/admin" replace />;
  }
  return <Outlet />;
}

function LandingRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  if (isAuthenticated) {
    const isAdmin = user?.roles?.some(r => r === 'super-admin' || r === 'super_admin');
    if (isAdmin) return <Navigate to="/admin" replace />;
    const hasSellingRole = user?.roles?.some((r: string) => ['shop-admin', 'org-admin'].includes(r));
    return <Navigate to={hasSellingRole ? '/marketplace/seller' : '/app'} replace />;
  }
  return <Outlet />;
}

function AdminRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const isAdmin = user?.roles?.some(r => r === 'super-admin' || r === 'super_admin' || r === 'admin');
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
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
  if (isAuthenticated) return <Navigate to="/app" replace />;
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

  const orgScopes = user?.organisations || [];
  const firstOrg = orgScopes[0];
  const orgNavPath = firstOrg ? orgPortalPath(firstOrg) : null;
  const orgNavLabel = firstOrg?.name?.trim() || t('nav.organization');

  const navLinkClass = (path: string) =>
    `text-sm transition-colors ${
      isActive(path) ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]'
    }`;

  return (
    <nav className="bg-[var(--color-surface)] border-b border-[var(--color-border)] sticky top-0 z-50 cz-pt-safe cz-px-safe">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4 min-w-0">
            <SiteLogo to="/app" size="md" variant="primary" className="mr-1 shrink-0" />
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
              {orgScopes.length > 0 && orgNavPath && (
                <Link to={orgNavPath} title={orgNavLabel} className="text-sm font-semibold px-3 py-1.5 bg-[var(--color-accent)] text-[var(--color-accent-text)] rounded-lg hover:opacity-90 max-w-[200px] truncate">
                  {orgNavLabel}
                </Link>
              )}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <RoleSwitcher />
            <NotificationBell />
            <Link to="/profile" className="text-sm text-[var(--color-text-muted)]">{user?.fullName || t('nav.profile')}</Link>
            <button onClick={handleLogout} className="text-sm text-[var(--color-text-muted)] hover:text-red-500">{t('nav.logout')}</button>
          </div>
          <div className="flex md:hidden items-center gap-1">
            {orgScopes.length > 0 && orgNavPath && (
              <Link
                to={orgNavPath}
                title={orgNavLabel}
                className="text-xs font-semibold px-2.5 py-1.5 bg-[var(--color-accent)] text-[var(--color-accent-text)] rounded-lg hover:opacity-90 shrink-0 max-w-[120px] truncate"
              >
                {orgNavLabel}
              </Link>
            )}
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
    <div className="flex flex-col h-dvh bg-[var(--color-bg)]">
      <LoginSplash />
      <WelcomeModal />
      <OfflineBanner />
      <Navbar />
      <main className="flex-1 overflow-y-auto min-h-0 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 cz-reserve-bnav md:pb-6 overflow-x-hidden">
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
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const initTheme = useThemeStore((s) => s.init);
  const fetchFlags = useFeatureFlagsStore((s) => s.fetch);
  const fetchAppearance = useAppearanceStore((s) => s.fetch);
  const fetchAppSettings = useAppSettingsStore((s) => s.fetch);
  const hydrateCurrency = useCurrencyStore((s) => s.hydrate);
  const loadSymbolRegistry = useCurrencyStore((s) => s.loadSymbolRegistry);
  const detectCurrency = useCurrencyStore((s) => s.detect);

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

  const navigate = useNavigate();
  useEffect(() => {
    const handler = () => navigate('/login', { replace: true });
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [navigate]);

  if (isLoading) {
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
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/browse" element={<BrowseBranchesPage />} />
          <Route path="/organisations/:orgId" element={<OrgStorefrontPage />} />
          <Route path="/branches/:branchId/resources" element={<BookingResourceListPage />} />
          <Route path="/book/:resourceId" element={<BookingFormPage />} />
          <Route path="/bookings" element={<MyBookingsPage />} />
          <Route path="/bookings/:id/confirmation" element={<BookingConfirmationPage />} />
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
          <Route path="/settings/appearance" element={<RoleAppearancePage />} />
          <Route path="/community/events" element={<CommunityEventsPage />} />
          <Route path="/messages" element={<FeatureFlagGuard flag="community.chat_enabled"><MessagesPage /></FeatureFlagGuard>} />
          <Route path="/notifications" element={<NotificationsPage />} />
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
          <Route path="subscription/upgrade-requests" element={<SubscriptionUpgradeRequestsPage />} />
          <Route path="security" element={<SecurityDashboard />} />
          <Route path="security/sessions" element={<SessionsPage />} />
          <Route path="security/failed-logins" element={<FailedLoginsPage />} />
          <Route path="security/uploads" element={<UploadSecurityPage />} />
          <Route path="security/system-health" element={<SystemHealthPage />} />
          <Route path="security/organisations" element={<OrganisationSecurityPage />} />
          <Route path="security/role-audit" element={<RoleAuditPage />} />
            <Route path="settlements" element={<SettlementListPage />} />
            <Route path="finance" element={<AdminFinancePage />} />
            <Route path="withdrawal-requests" element={<WithdrawalRequestsPage />} />
            <Route path="coupons" element={<CouponListPage />} />
            <Route path="design-tokens" element={<DesignTokensPage />} />
            <Route path="tournaments" element={<TournamentAdminPage />} />
            <Route path="academies" element={<AcademyAdminPage />} />
            <Route path="coaches" element={<CoachAdminPage />} />
            <Route path="community-events" element={<CommunityEventsAdminPage />} />
          <Route path="notifications/broadcast" element={<AdminBroadcastPage />} />
          <Route path="notifications/analytics" element={<AdminAnalyticsPage />} />
          <Route path="notifications/dead-letters" element={<AdminDeadLettersPage />} />
          <Route path="notifications/templates" element={<AdminTemplatesPage />} />
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
            <Route path="settings" element={<OrgSettingsPage />} />
            <Route path="shipping-rates" element={<Navigate to="settings" replace />} />
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
          <ToastProvider>
            <I18nProvider>
              <ErrorBoundary>
                <AppContent />
              </ErrorBoundary>
            </I18nProvider>
          </ToastProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

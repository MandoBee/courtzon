import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { useCan } from '../../hooks/useCan';
import { useThemeStore } from '../../store/theme.store';
import { useFeatureFlagsStore } from '../../store/feature-flags.store';
import api from '../../services/api';
import SiteLogo from '../branding/SiteLogo';

interface NavItem {
  label: string;
  icon?: string;
  path: string;
  permissionKey: string;
  requiredFlag?: string;
  children?: NavItem[];
}

function buildNavItems(can: (perm: string) => boolean, flag: (key: string) => boolean, savedLayout?: Map<string | null, string[]>): NavItem[] {
  const allItems: NavItem[] = [
    { label: 'Dashboard', icon: '📊', path: '/admin', permissionKey: 'sidebar.dashboard' },
    { label: 'Reports', icon: '📈', path: '/admin/reports', permissionKey: 'sidebar.reports' },
    {
      label: 'Organisations', icon: '🏢', path: '/admin/organisations', permissionKey: 'sidebar.organisations',
      children: [
        { label: 'All Organisations', path: '/admin/organisations', permissionKey: 'sidebar.organisations' },
        { label: 'Branch Access', path: '/admin/branch-access', permissionKey: 'sidebar.branch-access' },
        { label: 'All Bookings', path: '/admin/bookings', permissionKey: 'sidebar.admin-bookings' },
        { label: 'Subscription Plans', path: '/admin/subscription', permissionKey: 'sidebar.subscription' },
        { label: 'Subscription Requests', path: '/admin/subscription/requests', permissionKey: 'sidebar.subscription-requests' },
        { label: 'Types', path: '/admin/organisation-types', permissionKey: 'sidebar.organisation-types' },
        { label: 'Settlements', path: '/admin/settlements', permissionKey: 'sidebar.settlements' },
      ],
    },
    {
      label: 'Roles & Permissions', icon: '🔐', path: '/admin/roles', permissionKey: 'sidebar.roles',
      children: [
        { label: 'All Roles', path: '/admin/roles', permissionKey: 'sidebar.roles' },
        { label: 'Permissions', path: '/admin/permissions', permissionKey: 'sidebar.permissions' },
      ],
    },
    {
      label: 'Marketplace', icon: '🛒', path: '/admin/product-categories', permissionKey: 'sidebar.marketplace', requiredFlag: 'app.marketplace_enabled',
      children: [
        { label: 'Products', path: '/admin/marketplace/products', permissionKey: 'sidebar.marketplace-products' },
        { label: 'Orders', path: '/admin/marketplace/orders', permissionKey: 'sidebar.marketplace-orders' },
        { label: 'Sellers', path: '/admin/marketplace/sellers', permissionKey: 'sidebar.marketplace-sellers' },
        { label: 'Product Categories', path: '/admin/product-categories', permissionKey: 'sidebar.product-categories' },
        { label: 'Registrations', path: '/admin/approvals', permissionKey: 'sidebar.marketplace-approvals' },
        { label: 'Reviews', path: '/admin/marketplace/reviews', permissionKey: 'sidebar.marketplace-reviews' },
        { label: 'Brands', path: '/admin/brands', permissionKey: 'sidebar.brands' },
        { label: 'Tags', path: '/admin/tags', permissionKey: 'sidebar.tags' },
      ],
    },
    { label: 'Tournaments', icon: '🏆', path: '/admin/tournaments', permissionKey: 'sidebar.tournaments-admin' },
    { label: 'Academies', icon: '🎓', path: '/admin/academies', permissionKey: 'sidebar.academies-admin' },
    { label: 'Coaches', icon: '👨‍🏫', path: '/admin/coaches', permissionKey: 'sidebar.coaches-admin' },
    {
      label: 'Membership', icon: '⭐', path: '/admin/membership/plans', permissionKey: 'sidebar.membership',
      children: [
        { label: 'Plans', path: '/admin/membership/plans', permissionKey: 'membership.plans' },
        { label: 'Campaigns', path: '/admin/membership/campaigns', permissionKey: 'membership.campaigns' },
        { label: 'Rewards', path: '/admin/membership/rewards', permissionKey: 'membership.rewards' },
      ],
    },
    {
      label: 'Pricing', icon: '💰', path: '/admin/pricing/rules', permissionKey: 'sidebar.pricing',
      children: [
        { label: 'Rules', path: '/admin/pricing/rules', permissionKey: 'pricing.rules' },
        { label: 'Price Preview', path: '/admin/pricing/preview', permissionKey: 'pricing.preview' },
      ],
    },
    { label: 'Community Events', icon: '🎉', path: '/admin/community-events', permissionKey: 'sidebar.community-admin' },
    {
      label: 'Notifications', icon: '🔔', path: '/admin/notifications/broadcast', permissionKey: 'sidebar.notifications',
      children: [
        { label: 'Broadcast', path: '/admin/notifications/broadcast', permissionKey: 'notifications.broadcast' },
        { label: 'Analytics', path: '/admin/notifications/analytics', permissionKey: 'notifications.analytics' },
        { label: 'Dead Letters', path: '/admin/notifications/dead-letters', permissionKey: 'notifications.dead-letters' },
        { label: 'Templates', path: '/admin/notifications/templates', permissionKey: 'notifications.templates' },
      ],
    },
    { label: 'Ads', icon: '📢', path: '/admin/ads', permissionKey: 'sidebar.ads', requiredFlag: 'community.events_enabled' },
    {
      label: 'Admin Settings', icon: '⚙️', path: '/admin/sports', permissionKey: 'sidebar.admin-settings',
      children: [
        { label: 'Sports', path: '/admin/sports', permissionKey: 'sidebar.sports' },
        {
          label: 'Finance', path: '/admin/finance', permissionKey: 'sidebar.finance',
          children: [
            { label: 'Finance Dashboard', path: '/admin/finance', permissionKey: 'sidebar.finance-dashboard' },
            { label: 'Ledger', path: '/admin/finance/ledger', permissionKey: 'sidebar.finance-ledger' },
            { label: 'Reports', path: '/admin/finance/reports', permissionKey: 'sidebar.finance-reports' },
            { label: 'Withdrawal Requests', path: '/admin/withdrawal-requests', permissionKey: 'sidebar.withdrawal-requests' },
            { label: 'Coupons', path: '/admin/coupons', permissionKey: 'sidebar.coupons' },
            { label: 'Finance (Legacy)', path: '/admin/financial-ops', permissionKey: 'sidebar.finance-transactions' },
            { label: 'Banks', path: '/admin/banks', permissionKey: 'sidebar.banks' },
            { label: 'Bank Branches', path: '/admin/bank-branches', permissionKey: 'sidebar.bank-branches' },
          ],
        },
        {
          label: 'Payments Config', path: '/admin/payment-methods', permissionKey: 'sidebar.payment-methods',
          children: [
            { label: 'Payment Methods', path: '/admin/payment-methods', permissionKey: 'sidebar.payment-methods' },
            { label: 'Gateway Config', path: '/admin/payment-gateways', permissionKey: 'sidebar.payment-gateways' },
          ],
        },
        {
          label: 'Localization', icon: '🌍', path: '/admin/countries', permissionKey: 'sidebar.countries',
          children: [
            { label: 'Countries', path: '/admin/countries', permissionKey: 'sidebar.countries' },
            { label: 'Currencies', path: '/admin/currencies', permissionKey: 'sidebar.currencies' },
            { label: 'Languages', path: '/admin/languages', permissionKey: 'sidebar.languages' },
            { label: 'Translations', path: '/admin/translations', permissionKey: 'sidebar.translations' },
          ],
        },
        { label: 'Amenities', path: '/admin/amenities', permissionKey: 'sidebar.amenities' },
        {
          label: 'App Settings', path: '/admin/sidebar-layout', permissionKey: 'sidebar.app-settings-menu',
          children: [
            { label: 'Set Sidebar Layout', path: '/admin/sidebar-layout', permissionKey: 'sidebar.layout.manage' },
            { label: 'Branding', path: '/admin/app-settings', permissionKey: 'sidebar.app-settings' },
            { label: 'Appearance Studio', path: '/admin/design-tokens', permissionKey: 'sidebar.design-tokens' },
            { label: 'CMS', path: '/admin/cms', permissionKey: 'sidebar.cms' },
          ],
        },
      ],
    },
    { label: 'Users', icon: '👥', path: '/admin/users', permissionKey: 'sidebar.users' },
    {
      label: 'Security', icon: '🛡️', path: '/admin/security', permissionKey: 'sidebar.security-dashboard',
      children: [
        { label: 'Security Dashboard', path: '/admin/security', permissionKey: 'sidebar.security-dashboard' },
        { label: 'Active Sessions', path: '/admin/security/sessions', permissionKey: 'sidebar.active-sessions' },
        { label: 'Failed Logins', path: '/admin/security/failed-logins', permissionKey: 'sidebar.failed-logins' },
        { label: 'Upload Security', path: '/admin/security/uploads', permissionKey: 'sidebar.upload-security' },
        { label: 'System Health', path: '/admin/security/system-health', permissionKey: 'sidebar.system-health' },
        { label: 'Audit Log', path: '/admin/audit-logs', permissionKey: 'sidebar.audit' },
        { label: 'Feature Flags', path: '/admin/feature-flags', permissionKey: 'sidebar.feature-flags' },
      ],
    },
  ];

  const filterItem = (item: NavItem): boolean => {
    if (item.requiredFlag && !flag(item.requiredFlag)) return false;
    if (item.children && item.children.length > 0) {
      item.children = item.children.filter(filterItem);
      return item.children.length > 0;
    }
    return can(item.permissionKey);
  };

  if (savedLayout) {
    const leaf = allItems.filter((i) => !i.children);
    const sections = allItems.filter((i) => i.children);
    const topOrder = savedLayout.get(null);
    if (topOrder) {
      const orderedLeaf = topOrder.map((k) => leaf.find((i) => i.permissionKey === k)).filter(Boolean) as NavItem[];
      const remainingLeaf = leaf.filter((i) => !topOrder.includes(i.permissionKey));
      allItems.length = 0;
      allItems.push(...orderedLeaf, ...sections, ...remainingLeaf);
    }
    for (const section of sections) {
      const order = savedLayout.get(section.permissionKey);
      if (order && section.children) {
        const ordered = order.map((k) => section.children!.find((c) => c.permissionKey === k)).filter(Boolean) as NavItem[];
        const remaining = section.children.filter((c) => !order.includes(c.permissionKey));
        section.children = [...ordered, ...remaining];
      }
    }
  }

  return allItems.filter(filterItem);
}

function renderNavItem(
  item: NavItem,
  openMenus: Record<string, boolean>,
  toggleMenu: (label: string) => void,
  isActive: (item: NavItem) => boolean,
  location: ReturnType<typeof useLocation>,
  depth = 0,
): React.ReactNode {
  const hasChildren = item.children && item.children.length > 0;
  const isOpen = openMenus[item.label];
  const paddingLeft = depth > 0 ? 8 + depth * 4 : 0;

  if (hasChildren) {
    return (
      <div key={item.path}>
        <button
          onClick={() => toggleMenu(item.label)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${
            isActive(item) ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'text-[var(--color-text)] hover:bg-[var(--color-border)] hover:bg-[var(--color-bg)]'
          }`}
          style={{ paddingLeft: paddingLeft > 0 ? paddingLeft : undefined }}
        >
          {depth === 0 && <span>{item.icon}</span>}
          <span className="flex-1 text-left">{item.label}</span>
          <span className="text-xs">{isOpen ? '▼' : '▶'}</span>
        </button>
        {isOpen && (
          <div className={depth === 0 ? 'ml-8 mt-1 space-y-1' : 'ml-4 mt-1 space-y-1'}>
            {item.children!.map((child) => renderNavItem(child, openMenus, toggleMenu, isActive, location, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      key={item.path}
      to={item.path}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${
        location.pathname === item.path ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
      }`}
      style={{ paddingLeft: paddingLeft > 0 ? paddingLeft : undefined }}
    >
      {depth === 0 && <span>{item.icon}</span>}
      <span className="flex-1 text-left">{item.label}</span>
    </Link>
  );
}

export default function AdminSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const { can } = useCan();
  const { resolved: theme, setMode } = useThemeStore();
  const [collapsed, setCollapsed] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const flags = useFeatureFlagsStore((s) => s.flags);
  const flag = (key: string) => !!flags[key];

  const { data: layoutData } = useQuery({
    queryKey: ['sidebar-layout'],
    queryFn: () => api.get('/sidebar/layout').then((r) => r.data),
  });

  const savedLayout = useMemo(() => {
    const map = new Map<string | null, string[]>();
    if (layoutData?.data) {
      for (const entry of layoutData.data) {
        map.set(entry.parentKey, entry.orderedKeys);
      }
    }
    return map;
  }, [layoutData]);

  const navItems = useMemo(() => buildNavItems(can, flag, savedLayout), [can, flag, savedLayout]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (item: NavItem) => {
    if (item.path === '/admin') return location.pathname === '/admin';
    if (item.children) {
      const childActive = (items: NavItem[]): boolean =>
        items.some((c) => location.pathname === c.path || (c.children ? childActive(c.children) : false));
      return childActive(item.children) || location.pathname.startsWith(item.path);
    }
    return location.pathname === item.path;
  };

  if (collapsed) {
    return (
      <aside className="w-16 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col items-center py-4 gap-4">
        <button onClick={() => setCollapsed(false)} className="text-xl" aria-label="Expand sidebar">☰</button>
        <SiteLogo to="/admin" size="sm" showText={false} />
        {navItems.map((item) => {
          const linkPath = item.children?.[0]?.path || item.path;
          return (
            <Link
              key={item.path}
              to={linkPath}
              className={`text-lg p-2 rounded-[var(--radius-md)] transition-colors ${
                isActive(item) ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
              title={item.label}
            >
              {item.icon}
            </Link>
          );
        })}
        <div className="mt-auto flex flex-col items-center gap-2 pt-4 border-t border-[var(--color-border)] w-full px-2">
          <Link to="/admin/profile" className="text-lg p-2 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]" title="Profile">👤</Link>
          <button onClick={() => setMode(theme === 'dark' ? 'light' : 'dark')} className="text-lg p-2 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          <button
            onClick={handleLogout}
            className="text-lg p-2 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
            title="Logout"
          >
            🚪
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col h-screen sticky top-0 overflow-y-auto">
      <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
        <SiteLogo to="/admin" size="sm" />
        <button onClick={() => setCollapsed(true)} className="text-sm text-[var(--color-text-muted)] shrink-0" aria-label="Collapse sidebar">◀</button>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => renderNavItem(item, openMenus, toggleMenu, isActive, location))}
      </nav>
      <div className="sticky bottom-0 p-3 border-t border-[var(--color-border)] space-y-1 bg-[var(--color-surface)]">
        <Link to="/admin/profile" className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)] hover:bg-[var(--color-bg)]">
          👤 Profile
        </Link>
        {can('sidebar.back-to-app') && (
        <Link to="/" className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-border)] hover:bg-[var(--color-bg)]">
          ← Back to App
        </Link>
        )}
        <button onClick={() => setMode(theme === 'dark' ? 'light' : 'dark')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
          {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors"
        >
          🚪 Logout
        </button>
      </div>
    </aside>
  );
}

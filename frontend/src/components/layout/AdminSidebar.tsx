import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { useCan } from '../../hooks/useCan';
import { useThemeStore } from '../../store/theme.store';
import { useFeatureFlagsStore } from '../../store/feature-flags.store';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import SiteLogo from '../branding/SiteLogo';
import { resolveAdminNav, type ResolvedNavItem } from '../../navigation';

function renderNavItem(
  item: ResolvedNavItem,
  openMenus: Record<string, boolean>,
  toggleMenu: (label: string) => void,
  isActive: (item: ResolvedNavItem) => boolean,
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
  const { t } = useTranslation();

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

  const navItems = useMemo(() => resolveAdminNav(t, can, flag, savedLayout), [t, can, flag, savedLayout]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (item: ResolvedNavItem) => {
    if (item.path === '/admin') return location.pathname === '/admin';
    if (item.children) {
      const childActive = (items: ResolvedNavItem[]): boolean =>
        items.some((c) => location.pathname === c.path || (c.children ? childActive(c.children) : false));
      return childActive(item.children) || location.pathname.startsWith(item.path);
    }
    return location.pathname === item.path;
  };

  if (collapsed) {
    return (
      <aside className="w-16 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col items-center py-4 gap-4">
        <button onClick={() => setCollapsed(false)} className="text-xl" aria-label={t('admin.sidebar.expand')}>☰</button>
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
          <Link to="/admin/profile" className="text-lg p-2 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]" title={t('admin.sidebar.profile')}>👤</Link>
          <button onClick={() => setMode(theme === 'dark' ? 'light' : 'dark')} className="text-lg p-2 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          <button
            onClick={handleLogout}
            className="text-lg p-2 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
            title={t('admin.sidebar.logout')}
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
        <button onClick={() => setCollapsed(true)} className="text-sm text-[var(--color-text-muted)] shrink-0" aria-label={t('admin.sidebar.collapse')}>◀</button>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => renderNavItem(item, openMenus, toggleMenu, isActive, location))}
      </nav>
      <div className="sticky bottom-0 p-3 border-t border-[var(--color-border)] space-y-1 bg-[var(--color-surface)]">
        <Link to="/admin/profile" className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)] hover:bg-[var(--color-bg)]">
          👤 {t('admin.sidebar.profile')}
        </Link>
        {can('sidebar.back-to-app') && (
        <Link to="/" className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-border)] hover:bg-[var(--color-bg)]">
          ← {t('common.back')}
        </Link>
        )}
        <button onClick={() => setMode(theme === 'dark' ? 'light' : 'dark')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
          {theme === 'dark' ? '☀️' : '🌙'} {theme === 'dark' ? t('common.light_mode') : t('common.dark_mode')}
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors"
        >
          🚪 {t('admin.sidebar.logout')}
        </button>
      </div>
    </aside>
  );
}

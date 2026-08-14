import { useState, useMemo, useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useWorkspaceStore } from '../../store/workspace.store';
import { useCan } from '../../hooks/useCan';
import { useThemeStore } from '../../store/theme.store';
import { EntityImage } from '../ui';
import SiteLogo from '../branding/SiteLogo';
import api from '../../services/api';
import { t } from '../../i18n';
import { resolveOrgNav } from '../../navigation';
import type { ResolvedNavItem } from '../../navigation/types';

interface OrgInfo {
  id: number;
  name: string;
  logoUrl: string | null;
}

function renderNavItem(
  item: ResolvedNavItem,
  openMenus: Record<string, boolean>,
  toggleMenu: (label: string) => void,
  location: ReturnType<typeof useLocation>,
  depth = 0,
): React.ReactNode {
  const hasChildren = item.children && item.children.length > 0;
  const isOpen = openMenus[item.id];
  const paddingLeft = depth > 0 ? 8 + depth * 4 : 0;

  if (hasChildren) {
    const childActive = item.children!.some((c) => c.children?.length ? c.children.some((cc) => location.pathname === cc.path) : location.pathname === c.path);
    return (
      <div key={item.id}>
        <button
          onClick={() => toggleMenu(item.id)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm font-medium transition-colors ${
            childActive ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'text-[var(--color-text)] hover:bg-[var(--color-bg)]'
          }`}
          style={{ paddingLeft: paddingLeft > 0 ? paddingLeft : undefined }}
        >
          {depth === 0 && <span>{item.icon}</span>}
          <span className="flex-1 text-left">{item.label}</span>
          <span className="text-xs">{isOpen ? '▼' : '▶'}</span>
        </button>
        {isOpen && (
          <div className={depth === 0 ? 'ml-8 mt-1 space-y-1' : 'ml-4 mt-1 space-y-1'}>
            {item.children!.map((child) => renderNavItem(child, openMenus, toggleMenu, location, depth + 1))}
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
        location.pathname === item.path ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'text-[var(--color-text)] hover:bg-[var(--color-bg)]'
      }`}
      style={{ paddingLeft: paddingLeft > 0 ? paddingLeft : undefined }}
    >
      {depth === 0 && <span>{item.icon}</span>}
      <span className="flex-1 text-left">{item.label}</span>
    </Link>
  );
}

export default function OrgSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { orgId } = useParams<{ orgId: string }>();
  const logout = useAuthStore((s) => s.logout);
  const { can } = useCan();
  const { resolved: theme, setMode } = useThemeStore();
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const [collapsed, setCollapsed] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);

  useEffect(() => {
    if (!orgId) return;
    api.get(`/org/${orgId}/info`).then((res) => {
      const data = res.data;
      setOrgInfo({ id: data.id, name: data.name, logoUrl: data.logo_url || null });
    }).catch(() => {});
  }, [orgId]);

  const navItems = useMemo(() => {
    if (!orgId) return [];
    return resolveOrgNav(can, orgId, t);
  }, [can, orgId]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleBackToPlayer = () => {
    setActiveWorkspace('player');
    navigate('/app');
  };

  const toggleMenu = (id: string) => {
    setOpenMenus((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!orgId) return null;

  if (collapsed) {
    return (
      <aside className="w-16 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col items-center py-4 gap-4">
        <button onClick={() => setCollapsed(false)} className="text-xl">☰</button>
        {navItems.map((item) => {
          const linkPath = item.children?.[0]?.path || item.path;
          return (
            <Link
              key={item.path}
              to={linkPath}
              className={`text-lg p-2 rounded-[var(--radius-md)] transition-colors ${
                location.pathname === linkPath || (item.children && item.children.some((c) => location.pathname === c.path)) ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
              title={item.label}
            >
              {item.icon}
            </Link>
          );
        })}
        <div className="mt-auto flex flex-col items-center gap-2 pt-4 border-t border-[var(--color-border)] w-full px-2">
          <button onClick={() => setMode(theme === 'dark' ? 'light' : 'dark')} className="text-lg p-2 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? '☀️' : '🌙'}</button>
          <button onClick={handleLogout} className="text-lg p-2 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors" title="Logout">🚪</button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col h-full sticky top-0 overflow-y-auto">
      <div className="p-4 border-b border-[var(--color-border)] space-y-3">
        <SiteLogo to="/app" size="sm" variant="primary" className="shrink-0" />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <EntityImage
              src={orgInfo?.logoUrl}
              name={orgInfo?.name || 'Organisation'}
              className="w-6 h-6 rounded-full text-xs"
            />
            <span className="text-sm font-semibold text-[var(--color-text)] truncate">
              {orgInfo?.name || 'Organisation'}
            </span>
          </div>
          <button onClick={() => setCollapsed(true)} className="text-sm text-[var(--color-text-muted)] shrink-0">◀</button>
        </div>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => renderNavItem(item, openMenus, toggleMenu, location))}
      </nav>
      <div className="sticky bottom-0 p-3 border-t border-[var(--color-border)] space-y-1 bg-[var(--color-surface)]">
        <button onClick={handleBackToPlayer} className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg)] transition-colors">
          ← Back to Player
        </button>
        <Link to="/profile" className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)] hover:bg-[var(--color-bg)]">
          👤 Profile
        </Link>
        <button onClick={() => setMode(theme === 'dark' ? 'light' : 'dark')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
          {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
          🚪 Logout
        </button>
      </div>
    </aside>
  );
}

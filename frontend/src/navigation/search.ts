import type { ResolvedNavItem } from './types';

export interface NavSearchCommand {
  id: string;
  label: string;
  icon?: string;
  path: string;
  group: string;
  type: string;
  keywords: string[];
}

export interface AdminSearchCommand extends NavSearchCommand {
  domainId: string;
}

export const LEGACY_NAV_COMMANDS: NavSearchCommand[] = [
  { id: 'nav-book', label: 'Book a Court', icon: '🎾', path: '/browse', group: 'Navigation', type: 'navigation', keywords: ['book a court', 'nav-book', '/browse', 'navigation'] },
  { id: 'nav-marketplace', label: 'Marketplace', icon: '🛒', path: '/marketplace', group: 'Navigation', type: 'navigation', keywords: ['marketplace', 'nav-marketplace', '/marketplace', 'navigation'] },
  { id: 'nav-bookings', label: 'My Bookings', icon: '📅', path: '/bookings', group: 'Navigation', type: 'navigation', keywords: ['my bookings', 'bookings', 'nav-bookings', '/bookings', 'navigation'] },
  { id: 'nav-membership', label: 'Membership & Loyalty', icon: '⭐', path: '/membership', group: 'Navigation', type: 'navigation', keywords: ['membership & loyalty', 'membership', 'loyalty', 'nav-membership', '/membership', 'navigation'] },
  { id: 'nav-tournaments', label: 'Tournaments', icon: '🏆', path: '/tournaments', group: 'Navigation', type: 'navigation', keywords: ['tournaments', 'nav-tournaments', '/tournaments', 'navigation'] },
  { id: 'nav-academies', label: 'Academies', icon: '🎓', path: '/academies', group: 'Navigation', type: 'navigation', keywords: ['academies', 'nav-academies', '/academies', 'navigation'] },
  { id: 'nav-coaches', label: 'Coaches', icon: '👨‍🏫', path: '/coaches', group: 'Navigation', type: 'navigation', keywords: ['coaches', 'nav-coaches', '/coaches', 'navigation'] },
  { id: 'nav-notifications', label: 'Notifications', icon: '🔔', path: '/notifications', group: 'Navigation', type: 'navigation', keywords: ['notifications', 'nav-notifications', '/notifications', 'navigation'] },
  { id: 'nav-profile', label: 'Profile', icon: '👤', path: '/profile', group: 'Navigation', type: 'navigation', keywords: ['profile', 'nav-profile', '/profile', 'navigation'] },
];

export function buildAdminSearchCommands(nav: ResolvedNavItem[]): AdminSearchCommand[] {
  const commands: AdminSearchCommand[] = [];
  const walk = (items: ResolvedNavItem[], group: string, domainId: string) => {
    for (const item of items) {
      commands.push({
        id: item.id,
        label: item.label,
        icon: item.icon,
        path: item.path,
        group,
        domainId,
        type: 'admin',
        keywords: [item.label, item.id, item.path, group].map((s) => s.toLowerCase()),
      });
      if (item.children?.length) walk(item.children, group, domainId);
    }
  };
  for (const domain of nav) walk([domain], domain.label, domain.id);
  return commands;
}

export function matchNavSearchCommands(commands: NavSearchCommand[], terms: string): NavSearchCommand[] {
  const q = terms.trim().toLowerCase();
  if (!q) return [];
  return commands.filter((c) => c.keywords.some((k) => k.includes(q)));
}

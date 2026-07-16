import type { Workspace } from '../../store/workspace.store';

export interface WorkspaceContent {
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  gradientFrom: string;
  gradientTo: string;
  greetingIcon: string;
  primaryCta: { label: string; icon: string; to: string; permission?: string };
  actions: { label: string; description: string; icon: string; to: string; permission?: string }[];
  emptySuggestions: string[];
}

export const workspaceContent: Record<Workspace, WorkspaceContent> = {
  player: {
    accentColor: 'var(--color-primary)',
    accentBg: 'bg-[var(--color-primary)]/10',
    accentBorder: 'border-[var(--color-primary)]/20',
    gradientFrom: 'from-[var(--color-primary)]/20',
    gradientTo: 'to-[var(--color-info)]/10',
    greetingIcon: '🎾',
    primaryCta: { label: 'Book a Court', icon: '🎾', to: '/bookings?newBooking=true' },
    actions: [
      { label: 'Find a Coach', description: 'Start improving your game', icon: '👨‍🏫', to: '/coaches', permission: 'coaches.view' },
      { label: 'Tournaments', description: 'Compete and win', icon: '🏆', to: '/tournaments', permission: 'tournaments.view' },
      { label: 'Academies', description: 'Learn from the best', icon: '🏫', to: '/academies', permission: 'academies.view' },
    ],
    emptySuggestions: [
      'Book your first court and start playing!',
      'Find a coach to improve your skills.',
      'Explore tournaments near you.',
    ],
  },
  coach: {
    accentColor: 'var(--color-warning)',
    accentBg: 'bg-[var(--color-warning)]/10',
    accentBorder: 'border-[var(--color-warning)]/20',
    gradientFrom: 'from-[var(--color-warning)]/20',
    gradientTo: 'to-[var(--color-primary)]/10',
    greetingIcon: '🏋️',
    primaryCta: { label: 'Manage Sessions', icon: '📅', to: '/coaches/sessions/me' },
    actions: [
      { label: 'My Profile', description: 'Update your coach profile', icon: '👤', to: '/coaches/profile', permission: 'coaches.manage_profile' },
      { label: 'Availability', description: 'Set your available hours', icon: '⏰', to: '/coaches/profile', permission: 'coaches.availability.manage' },
      { label: 'Browse Courts', description: 'Find courts for sessions', icon: '🎾', to: '/browse' },
    ],
    emptySuggestions: [
      'Set your availability to start receiving bookings.',
      'Update your coach profile to attract clients.',
      'Browse courts near you for sessions.',
    ],
  },
  resident_coach: {
    accentColor: 'var(--color-secondary)',
    accentBg: 'bg-[var(--color-secondary)]/10',
    accentBorder: 'border-[var(--color-secondary)]/20',
    gradientFrom: 'from-[var(--color-secondary)]/20',
    gradientTo: 'to-[var(--color-primary)]/10',
    greetingIcon: '🏢',
    primaryCta: { label: 'Today\'s Schedule', icon: '📋', to: '/coaches/sessions/me' },
    actions: [
      { label: 'My Profile', description: 'Manage your coach profile', icon: '👤', to: '/coaches/profile', permission: 'coaches.manage_profile' },
      { label: 'Browse Courts', description: 'Find available courts', icon: '🎾', to: '/browse' },
    ],
    emptySuggestions: [
      'Check your assigned courts for today.',
      'Review your upcoming coaching sessions.',
    ],
  },
  organization: {
    accentColor: 'var(--color-info)',
    accentBg: 'bg-[var(--color-info)]/10',
    accentBorder: 'border-[var(--color-info)]/20',
    gradientFrom: 'from-[var(--color-info)]/20',
    gradientTo: 'to-[var(--color-primary)]/10',
    greetingIcon: '🏛️',
    primaryCta: { label: 'View Dashboard', icon: '📊', to: '/org' },
    actions: [
      { label: 'Manage Bookings', description: 'View and manage bookings', icon: '📅', to: '/org/bookings' },
      { label: 'Marketplace', description: 'Manage your shop', icon: '🏪', to: '/org/marketplace', permission: 'org.marketplace.manage' },
      { label: 'Staff', description: 'Manage your team', icon: '👥', to: '/org/staff', permission: 'org.staff.manage' },
    ],
    emptySuggestions: [
      'Set up your organisation to start receiving bookings.',
      'Add your staff members to manage the venue.',
      'List your courts and resources.',
    ],
  },
  platform: {
    accentColor: 'var(--color-text-muted)',
    accentBg: 'bg-[var(--color-text-muted)]/10',
    accentBorder: 'border-[var(--color-border)]',
    gradientFrom: 'from-[var(--color-text)]/10',
    gradientTo: 'to-transparent',
    greetingIcon: '⚙️',
    primaryCta: { label: 'Admin Dashboard', icon: '📊', to: '/admin' },
    actions: [
      { label: 'Users', description: 'Manage platform users', icon: '👥', to: '/admin/users' },
      { label: 'Organisations', description: 'Manage organisations', icon: '🏛️', to: '/admin/organisations' },
      { label: 'Reports', description: 'View platform analytics', icon: '📈', to: '/admin/reports' },
    ],
    emptySuggestions: [
      'Check the analytics dashboard for platform insights.',
      'Review pending user registrations.',
    ],
  },
};

export interface RefereeNavItem {
  label: string;
  icon: string;
  path: string;
  permission?: string;
}

export const REFEREE_NAV: RefereeNavItem[] = [
  { label: 'Dashboard', icon: '🏠', path: '/referee/dashboard', permission: 'referee.dashboard.view' },
  { label: 'Assignments', icon: '📋', path: '/referee/assignments', permission: 'referee.assignments.view' },
  { label: 'Matches', icon: '🎯', path: '/referee/matches', permission: 'referee.assignments.view' },
  { label: 'Availability', icon: '⏰', path: '/referee/availability', permission: 'referee.availability.view' },
  { label: 'Statistics', icon: '📊', path: '/referee/statistics', permission: 'referee.statistics.view' },
  { label: 'Profile', icon: '👤', path: '/referee/profile', permission: 'referee.profile.view' },
];

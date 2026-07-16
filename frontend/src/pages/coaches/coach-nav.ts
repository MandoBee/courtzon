export interface CoachNavItem {
  label: string;
  icon: string;
  path: string;
  permission?: string;
}

export const COACH_NAV: CoachNavItem[] = [
  { label: 'Dashboard', icon: '🏠', path: '/coach/dashboard' },
  { label: 'Sessions', icon: '📋', path: '/coach/sessions' },
  { label: 'Requests', icon: '📥', path: '/coach/requests' },
  { label: 'Players', icon: '👥', path: '/coach/players' },
  { label: 'Availability', icon: '⏰', path: '/coach/availability' },
  { label: 'Profile', icon: '👤', path: '/coach/profile' },
];

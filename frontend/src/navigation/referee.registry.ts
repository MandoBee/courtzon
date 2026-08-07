import type { NavDefinition } from './types';
import { LIT } from './labels';

export const REFEREE_NAV: NavDefinition[] = [
  { id: 'referee.dashboard.view', label: LIT('Dashboard'), icon: '🏠', path: '/referee/dashboard', permissionKey: 'referee.dashboard.view' },
  { id: 'referee.assignments.view', label: LIT('Assignments'), icon: '📋', path: '/referee/assignments', permissionKey: 'referee.assignments.view' },
  { id: 'referee.matches', label: LIT('Matches'), icon: '🎯', path: '/referee/matches', permissionKey: 'referee.assignments.view' },
  { id: 'referee.availability.view', label: LIT('Availability'), icon: '⏰', path: '/referee/availability', permissionKey: 'referee.availability.view' },
  { id: 'referee.statistics.view', label: LIT('Statistics'), icon: '📊', path: '/referee/statistics', permissionKey: 'referee.statistics.view' },
  { id: 'referee.profile.view', label: LIT('Profile'), icon: '👤', path: '/referee/profile', permissionKey: 'referee.profile.view' },
];

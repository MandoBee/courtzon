import type { NavDefinition } from './types';
import { LIT } from './labels';
import { buildNavIdKeyMaps } from './id-key';

export const REFEREE_NAV: NavDefinition[] = [
  { id: 'nav.referee.dashboard', label: LIT('Dashboard'), icon: '🏠', path: '/referee/dashboard', permissionKey: 'referee.dashboard.view' },
  { id: 'nav.referee.assignments', label: LIT('Assignments'), icon: '📋', path: '/referee/assignments', permissionKey: 'referee.assignments.view' },
  { id: 'nav.referee.matches', label: LIT('Matches'), icon: '🎯', path: '/referee/matches', permissionKey: 'referee.assignments.view' },
  { id: 'nav.referee.availability', label: LIT('Availability'), icon: '⏰', path: '/referee/availability', permissionKey: 'referee.availability.view' },
  { id: 'nav.referee.statistics', label: LIT('Statistics'), icon: '📊', path: '/referee/statistics', permissionKey: 'referee.statistics.view' },
  { id: 'nav.referee.profile', label: LIT('Profile'), icon: '👤', path: '/referee/profile', permissionKey: 'referee.profile.view' },
];

const { idToKey, keyToIds } = buildNavIdKeyMaps(REFEREE_NAV);

export const REFEREE_ID_TO_KEY: ReadonlyMap<string, string> = idToKey;
export const REFEREE_LEGACY_KEY_TO_ID: ReadonlyMap<string, string[]> = keyToIds;

import type { NavDefinition } from './types';
import { LIT } from './labels';
import { buildNavIdKeyMaps } from './id-key';

export const COACH_NAV: NavDefinition[] = [
  { id: 'nav.coach.dashboard', label: LIT('Dashboard'), icon: '🏠', path: '/coach/dashboard' },
  { id: 'nav.coach.sessions', label: LIT('Sessions'), icon: '📋', path: '/coach/sessions' },
  { id: 'nav.coach.requests', label: LIT('Requests'), icon: '📥', path: '/coach/requests' },
  { id: 'nav.coach.players', label: LIT('Players'), icon: '👥', path: '/coach/players' },
  { id: 'nav.coach.availability', label: LIT('Availability'), icon: '⏰', path: '/coach/availability' },
  { id: 'nav.coach.revenue', label: LIT('Revenue'), icon: '💰', path: '/coach/revenue' },
  { id: 'nav.coach.attendance', label: LIT('Attendance'), icon: '📊', path: '/coach/attendance' },
  { id: 'nav.coach.profile', label: LIT('Profile'), icon: '👤', path: '/coach/profile' },
];

const { idToKey, keyToIds } = buildNavIdKeyMaps(COACH_NAV);

export const COACH_ID_TO_KEY: ReadonlyMap<string, string> = idToKey;
export const COACH_LEGACY_KEY_TO_ID: ReadonlyMap<string, string[]> = keyToIds;

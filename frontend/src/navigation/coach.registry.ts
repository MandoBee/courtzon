import type { NavDefinition } from './types';
import { LIT } from './labels';

export const COACH_NAV: NavDefinition[] = [
  { id: 'coach.dashboard', label: LIT('Dashboard'), icon: '🏠', path: '/coach/dashboard' },
  { id: 'coach.sessions', label: LIT('Sessions'), icon: '📋', path: '/coach/sessions' },
  { id: 'coach.requests', label: LIT('Requests'), icon: '📥', path: '/coach/requests' },
  { id: 'coach.players', label: LIT('Players'), icon: '👥', path: '/coach/players' },
  { id: 'coach.availability', label: LIT('Availability'), icon: '⏰', path: '/coach/availability' },
  { id: 'coach.profile', label: LIT('Profile'), icon: '👤', path: '/coach/profile' },
];

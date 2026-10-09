/**
 * Tournament status-badge token classes (TUX-05).
 *
 * Kept in a plain (non-component) module so the maps can be shared by the
 * admin and player surfaces AND unit-tested for background/foreground token
 * distinctness without tripping `react-refresh/only-export-components`.
 *
 * EVERY foreground must use a DIFFERENT theme token from its background.
 * `tailwind.config.js` maps gray-100 and gray-700 BOTH to
 * `var(--color-border)`, so a pair like `bg-gray-100 text-gray-700` renders
 * text on an identical background (effectively invisible). The regression
 * guard lives in `components/tournaments/__tests__/tournamentStatusBadges.spec.ts`.
 */

export const TOURNAMENT_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-blue-100 text-blue-700',
  registration_open: 'bg-green-100 text-green-700',
  registration_closed: 'bg-amber-100 text-amber-700',
  running: 'bg-purple-100 text-purple-700',
  completed: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-600',
};

export const TOURNAMENT_REG_STATUS_COLORS: Record<string, string> = {
  registered: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  withdrawn: 'bg-red-100 text-red-700',
  disqualified: 'bg-gray-100 text-gray-600',
};

export const PLAYER_TOURNAMENT_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-blue-100 text-blue-700',
  registration_open: 'bg-green-100 text-green-700',
  registration_closed: 'bg-amber-100 text-amber-700',
  running: 'bg-purple-100 text-purple-700',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-600',
};

import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export interface PlayerNavCounts {
  bookings: number;
  matches: number;
  tournaments: number;
  academies: number;
  chat: number;
  marketplace: number;
}

export const PLAYER_NAV_COUNTS_KEY = 'player-nav-counts';

/**
 * Authoritative navigation counters for the player shell. Single backend
 * endpoint (`GET /players/my/nav-summary`) — every badge reads the same data.
 * Invalidated by the realtime layer on booking/match/tournament/academy/chat/
 * marketplace events; a periodic refetch acts as a safety net so the badges
 * never go stale.
 */
export function usePlayerNavCounts() {
  return useQuery({
    queryKey: [PLAYER_NAV_COUNTS_KEY],
    queryFn: () => api.get('/players/my/nav-summary').then((r) => r.data?.data ?? r.data),
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}
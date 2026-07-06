import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketService } from '../services/socket';

type EventHandler = (...args: any[]) => void;

interface RealtimeSubscription {
  event: string;
  handler: EventHandler;
}

/**
 * Subscribe to Socket.IO events with automatic cleanup and React Query invalidation.
 *
 * Usage:
 *   useRealtime([
 *     { event: 'match:available', handler: () => queryClient.invalidateQueries({ queryKey: ['public-matches'] }) },
 *     { event: 'booking:created', handler: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }) },
 *   ]);
 */
export function useRealtime(subscriptions: RealtimeSubscription[]): void {

  useEffect(() => {
    const wrapped: RealtimeSubscription[] = subscriptions.map((sub) => ({
      event: sub.event,
      handler: sub.handler,
    }));

    for (const sub of wrapped) {
      socketService.on(sub.event, sub.handler);
    }

    return () => {
      for (const sub of wrapped) {
        socketService.off(sub.event, sub.handler);
      }
    };
  }, [subscriptions.map((s) => s.event).join(',')]);
}

/**
 * Convenience subscriptions for common real-time invalidation patterns.
 */
export function useMatchRealtime() {
  const queryClient = useQueryClient();
  useRealtime([
    {
      event: 'match:available',
      handler: () => queryClient.invalidateQueries({ queryKey: ['public-matches'] }),
    },
    {
      event: 'match:removed',
      handler: () => queryClient.invalidateQueries({ queryKey: ['public-matches'] }),
    },
    {
      event: 'match:updated',
      handler: () => queryClient.invalidateQueries({ queryKey: ['public-matches'] }),
    },
  ]);
}

export function useBookingRealtime() {
  const queryClient = useQueryClient();
  useRealtime([
    {
      event: 'booking:created',
      handler: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
    },
    {
      event: 'booking:confirmed',
      handler: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
    },
    {
      event: 'booking:cancelled',
      handler: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
    },
    {
      event: 'booking:completed',
      handler: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
    },
  ]);
}

export function useWalletRealtime() {
  const queryClient = useQueryClient();
  useRealtime([
    {
      event: 'wallet:updated',
      handler: () => queryClient.invalidateQueries({ queryKey: ['wallet'] }),
    },
    {
      event: 'payment:completed',
      handler: () => queryClient.invalidateQueries({ queryKey: ['wallet'] }),
    },
  ]);
}

export function useMarketplaceRealtime() {
  const queryClient = useQueryClient();
  useRealtime([
    {
      event: 'order:created',
      handler: () => queryClient.invalidateQueries({ queryKey: ['mp-orders'] }),
    },
    {
      event: 'order:updated',
      handler: () => queryClient.invalidateQueries({ queryKey: ['mp-orders'] }),
    },
  ]);
}

export function useDashboardRealtime() {
  const queryClient = useQueryClient();
  useRealtime([
    {
      event: 'dashboard:updated',
      handler: () => queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] }),
    },
  ]);
}

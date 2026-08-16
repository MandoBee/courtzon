import { useEffect, useRef } from 'react';
import { socketService } from '../services/socket';

/**
 * Lifecycle-safe resource room membership for realtime availability updates.
 *
 * Open/view resource availability → join resource:{resourceId}
 * Leave/unmount/change resource     → leave resource:{resourceId}
 * Socket (re)connect                → re-join the currently viewed resource
 *
 * Uses the existing SocketService facade — no second connection is created.
 */
export function useResourceRoom(resourceId?: number | null): void {
  const currentRef = useRef<number | null>(null);

  // Join on mount/change, leave on unmount/change.
  useEffect(() => {
    const prev = currentRef.current;
    const next = resourceId ?? null;
    if (prev === next) {
      if (next) socketService.emit('join:resource', next);
    } else {
      if (prev) socketService.emit('leave:resource', prev);
      if (next) socketService.emit('join:resource', next);
    }
    currentRef.current = next;

    return () => {
      const id = currentRef.current;
      if (id) socketService.emit('leave:resource', id);
    };
  }, [resourceId]);

  // Restore the active subscription after any socket (re)connect.
  useEffect(() => {
    const onConnect = () => {
      const id = currentRef.current;
      if (id) socketService.emit('join:resource', id);
    };
    socketService.on('connect', onConnect);
    return () => socketService.off('connect', onConnect);
  }, []);
}
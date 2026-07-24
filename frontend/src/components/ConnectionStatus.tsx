import { useState, useEffect } from 'react';
import { useSocketContext } from '../realtime/SocketContext';

/**
 * Connection status banner.
 *
 * State visibility:
 *   uninitialized  → hidden (no socket expected)
 *   connecting     → hidden (first connect, not a reconnection)
 *   connected      → hidden
 *   disconnected   → hidden (brief, will transition to reconnecting or uninitialized)
 *   reconnecting   → visible "Reconnecting..."
 *   auth_failed    → hidden (user needs to re-login, not a reconnect issue)
 */
export function ConnectionStatus() {
  const { state } = useSocketContext();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state === 'reconnecting') {
      setVisible(true);
    } else if (state === 'connected') {
      // Show "Connected" briefly, then hide
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timer);
    } else {
      // uninitialized, connecting, disconnected, auth_failed — hidden
      setVisible(false);
    }
  }, [state]);

  if (!visible) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-[9999] px-4 py-2 rounded-full text-sm font-medium shadow-lg transition-all duration-300 ${
        state === 'connected'
          ? 'bg-green-500 text-white'
          : 'bg-yellow-500 text-white animate-pulse'
      }`}
    >
      {state === 'connected' ? 'Connected' : 'Reconnecting...'}
    </div>
  );
}

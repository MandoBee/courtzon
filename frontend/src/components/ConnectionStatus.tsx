import { useState, useEffect } from 'react';
import { useSocketContext } from '../realtime/SocketContext';

export function ConnectionStatus() {
  const { isConnected } = useSocketContext();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isConnected) {
      setVisible(true);
    } else {
      const timer = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isConnected]);

  if (!visible) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-[9999] px-4 py-2 rounded-full text-sm font-medium shadow-lg transition-all duration-300 ${
        isConnected
          ? 'bg-green-500 text-white'
          : 'bg-yellow-500 text-white animate-pulse'
      }`}
    >
      {isConnected ? 'Connected' : 'Reconnecting...'}
    </div>
  );
}

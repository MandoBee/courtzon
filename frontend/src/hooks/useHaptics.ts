// Haptic feedback helper. No-ops on devices without the Vibration API.
function safeVibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* vibration not allowed or blocked */
  }
}

export function useHaptics() {
  return {
    vibrate: safeVibrate,
    tap: () => safeVibrate(10),
    confirm: () => safeVibrate([10, 30, 10]),
    warn: () => safeVibrate([20, 40, 20]),
    error: () => safeVibrate([30, 60, 30]),
  };
}

export const haptics = {
  vibrate: safeVibrate,
  tap: () => safeVibrate(10),
  confirm: () => safeVibrate([10, 30, 10]),
  warn: () => safeVibrate([20, 40, 20]),
  error: () => safeVibrate([30, 60, 30]),
};

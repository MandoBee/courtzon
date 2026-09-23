import { create } from 'zustand';

/**
 * G9-D5-D — Notification sound preference (client-side presentation setting).
 *
 * Stored in localStorage (the established client-side settings pattern used by
 * theme.store / workspace.store / appearance.store). Web and mobile are the same
 * React bundle on the same origin, so they share this one preference. Default ON.
 *
 * This is INDEPENDENT from category ON/OFF (user_notification_preferences) and
 * from delivery channels (user_channel_preferences) — it only controls whether
 * the client attempts to play a sound when a NEW notification is received.
 */
const SOUND_KEY = 'notification_sound';

export interface NotificationSoundState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  init: () => void;
}

/** Default ON; any non-'0'/'false' stored value is treated as enabled. */
export function readNotificationSoundEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const raw = localStorage.getItem(SOUND_KEY);
  if (raw == null) return true;
  return raw !== '0' && raw !== 'false';
}

export const useNotificationSoundStore = create<NotificationSoundState>((set) => ({
  enabled: readNotificationSoundEnabled(),

  setEnabled: (enabled) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SOUND_KEY, enabled ? '1' : '0');
    }
    set({ enabled });
  },

  init: () => {
    set({ enabled: readNotificationSoundEnabled() });
  },
}));
import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationSoundStore, readNotificationSoundEnabled } from './notification-sound.store';

/**
 * G9-D5-D — sound preference store (A/B/C/D).
 * Client-side presentation preference; default ON; survives reload via localStorage.
 */
describe('G9-D5-D — notification sound preference store', () => {
  beforeEach(() => {
    localStorage.clear();
    useNotificationSoundStore.setState({ enabled: true });
  });

  it('A. default is ON when no stored preference exists', () => {
    expect(readNotificationSoundEnabled()).toBe(true);
    expect(useNotificationSoundStore.getState().enabled).toBe(true);
  });

  it('C. explicit ON persists and survives reload', () => {
    useNotificationSoundStore.getState().setEnabled(true);
    expect(localStorage.getItem('notification_sound')).toBe('1');
    expect(useNotificationSoundStore.getState().enabled).toBe(true);

    useNotificationSoundStore.getState().init();
    expect(useNotificationSoundStore.getState().enabled).toBe(true);
  });

  it('B. explicit OFF persists and survives reload', () => {
    useNotificationSoundStore.getState().setEnabled(false);
    expect(localStorage.getItem('notification_sound')).toBe('0');
    expect(useNotificationSoundStore.getState().enabled).toBe(false);

    useNotificationSoundStore.getState().init();
    expect(useNotificationSoundStore.getState().enabled).toBe(false);
  });

  it('D. preference persistence is stable across re-initialisation (toggle OFF then ON)', () => {
    useNotificationSoundStore.getState().setEnabled(false);
    useNotificationSoundStore.getState().init();
    expect(useNotificationSoundStore.getState().enabled).toBe(false);

    useNotificationSoundStore.getState().setEnabled(true);
    useNotificationSoundStore.getState().init();
    expect(useNotificationSoundStore.getState().enabled).toBe(true);
  });
});
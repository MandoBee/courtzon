import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * G9-D5-D — client-side sound playback (F/G/Q and autoplay behaviour).
 * The Web Audio API is mocked; we assert calls/state transitions, never speakers.
 */

const __state = vi.hoisted(() => ({
  enabled: true,
  started: 0,
  suspended: false,
  resumeRejects: false,
}));

vi.mock('../store/notification-sound.store', () => ({
  useNotificationSoundStore: { getState: () => ({ enabled: __state.enabled }) },
}));

class FakeOscillator {
  type = '';
  frequency = { value: 0 };
  connect() { return this; }
  start() { __state.started += 1; }
  stop() {}
}

class FakeGain {
  gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  connect() { return this; }
}

class FakeAudioContext {
  state = __state.suspended ? 'suspended' : 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {
    if (__state.resumeRejects) throw new Error('NotAllowedError');
  });
  createOscillator() { return new FakeOscillator(); }
  createGain() { return new FakeGain(); }
}

type SoundModule = typeof import('./notificationSound');

let sound: SoundModule;

beforeEach(async () => {
  __state.enabled = true;
  __state.started = 0;
  __state.suspended = false;
  __state.resumeRejects = false;
  vi.resetModules();
  (window as any).AudioContext = FakeAudioContext;
  sound = await import('./notificationSound');
});

describe('G9-D5-D — sound playback service', () => {
  it('F. a new notification triggers sound when enabled', () => {
    sound.maybePlayNotificationSound();
    expect(__state.started).toBeGreaterThan(0);
  });

  it('G. a new notification does NOT trigger sound when disabled', () => {
    __state.enabled = false;
    sound.maybePlayNotificationSound();
    expect(__state.started).toBe(0);
  });

  it('Q. autoplay rejection (suspended + resume rejected) is swallowed — no throw, no playback', async () => {
    __state.suspended = true;
    __state.resumeRejects = true;
    expect(() => sound.maybePlayNotificationSound()).not.toThrow();
    expect(__state.started).toBe(0);
  });

  it('no AudioContext available → playback is a silent no-op', async () => {
    delete (window as any).AudioContext;
    vi.resetModules();
    sound = await import('./notificationSound');
    expect(() => sound.maybePlayNotificationSound()).not.toThrow();
    expect(__state.started).toBe(0);
  });

  it('initNotificationSound registers autoplay unlock listeners once', () => {
    const add = vi.spyOn(window, 'addEventListener');
    sound.initNotificationSound();
    sound.initNotificationSound();
    expect(add).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(add).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
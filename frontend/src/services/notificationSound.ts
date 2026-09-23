import { useNotificationSoundStore } from '../store/notification-sound.store';

/**
 * G9-D5-D — Client-side notification sound playback.
 *
 * The sound system is a pure CLIENT presentation capability. It operates
 * generically on notification arrival (the frontend notification store owns it —
 * no domain code calls audio). Server delivery, realtime, and notification
 * preferences are never touched here.
 *
 * Sound is synthesized with the Web Audio API (browser-safe, no external asset,
 * no copyrighted sample). A short two-tone "sport impact + confirmation chime"
 * is used for every category. The profile map below is the future-compatible
 * seam for sport-specific sounds (tennis/padel/basketball/signature) without any
 * server changes; D5-D ships the `default` profile.
 */
export type NotificationSoundProfile = 'default' | 'tennis' | 'padel' | 'basketball' | 'courtzon_signature';

const PROFILE_FREQUENCIES: Record<NotificationSoundProfile, number[]> = {
  default: [880, 1318.5], // A5 → E6
  tennis: [880, 1318.5],
  padel: [880, 1318.5],
  basketball: [880, 1318.5],
  courtzon_signature: [880, 1318.5],
};

const TONE_DURATION = 0.16;
const TONE_GAP = 0.14;
const PEAK_GAIN = 0.16;

let audioCtx: AudioContext | null = null;
let unlockListenersBound = false;

function ensureContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function unlockAudio(): void {
  const ctx = ensureContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

/**
 * Browser-autoplay safe unlock. Registers one-time global listeners so the
 * AudioContext is resumed after the user's first interaction; notifications
 * received before that simply do not play sound (no error, no retry loop).
 */
export function initNotificationSound(): void {
  if (typeof window === 'undefined' || unlockListenersBound) return;
  unlockListenersBound = true;
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('touchstart', unlockAudio);
}

function playChime(ctx: AudioContext, profile: NotificationSoundProfile): void {
  const freqs = PROFILE_FREQUENCIES[profile] ?? PROFILE_FREQUENCIES.default;
  const now = ctx.currentTime;
  for (let i = 0; i < freqs.length; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freqs[i];
    const t0 = now + i * TONE_GAP;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + TONE_DURATION);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + TONE_DURATION + 0.02);
  }
}

/**
 * Attempt to play the notification sound for a newly received notification.
 * No-op when the sound preference is OFF, when audio is unavailable, or while
 * the browser blocks autoplay. Never throws and never retries.
 */
export function maybePlayNotificationSound(profile: NotificationSoundProfile = 'default'): void {
  try {
    if (!useNotificationSoundStore.getState().enabled) return;
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      return;
    }
    playChime(ctx, profile);
  } catch {
    // Audio must never affect notification delivery or surface an error.
  }
}
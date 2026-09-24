import api from './api';

/**
 * G9-D5 — Web Push subscription client (PWA native OS notifications).
 *
 * Completes the push half of the notification platform: request permission,
 * subscribe through the existing service worker and register the subscription
 * on the backend (reusing `/notifications/devices` → `push_tokens`).
 *
 * Everything is feature-detected and fully guarded:
 *  - unsupported browsers / non-secure contexts / missing VAPID key → no-op,
 *  - permission denied → no-op,
 *  - registration failures are swallowed (native push stays optional).
 *
 * Requires `VITE_VAPID_PUBLIC_KEY` in the frontend build and matching
 * `WEB_PUSH_VAPID_*` env vars on the backend for real delivery.
 */

let started = false;

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function initPushNotifications(): Promise<void> {
  if (started) return;
  started = true;

  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!('Notification' in window)) return;

  const publicKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim();
  if (!publicKey) return;

  try {
    if (Notification.permission === 'denied') return;

    let permission: NotificationPermission = Notification.permission;
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch {
        return;
      }
    }
    if (permission !== 'granted') return;

    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const sub = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return;

    let fingerprint = localStorage.getItem('device_fingerprint');
    if (!fingerprint) {
      fingerprint = `web-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
      localStorage.setItem('device_fingerprint', fingerprint);
    }

    await api.post('/notifications/devices', {
      deviceFingerprint: fingerprint,
      platform: 'web',
      deviceType: 'web',
      deviceName: `${navigator.userAgent.includes('Android') ? 'Android' : 'Web'} browser`,
      browser: navigator.userAgent,
      os: navigator.userAgent.includes('Android') ? 'Android' : undefined,
      userAgent: navigator.userAgent,
      pushToken: JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }),
    });
  } catch {
    // Native push is additive — never break the app when it is unavailable.
  }
}
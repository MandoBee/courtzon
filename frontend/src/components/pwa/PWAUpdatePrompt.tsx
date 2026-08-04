import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import { useAppSettingsStore } from '../../store/app-settings.store';
import { useHaptics } from '../../hooks/useHaptics';
import { PENDING_RELOAD_KEY } from '../../constants/pwa-reload';
import ReloadSplash from './ReloadSplash';

/**
 * "New version available" prompt backed by vite-plugin-pwa's `virtual:pwa-register`
 * `onNeedRefresh` callback. Renders a small toast-like card; reload applies the update.
 * In dev (no service worker) it no-ops.
 *
 * Reload flow: clicking "Reload" shows the official CourtZon splash overlay with a
 * "Loading latest version..." message, records the pending reload in sessionStorage,
 * and only then reloads the page in the background. After the reload the app keeps the
 * splash visible until boot/initialization completes (handled in App.tsx), so there is
 * no flicker or blank screen.
 *
 * NOTE: `onOfflineReady` is intentionally absorbed without UI. The branded
 * InstallPrompt component is the ONLY install UI allowed.
 */
export default function PWAUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [reloading, setReloading] = useState(false);
  const { t } = useTranslation();
  const siteName = useAppSettingsStore((s) => s.siteName);
  const { confirm } = useHaptics();
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let cancelled = false;
    (async () => {
      try {
        const { registerSW } = await import(/* @vite-ignore */ 'virtual:pwa-register');
        if (cancelled) return;
        const updateSW = registerSW({
          onNeedRefresh: () => setNeedRefresh(true),
          onOfflineReady: () => {
            /* silently absorbed — the branded InstallPrompt is the only install UI */
          },
        });
        updateSWRef.current = updateSW;
      } catch {
        /* PWA registration not available */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Perform the actual reload only after the splash overlay has painted.
  useEffect(() => {
    if (!reloading) return;
    const timer = setTimeout(() => {
      const updateSW = updateSWRef.current;
      if (updateSW) {
        updateSW(true).catch(() => window.location.reload());
      } else {
        window.location.reload();
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [reloading]);

  const reload = () => {
    confirm();
    try {
      sessionStorage.setItem(PENDING_RELOAD_KEY, '1');
    } catch {
      /* sessionStorage unavailable — proceed with a plain reload */
    }
    setReloading(true);
  };

  const close = () => {
    setNeedRefresh(false);
  };

  if (!needRefresh && !reloading) return null;

  return (
    <>
      {reloading && (
        <ReloadSplash visible message={t('pwa.loading_latest')} />
      )}
      {needRefresh && !reloading && (
        <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[55] w-[92%] max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-4 flex items-center gap-3 cz-fade-enter cz-pb-safe">
          <span className="text-2xl">🔄</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--color-text)]">{t('pwa.new_version_title')}</p>
            <p className="text-xs text-[var(--color-text-muted)] truncate">{t('pwa.new_version_desc', { app: siteName })}</p>
          </div>
          <button onClick={close} className="text-xs text-[var(--color-text-muted)] px-2 py-1">{t('pwa.not_now')}</button>
          <button
            onClick={reload}
            className="text-xs font-medium text-white bg-[var(--color-primary)] px-3 py-1.5 rounded-[var(--radius-md)]"
          >
            {t('pwa.reload')}
          </button>
        </div>
      )}
    </>
  );
}

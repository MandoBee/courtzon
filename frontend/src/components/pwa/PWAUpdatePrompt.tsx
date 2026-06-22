import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import { useAppSettingsStore } from '../../store/app-settings.store';
import { useHaptics } from '../../hooks/useHaptics';

/**
 * "New version available" prompt backed by vite-plugin-pwa's `virtual:pwa-register`
 * `onNeedRefresh` callback. Renders a small toast-like card; reload applies the update.
 * In dev (no service worker) it no-ops.
 */
export default function PWAUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
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
          onOfflineReady: () => setOfflineReady(true),
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

  const reload = async () => {
    confirm();
    const updateSW = updateSWRef.current;
    if (updateSW) {
      await updateSW(true);
    } else {
      window.location.reload();
    }
  };

  const close = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  if (offlineReady && !needRefresh) {
    return (
      <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[55] w-[92%] max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-4 flex items-center gap-3 cz-fade-enter cz-pb-safe">
        <span className="text-2xl">✅</span>
        <p className="flex-1 text-sm text-[var(--color-text)]">
          {t('pwa.install_app', { app: siteName })} — {t('common.close')}
        </p>
        <button onClick={close} className="text-xs text-[var(--color-text-muted)] px-2 py-1">{t('common.close')}</button>
      </div>
    );
  }

  if (!needRefresh) return null;

  return (
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
  );
}

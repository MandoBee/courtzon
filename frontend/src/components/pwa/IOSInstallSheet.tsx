import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import { useAppSettingsStore } from '../../store/app-settings.store';
import { Modal } from '../ui/Modal';
import { isLandingInstallPromptPath } from '../../pages/landing/landing-install-paths';
import { useHaptics } from '../../hooks/useHaptics';

const DISMISS_KEY = 'cz-ios-install-dismissed';

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isAppleTouch = /iPad|iPhone|iPod/.test(ua);
  const isMacTouch = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
  return isAppleTouch || isMacTouch;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export default function IOSInstallSheet() {
  const location = useLocation();
  const { t } = useTranslation();
  const siteName = useAppSettingsStore((s) => s.siteName);
  const { tap } = useHaptics();
  const [showSheet, setShowSheet] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);

  const onLanding = isLandingInstallPromptPath(location.pathname);
  const shouldShowPill = onLanding && !dismissed && isIOS() && !isStandalone();

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  if (!onLanding) return null;

  return (
    <>
      {shouldShowPill && (
        <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-4 flex items-center gap-3 cz-fade-enter cz-pb-safe">
          <span className="text-2xl"></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--color-text)]">{t('pwa.install_app', { app: siteName })}</p>
            <p className="text-xs text-[var(--color-text-muted)] truncate">{t('pwa.install_desc', { app: siteName })}</p>
          </div>
          <button onClick={dismiss} className="text-xs text-[var(--color-text-muted)] px-2 py-1">{t('pwa.not_now')}</button>
          <button
            onClick={() => { tap(); setShowSheet(true); }}
            className="text-xs font-medium text-white bg-[var(--color-primary)] px-3 py-1.5 rounded-[var(--radius-md)]"
          >
            {t('pwa.install')}
          </button>
        </div>
      )}

      <Modal open={showSheet} onClose={() => setShowSheet(false)} title={t('pwa.ios_install_title')} size="md">
        <ol className="space-y-4">
          <li className="flex items-start gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)] text-sm font-semibold shrink-0">1</span>
            <div className="flex-1">
              <p className="text-sm text-[var(--color-text)]">{t('pwa.ios_install_step1')}</p>
              <span className="inline-flex items-center gap-1 mt-1 text-xs text-[var(--color-text-muted)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M12 3v13m0 0l-4-4m4 4l4-4" />
                </svg>
                {t('pwa.ios_install_share')}
              </span>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)] text-sm font-semibold shrink-0">2</span>
            <p className="flex-1 text-sm text-[var(--color-text)]">{t('pwa.ios_install_step2')}</p>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--color-primary-bg)] text-[var(--color-primary)] text-sm font-semibold shrink-0">3</span>
            <p className="flex-1 text-sm text-[var(--color-text)]">{t('pwa.ios_install_step3', { app: siteName })}</p>
          </li>
        </ol>
        <button
          onClick={() => setShowSheet(false)}
          className="mt-6 w-full text-sm font-medium text-white bg-[var(--color-primary)] py-2.5 rounded-[var(--radius-md)]"
        >
          {t('common.close')}
        </button>
      </Modal>
    </>
  );
}

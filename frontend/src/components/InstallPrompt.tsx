import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppSettingsStore, resolveAssetUrl } from '../store/app-settings.store';
import { isLandingInstallPromptPath } from '../pages/landing/landing-install-paths';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandaloneApp(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function InstallPrompt() {
  const location = useLocation();
  const siteName = useAppSettingsStore((s) => s.siteName);
  const siteTagline = useAppSettingsStore((s) => s.siteTagline);
  const pwaIcon192Url = useAppSettingsStore((s) => s.pwaIcon192Url);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const onLandingPage = isLandingInstallPromptPath(location.pathname);

  useEffect(() => {
    if (!onLandingPage) {
      setDeferred(null);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [onLandingPage]);

  useEffect(() => {
    if (isStandaloneApp() || dismissed || !onLandingPage || !deferred) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [onLandingPage, dismissed, deferred]);

  const dismiss = () => {
    setDismissed(true);
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setVisible(false);
    setDeferred(null);
  };

  if (!visible || !onLandingPage) return null;

  const iconSrc = resolveAssetUrl(pwaIcon192Url || '/favicon.svg');
  const installReady = !!deferred;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-4 flex items-center gap-3">
      <img
        src={iconSrc}
        alt=""
        className="w-12 h-12 rounded-[var(--radius-md)] object-cover flex-shrink-0 bg-[var(--color-bg)]"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--color-text)]">Install {siteName}</p>
        <p className="text-xs text-[var(--color-text-muted)] truncate">
          {siteTagline || 'Book courts and join the sports community from your phone.'}
        </p>
      </div>
      <button onClick={dismiss} className="text-xs text-[var(--color-text-muted)] px-2 py-1">
        Not now
      </button>
      <button
        onClick={install}
        disabled={!installReady}
        className="text-xs font-medium text-white bg-[var(--color-primary)] px-3 py-1.5 rounded-[var(--radius-md)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Install
      </button>
    </div>
  );
}

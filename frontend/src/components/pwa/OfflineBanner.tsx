import { useEffect, useRef } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../i18n';

/** Full-width offline banner rendered in page flow; fires a toast when connectivity returns. */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      showToast(t('pwa.back_online'), 'success');
    }
  }, [online, showToast, t]);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-[var(--color-error)] text-white cz-px-safe"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2">
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 0118 0M6 12a6 6 0 0112 0M9 12a3 3 0 016 0" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
        </svg>
        <span className="text-sm font-medium">{t('pwa.offline_title')}</span>
        <span className="text-xs opacity-90 hidden sm:inline">— {t('pwa.offline_desc')}</span>
      </div>
    </div>
  );
}

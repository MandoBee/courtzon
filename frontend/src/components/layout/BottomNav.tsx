import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useTranslation } from '../../i18n';
import { useCan } from '../../hooks/useCan';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { useHaptics } from '../../hooks/useHaptics';
import { Modal } from '../ui/Modal';

export default function BottomNav() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const { can } = useCan();
  const chatEnabled = useFeatureFlag('community.chat_enabled');
  const { tap } = useHaptics();
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isSeller = user && user.isSeller;

  const isPath = (p: string) => (p === '/app' ? location.pathname === '/app' || location.pathname === '/' : location.pathname === p);

  const coreTabs = [
    { label: t('nav.home'), icon: '🏠', path: '/app' },
    { label: t('nav.bookings'), icon: '📅', path: '/bookings' },
    { label: t('nav.marketplace'), icon: '🛒', path: '/marketplace' },
  ];

  const moreItems: { label: string; icon: string; path: string; perm?: string; flag?: boolean; show?: boolean }[] = [
    { label: t('nav.matches'), icon: '🎯', path: '/matches' },
    { label: t('nav.coaches'), icon: '🏆', path: '/coaches', perm: 'coaches.view' },
    { label: t('nav.tournaments'), icon: '🥇', path: '/tournaments', perm: 'tournaments.view' },
    { label: t('nav.academies'), icon: '🎓', path: '/academies', perm: 'academies.view' },
    { label: t('nav.messages'), icon: '💬', path: '/messages', perm: 'community.chat.view', flag: chatEnabled },
    { label: t('nav.notifications'), icon: '🔔', path: '/notifications' },
    ...(isSeller ? [{ label: t('nav.my_shop'), icon: '🏪', path: '/marketplace/seller' }] : []),
  ];
  const visibleMore = moreItems.filter((i) => (i.show === undefined || i.show) && (!i.perm || can(i.perm)) && (i.flag === undefined || i.flag));
  const morePaths = visibleMore.map((i) => i.path);
  const moreActive = morePaths.some((p) => location.pathname === p);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-[60] bg-[var(--color-surface)] border-t border-[var(--color-border)] md:hidden cz-pb-safe cz-px-safe">
        <div className="flex items-center justify-around h-16">
          {coreTabs.map((tab) => (
            <Link
              key={tab.path}
              to={tab.path}
              onClick={() => tap()}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-w-0 transition-colors cz-no-select ${
                isPath(tab.path) ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
            </Link>
          ))}
          <button
            type="button"
            onClick={() => { tap(); setMoreOpen(true); }}
            aria-label={t('nav.more')}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-w-0 transition-colors cz-no-select ${
              moreActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'
            }`}
          >
            <span className="text-xl leading-none">⋯</span>
            <span className="text-[10px] font-medium leading-tight">{t('nav.more')}</span>
          </button>
          <Link
            to="/profile"
            onClick={() => tap()}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-w-0 transition-colors cz-no-select ${
              isPath('/profile') ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'
            }`}
          >
            <span className="text-xl leading-none">👤</span>
            <span className="text-[10px] font-medium leading-tight">{t('nav.profile')}</span>
          </Link>
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')} variant="sheet" size="md">
        <div className="grid grid-cols-3 gap-3 py-1">
          {visibleMore.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => { tap(); setMoreOpen(false); }}
              className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border transition-colors cz-no-select ${
                isPath(item.path)
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg)]'
              }`}
            >
              <span className="text-2xl leading-none">{item.icon}</span>
              <span className="text-[11px] font-medium text-center leading-tight">{item.label}</span>
            </Link>
          ))}
        </div>
      </Modal>
    </>
  );
}

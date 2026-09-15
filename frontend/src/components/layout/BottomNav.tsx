import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useTranslation } from '../../i18n';
import { useCan } from '../../hooks/useCan';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { useHaptics } from '../../hooks/useHaptics';
import { usePlayerNavCounts, type PlayerNavCounts } from '../../hooks/usePlayerNavCounts';
import { Modal } from '../ui/Modal';
import CountBadge from '../ui/CountBadge';
import { resolvePlayerCoreTabs, resolvePlayerMoreItems } from '../../navigation';

const CORE_BADGE_BY_ID: Partial<Record<string, keyof PlayerNavCounts>> = {
  'nav.player.bookings': 'bookings',
  'nav.player.marketplace': 'marketplace',
};

const MORE_BADGE_BY_ID: Partial<Record<string, keyof PlayerNavCounts>> = {
  'nav.player.matches': 'matches',
  'nav.player.tournaments': 'tournaments',
  'nav.player.academy': 'academies',
  'nav.player.messages': 'chat',
};

export default function BottomNav() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const { can } = useCan();
  const chatEnabled = useFeatureFlag('community.chat_enabled');
  const { tap } = useHaptics();
  const { t } = useTranslation();
  const { data: counts } = usePlayerNavCounts();
  const [moreOpen, setMoreOpen] = useState(false);

  const isSeller = !!(user && user.isSeller);

  const isPath = (p: string) => (p === '/app' ? location.pathname === '/app' || location.pathname === '/' : location.pathname === p);

  const coreTabs = resolvePlayerCoreTabs(t).map((tab) =>
    CORE_BADGE_BY_ID[tab.id] ? { ...tab, badgeCount: counts?.[CORE_BADGE_BY_ID[tab.id]!] ?? 0 } : tab,
  );
  const visibleMore = resolvePlayerMoreItems(t, { isSeller, chatEnabled, can }).map((item) =>
    MORE_BADGE_BY_ID[item.id] ? { ...item, badgeCount: counts?.[MORE_BADGE_BY_ID[item.id]!] ?? 0 } : item,
  );
  const morePaths = visibleMore.map((i) => i.path);
  const moreActive = morePaths.some((p) => location.pathname === p);
  const visibleMoreUnread = visibleMore.reduce((acc, i) => acc + (i.badgeCount ?? 0), 0);

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
              <span className="text-xl leading-none relative">
                {tab.icon}
                {'badgeCount' in tab && <CountBadge count={tab.badgeCount ?? 0} />}
              </span>
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
            <span className="text-xl leading-none relative">
              ⋯
              {visibleMoreUnread > 0 && <CountBadge count={visibleMoreUnread} />}
            </span>
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
              <span className="text-2xl leading-none relative">
                {item.icon}
                {'badgeCount' in item && <CountBadge count={item.badgeCount ?? 0} />}
              </span>
              <span className="text-[11px] font-medium text-center leading-tight">{item.label}</span>
            </Link>
          ))}
        </div>
      </Modal>
    </>
  );
}

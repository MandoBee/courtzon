export interface PlayerCoreTab {
  label: string;
  icon: string;
  path: string;
}

export interface PlayerMoreItem {
  label: string;
  icon: string;
  path: string;
  perm?: string;
  flag?: boolean;
  show?: boolean;
}

export function buildPlayerCoreTabs(t: (key: string) => string): PlayerCoreTab[] {
  return [
    { label: t('nav.home'), icon: '🏠', path: '/app' },
    { label: t('nav.bookings'), icon: '📅', path: '/bookings' },
    { label: t('nav.marketplace'), icon: '🛒', path: '/marketplace' },
  ];
}

export function buildPlayerMoreItems(
  t: (key: string) => string,
  opts: { isSeller: boolean; chatEnabled: boolean },
): PlayerMoreItem[] {
  const { isSeller, chatEnabled } = opts;
  return [
    { label: t('nav.matches'), icon: '🎯', path: '/matches' },
    { label: t('nav.coaches'), icon: '🏆', path: '/coaches', perm: 'coaches.view' },
    { label: t('nav.tournaments'), icon: '🥇', path: '/tournaments', perm: 'tournaments.view' },
    { label: t('nav.academies'), icon: '🎓', path: '/academies', perm: 'academies.view' },
    { label: t('nav.messages'), icon: '💬', path: '/messages', perm: 'community.chat.view', flag: chatEnabled },
    { label: t('nav.players'), icon: '👥', path: '/players', perm: 'player.search' },
    { label: t('nav.favorites'), icon: '❤️', path: '/my/favorites', perm: 'player.favorites.manage' },
    { label: t('nav.statistics'), icon: '📊', path: '/my/statistics', perm: 'player.statistics.view' },
    { label: t('nav.achievements'), icon: '🏅', path: '/my/achievements', perm: 'player.achievements.view' },
    { label: t('nav.wallet'), icon: '👛', path: '/my/wallet', perm: 'player.wallet.view' },
    { label: t('nav.payments'), icon: '💳', path: '/my/payments', perm: 'player.payments.view' },
    { label: t('nav.rank_history'), icon: '📈', path: '/my/rank-history', perm: 'player.rank.history' },
    { label: t('nav.my_tournaments'), icon: '🥇', path: '/my/tournaments', perm: 'player.tournaments.register' },
    { label: t('nav.notifications'), icon: '🔔', path: '/notifications' },
    ...(isSeller ? [{ label: t('nav.my_shop'), icon: '🏪', path: '/marketplace/seller' }] : []),
  ];
}

export function filterPlayerMoreItems(items: PlayerMoreItem[], can: (perm: string) => boolean): PlayerMoreItem[] {
  return items.filter((i) => (i.show === undefined || i.show) && (!i.perm || can(i.perm)) && (i.flag === undefined || i.flag));
}

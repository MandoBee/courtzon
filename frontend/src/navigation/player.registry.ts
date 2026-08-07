import type { PlayerCoreTabDef, PlayerMoreItemDef } from './types';
import { T } from './labels';

export const PLAYER_CORE_TABS: PlayerCoreTabDef[] = [
  { id: 'nav.home', label: T('nav.home'), icon: '🏠', path: '/app' },
  { id: 'nav.bookings', label: T('nav.bookings'), icon: '📅', path: '/bookings' },
  { id: 'nav.marketplace', label: T('nav.marketplace'), icon: '🛒', path: '/marketplace' },
];

export const PLAYER_MORE_ITEMS: PlayerMoreItemDef[] = [
  { id: 'nav.matches', label: T('nav.matches'), icon: '🎯', path: '/matches' },
  { id: 'nav.coaches', label: T('nav.coaches'), icon: '🏆', path: '/coaches', permissionKey: 'coaches.view' },
  { id: 'nav.tournaments', label: T('nav.tournaments'), icon: '🥇', path: '/tournaments', permissionKey: 'tournaments.view' },
  { id: 'nav.academies', label: T('nav.academies'), icon: '🎓', path: '/academies', permissionKey: 'academies.view' },
  { id: 'nav.messages', label: T('nav.messages'), icon: '💬', path: '/messages', permissionKey: 'community.chat.view', featureFlag: 'community.chat_enabled' },
  { id: 'nav.players', label: T('nav.players'), icon: '👥', path: '/players', permissionKey: 'player.search' },
  { id: 'nav.favorites', label: T('nav.favorites'), icon: '❤️', path: '/my/favorites', permissionKey: 'player.favorites.manage' },
  { id: 'nav.statistics', label: T('nav.statistics'), icon: '📊', path: '/my/statistics', permissionKey: 'player.statistics.view' },
  { id: 'nav.achievements', label: T('nav.achievements'), icon: '🏅', path: '/my/achievements', permissionKey: 'player.achievements.view' },
  { id: 'nav.wallet', label: T('nav.wallet'), icon: '👛', path: '/my/wallet', permissionKey: 'player.wallet.view' },
  { id: 'nav.payments', label: T('nav.payments'), icon: '💳', path: '/my/payments', permissionKey: 'player.payments.view' },
  { id: 'nav.rank_history', label: T('nav.rank_history'), icon: '📈', path: '/my/rank-history', permissionKey: 'player.rank.history' },
  { id: 'nav.my_tournaments', label: T('nav.my_tournaments'), icon: '🥇', path: '/my/tournaments', permissionKey: 'player.tournaments.register' },
  { id: 'nav.notifications', label: T('nav.notifications'), icon: '🔔', path: '/notifications' },
  { id: 'nav.my_shop', label: T('nav.my_shop'), icon: '🏪', path: '/marketplace/seller', sellerOnly: true },
];

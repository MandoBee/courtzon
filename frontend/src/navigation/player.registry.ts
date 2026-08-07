import type { PlayerCoreTabDef, PlayerMoreItemDef } from './types';
import { T } from './labels';
import { buildNavIdKeyMaps } from './id-key';

export const PLAYER_CORE_TABS: PlayerCoreTabDef[] = [
  { id: 'nav.player.home', label: T('nav.home'), icon: '🏠', path: '/app' },
  { id: 'nav.player.bookings', label: T('nav.bookings'), icon: '📅', path: '/bookings' },
  { id: 'nav.player.marketplace', label: T('nav.marketplace'), icon: '🛒', path: '/marketplace' },
];

export const PLAYER_MORE_ITEMS: PlayerMoreItemDef[] = [
  { id: 'nav.player.matches', label: T('nav.matches'), icon: '🎯', path: '/matches' },
  { id: 'nav.player.coaches', label: T('nav.coaches'), icon: '🏆', path: '/coaches', permissionKey: 'coaches.view' },
  { id: 'nav.player.tournaments', label: T('nav.tournaments'), icon: '🥇', path: '/tournaments', permissionKey: 'tournaments.view' },
  { id: 'nav.player.academies', label: T('nav.academies'), icon: '🎓', path: '/academies', permissionKey: 'academies.view' },
  { id: 'nav.player.messages', label: T('nav.messages'), icon: '💬', path: '/messages', permissionKey: 'community.chat.view', featureFlag: 'community.chat_enabled' },
  { id: 'nav.player.players', label: T('nav.players'), icon: '👥', path: '/players', permissionKey: 'player.search' },
  { id: 'nav.player.favorites', label: T('nav.favorites'), icon: '❤️', path: '/my/favorites', permissionKey: 'player.favorites.manage' },
  { id: 'nav.player.statistics', label: T('nav.statistics'), icon: '📊', path: '/my/statistics', permissionKey: 'player.statistics.view' },
  { id: 'nav.player.achievements', label: T('nav.achievements'), icon: '🏅', path: '/my/achievements', permissionKey: 'player.achievements.view' },
  { id: 'nav.player.wallet', label: T('nav.wallet'), icon: '👛', path: '/my/wallet', permissionKey: 'player.wallet.view' },
  { id: 'nav.player.payments', label: T('nav.payments'), icon: '💳', path: '/my/payments', permissionKey: 'player.payments.view' },
  { id: 'nav.player.rank_history', label: T('nav.rank_history'), icon: '📈', path: '/my/rank-history', permissionKey: 'player.rank.history' },
  { id: 'nav.player.my_tournaments', label: T('nav.my_tournaments'), icon: '🥇', path: '/my/tournaments', permissionKey: 'player.tournaments.register' },
  { id: 'nav.player.notifications', label: T('nav.notifications'), icon: '🔔', path: '/notifications' },
  { id: 'nav.player.my_shop', label: T('nav.my_shop'), icon: '🏪', path: '/marketplace/seller', sellerOnly: true },
];

const { idToKey, keyToIds } = buildNavIdKeyMaps([...PLAYER_CORE_TABS, ...PLAYER_MORE_ITEMS]);

export const PLAYER_ID_TO_KEY: ReadonlyMap<string, string> = idToKey;
export const PLAYER_LEGACY_KEY_TO_ID: ReadonlyMap<string, string[]> = keyToIds;

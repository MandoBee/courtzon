export * from './types';
export { T, LIT, COMPOSITE, resolveLabel } from './labels';
export { ADMIN_NAV } from './admin.registry';
export { ORG_NAV } from './org.registry';
export { COACH_NAV } from './coach.registry';
export { REFEREE_NAV } from './referee.registry';
export { PLAYER_CORE_TABS, PLAYER_MORE_ITEMS } from './player.registry';
export {
  resolveAdminNav,
  resolveOrgNav,
  resolveCoachNav,
  resolveRefereeNav,
  resolvePlayerCoreTabs,
  resolvePlayerMoreItems,
  type PlayerMoreOptions,
} from './resolve';

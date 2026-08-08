import {
  resolveAdminNav,
  buildAdminSearchCommands,
} from '../../navigation';
import type { NavSearchCommand } from '../../navigation/search';

export function buildAdminCommands(
  t: (key: string) => string,
  can: (perm: string) => boolean,
  flag: (key: string) => boolean,
): NavSearchCommand[] {
  return buildAdminSearchCommands(resolveAdminNav(t, can, flag));
}

import { useCallback } from 'react';
import { useAuthStore } from '../store/auth.store';

// Stable module-level identity: a fresh `[]` on every render made `permissions`
// (and therefore `can`) change identity each render, which turned downstream
// `useCallback`/`useEffect` dependency chains into an infinite render loop while
// the user is still loading (user === null).
const EMPTY_PERMISSIONS: string[] = [];

export function useCan(): {
  can: (permission: string) => boolean;
  permissions: string[];
} {
  const user = useAuthStore((s) => s.user);
  const permissions = user?.permissions ?? EMPTY_PERMISSIONS;

  const can = useCallback(
    (permission: string) => permissions.includes('*') || permissions.includes(permission),
    [permissions],
  );

  return { can, permissions };
}

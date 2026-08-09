import { useCallback } from 'react';
import { useAuthStore } from '../store/auth.store';

export function useCan(): {
  can: (permission: string) => boolean;
  permissions: string[];
} {
  const user = useAuthStore((s) => s.user);
  const permissions = user?.permissions ?? [];

  const can = useCallback(
    (permission: string) => permissions.includes('*') || permissions.includes(permission),
    [permissions],
  );

  return { can, permissions };
}

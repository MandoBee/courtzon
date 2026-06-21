import { useAuthStore } from '../store/auth.store';

export function useCan(): {
  can: (permission: string) => boolean;
  permissions: string[];
} {
  const user = useAuthStore((s) => s.user);
  const permissions = user?.permissions ?? [];

  return {
    can: (permission: string) => permissions.includes('*') || permissions.includes(permission),
    permissions,
  };
}

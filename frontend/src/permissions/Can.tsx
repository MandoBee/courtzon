import type { ReactNode } from 'react';
import { useAuthStore } from '../store/auth.store';

interface CanProps {
  permission: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export function Can({ permission, fallback = null, children }: CanProps) {
  const user = useAuthStore((s) => s.user);
  const permissions = user?.permissions ?? [];

  if (permissions.includes('*') || permissions.includes(permission)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

import { Navigate } from 'react-router-dom';
import { useCan } from '../hooks/useCan';

interface RouteGuardProps {
  children: React.ReactNode;
  permission?: string;
  fallback?: string;
}

export function RouteGuard({ children, permission, fallback = '/' }: RouteGuardProps) {
  const { can } = useCan();

  if (permission && !can(permission)) {
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}

interface PermissionRouteProps {
  element: React.ReactElement;
  permission: string;
  fallback?: string;
}

export function createPermissionRoute({ element, permission, fallback }: PermissionRouteProps) {
  return (
    <RouteGuard permission={permission} fallback={fallback}>
      {element}
    </RouteGuard>
  );
}

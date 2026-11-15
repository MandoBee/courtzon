import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { InventoryOrgProvider } from '../../admin/inventory/InventoryOrgContext';

/**
 * Binds the shared Inventory pages to the organisation of the current
 * `/org/:orgId/inventory` route. The route organisation is the only scope the
 * page ever uses; the backend validates it and returns the capabilities granted
 * by roles bound to that organisation.
 */
export function OrgInventoryScope({ children }: { children: ReactNode }) {
  const { orgId } = useParams<{ orgId: string }>();
  return <InventoryOrgProvider orgId={orgId ?? ''}>{children}</InventoryOrgProvider>;
}

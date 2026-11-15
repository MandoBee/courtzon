import PurchaseOrdersPage from '../../admin/inventory/PurchaseOrdersPage';
import { OrgInventoryScope } from './OrgInventoryScope';

export default function OrgInventoryPurchaseOrdersPage() {
  return (
    <OrgInventoryScope>
      <PurchaseOrdersPage />
    </OrgInventoryScope>
  );
}

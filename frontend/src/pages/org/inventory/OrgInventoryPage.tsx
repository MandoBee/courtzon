import InventoryPage from '../../admin/inventory/InventoryPage';
import { OrgInventoryScope } from './OrgInventoryScope';

export default function OrgInventoryPage() {
  return (
    <OrgInventoryScope>
      <InventoryPage />
    </OrgInventoryScope>
  );
}

import WarehousesPage from '../../admin/inventory/WarehousesPage';
import { OrgInventoryScope } from './OrgInventoryScope';

export default function OrgInventoryWarehousesPage() {
  return (
    <OrgInventoryScope>
      <WarehousesPage />
    </OrgInventoryScope>
  );
}

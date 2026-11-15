import SuppliersPage from '../../admin/inventory/SuppliersPage';
import { OrgInventoryScope } from './OrgInventoryScope';

export default function OrgInventorySuppliersPage() {
  return (
    <OrgInventoryScope>
      <SuppliersPage />
    </OrgInventoryScope>
  );
}

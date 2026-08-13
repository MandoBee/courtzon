import { useParams } from 'react-router-dom';
import OrgBookingSettlements from './OrgBookingSettlements';

export default function OrgBookingSettlementsPage() {
  const { orgId } = useParams<{ orgId: string }>();

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Booking Settlements</h1>
      <OrgBookingSettlements orgId={orgId} />
    </div>
  );
}

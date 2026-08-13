import { useParams } from 'react-router-dom';
import OrgShippingRatesPage from './OrgShippingRatesPage';

export default function OrgSettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;

  return <OrgShippingRatesPage orgId={orgId} />;
}

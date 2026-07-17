// Legacy wrapper — determines requestType from subscription status
// and delegates to SubscriptionRequestModal.
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import SubscriptionRequestModal from './SubscriptionRequestModal';

interface Props {
  orgId: number;
  open: boolean;
  onClose: () => void;
  triggerMessage?: string;
}

export default function UpgradeRequestModal({ orgId, open, onClose, triggerMessage }: Props) {
  const { data: subscription } = useQuery<any>({
    queryKey: ['org-subscription', orgId],
    queryFn: () => api.get(`/org/${orgId}/subscription`).then(r => r.data),
    enabled: open,
  });

  const requestType = subscription?.planId ? 'PLAN_CHANGE' : 'NEW_SUBSCRIPTION';

  return (
    <SubscriptionRequestModal
      orgId={orgId}
      open={open}
      onClose={onClose}
      requestType={requestType}
      triggerMessage={triggerMessage}
    />
  );
}

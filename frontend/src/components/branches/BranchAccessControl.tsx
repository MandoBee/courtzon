import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { useToast } from '../ui/Toast';

export default function BranchAccessControl({ branchId }: { branchId: number }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: status } = useQuery({
    queryKey: ['branch-access', branchId],
    queryFn: () => api.get(`/branches/${branchId}/my-access`).then((r) => r.data.status as string | null),
  });

  const requestMutation = useMutation({
    mutationFn: () => api.post(`/branches/${branchId}/request-access`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-access', branchId] });
      showToast('Access requested — the facility will review it.');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to request access', 'error'),
  });

  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

  if (status === 'approved') {
    return <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-success-bg)] text-[var(--color-success-text)]">✓ Access granted</span>;
  }
  if (status === 'pending') {
    return <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]">⏳ Request pending</span>;
  }
  if (status === 'rejected') {
    return (
      <Can permission="branches.request-access">
        <button onClick={(e) => { stop(e); requestMutation.mutate(); }} disabled={requestMutation.isPending}
          className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-error-bg)] text-[var(--color-error-text)] hover:opacity-80 disabled:opacity-50">
          Denied — request again
        </button>
      </Can>
    );
  }
  return (
    <Can permission="branches.request-access">
      <button onClick={(e) => { stop(e); requestMutation.mutate(); }} disabled={requestMutation.isPending}
        className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50">
        {requestMutation.isPending ? 'Requesting…' : 'Request access'}
      </button>
    </Can>
  );
}

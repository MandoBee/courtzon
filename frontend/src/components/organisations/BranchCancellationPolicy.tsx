import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../ui/Toast';

interface Props {
  branchId: number;
  orgId?: number;
}

export default function BranchCancellationPolicy({ branchId, orgId }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [windowHours, setWindowHours] = useState('');
  const [refundPercent, setRefundPercent] = useState('100');

  const policiesUrl = orgId
    ? `/org/${orgId}/branches/${branchId}/cancellation-policies`
    : `/branches/${branchId}/cancellation-policies`;
  const createUrl = orgId
    ? `/org/${orgId}/branches/${branchId}/cancellation-policies`
    : '/cancellation-policies';

  const { data, isLoading } = useQuery({
    queryKey: ['branch-cancellation-policies', branchId],
    queryFn: () => api.get(policiesUrl).then((r) => r.data.data),
    enabled: !!branchId,
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post(createUrl, payload),
    onSuccess: () => {
      showToast('Policy added!');
      queryClient.invalidateQueries({ queryKey: ['branch-cancellation-policies', branchId] });
      setWindowHours('');
      setRefundPercent('100');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      orgId
        ? api.put(`/org/${orgId}/branches/${branchId}/cancellation-policies/${id}`, payload)
        : api.put(`/cancellation-policies/${id}`, payload),
    onSuccess: () => {
      showToast('Policy updated!');
      queryClient.invalidateQueries({ queryKey: ['branch-cancellation-policies', branchId] });
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      orgId
        ? api.delete(`/org/${orgId}/branches/${branchId}/cancellation-policies/${id}`)
        : api.delete(`/cancellation-policies/${id}`),
    onSuccess: () => {
      showToast('Policy removed');
      queryClient.invalidateQueries({ queryKey: ['branch-cancellation-policies', branchId] });
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed', 'error'),
  });

  const policies = data || [];

  const handleAdd = () => {
    if (!windowHours || !refundPercent) return;
    createMutation.mutate({
      branchId,
      cancellationWindowMinutes: Number(windowHours) * 60,
      refundPercent: Number(refundPercent),
    });
  };

  const handleToggle = (id: number, currentActive: boolean) => {
    updateMutation.mutate({ id, payload: { isActive: !currentActive } });
  };

  if (isLoading) return <p className="text-xs text-[var(--color-text-muted)]">Loading...</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--color-text-muted)]">Add cancellation policies for this branch. The best matching active policy applies.</p>

      <div className="flex gap-2 items-end">
        <div>
          <label className="block text-[10px] text-[var(--color-text-muted)] mb-0.5">Window (hours)</label>
          <input
            type="number"
            value={windowHours}
            onChange={(e) => setWindowHours(e.target.value)}
            className="w-28 px-2 py-1 rounded-[var(--radius-md)] border text-sm"
            placeholder="24"
            min="0"
          />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--color-text-muted)] mb-0.5">Refund %</label>
          <input
            type="number"
            value={refundPercent}
            onChange={(e) => setRefundPercent(e.target.value)}
            className="w-24 px-2 py-1 rounded-[var(--radius-md)] border text-sm"
            min="0" max="100"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={createMutation.isPending}
          className="px-3 py-1 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {policies.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto text-xs">
          {policies.map((p: any) => {
            const hours = Math.round(Number(p.cancellation_window_minutes) / 60);
            return (
              <div key={p.id} className={`flex items-center justify-between px-3 py-1.5 rounded-[var(--radius-md)] border ${p.is_active ? 'bg-[var(--color-success-bg)] border-[var(--color-border)]' : 'bg-[var(--color-bg)] bg-[var(--color-surface)] border-[var(--color-border)]'}`}>
                <span className="text-[var(--color-text)]">
                  {hours}h before · {Number(p.refund_percent).toFixed(0)}% refund
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleToggle(p.id, !!p.is_active)}
                    className={`text-[10px] px-2 py-0.5 rounded ${p.is_active ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' : 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'}`}
                  >
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm('Delete this policy?')) deleteMutation.mutate(p.id); }}
                    className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-error-bg)] text-[var(--color-error-text)]"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';

const STATUS_OPTIONS = ['pending', 'approved', 'rejected'];

export default function BranchAccessPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [filterOrgId, setFilterOrgId] = useState<number | ''>('');
  const [filterBranchId, setFilterBranchId] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState('');

  const { data: orgs } = useQuery({
    queryKey: ['admin', 'organisations'],
    queryFn: () => api.get('/organisations').then((r: any) => r.data.data),
  });

  const { data: branches } = useQuery({
    queryKey: ['admin', 'branches', filterOrgId],
    queryFn: () => api.get(`/organisations/${filterOrgId}/branches`).then((r: any) => r.data.data),
    enabled: !!filterOrgId,
  });

  const orgList: any[] = orgs || [];
  const branchList: any[] = branches || [];

  const queryParams: Record<string, string> = {};
  if (filterOrgId) queryParams.orgId = String(filterOrgId);
  if (filterBranchId) queryParams.branchId = String(filterBranchId);
  if (filterStatus) queryParams.status = filterStatus;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'branch-access-requests', queryParams],
    queryFn: () => api.get('/admin/branch-access-requests', { params: queryParams }).then((r: any) => r.data.data),
  });

  const requests: any[] = data || [];

  const updateAccessMutation = useMutation({
    mutationFn: ({ branchId, playerId, status }: { branchId: number; playerId: number; status: string }) =>
      api.put(`/branches/${branchId}/access/${playerId}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'branch-access-requests'] });
      showToast('Access status updated');
    },
    onError: (err: any) => showToast(getErrorMessage(err, 'Failed to update'), 'error'),
  });

  function handleOrgChange(orgId: string) {
    setFilterOrgId(orgId ? Number(orgId) : '');
    setFilterBranchId('');
  }

  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-border)] bg-[var(--color-surface)] rounded-xl" />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Branch Access Requests</h1>
      {requests.length === 0 && !Object.values(queryParams).some(Boolean) ? (
        <p className="text-[var(--color-text-muted)]">No access requests found.</p>
      ) : (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <td className="p-1.5">
                    <select value={filterOrgId}
                      onChange={(e: any) => handleOrgChange(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)]">
                      <option value="">All</option>
                      {orgList.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </td>
                  <td className="p-1.5">
                    <select value={filterBranchId}
                      onChange={(e: any) => setFilterBranchId(e.target.value ? Number(e.target.value) : '')}
                      disabled={!filterOrgId}
                      className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)] disabled:opacity-50">
                      <option value="">All</option>
                      {branchList.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </td>
                  <td className="p-1.5" />
                  <td className="p-1.5" />
                  <td className="p-1.5">
                    <select value={filterStatus}
                      onChange={(e: any) => setFilterStatus(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)]">
                      <option value="">All</option>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="p-1.5" />
                </tr>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="text-left p-3 text-[var(--color-text-muted)] font-medium">Org</th>
                  <th className="text-left p-3 text-[var(--color-text-muted)] font-medium">Branch</th>
                  <th className="text-left p-3 text-[var(--color-text-muted)] font-medium">Player</th>
                  <th className="text-left p-3 text-[var(--color-text-muted)] font-medium">Phone</th>
                  <th className="text-left p-3 text-[var(--color-text-muted)] font-medium">Status</th>
                  <th className="text-left p-3 text-[var(--color-text-muted)] font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-[var(--color-text-muted)]">No requests match filters</td></tr>
                ) : (
                  requests.map((r: any) => (
                    <tr key={`${r.branch_id}-${r.player_id}`} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="p-3 text-[var(--color-text)]">{r.organisation_name}</td>
                      <td className="p-3 text-[var(--color-text)]">{r.branch_name}</td>
                      <td className="p-3 text-[var(--color-text)] font-medium">{r.full_name}</td>
                      <td className="p-3 text-[var(--color-text-muted)]">{r.phone_number || '-'}</td>
                      <td className="p-3">
                        <select value={r.status}
                          onChange={(e: any) => updateAccessMutation.mutate({ branchId: r.branch_id, playerId: r.player_id, status: e.target.value })}
                          className="text-xs px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)] w-full">
                          {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s} disabled={s === r.status}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 text-[var(--color-text-muted)] text-xs">
                        {new Date(r.created_at).toLocaleDateString('en-GB')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

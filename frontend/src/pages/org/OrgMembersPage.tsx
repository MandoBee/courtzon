import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';
import { getErrorMessage } from '../../utils/errors';

const STATUS_OPTIONS = ['pending', 'approved', 'rejected', 'banned'] as const;

const statusClass: Record<string, string> = {
  pending: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  approved: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  rejected: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  banned: 'bg-[var(--color-surface)] text-[var(--color-text-muted)] text-[var(--color-text-muted)]',
};

export default function OrgMembersPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [filterBranchId, setFilterBranchId] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState('');

  const { data: branches } = useQuery({
    queryKey: ['org-branches', orgId],
    queryFn: () => api.get(`/org/${orgId}/branches`).then((r) => r.data || []),
    enabled: !!orgId,
  });

  const queryParams: Record<string, string> = {};
  if (filterBranchId) queryParams.branchId = String(filterBranchId);
  if (filterStatus) queryParams.status = filterStatus;

  const { data: members, isLoading } = useQuery({
    queryKey: ['org-members', orgId, queryParams],
    queryFn: () => api.get(`/org/${orgId}/members`, { params: queryParams }).then((r) => r.data?.data || []),
    enabled: !!orgId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ branchId, playerId, status }: { branchId: number; playerId: number; status: string }) =>
      api.put(`/org/${orgId}/members/${branchId}/${playerId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgId] });
      showToast('Member access updated');
    },
    onError: (err) => showToast(getErrorMessage(err, 'Failed to update'), 'error'),
  });

  if (!orgId) return <div>Invalid organisation</div>;
  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-border)] bg-[var(--color-surface)] rounded-xl" />;

  const branchList: { id: number; name: string }[] = Array.isArray(branches) ? branches : [];
  const rows: any[] = members || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">🎫 Members</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Players who requested or hold access to your restricted branches. Approve or reject requests so they can book.
        </p>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <td className="p-1.5">
                  <select
                    value={filterBranchId}
                    onChange={(e) => setFilterBranchId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)]"
                  >
                    <option value="">All branches</option>
                    {branchList.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </td>
                <td className="p-1.5" />
                <td className="p-1.5" />
                <td className="p-1.5">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)]"
                  >
                    <option value="">All statuses</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td className="p-1.5" />
                <td className="p-1.5" />
              </tr>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium">Branch</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium">Player</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium">Contact</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium">Status</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium">Requested</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium">Reviewed by</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-[var(--color-text-muted)]">
                    No member records match your filters.
                  </td>
                </tr>
              ) : (
                rows.map((r: any) => (
                  <tr key={`${r.branch_id}-${r.player_id}`} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="p-3 text-[var(--color-text)]">{r.branch_name}</td>
                    <td className="p-3 text-[var(--color-text)] font-medium">{r.full_name}</td>
                    <td className="p-3 text-[var(--color-text-muted)] text-xs">
                      <div>{r.email}</div>
                      {r.phone_number && <div>{r.phone_number}</div>}
                    </td>
                    <td className="p-3">
                      <Can
                        permission="org.members.manage"
                        fallback={
                          <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${statusClass[r.status] || ''}`}>
                            {r.status}
                          </span>
                        }
                      >
                        <select
                          value={r.status}
                          onChange={(e) =>
                            updateMutation.mutate({
                              branchId: r.branch_id,
                              playerId: r.player_id,
                              status: e.target.value,
                            })
                          }
                          disabled={updateMutation.isPending}
                          className="text-xs px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)] w-full max-w-[8rem]"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </Can>
                    </td>
                    <td className="p-3 text-[var(--color-text-muted)] text-xs">
                      {new Date(r.created_at).toLocaleDateString('en-GB')}
                    </td>
                    <td className="p-3 text-[var(--color-text-muted)] text-xs">
                      {r.reviewer_name || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

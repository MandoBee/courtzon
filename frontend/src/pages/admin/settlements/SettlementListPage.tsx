import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';

export default function SettlementListPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [orgId, setOrgId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [showRunForm, setShowRunForm] = useState(false);

  const { data: settlements, isLoading } = useQuery({
    queryKey: ['settlements', page, statusFilter],
    queryFn: () => api.get('/settlements', { params: { page, limit: 20, status: statusFilter || undefined } }).then((r: any) => r.data),
  });

  const runMutation = useMutation({
    mutationFn: (data: { organisationId: number; periodStart: string; periodEnd: string }) =>
      api.post('/settlements/run', data).then((r: any) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      setShowRunForm(false);
      setOrgId('');
      setPeriodStart('');
      setPeriodEnd('');
      showToast('Settlement run successfully!');
    },
    onError: (err: any) => { showToast('Failed to run settlement: ' + getErrorMessage(err), 'error'); },
  });

  const approveMutation = useMutation({
    mutationFn: (settlementId: number) =>
      api.post('/settlements/approve', { settlementId }).then((r: any) => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['settlements'] }); showToast('Settlement approved!'); },
    onError: (err: any) => { showToast('Failed to approve settlement: ' + getErrorMessage(err), 'error'); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Settlements</h1>
        <button
          onClick={() => setShowRunForm(!showRunForm)}
          className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)]"
        >
          {showRunForm ? 'Cancel' : 'Run Settlement'}
        </button>
      </div>

      {showRunForm && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-6 space-y-4">
          <h2 className="font-semibold text-[var(--color-text)]">Run New Settlement</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">Organisation ID</label>
              <input type="number" value={orgId} onChange={(e: any) => setOrgId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)]" />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">Period Start</label>
              <input type="date" value={periodStart} onChange={(e: any) => setPeriodStart(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)]" />
            </div>
            <div>
              <label className="block text-sm text-[var(--color-text-muted)] mb-1">Period End</label>
              <input type="date" value={periodEnd} onChange={(e: any) => setPeriodEnd(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)]" />
            </div>
          </div>
          <button
            onClick={() => runMutation.mutate({ organisationId: Number(orgId), periodStart, periodEnd })}
            disabled={!orgId || !periodStart || !periodEnd || runMutation.isPending}
            className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] disabled:opacity-50"
          >
            {runMutation.isPending ? 'Running...' : 'Run Settlement'}
          </button>
          {runMutation.isError && (
            <p className="text-sm text-[var(--color-error)]">Failed to run settlement.</p>
          )}
        </div>
      )}

      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e: any) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)]"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="settled">Settled</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading settlements...</p>
      ) : !settlements?.data?.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">No settlements found.</p>
      ) : (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg)]">
              <tr>
                <th className="text-left px-4 py-3 text-[var(--color-text-muted)] font-medium">ID</th>
                <th className="text-left px-4 py-3 text-[var(--color-text-muted)] font-medium">Organisation</th>
                <th className="text-left px-4 py-3 text-[var(--color-text-muted)] font-medium">Period</th>
                <th className="text-right px-4 py-3 text-[var(--color-text-muted)] font-medium">Gross</th>
                <th className="text-right px-4 py-3 text-[var(--color-text-muted)] font-medium">Commission</th>
                <th className="text-right px-4 py-3 text-[var(--color-text-muted)] font-medium">Net</th>
                <th className="text-center px-4 py-3 text-[var(--color-text-muted)] font-medium">Status</th>
                <th className="text-center px-4 py-3 text-[var(--color-text-muted)] font-medium">Bookings</th>
                <th className="text-center px-4 py-3 text-[var(--color-text-muted)] font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {settlements.data.map((s: any) => (
                <tr key={s.id} className="hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 text-[var(--color-text)]">#{s.id}</td>
                  <td className="px-4 py-3 text-[var(--color-text)]">{s.organisation_id}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">
                    {s.period_start ? new Date(s.period_start).toLocaleDateString('en-GB') : ''} — {s.period_end ? new Date(s.period_end).toLocaleDateString('en-GB') : ''}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--color-text)]">{Number(s.gross_amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-error-text)]">{Number(s.commission_amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-success-text)] font-medium">{Number(s.net_amount).toFixed(2)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                      s.status === 'settled' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
                      : s.status === 'pending' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)] dark:bg-yellow-900/30 dark:text-yellow-400'
                      : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-[var(--color-text)]">{s.booking_count}</td>
                  <td className="px-4 py-3 text-center">
                    {s.status === 'pending' && (
                      <button
                        onClick={() => approveMutation.mutate(s.id)}
                        disabled={approveMutation.isPending}
                        className="text-xs px-2 py-1 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] disabled:opacity-50"
                      >
                        {approveMutation.isPending ? '...' : 'Approve'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {settlements && settlements.total > settlements.limit && (
        <div className="flex items-center justify-between">
          <button onClick={() => setPage((p: any) => Math.max(1, p - 1))} disabled={page <= 1}
            className="text-sm text-[var(--color-primary)] disabled:opacity-50">Previous</button>
          <span className="text-sm text-[var(--color-text-muted)]">Page {page} of {Math.ceil(settlements.total / settlements.limit)}</span>
          <button onClick={() => setPage((p: any) => p + 1)} disabled={page >= Math.ceil(settlements.total / settlements.limit)}
            className="text-sm text-[var(--color-primary)] disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}

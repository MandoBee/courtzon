import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface Period {
  id: number;
  fiscal_year: number;
  period_number: number;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed' | 'locked';
}

const STATUS_BADGE: Record<string, string> = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  locked: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

export default function AccountingPeriodsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showGenerate, setShowGenerate] = useState(false);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [periodCount, setPeriodCount] = useState(12);
  const [actionTarget, setActionTarget] = useState<{ id: number; action: 'close' | 'open' } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'periods'],
    queryFn: () => api.get('/accounting/periods').then((r: any) => r.data.data || r.data),
  });

  const periods: Period[] = data || [];

  const generateMutation = useMutation({
    mutationFn: () => api.post('/accounting/periods/generate', { fiscalYear, periodCount }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'periods'] }); setShowGenerate(false); showToast('Periods generated!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => api.put(`/accounting/periods/${id}/close`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'periods'] }); setActionTarget(null); showToast('Period closed!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const openMutation = useMutation({
    mutationFn: (id: number) => api.put(`/accounting/periods/${id}/open`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounting', 'periods'] }); setActionTarget(null); showToast('Period opened!'); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Accounting Periods</h1>
        <Can permission="accounting.periods.manage">
          <Button onClick={() => { setShowGenerate(true); setFiscalYear(new Date().getFullYear()); }}>+ Generate Periods</Button>
        </Can>
      </div>

      {showGenerate && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">Generate Accounting Periods</h3>
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Fiscal Year</label>
              <input type="number" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-28" />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Periods</label>
              <select value={periodCount} onChange={e => setPeriodCount(Number(e.target.value))}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value={12}>12 (Monthly)</option>
                <option value={4}>4 (Quarterly)</option>
                <option value={2}>2 (Semi-Annual)</option>
                <option value={1}>1 (Annual)</option>
              </select>
            </div>
            <Button onClick={() => generateMutation.mutate()} loading={generateMutation.isPending}>Generate</Button>
            <Button variant="ghost" onClick={() => setShowGenerate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Fiscal Year</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Period</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Start Date</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">End Date</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
              <Can permission="accounting.periods.manage">
                <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
              </Can>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {periods.map(p => (
              <tr key={p.id} className="hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3 text-[var(--color-text)]">{p.fiscal_year}</td>
                <td className="px-4 py-3 text-center text-[var(--color-text)]">{p.period_number}</td>
                <td className="px-4 py-3 text-[var(--color-text)]">{new Date(p.start_date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-[var(--color-text)]">{new Date(p.end_date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${STATUS_BADGE[p.status]}`}>{p.status}</span>
                </td>
                <Can permission="accounting.periods.manage">
                  <td className="px-4 py-3 text-right">
                    {p.status === 'open' && (
                      <button onClick={() => setActionTarget({ id: p.id, action: 'close' })}
                        className="text-xs text-[var(--color-primary)] hover:underline">Close</button>
                    )}
                    {p.status === 'closed' && (
                      <button onClick={() => setActionTarget({ id: p.id, action: 'open' })}
                        className="text-xs text-[var(--color-primary)] hover:underline">Open</button>
                    )}
                  </td>
                </Can>
              </tr>
            ))}
          </tbody>
        </table>
        {!periods.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No periods found</p>}
      </div>

      <Modal open={actionTarget !== null} onClose={() => setActionTarget(null)} title={actionTarget?.action === 'close' ? 'Close Period' : 'Open Period'}>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          {actionTarget?.action === 'close' ? 'Are you sure you want to close this period? This may prevent new entries.' : 'Re-open this period for posting?'}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setActionTarget(null)}>Cancel</Button>
          <Button onClick={() => {
            if (!actionTarget) return;
            if (actionTarget.action === 'close') closeMutation.mutate(actionTarget.id);
            else openMutation.mutate(actionTarget.id);
          }} loading={closeMutation.isPending || openMutation.isPending}
            className="bg-[var(--color-primary)] text-white">Confirm</Button>
        </div>
      </Modal>
    </div>
  );
}

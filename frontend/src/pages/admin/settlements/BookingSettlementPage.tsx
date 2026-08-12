import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { useCan } from '../../../hooks/useCan';

const ELIGIBILITY_BADGE: Record<string, string> = {
  NOT_ELIGIBLE: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  ELIGIBLE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  PARTIALLY_SETTLED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  SETTLED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

export default function BookingSettlementPage() {
  const { can } = useCan();
  if (!can('settlements.view')) return null;
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [orgId, setOrgId] = useState('');
  const [settleTarget, setSettleTarget] = useState<any | null>(null);
  const [coachAmount, setCoachAmount] = useState('');
  const [orgAmount, setOrgAmount] = useState('');
  const [collectTarget, setCollectTarget] = useState<any | null>(null);
  const [collectParty, setCollectParty] = useState<'coach' | 'org'>('org');
  const [collectAmount, setCollectAmount] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['booking-settlements', page, orgId],
    queryFn: () => api.get('/settlements/bookings/eligible', { params: { page, limit: 20, organisationId: orgId || undefined } }).then((r: any) => r.data),
  });

  const settleMutation = useMutation({
    mutationFn: ({ bookingId, coachAmount, orgAmount }: any) =>
      api.post(`/settlements/bookings/${bookingId}/settle`, { coachAmount, orgAmount }),
    onSuccess: (r: any) => {
      const d = r.data;
      showToast(`Settled: coach ${d.coachSettled}, org ${d.orgSettled}${d.coachOffset || d.orgOffset ? ` (offset ${(d.coachOffset || 0) + (d.orgOffset || 0)})` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['booking-settlements'] });
      setSettleTarget(null); setCoachAmount(''); setOrgAmount('');
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const collectMutation = useMutation({
    mutationFn: ({ bookingId, party, amount }: any) =>
      api.post(`/settlements/bookings/${bookingId}/recovery/collect`, { party, amount }),
    onSuccess: (r: any) => {
      showToast(`Collected ${r.data.collected} recovery`);
      queryClient.invalidateQueries({ queryKey: ['booking-settlements'] });
      setCollectTarget(null); setCollectAmount('');
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const fmt = (n: number) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rows = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Booking Settlements</h1>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-[var(--color-text-muted)]">Organisation ID (blank = all)</label>
        <input type="number" value={orgId} onChange={(e) => { setOrgId(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] w-40" />
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading eligible bookings...</p>
      ) : !rows.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">No settlement-eligible bookings.</p>
      ) : (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg)]">
              <tr>
                <th className="text-left px-4 py-3 text-[var(--color-text-muted)] font-medium">Booking</th>
                <th className="text-left px-4 py-3 text-[var(--color-text-muted)] font-medium">Org</th>
                <th className="text-left px-4 py-3 text-[var(--color-text-muted)] font-medium">Date</th>
                <th className="text-right px-4 py-3 text-[var(--color-text-muted)] font-medium">Coach (settled/settleable)</th>
                <th className="text-right px-4 py-3 text-[var(--color-text-muted)] font-medium">Org (settled/settleable)</th>
                <th className="text-center px-4 py-3 text-[var(--color-text-muted)] font-medium">Status</th>
                <th className="text-center px-4 py-3 text-[var(--color-text-muted)] font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {rows.map((b: any) => (
                <tr key={b.bookingId} className="hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 text-[var(--color-text)]">#{b.bookingId}</td>
                  <td className="px-4 py-3 text-[var(--color-text)]">{b.organisationId ?? '—'}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">{b.bookingDate} {b.startTime}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-text)]">{fmt(b.coachSettled)} / {fmt(b.coachSettleable)}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-text)]">{fmt(b.orgSettled)} / {fmt(b.orgSettleable)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${ELIGIBILITY_BADGE[b.eligibility] || ''}`}>
                      {b.eligibility}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center space-x-2">
                    <button onClick={() => { setSettleTarget(b); setCoachAmount(String(b.coachSettleable)); setOrgAmount(String(b.orgSettleable)); }}
                      className="text-xs px-2 py-1 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)]">Settle</button>
                    {(b.coachOutstandingRecovery > 0 || b.orgOutstandingRecovery > 0) && (
                      <button onClick={() => { setCollectTarget(b); setCollectParty(b.coachOutstandingRecovery > 0 ? 'coach' : 'org'); }}
                        className="text-xs px-2 py-1 border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-md)]">Collect Recovery</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > 20 && (
        <div className="flex items-center justify-between">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="text-sm text-[var(--color-primary)] disabled:opacity-50">Previous</button>
          <span className="text-sm text-[var(--color-text-muted)]">Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(data.total / 20)}
            className="text-sm text-[var(--color-primary)] disabled:opacity-50">Next</button>
        </div>
      )}

      {/* Settle Modal */}
      {settleTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-xl p-6 w-full max-w-md">
            <h2 className="font-semibold text-[var(--color-text)] mb-4">Settle Booking #{settleTarget.bookingId}</h2>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              Coach settleable: {fmt(settleTarget.coachSettleable)} | Org settleable: {fmt(settleTarget.orgSettleable)}
              {settleTarget.coachOutstandingRecovery > 0 && <span className="block text-amber-600">Coach outstanding recovery: {fmt(settleTarget.coachOutstandingRecovery)} (will auto-offset)</span>}
              {settleTarget.orgOutstandingRecovery > 0 && <span className="block text-amber-600">Org outstanding recovery: {fmt(settleTarget.orgOutstandingRecovery)} (will auto-offset)</span>}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">Coach Amount</label>
                <input type="number" min="0" value={coachAmount} onChange={(e) => setCoachAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)]" />
              </div>
              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">Organization Amount</label>
                <input type="number" min="0" value={orgAmount} onChange={(e) => setOrgAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setSettleTarget(null)} className="px-3 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)]">Cancel</button>
              <button onClick={() => settleMutation.mutate({ bookingId: settleTarget.bookingId, coachAmount: Number(coachAmount) || 0, orgAmount: Number(orgAmount) || 0 })}
                disabled={settleMutation.isPending}
                className="px-3 py-2 text-sm bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] disabled:opacity-50">
                {settleMutation.isPending ? 'Settling...' : 'Confirm Settle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect Recovery Modal */}
      {collectTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-xl p-6 w-full max-w-md">
            <h2 className="font-semibold text-[var(--color-text)] mb-4">Collect Recovery — Booking #{collectTarget.bookingId}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">Party</label>
                <select value={collectParty} onChange={(e) => setCollectParty(e.target.value as 'coach' | 'org')}
                  className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)]">
                  <option value="coach">Coach (outstanding {fmt(collectTarget.coachOutstandingRecovery)})</option>
                  <option value="org">Organization (outstanding {fmt(collectTarget.orgOutstandingRecovery)})</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1">Amount</label>
                <input type="number" min="0" value={collectAmount} onChange={(e) => setCollectAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setCollectTarget(null)} className="px-3 py-2 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)]">Cancel</button>
              <button onClick={() => collectMutation.mutate({ bookingId: collectTarget.bookingId, party: collectParty, amount: Number(collectAmount) || 0 })}
                disabled={collectMutation.isPending}
                className="px-3 py-2 text-sm bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] disabled:opacity-50">
                {collectMutation.isPending ? 'Collecting...' : 'Collect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

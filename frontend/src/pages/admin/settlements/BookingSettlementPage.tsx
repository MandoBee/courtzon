import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { useCan } from '../../../hooks/useCan';
import { Can } from '../../../permissions/Can';

const ELIGIBILITY_BADGE: Record<string, string> = {
  NOT_ELIGIBLE: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  ELIGIBLE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  PARTIALLY_SETTLED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  SETTLED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const fmt = (n: number) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface EligibleBooking {
  bookingId: number;
  organisationId: number | null;
  orgName: string;
  bookingType: string;
  paymentMethod: string;
  bookingDate: string;
  startTime: string;
  cardOnlineNet: number;
  codFee: number;
  gross: number;
  coachSettleable: number;
  orgSettleable: number;
  coachOutstandingRecovery: number;
  orgOutstandingRecovery: number;
  eligibility: string;
  eligibilityReason: string;
}

interface Preview {
  gross: number;
  onlineNet: number;
  codGross: number;
  codFee: number;
  commission: number;
  direction: 'COURTZON_TO_ORGANIZATION' | 'ORGANIZATION_TO_COURTZON' | 'ZERO_BALANCE';
  finalAmount: number;
  eligibleBookings: number;
}

const DIRECTION_LABEL: Record<string, string> = {
  COURTZON_TO_ORGANIZATION: 'CourtZon pays Organization',
  ORGANIZATION_TO_COURTZON: 'Organization pays CourtZon',
  ZERO_BALANCE: 'Zero balance — no payment required',
};

export default function BookingSettlementPage() {
  const { can } = useCan();
  const navigate = useNavigate();
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

  if (!can('settlements.view')) return null;

  // Organisation options — reuse the existing admin organisation lookup
  // (financial.view) with a scoped fallback (my/scopes) for org-scoped admins.
  // Both data sources are backend-enforced — no frontend-only authorization.
  const orgsQuery = useQuery<{ id: number; name: string }[]>({
    queryKey: ['admin-org-options'],
    queryFn: async () => {
      try {
        const r = await api.get('/admin/organisations');
        return (r.data || []).map((o: any) => ({ id: Number(o.id), name: String(o.name || '') }));
      } catch {
        const r = await api.get('/my/scopes');
        const arr = (r.data?.data || []) as any[];
        return arr
          .filter((s: any) => s.scope_id != null)
          .map((s: any) => ({ id: Number(s.scope_id), name: String(s.name || '') }));
      }
    },
    staleTime: 60_000,
  });

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

  // Create ONE unified settlement for the selected organisation — nets the
  // Card/online position held by CourtZon against the COD commission owed by
  // the organisation via the SAME authoritative unified settlement engine.
  const createSettlementMutation = useMutation({
    mutationFn: (org: number) =>
      api.post('/unified-settlements', { orgId: org, excludeEntitlementIds: [] }).then((r) => r.data),
    onSuccess: (detail: any) => {
      showToast('Settlement created');
      queryClient.invalidateQueries({ queryKey: ['booking-settlements'] });
      navigate(`/admin/unified-settlements/${detail.settlement.id}`);
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const rows: EligibleBooking[] = data?.data || [];
  const preview: Preview | undefined = data?.preview;
  const canRequest = can('settlements.request');

  const orgOptions = useMemo(() => {
    const list = orgsQuery.data || [];
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [orgsQuery.data]);
  const selectedOrgName = orgOptions.find((o) => String(o.id) === orgId)?.name;

  const handleCreate = () => {
    if (!orgId) { showToast('Select an organisation to create a settlement', 'warning'); return; }
    createSettlementMutation.mutate(Number(orgId));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Booking Settlements</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-[var(--color-text-muted)]" htmlFor="booking-settlement-org">Organisation</label>
        <select
          id="booking-settlement-org"
          value={orgId}
          onChange={(e) => { setOrgId(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] min-w-64"
        >
          <option value="">All Organisations</option>
          {orgOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.name} (#{o.id})</option>
          ))}
        </select>
        {orgId && <span className="text-xs text-[var(--color-text-muted)]">Showing only {selectedOrgName}</span>}
      </div>

      {/* Settlement preview — entitlement-driven booking breakdown (card vs COD) */}
      {preview && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-4 text-sm space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-[var(--color-text)]">Booking Settlement Preview</p>
            <span className="text-xs text-[var(--color-text-muted)]">{preview.eligibleBookings} eligible booking(s)</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-[var(--color-text-muted)] text-xs">Gross bookings</p>
              <p className="text-lg font-bold text-[var(--color-text)]">{fmt(preview.gross)}</p>
            </div>
            <div>
              <p className="text-[var(--color-text-muted)] text-xs">Online / Card net — held by CourtZon, owed to org</p>
              <p className="text-lg font-bold text-[var(--color-text)]">{fmt(preview.onlineNet)}</p>
            </div>
            <div>
              <p className="text-[var(--color-text-muted)] text-xs">COD collected by organisation</p>
              <p className="text-lg font-bold text-[var(--color-text)]">{fmt(preview.codGross)}</p>
            </div>
            <div>
              <p className="text-[var(--color-text-muted)] text-xs">CourtZon COD commission receivable</p>
              <p className="text-lg font-bold text-[var(--color-text)]">{fmt(preview.codFee)}</p>
            </div>
            <div>
              <p className="text-[var(--color-text-muted)] text-xs">CourtZon commission</p>
              <p className="text-lg font-bold text-[var(--color-text)]">{fmt(preview.commission)}</p>
            </div>
            <div>
              <p className="text-[var(--color-text-muted)] text-xs">Net settlement direction</p>
              <p className="text-sm font-medium text-[var(--color-text)]">{DIRECTION_LABEL[preview.direction] || preview.direction}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--color-border)]">
            <span className="text-[var(--color-text-muted)]">
              Net settlement payable to the organisation: <strong className="text-[var(--color-text)]">{fmt(preview.finalAmount)}</strong>
            </span>
            <Can permission="settlements.request">
              <button
                onClick={handleCreate}
                disabled={createSettlementMutation.isPending || !orgId || preview.eligibleBookings === 0}
                className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50"
              >
                {createSettlementMutation.isPending ? 'Creating...' : 'Create Settlement'}
              </button>
            </Can>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading eligible bookings...</p>
      ) : !rows.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          {preview ? 'No settlement-eligible bookings.' : 'No eligible bookings found for the current organisation scope.'}
        </p>
      ) : (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-bg)]">
              <tr>
                <th className="text-left px-4 py-3 text-[var(--color-text-muted)] font-medium">Booking</th>
                <th className="text-left px-4 py-3 text-[var(--color-text-muted)] font-medium">Org</th>
                <th className="text-left px-4 py-3 text-[var(--color-text-muted)] font-medium">Date</th>
                <th className="text-left px-4 py-3 text-[var(--color-text-muted)] font-medium">Type</th>
                <th className="text-left px-4 py-3 text-[var(--color-text-muted)] font-medium">Method</th>
                <th className="text-right px-4 py-3 text-[var(--color-text-muted)] font-medium">Card online net</th>
                <th className="text-right px-4 py-3 text-[var(--color-text-muted)] font-medium">COD fee</th>
                <th className="text-right px-4 py-3 text-[var(--color-text-muted)] font-medium">Gross</th>
                <th className="text-center px-4 py-3 text-[var(--color-text-muted)] font-medium">Status</th>
                <th className="text-center px-4 py-3 text-[var(--color-text-muted)] font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {rows.map((b: EligibleBooking) => (
                <tr key={b.bookingId} className="hover:bg-[var(--color-bg)]/30">
                  <td className="px-4 py-3 text-[var(--color-text)]">#{b.bookingId}</td>
                  <td className="px-4 py-3 text-[var(--color-text)]">{b.orgName || b.organisationId || '—'}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs whitespace-nowrap">{b.bookingDate} {b.startTime}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs">{b.bookingType}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)] text-xs uppercase">{b.paymentMethod}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-text)]">{fmt(b.cardOnlineNet)}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-text)]">{fmt(b.codFee)}</td>
                  <td className="px-4 py-3 text-right text-[var(--color-text)]">{fmt(b.gross)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${ELIGIBILITY_BADGE[b.eligibility] || ''}`}>
                      {b.eligibility}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center space-x-2">
                    {canRequest && (b.orgSettleable > 0 || b.coachSettleable > 0) && (
                      <button onClick={() => { setSettleTarget(b); setCoachAmount(String(b.coachSettleable)); setOrgAmount(String(b.orgSettleable)); }}
                        className="text-xs px-2 py-1 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)]">Settle</button>
                    )}
                    {canRequest && (b.coachOutstandingRecovery > 0 || b.orgOutstandingRecovery > 0) && (
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
              Coach settleable: {fmt(settleTarget.coachSettleable)} | Org (card online net) settleable: {fmt(settleTarget.orgSettleable)}
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
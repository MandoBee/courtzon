import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { useCan } from '../../../hooks/useCan';
import { formatPrice } from '../../../utils/currency';
import { formatISODate } from '../../../utils/formatDate';

const TYPE_LABEL: Record<string, string> = {
  ORGANIZATION_EARNING: 'Organization Earning',
  COURTZON_COMMISSION: 'CourtZon Commission',
  ORGANIZATION_ADJUSTMENT: 'Organization Adjustment',
  COURTZON_ADJUSTMENT: 'CourtZon Adjustment',
};

const DIRECTION_LABEL: Record<string, string> = {
  COURTZON_TO_ORGANIZATION: 'CourtZon pays Organization',
  ORGANIZATION_TO_COURTZON: 'Organization pays CourtZon',
  ZERO_BALANCE: 'Zero balance — no payment required',
};

const SOURCE_LABEL: Record<string, string> = {
  marketplace: 'Marketplace',
  booking: 'Booking',
  academy: 'Academy',
  tournament: 'Tournament',
  coach_session: 'Coach Session',
  manual: 'Manual',
};

const fmtDate = (v: string | null | undefined): string => (v ? formatISODate(String(v).slice(0, 10)) : '—');

export default function UnifiedSettlementCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { can } = useCan();

  // Step 1 — Organisation dropdown/select (searchable, name-first).
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<{ id: number; name: string } | null>(null);
  const orgMenuRef = useRef<HTMLDivElement | null>(null);

  // Step 2 — settlement item selection (all selected by default; uncheck to exclude).
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  // Step 5 — payment method (Bank / Cash) + reference, persisted via the
  // canonical RecordPaymentSchema.
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'cash' | ''>('bank_transfer');
  const [paymentReference, setPaymentReference] = useState('');

  // Guards a single create→pay sequence against double submission.
  const busyRef = useRef(false);

  // Accessible organisations, loaded when the dropdown opens. Primary source is
  // the admin organisation lookup (financial.view, server-side); falls back to
  // the caller's own scoped organisations (/my/scopes) for org-scoped admins.
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
    enabled: orgMenuOpen,
    staleTime: 60_000,
  });

  const filteredOrgs = useMemo(() => {
    const term = orgSearch.trim().toLowerCase();
    const list = orgsQuery.data || [];
    if (!term) return list;
    return list.filter((o) => o.name.toLowerCase().includes(term) || String(o.id).includes(term));
  }, [orgsQuery.data, orgSearch]);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!orgMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (orgMenuRef.current && !orgMenuRef.current.contains(e.target as Node)) setOrgMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOrgMenuOpen(false); };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [orgMenuOpen]);

  const pickOrg = (org: { id: number; name: string }) => {
    setSelectedOrg(org);
    setOrgSearch('');
    setOrgMenuOpen(false);
    setExcluded(new Set());
  };

  const toggleExclude = (id: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Step 2/3 — canonical preview: only the selected organisation's eligible
  // AVAILABLE entitlements (authoritative eligibility incl. gateway-settlement
  // linkage). The backend recomputes financials for the selected set.
  const preview = useQuery({
    queryKey: ['unified-settlement-preview', selectedOrg?.id, [...excluded].join(',')],
    queryFn: () =>
      api.get('/unified-settlements/preview', {
        params: { orgId: selectedOrg!.id, exclude: [...excluded].join(',') },
      }).then((r) => r.data),
    enabled: !!selectedOrg,
  });

  const ents: any[] = preview.data?.entitlements || [];
  const selectedEnts = ents.filter((e: any) => !excluded.has(e.id));
  const availableTotal = useMemo(() => ents.reduce((s, e: any) => s + Number(e.amount || 0), 0), [ents]);
  const selectedTotal = useMemo(() => selectedEnts.reduce((s, e: any) => s + Number(e.amount || 0), 0), [selectedEnts]);
  const f = preview.data?.financials;

  const invalidateAndGo = (settlementId: number) => {
    queryClient.invalidateQueries({ queryKey: ['unified-settlements'] });
    queryClient.invalidateQueries({ queryKey: ['unified-settlement-preview'] });
    queryClient.invalidateQueries({ queryKey: ['gateway-settlements'] });
    navigate(`/admin/unified-settlements/${settlementId}`);
  };

  // Step 6 — canonical pay/create flow: create first, then pay (sequential,
  // both canonical endpoints). Payment only runs when the actor has the pay
  // permission; otherwise the settlement is created and the admin finalizes it
  // from the detail page (existing behaviour).
  const createdSidRef = useRef<number | null>(null);

  const payMut = useMutation({
    mutationFn: (settlementId: number) =>
      api.post(`/unified-settlements/${settlementId}/pay`, {
        paymentMethod: paymentMethod || undefined,
        paymentReference: paymentReference.trim() || undefined,
      }).then((r) => r.data),
    onSuccess: (detail) => {
      busyRef.current = false;
      showToast('Settlement created and finalized as paid');
      invalidateAndGo(detail.settlement.id);
    },
    onError: (e: any) => {
      busyRef.current = false;
      showToast(e?.response?.data?.message || 'Settlement created, but the payment could not be recorded. Record it from the detail page.', 'warning');
      invalidateAndGo(createdSidRef.current ?? 0);
    },
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.post('/unified-settlements', {
        orgId: selectedOrg!.id,
        excludeEntitlementIds: [...excluded],
      }).then((r) => r.data),
    onSuccess: (detail) => {
      if (can('settlements.pay')) {
        createdSidRef.current = detail.settlement.id;
        payMut.mutate(detail.settlement.id);
      } else {
        busyRef.current = false;
        showToast('Settlement created');
        invalidateAndGo(detail.settlement.id);
      }
    },
    onError: (e: any) => {
      busyRef.current = false;
      showToast(e?.response?.data?.message || 'Failed to create settlement', 'error');
    },
  });

  const busy = busyRef.current || createMut.isPending || payMut.isPending;
  const canPay = can('settlements.pay');
  const submitLabel = busy ? (canPay ? 'Creating & paying...' : 'Creating...') : (canPay ? 'Create Settlement & Pay' : 'Create Settlement');

  const handleSubmit = () => {
    if (busyRef.current || !selectedOrg) return;
    if (!preview.data || selectedEnts.length === 0) return;
    busyRef.current = true;
    createMut.mutate();
  };

  if (!can('settlements.request')) return null;

  return (
    <div className="p-6 space-y-4">
      <Link to="/admin/unified-settlements" className="text-sm text-[var(--color-primary)]">← Back</Link>
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">New Unified Settlement</h1>
        <p className="text-xs text-[var(--color-text-muted)]">
          Select an organisation, choose the outstanding settlements to pay, then finalize via the canonical settlement flow.
        </p>
      </div>

      {/* Step 1 — Organisation dropdown/select */}
      <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 space-y-2">
        <label className="block text-sm text-[var(--color-text-muted)]">Select Organisation</label>
        <div className="relative" ref={orgMenuRef}>
          <button
            type="button"
            onClick={() => setOrgMenuOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={orgMenuOpen}
            className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm text-left ${
              orgMenuOpen ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]'
            } bg-[var(--color-bg)]`}
          >
            <span className={selectedOrg ? 'font-medium text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}>
              {selectedOrg ? selectedOrg.name : 'Select organisation…'}
            </span>
            <span className="flex items-center gap-2">
              {selectedOrg && <span className="text-xs text-[var(--color-text-muted)]">#{selectedOrg.id}</span>}
              <span className="text-xs text-[var(--color-text-muted)]">{orgMenuOpen ? '▴' : '▾'}</span>
            </span>
          </button>

          {orgMenuOpen && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg" role="listbox">
              <div className="p-2 border-b border-[var(--color-border)]">
                <input
                  autoFocus
                  type="text"
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  placeholder="Search organisations…"
                  aria-label="Search organisations"
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]"
                />
              </div>
              <div className="max-h-64 overflow-auto p-1">
                {orgsQuery.isLoading && (
                  <div className="px-3 py-2 text-sm text-[var(--color-text-muted)]">Loading organisations…</div>
                )}
                {orgsQuery.isError && (
                  <div className="px-3 py-2 text-sm text-[var(--color-error)]">Failed to load organisations.</div>
                )}
                {!orgsQuery.isLoading && !orgsQuery.isError && filteredOrgs.length === 0 && (
                  <div className="px-3 py-2 text-sm text-[var(--color-text-muted)]">No organisations match.</div>
                )}
                {filteredOrgs.map((org) => (
                  <button
                    key={org.id}
                    type="button"
                    role="option"
                    onMouseDown={(e) => { e.preventDefault(); pickOrg(org); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-surface-alt)] rounded-lg flex items-center justify-between gap-2"
                  >
                    <span className="font-medium text-[var(--color-text)]">{org.name}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">#{org.id}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {selectedOrg && (
          <p className="text-sm text-[var(--color-text)]">
            Organisation: <span className="font-semibold">{selectedOrg.name}</span>
            <span className="text-xs text-[var(--color-text-muted)]"> (#{selectedOrg.id})</span>
          </p>
        )}
      </div>

      {/* No organisation selected → nothing loaded */}
      {!selectedOrg && (
        <div className="text-center py-6 text-[var(--color-text-muted)] text-sm">
          Select an organisation to load its outstanding settlements.
        </div>
      )}

      {/* Step 2 — outstanding settlement items (only when an organisation is selected) */}
      {selectedOrg && preview.isLoading && (
        <div className="text-center py-6 text-[var(--color-text-muted)]">Loading outstanding settlements…</div>
      )}

      {selectedOrg && preview.data && ents.length === 0 && (
        <div className="text-center py-6 text-[var(--color-text-muted)]">
          No eligible settlements for this organisation.
        </div>
      )}

      {selectedOrg && preview.data && ents.length > 0 && (
        <>
          <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-[var(--color-text)]">Outstanding Settlements</p>
              <p className="text-sm text-[var(--color-text-muted)]">Available to settle: <span className="font-semibold text-[var(--color-text)]">{formatPrice(availableTotal)}</span></p>
            </div>
            {ents.map((ent: any) => {
              const isExcluded = excluded.has(ent.id);
              return (
                <label key={ent.id} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2 last:border-b-0 last:pb-0">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={!isExcluded} onChange={() => toggleExclude(ent.id)} />
                    <span className="font-medium text-[var(--color-text)]">Settlement #{ent.id}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{fmtDate(ent.available_at)}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{SOURCE_LABEL[ent.source_type] || ent.source_type} #{ent.source_id}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{TYPE_LABEL[ent.entitlement_type] || ent.entitlement_type}</span>
                  </span>
                  <span className={`font-medium ${Number(ent.amount) < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {formatPrice(Number(ent.amount))}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Step 3 — selected total */}
          <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-xs text-[var(--color-text-muted)]">Selected settlements</span>
              <p className="text-lg font-bold text-[var(--color-text)]">{selectedEnts.length}</p>
            </div>
            <div>
              <span className="text-xs text-[var(--color-text-muted)]">Total payout</span>
              <p className="text-lg font-bold text-[var(--color-primary)]">{formatPrice(selectedTotal)}</p>
            </div>
          </div>

          {/* Step 4 — canonical preview financials (recomputed by the backend for the selected set) */}
          <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-[var(--color-text-muted)]">CourtZon owes Organization</p>
              <p className="text-lg font-bold text-[var(--color-text)]">{formatPrice(f?.courtzonOwedToOrg || 0)}</p>
            </div>
            <div>
              <p className="text-[var(--color-text-muted)]">Organization owes CourtZon</p>
              <p className="text-lg font-bold text-[var(--color-text)]">{formatPrice(f?.orgOwedToCourtZon || 0)}</p>
            </div>
            <div>
              <p className="text-[var(--color-text-muted)]">Net ({preview.data.selectedIds.length} entitlements)</p>
              <p className="text-lg font-bold text-[var(--color-text)]">{formatPrice(f?.finalAmount || 0)}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{DIRECTION_LABEL[f?.direction] || ''}</p>
            </div>
          </div>

          {/* Step 5 — payment method + reference (canonical, pay-capable roles only) */}
          {canPay && (
            <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 space-y-3">
              <p className="text-sm font-medium text-[var(--color-text)]">Payment method</p>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="paymentMethod" checked={paymentMethod === 'bank_transfer'} onChange={() => setPaymentMethod('bank_transfer')} />
                  <span>Bank Transfer</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" name="paymentMethod" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} />
                  <span>Cash</span>
                </label>
              </div>
              <div>
                <label className="block text-sm text-[var(--color-text-muted)]">Payment reference</label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="mt-1 w-full input input-bordered"
                  placeholder="Optional reference (e.g. transfer receipt number)"
                  aria-label="Payment reference"
                />
              </div>
            </div>
          )}

          {/* Step 6 — create (+ pay) */}
          <button
            onClick={handleSubmit}
            disabled={busy || selectedEnts.length === 0}
            className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </>
      )}
    </div>
  );
}
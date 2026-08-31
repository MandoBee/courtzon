import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { useCan } from '../../../hooks/useCan';
import { formatPrice } from '../../../utils/currency';

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

export default function UnifiedSettlementCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { can } = useCan();
  const [orgId, setOrgId] = useState('');
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  const preview = useQuery({
    queryKey: ['unified-settlement-preview', orgId, [...excluded].join(',')],
    queryFn: () =>
      api.get('/unified-settlements/preview', { params: { orgId, exclude: [...excluded].join(',') } })
        .then((r) => r.data),
    enabled: !!orgId,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/unified-settlements', { orgId: Number(orgId), excludeEntitlementIds: [...excluded] })
        .then((r) => r.data),
    onSuccess: (detail) => {
      showToast('Settlement created');
      queryClient.invalidateQueries({ queryKey: ['unified-settlements'] });
      navigate(`/admin/unified-settlements/${detail.settlement.id}`);
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to create settlement', 'error'),
  });

  if (!can('settlements.request')) return null;

  const f = preview.data?.financials;

  const toggleExclude = (id: number) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6 space-y-4">
      <Link to="/admin/unified-settlements" className="text-sm text-[var(--color-primary)]">← Back</Link>
      <h1 className="text-xl font-bold text-[var(--color-text)]">New Unified Settlement</h1>

      <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 space-y-3">
        <label className="block text-sm text-[var(--color-text-muted)]">
          Organization ID
          <input type="number" className="mt-1 w-full input input-bordered" value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="Organization ID" />
        </label>
      </div>

      {preview.isLoading && <div className="text-center py-6 text-[var(--color-text-muted)]">Loading entitlements...</div>}

      {preview.data && preview.data.entitlements.length === 0 && (
        <div className="text-center py-6 text-[var(--color-text-muted)]">No AVAILABLE entitlements for this organization.</div>
      )}

      {preview.data && preview.data.entitlements.length > 0 && (
        <>
          <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] p-4 space-y-2">
            <p className="text-sm font-medium">Select entitlements to settle (all selected by default; uncheck to exclude)</p>
            {preview.data.entitlements.map((ent: any) => {
              const isExcluded = excluded.has(ent.id);
              return (
                <label key={ent.id} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={!isExcluded} onChange={() => toggleExclude(ent.id)} />
                    <span>#{ent.id} · {TYPE_LABEL[ent.entitlement_type] || ent.entitlement_type}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">({ent.source_type})</span>
                  </span>
                  <span className={`font-medium ${Number(ent.amount) < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {formatPrice(Number(ent.amount))}
                  </span>
                </label>
              );
            })}
          </div>

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

          <button onClick={() => create.mutate()} disabled={create.isPending || preview.data.selectedIds.length === 0}
            className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50">
            {create.isPending ? 'Creating...' : 'Create Settlement'}
          </button>
        </>
      )}
    </div>
  );
}

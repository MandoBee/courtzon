import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { useCan } from '../../../hooks/useCan';
import { formatPrice } from '../../../utils/currency';

const STATUS_BADGE: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const DIRECTION_LABEL: Record<string, string> = {
  courtzon_to_org: 'CourtZon → Organization',
  org_to_courtzon: 'Organization → CourtZon',
};

export default function UnifiedSettlementListPage() {
  const navigate = useNavigate();
  const { can } = useCan();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  if (!can('settlements.view')) return null;

  const { data, isLoading } = useQuery({
    queryKey: ['unified-settlements', page, statusFilter],
    queryFn: () =>
      api.get('/unified-settlements', { params: { page, limit: 20, status: statusFilter || undefined } })
        .then((r) => r.data),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Unified Settlements</h1>
          <p className="text-xs text-[var(--color-text-muted)]">Settle AVAILABLE financial entitlements between CourtZon and an organization</p>
        </div>
        {can('settlements.request') && (
          <Link to="/admin/unified-settlements/new" className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium">
            New Settlement
          </Link>
        )}
      </div>

      <div className="flex gap-2">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="input input-bordered text-sm">
          <option value="">All statuses</option>
          <option value="requested">Requested</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="completed">Completed / Paid</option>
          <option value="cancelled">Cancelled</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">Organization</th>
              <th className="p-3">Batch</th>
              <th className="p-3">Org Position</th>
              <th className="p-3">CourtZon Position</th>
              <th className="p-3">Net / Direction</th>
              <th className="p-3">Status</th>
              <th className="p-3">Entitlements</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="p-3 text-center text-[var(--color-text-muted)]">Loading...</td></tr>}
            {!isLoading && data?.data?.length === 0 && <tr><td colSpan={8} className="p-3 text-center text-[var(--color-text-muted)]">No settlements found.</td></tr>}
            {data?.data?.map((s: any) => (
              <tr key={s.id} onClick={() => navigate(`/admin/unified-settlements/${s.id}`)} className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-alt)] cursor-pointer">
                <td className="p-3 font-medium">#{s.id}</td>
                <td className="p-3">{s.organisation_name}</td>
                <td className="p-3 text-xs">{s.batch_code || '—'}</td>
                <td className="p-3">{formatPrice(Number(s.organization_position), 'EGP')}</td>
                <td className="p-3">{formatPrice(Number(s.courtzon_position), 'EGP')}</td>
                <td className="p-3">
                  <span className="font-medium">{formatPrice(Number(s.final_amount), 'EGP')}</span>
                  <span className="block text-xs text-[var(--color-text-muted)]">{DIRECTION_LABEL[s.settlement_direction] || 'Zero balance'}</span>
                </td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[s.settlement_status] || ''}`}>{s.settlement_status.replace(/_/g, ' ')}</span>
                </td>
                <td className="p-3 text-xs">{s.entitlement_count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="flex justify-between items-center text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded border border-[var(--color-border)] disabled:opacity-50">Previous</button>
          <span className="text-[var(--color-text-muted)]">Page {page} · {data.total} total</span>
          <button disabled={page * 20 >= data.total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded border border-[var(--color-border)] disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}

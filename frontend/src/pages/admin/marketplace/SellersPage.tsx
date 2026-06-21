import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';

export default function SellersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [orgType, setOrgType] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<any>(null);
  const [limit, setLimit] = useState(20);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-marketplace-sellers', search, orgType, page, limit],
    queryFn: () => api.get('/marketplace/admin/sellers', { params: { search: search || undefined, orgType: orgType || undefined, page, limit } }).then((r: any) => r.data),
  });

  const toggleVerified = useMutation({
    mutationFn: ({ id, isVerified }: { id: number; isVerified: boolean }) => api.put(`/organisations/${id}`, { isVerified }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-marketplace-sellers'] }); setDetail(null); },
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.put(`/organisations/${id}`, { isActive }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-marketplace-sellers'] }); setDetail(null); },
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Sellers</h1>
      </div>
      <div className="flex gap-3 mb-4">
        <input value={search} onChange={(e: any) => { setSearch(e.target.value); setPage(1); }} placeholder="Search seller or owner..." className="flex-1 px-3 py-2 text-sm rounded-lg border" />
        <select value={orgType} onChange={(e: any) => { setOrgType(e.target.value); setPage(1); }} className="px-3 py-2 text-sm rounded-lg border">
          <option value="">All Types</option>
          <option value="shop">Seller (Shop)</option>
          <option value="player">Player</option>
          <option value="shop">Shop Admin</option>
        </select>
      </div>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-[var(--color-bg)]/50"><th className="text-left px-4 py-3">Shop</th><th className="text-left px-4 py-3">Owner</th><th className="text-left px-4 py-3">Type</th><th className="text-left px-4 py-3">Products</th><th className="text-left px-4 py-3">Orders</th><th className="text-left px-4 py-3">Revenue</th><th className="text-left px-4 py-3">Verified</th><th className="text-left px-4 py-3">Status</th><th className="text-right px-4 py-3">Actions</th></tr></thead>
          <tbody className="divide-y">
            {data?.data?.map((s: any) => (
              <tr key={s.id} className="hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{s.owner_name}</td>
                <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-info-bg)] text-[var(--color-info-text)]">{s.org_type_slug}</span></td>
                <td className="px-4 py-3">{s.stats?.active_products || 0}/{s.stats?.total_products || 0}</td>
                <td className="px-4 py-3">{s.stats?.total_orders || 0}</td>
                <td className="px-4 py-3">{Number(s.stats?.total_revenue || 0).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <Can permission="marketplace.admin.sellers.is-verified">
                    <Can permission="organisations.verify" fallback={
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_verified ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'}`}>
                        {s.is_verified ? 'Verified' : 'Pending'}
                      </span>
                    }>
                      <button onClick={() => toggleVerified.mutate({ id: s.id, isVerified: !s.is_verified })}
                        className={`text-xs px-2 py-0.5 rounded-full cursor-pointer border transition-colors ${s.is_verified ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] border-green-300 hover:opacity-80' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)] border-yellow-300 hover:bg-yellow-200'}`}>
                        {s.is_verified ? 'Verified' : 'Pending'}
                      </button>
                    </Can>
                  </Can>
                </td>
                <td className="px-4 py-3">
                  <Can permission="marketplace.admin.sellers.is-active">
                    <Can permission="marketplace.admin.sellers.toggle" fallback={
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'}`}>
                        {s.is_active ? 'Active' : 'Suspended'}
                      </span>
                    }>
                      <button onClick={() => toggleStatus.mutate({ id: s.id, isActive: !s.is_active })}
                        className={`text-xs px-2 py-0.5 rounded-full cursor-pointer border transition-colors ${s.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] border-green-300 hover:opacity-80' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)] border-red-300 hover:bg-red-200'}`}>
                        {s.is_active ? 'Active' : 'Suspended'}
                      </button>
                    </Can>
                  </Can>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setDetail(s)} className="text-xs text-[var(--color-primary)]">View</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">Rows:</span>
          <select value={limit} onChange={(e: any) => { setLimit(Number(e.target.value)); setPage(1); }} className="px-2 py-1 text-xs rounded border">
            {[10, 20, 50, 100].map((n: any) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {data && data.total > limit && (
          <div className="flex items-center gap-3">
            <button onClick={() => setPage((p: any) => Math.max(1, p - 1))} disabled={page <= 1} className="text-sm text-[var(--color-primary)] disabled:opacity-50">Previous</button>
            <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {Math.ceil(data.total / limit)}</span>
            <button onClick={() => setPage((p: any) => p + 1)} disabled={page >= Math.ceil(data.total / limit)} className="text-sm text-[var(--color-primary)] disabled:opacity-50">Next</button>
          </div>
        )}
        {data && <span className="text-xs text-[var(--color-text-muted)]">{data.total} total</span>}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setDetail(null)}>
          <div className="bg-[var(--color-surface)] rounded-xl shadow-xl p-6 max-w-md w-full mx-4" onClick={(e: any) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{detail.name}</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Type</span><span>{detail.org_type_slug}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Owner</span><span>{detail.owner_name}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Email</span><span>{detail.owner_email || detail.email || '—'}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Phone</span><span>{detail.owner_phone || detail.phone || '—'}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Verified</span><span>{detail.is_verified ? 'Yes' : 'No'}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Plan</span><span>{detail.subscription?.plan_name || '—'}</span></div>
              {detail.stats && (<>
                <div className="border-t pt-2 mt-2"><span className="text-[var(--color-text-muted)]">Stats</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Products</span><span>{detail.stats.active_products} active / {detail.stats.total_products} total</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Orders</span><span>{detail.stats.total_orders}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Revenue</span><span>{Number(detail.stats.total_revenue).toFixed(2)}</span></div>
              </>)}
            </div>
            <button onClick={() => setDetail(null)} className="mt-6 w-full px-4 py-2 border rounded-lg text-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

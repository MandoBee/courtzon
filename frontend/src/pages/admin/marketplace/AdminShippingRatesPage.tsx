import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';

export default function AdminShippingRatesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [selectedSeller, setSelectedSeller] = useState<any>(null);
  const [ratesSellerId, setRatesSellerId] = useState<number | null>(null);

  const { data: sellersData, isLoading: sellersLoading } = useQuery({
    queryKey: ['admin-shipping-rates-sellers', search, page, limit],
    queryFn: () => api.get('/marketplace/admin/sellers', { params: { search: search || undefined, page, limit } }).then((r: any) => r.data),
  });

  const { data: ratesData, isLoading: ratesLoading } = useQuery({
    queryKey: ['seller-shipping-rates', ratesSellerId],
    queryFn: () => api.get('/marketplace/seller/shipping-rates', { params: { orgId: ratesSellerId, admin: 'true' } }).then((r: any) => r.data),
    enabled: !!ratesSellerId,
  });

  if (sellersLoading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Seller Shipping Rates</h1>
      </div>
      <div className="flex gap-3 mb-4">
        <input value={search} onChange={(e: any) => { setSearch(e.target.value); setPage(1); }} placeholder="Search seller..." className="flex-1 px-3 py-2 text-sm rounded-lg border" />
      </div>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3">Shop Name</th>
              <th className="text-left px-4 py-3">Province</th>
              <th className="text-left px-4 py-3">City</th>
              <th className="text-left px-4 py-3">Org ID</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sellersData?.data?.map((s: any) => (
              <tr key={s.id} className="hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{s.province || s.address?.province || '—'}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{s.city || s.address?.city || '—'}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{s.id}</td>
                <td className="px-4 py-3 text-right">
                  <Can permission="marketplace.admin.shipping-rates">
                    <button onClick={() => { setSelectedSeller(s); setRatesSellerId(s.id); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90">
                      View Rates
                    </button>
                  </Can>
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
        {sellersData && sellersData.total > limit && (
          <div className="flex items-center gap-3">
            <button onClick={() => setPage((p: any) => Math.max(1, p - 1))} disabled={page <= 1} className="text-sm text-[var(--color-primary)] disabled:opacity-50">Previous</button>
            <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {Math.ceil(sellersData.total / limit)}</span>
            <button onClick={() => setPage((p: any) => p + 1)} disabled={page >= Math.ceil(sellersData.total / limit)} className="text-sm text-[var(--color-primary)] disabled:opacity-50">Next</button>
          </div>
        )}
        {sellersData && <span className="text-xs text-[var(--color-text-muted)]">{sellersData.total} total</span>}
      </div>

      {selectedSeller && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center" onClick={() => { setSelectedSeller(null); setRatesSellerId(null); }}>
          <div className="bg-[var(--color-surface)] rounded-xl shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e: any) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Shipping Rates — {selectedSeller.name}</h2>
              <button onClick={() => { setSelectedSeller(null); setRatesSellerId(null); }} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">&times;</button>
            </div>
            <div className="mb-4 text-xs text-[var(--color-text-muted)] space-y-1">
              <p>Org ID: {selectedSeller.id}</p>
              <p>Province: {selectedSeller.province || selectedSeller.address?.province || '—'}</p>
              <p>City: {selectedSeller.city || selectedSeller.address?.city || '—'}</p>
            </div>

            {ratesLoading ? (
              <p className="text-sm text-[var(--color-text-muted)]">Loading rates...</p>
            ) : ratesData?.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--color-bg)]/50">
                      <th className="text-left px-3 py-2">Province</th>
                      <th className="text-left px-3 py-2">City</th>
                      <th className="text-left px-3 py-2">Delivery Type</th>
                      <th className="text-right px-3 py-2">Price</th>
                      <th className="text-right px-3 py-2">Min Order</th>
                      <th className="text-right px-3 py-2">Est. Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ratesData.data.map((r: any, i: number) => (
                      <tr key={r.id || i} className="hover:bg-[var(--color-bg)]/30">
                        <td className="px-3 py-2">{r.province || r.province_name || '—'}</td>
                        <td className="px-3 py-2">{r.city || r.city_name || '—'}</td>
                        <td className="px-3 py-2">{r.delivery_type || r.type || '—'}</td>
                        <td className="px-3 py-2 text-right font-medium">{Number(r.price || r.rate || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{r.min_order_amount ? Number(r.min_order_amount).toFixed(2) : '—'}</td>
                        <td className="px-3 py-2 text-right">{r.estimated_days || r.etd || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">No shipping rates configured for this seller.</p>
            )}

            <div className="mt-4 flex justify-end">
              <button onClick={() => { setSelectedSeller(null); setRatesSellerId(null); }}
                className="px-4 py-2 border rounded-lg text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

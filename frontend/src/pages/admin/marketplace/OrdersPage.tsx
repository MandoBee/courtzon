import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { formatPrice } from '../../../utils/currency';

const STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  processing: 'bg-indigo-100 text-indigo-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-marketplace-orders', statusFilter, search, sellerId, page],
    queryFn: () => api.get('/marketplace/admin/orders', { params: { status: statusFilter || undefined, search: search || undefined, sellerId: sellerId || undefined, page, limit } }).then((r: any) => r.data),
  });

  const { data: sellers } = useQuery({
    queryKey: ['admin-marketplace-sellers-list'],
    queryFn: () => api.get('/marketplace/admin/sellers', { params: { limit: 500 } }).then((r: any) => r.data.data),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.put(`/marketplace/orders/${id}/status`, { status, note: `Admin update to ${status}` }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-marketplace-orders'] }),
  });

  if (isLoading) return <div className="p-6 text-center text-[var(--color-text-muted)]">Loading...</div>;

  const orders = data?.data || [];
  const total = data?.total || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Orders</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-xs"><span className="text-[var(--color-text-muted)]">Search</span>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="buyer or product..."
            className="ml-1 w-48 px-2 py-1.5 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)]" />
        </label>
        <label className="text-xs"><span className="text-[var(--color-text-muted)]">Seller</span>
          <select value={sellerId} onChange={e => { setSellerId(e.target.value); setPage(1); }}
            className="ml-1 px-2 py-1.5 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
            <option value="">All Sellers</option>
            {sellers?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-xs"><span className="text-[var(--color-text-muted)]">Status</span>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="ml-1 px-2 py-1.5 text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {/* Orders list */}
      {!orders.length ? (
        <p className="text-sm text-[var(--color-text-muted)] py-6">No orders found.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order: any) => {
            const items = order.items || [];
            const shipping = Number(order.shipping_cost || 0);
            const subtotal = Number(order.subtotal || 0);
            return (
              <div key={order.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)]">
                {/* Order header */}
                <div className="flex items-center gap-4 p-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] text-xs">
                  <span className="font-mono text-[var(--color-text)]">#{order.public_id?.slice(0, 8) || order.id}</span>
                  <span className="text-[var(--color-text-muted)]">{new Date(order.created_at).toLocaleDateString('en-GB')}</span>
                  <span className="text-[var(--color-text-muted)]">{order.buyer_name}{order.buyer_phone ? ` · ${order.buyer_phone}` : ''}</span>
                  <span className="flex-1" />
                  <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] || ''}`}>{order.status}</span>
                  <select value={order.status} onChange={e => updateStatus.mutate({ id: order.id, status: e.target.value })}
                    className="px-2 py-1 text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Items */}
                {items.map((item: any, idx: number) => {
                  const images = (() => { try { return JSON.parse(item.images || '[]'); } catch { return []; } })();
                  return (
                    <div key={idx} className={`flex gap-3 p-3 ${idx > 0 ? 'border-t border-[var(--color-border)]' : ''}`}>
                      {images[0] ? (
                        <img src={images[0]} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-[var(--color-bg)] flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text)]">{item.productName}{item.variantName ? ` (${item.variantName})` : ''}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{item.shopName} · Qty: {item.quantity}</p>
                      </div>
                      <p className="text-sm font-semibold flex-shrink-0">{formatPrice(Number(item.totalPrice), order.currency_code)}</p>
                    </div>
                  );
                })}

                {/* Totals footer */}
                <div className="flex justify-end gap-6 p-3 border-t border-[var(--color-border)] bg-[var(--color-bg)] text-xs">
                  <span className="text-[var(--color-text-muted)]">Subtotal: {formatPrice(subtotal, order.currency_code)}</span>
                  <span className="text-[var(--color-text-muted)]">Shipping: {formatPrice(shipping, order.currency_code)}</span>
                  <span className="font-bold text-[var(--color-text)]">Total: {formatPrice(Number(order.total), order.currency_code)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded border text-sm disabled:opacity-40">Previous</button>
          <span className="text-sm text-[var(--color-text-muted)]">Page {page} of {Math.ceil(total / limit)}</span>
          <button disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded border text-sm disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}

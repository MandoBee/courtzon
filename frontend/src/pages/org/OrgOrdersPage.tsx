import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { formatPrice } from '../../utils/currency';
import { Can } from '../../permissions/Can';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  processing: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  shipped: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  refunded: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

const STATUSES = ['', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

export default function OrgOrdersPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['mp-seller-orders', page, statusFilter],
    queryFn: () =>
      api.get('/marketplace/seller/orders', { params: { page, limit: 20, status: statusFilter || undefined } }).then((r) => r.data),
  });

  const updateOrderStatus = useMutation({
    mutationFn: ({ orderId, status, note, tracking }: any) =>
      api.put(`/marketplace/orders/${orderId}/status`, { status, note, trackingNumber: tracking?.number, shippingCarrier: tracking?.carrier }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mp-seller-orders'] });
      showToast('Order status updated!');
    },
    onError: (err: any) => {
      showToast('Failed to update order: ' + (err?.response?.data?.message || err.message), 'error');
    },
  });

  const orders = ordersData?.data ?? ordersData?.orders ?? [];
  const total = ordersData?.total ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Orders</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Manage all your shop orders</p>
      </div>

      <div className="flex gap-1 border-b border-[var(--color-border)] overflow-x-auto">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              statusFilter === s
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[var(--color-text-muted)]">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-[var(--color-text-muted)]">No orders found</div>
      ) : (
        <div className="space-y-3">
          {orders.map((order: any) => {
            const items = order.items || [];
            const shipping = Number(order.shipping_cost || 0);
            const subtotal = Number(order.subtotal || 0);
            return (
            <div key={order.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors cursor-pointer" onClick={() => navigate(`/marketplace/orders/${order.id}`)}>
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                <span className="font-mono text-[var(--color-text)]">#{order.public_id?.slice(0, 8) || order.id}</span>
                <span>{new Date(order.created_at).toLocaleDateString('en-GB')}</span>
                <span>{order.buyer_name}{order.buyer_phone ? ` · ${order.buyer_phone}` : ''}</span>
                <span className="flex-1" />
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap ${STATUS_COLORS[order.status] || ''}`}>
                  {order.status}
                </span>
                <Can permission="marketplace.seller.manage-orders">
                  <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                    {order.status === 'confirmed' && (
                      <button onClick={() => updateOrderStatus.mutate({ orderId: order.id, status: 'processing', note: 'Processing order' })}
                        className="px-2 py-1 bg-indigo-500 text-white rounded text-xs font-medium hover:bg-indigo-600">
                        Start Processing
                      </button>
                    )}
                    {order.status === 'processing' && (
                      <button onClick={() => updateOrderStatus.mutate({ orderId: order.id, status: 'shipped', note: 'Shipped', tracking: { carrier: 'Default', number: `TRK${Date.now()}` } })}
                        className="px-2 py-1 bg-purple-500 text-white rounded text-xs font-medium hover:bg-purple-600">
                        Mark Shipped
                      </button>
                    )}
                    {order.status === 'shipped' && (
                      <button onClick={() => updateOrderStatus.mutate({ orderId: order.id, status: 'delivered', note: 'Delivered' })}
                        className="px-2 py-1 bg-green-500 text-white rounded text-xs font-medium hover:bg-green-600">
                        Confirm Delivery
                      </button>
                    )}
                    {(order.status === 'pending' || order.status === 'confirmed') && (
                      <button onClick={() => updateOrderStatus.mutate({ orderId: order.id, status: 'cancelled', note: 'Cancelled by seller' })}
                        className="px-2 py-1 border border-red-300 text-red-600 rounded text-xs font-medium hover:bg-red-50">
                        Cancel
                      </button>
                    )}
                  </div>
                </Can>
              </div>

              {/* Items */}
              {items.map((item: any, idx: number) => {
                const images = (() => { try { return JSON.parse(item.images || '[]'); } catch { return []; } })();
                const firstImage = images[0];
                return (
                  <div key={idx} className={`flex gap-3 px-4 py-3 ${idx > 0 ? 'border-t border-[var(--color-border)]' : ''}`}>
                    {firstImage ? (
                      <img src={firstImage} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-[var(--color-bg)] flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)]">{item.productName}{item.variantName ? ` (${item.variantName})` : ''}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-semibold flex-shrink-0">{formatPrice(Number(item.totalPrice), order.currency_code)}</p>
                  </div>
                );
              })}

              {/* Totals footer */}
              <div className="flex justify-end gap-6 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)] text-xs">
                <span className="text-[var(--color-text-muted)]">Subtotal: {formatPrice(subtotal, order.currency_code)}</span>
                <span className="text-[var(--color-text-muted)]">Shipping: {formatPrice(shipping, order.currency_code)}</span>
                <span className="font-bold text-[var(--color-text)]">Total: {formatPrice(Number(order.total), order.currency_code)}</span>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {total > 20 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-[var(--radius-md)] border text-sm disabled:opacity-40">Previous</button>
          <span className="text-sm text-[var(--color-text-muted)]">Page {page} of {Math.ceil(total / 20)}</span>
          <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 rounded-[var(--radius-md)] border text-sm disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { useTranslation } from '../../i18n';

const ORDER_STATUSES = ['', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  confirmed: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  processing: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  shipped: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  delivered: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  cancelled: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  refunded: 'bg-[var(--color-border)] text-[var(--color-text)]  text-[var(--color-text-muted)]',
};

export default function OrderListPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const { data: orders, isLoading } = useQuery({
    queryKey: ['mp-orders', page, statusFilter],
    queryFn: () => api.get('/marketplace/orders', { params: { page, limit: 20, status: statusFilter || undefined } }).then((r) => r.data),
  });

  const { data: orderCounts } = useQuery({
    queryKey: ['mp-orders', 'counts'],
    queryFn: () => api.get('/marketplace/orders/counts').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const cancelOrder = useMutation({
    mutationFn: (orderId: number) =>
      api.put(`/marketplace/orders/${orderId}/status`, { status: 'cancelled', note: 'Cancelled by buyer' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mp-orders'] }),
  });

  const confirmDelivery = useMutation({
    mutationFn: (orderId: number) =>
      api.put(`/marketplace/orders/${orderId}/status`, { status: 'delivered', note: 'Confirmed delivered by buyer' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mp-orders'] }),
  });

  const formatId = (id: string) => id.slice(0, 8).toUpperCase();

  const statusLabelMap: Record<string, string> = {
    '': t('orders.all'),
    pending: t('common.pending'),
    confirmed: t('common.confirmed'),
    processing: t('common.processing_ship'),
    shipped: t('common.shipped'),
    delivered: t('common.delivered'),
    cancelled: t('common.cancelled'),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{t('orders.title')}</h1>
        <Link to="/marketplace" className="text-sm text-[var(--color-primary)]">{t('marketplace.back')}</Link>
      </div>

      {/* Desktop tabs */}
      <div className="hidden md:flex gap-2 flex-wrap">
        {ORDER_STATUSES.map((s) => {
          const count = orderCounts ? (s === '' ? orderCounts.all : (orderCounts[s] ?? 0)) : 0;
          return (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border ${
              statusFilter === s ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : ''
            }`}>
            {s || t('orders.all')}
            {count > 0 && (
              <span className="bg-[var(--color-error)] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );})}
      </div>

      {/* Mobile dropdown */}
      <div className="md:hidden">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border bg-[var(--color-surface)]"
        >
          {ORDER_STATUSES.map((s) => {
            const count = orderCounts ? (s === '' ? orderCounts.all : (orderCounts[s] ?? 0)) : 0;
            return (
            <option key={s} value={s}>{statusLabelMap[s]}{count > 0 ? ` (${count})` : ''}</option>
          );})}
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('orders.loading')}</p>
      ) : !orders?.data?.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">{t('orders.empty')}</p>
      ) : (
        <div className="space-y-3">
          {orders.data.map((order: any) => {
            const items = order.items || [];
            const expectedDate = order.estimated_delivery_date ? new Date(order.estimated_delivery_date).toLocaleDateString('en-GB') : 'N/A';
            const shippingCost = Number(order.shipping_cost || 0);
            const subtotal = Number(order.subtotal || 0);
            return (
            <div key={order.id}
              className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] hover:shadow-md transition-shadow">
              <Link to={`/marketplace/orders/${order.id}`} className="block p-4">
                {items.map((item: any, idx: number) => {
                  const images = (() => { try { return JSON.parse(item.images || '[]'); } catch { return []; } })();
                  const firstImage = images[0];
                  return (
                    <div key={idx} className={`flex gap-3 ${idx > 0 ? 'mt-3 pt-3 border-t border-[var(--color-border)]' : ''}`}>
                      {firstImage ? (
                        <img src={firstImage} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded bg-[var(--color-bg)] flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text)] truncate">
                          {item.productName}{item.variantName ? ` (${item.variantName})` : ''}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">{item.shopName}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">Qty: {item.quantity}</p>
                      </div>
                      <p className="text-sm font-semibold text-[var(--color-text)] flex-shrink-0">{formatPrice(Number(item.totalPrice), order.currency_code)}</p>
                    </div>
                  );
                })}
                {/* Order totals footer */}
                <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex justify-between items-center text-xs text-[var(--color-text-muted)]">
                  <div>
                    <p>Subtotal: {formatPrice(subtotal, order.currency_code)}</p>
                    <p>Shipping: {formatPrice(shippingCost, order.currency_code)}</p>
                  </div>
                  <p className="text-sm font-bold text-[var(--color-text)]">Total: {formatPrice(Number(order.total), order.currency_code)}</p>
                </div>
              </Link>
              {/* Status bar outside the link to allow button clicks */}
              <div className="flex items-center gap-3 px-4 pb-3">
                <p className="text-xs text-[var(--color-text-muted)]">
                  Order #{formatId(order.public_id)} · {new Date(order.created_at).toLocaleDateString('en-GB')} · Expected: {expectedDate}
                </p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] || ''}`}>
                  {order.status}
                </span>
                <div className="flex-1" />
                <div className="flex gap-2">
                  {(order.status === 'pending' || order.status === 'confirmed') && (
                    <button onClick={() => cancelOrder.mutate(order.id)}
                      className="text-xs px-2 py-1 border border-[var(--color-error)] text-[var(--color-error)] rounded">{t('orders.cancel')}</button>
                  )}
                  {order.status === 'shipped' && (
                    <button onClick={() => confirmDelivery.mutate(order.id)}
                      className="text-xs px-2 py-1 bg-[var(--color-success)] text-white rounded">{t('orders.confirm_delivery')}</button>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {orders && orders.total > orders.limit && (
        <div className="flex items-center justify-between">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="text-sm text-[var(--color-primary)] disabled:opacity-50">{t('common.previous')}</button>
          <span className="text-sm text-[var(--color-text-muted)]">Page {page} of {Math.ceil(orders.total / orders.limit)}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(orders.total / orders.limit)}
            className="text-sm text-[var(--color-primary)] disabled:opacity-50">{t('common.next')}</button>
        </div>
      )}
    </div>
  );
}

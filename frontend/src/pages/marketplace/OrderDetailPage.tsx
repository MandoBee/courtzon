import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  confirmed: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  processing: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  shipped: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  delivered: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  cancelled: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  refunded: 'bg-[var(--color-border)] text-[var(--color-text)]  text-[var(--color-text-muted)]',
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ['mp-order', id],
    queryFn: () => api.get(`/marketplace/orders/${id}`).then((r) => r.data),
  });

  const updateStatus = useMutation({
    mutationFn: (data: { status: string; note?: string }) =>
      api.put(`/marketplace/orders/${id}/status`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mp-order', id] });
      queryClient.invalidateQueries({ queryKey: ['mp-orders'] });
    },
  });

  if (isLoading) return <div className="text-center py-8">Loading...</div>;
  if (!order) return <div className="text-center py-8">Order not found</div>;

  const formatId = (publicId: string) => publicId?.slice(0, 8).toUpperCase() || `#${id}`;
  const isGrouped = order._isGrouped && order._sellerOrders?.length > 1;
  const currencyCode = order.currency_code;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="text-sm text-[var(--color-primary)]">← Back</button>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Order {formatId(order.public_id)}</h1>
            <p className="text-xs text-[var(--color-text-muted)]">{new Date(order.created_at).toLocaleString('en-GB')}</p>
          </div>
          <span className={`text-sm px-3 py-1 rounded-full ${STATUS_COLORS[order.status] || ''}`}>
            {order.status}
          </span>
        </div>

        {/* ── Multi-seller: per-seller sections ── */}
        {isGrouped ? (
          <div className="space-y-4">
            {order._sellerOrders.map((sellerOrder: any) => (
              <div key={sellerOrder.id} className="border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
                {/* Seller header */}
                <div className="bg-[var(--color-surface-alt)] px-4 py-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-[var(--color-text)]">
                    {sellerOrder.shop_name || `Seller #${sellerOrder.seller_id}`}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {sellerOrder.items?.length || 0} item{(sellerOrder.items?.length || 0) !== 1 ? 's' : ''}
                  </span>
                </div>
                {/* Seller items */}
                <div className="px-4 py-2 space-y-2">
                  {sellerOrder.items?.map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] last:border-0 pb-2 last:pb-0">
                      <div>
                        <p className="text-[var(--color-text)]">{item.productName}</p>
                        {item.variantName && <p className="text-xs text-[var(--color-text-muted)]">{item.variantName}</p>}
                        <p className="text-xs text-[var(--color-text-muted)]">Qty: {item.quantity} × {formatPrice(Number(item.unitPrice), currencyCode)}</p>
                      </div>
                      <p className="font-medium">{formatPrice(Number(item.totalPrice), currencyCode)}</p>
                    </div>
                  ))}
                </div>
                {/* Seller subtotal */}
                <div className="border-t border-[var(--color-border)] px-4 py-2 space-y-1 text-xs">
                  <div className="flex justify-between text-[var(--color-text-muted)]">
                    <span>Subtotal</span>
                    <span>{formatPrice(Number(sellerOrder.subtotal), currencyCode)}</span>
                  </div>
                  <div className="flex justify-between text-[var(--color-text-muted)]">
                    <span>Shipping</span>
                    <span>{formatPrice(Number(sellerOrder.shipping_cost), currencyCode)}</span>
                  </div>
                  {Number(sellerOrder.tax_amount) > 0 && (
                    <div className="flex justify-between text-[var(--color-text-muted)]">
                      <span>Tax</span>
                      <span>{formatPrice(Number(sellerOrder.tax_amount), currencyCode)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-[var(--color-text)] pt-1 border-t border-[var(--color-border)]">
                    <span>Seller Total</span>
                    <span>{formatPrice(Number(sellerOrder.total), currencyCode)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ── Single-seller / legacy: flat items list ── */
          <div className="border-t pt-4">
            <h2 className="text-sm font-medium mb-2">Items</h2>
            <div className="space-y-2">
              {order.items?.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-[var(--color-border)] pb-2">
                  <div>
                    <p className="text-[var(--color-text)]">{item.productName}</p>
                    {item.variantName && <p className="text-xs text-[var(--color-text-muted)]">{item.variantName}</p>}
                    <p className="text-xs text-[var(--color-text-muted)]">Qty: {item.quantity} × {item.unitPrice}</p>
                  </div>
                  <p className="font-medium">{formatPrice(Number(item.totalPrice), currencyCode)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shipping Address */}
        {order.shipping_address && (
          <div className="border-t pt-4">
            <h2 className="text-sm font-medium mb-2">Shipping Address</h2>
            <div className="bg-[var(--color-surface-alt)] rounded-[var(--radius-md)] p-3 text-sm">
              {(() => {
                const a = typeof order.shipping_address === 'string'
                  ? JSON.parse(order.shipping_address)
                  : order.shipping_address;
                return <div className="text-[var(--color-text)] leading-relaxed space-y-0.5">
                  {a.full_name && <p>{a.full_name}</p>}
                  {a.phone && <p>{a.phone}</p>}
                  {a.street_address && <p>{a.street_address}</p>}
                  {order.province_name && <p>{order.province_name}</p>}
                  {a.city && <p>{a.city}</p>}
                </div>;
              })()}
            </div>
          </div>
        )}

        {/* Tracking */}
        {order.tracking_number && (
          <div className="border-t pt-4">
            <h2 className="text-sm font-medium mb-1">Tracking</h2>
            <p className="text-sm">Carrier: {order.shipping_carrier}</p>
            <p className="text-sm">Tracking: {order.tracking_number}</p>
          </div>
        )}

        {/* Payment Summary — Grand Total */}
        <div className="border-t pt-4 space-y-1 text-sm">
          {isGrouped && (
            <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">Order Summary</p>
          )}
          <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(Number(order.subtotal), currencyCode)}</span></div>
          {Number(order.discount_amount) > 0 && (
            <div className="flex justify-between text-[var(--color-success)]"><span>Discount</span><span>-{formatPrice(Number(order.discount_amount), currencyCode)}</span></div>
          )}
          <div className="flex justify-between"><span>Shipping</span><span>{formatPrice(Number(order.shipping_cost), currencyCode)}</span></div>
          {Number(order.tax_amount) > 0 && (
            <div className="flex justify-between"><span>Tax</span><span>{formatPrice(Number(order.tax_amount), currencyCode)}</span></div>
          )}
          <div className="flex justify-between font-bold text-base border-t pt-2">
            <span>{isGrouped ? 'Grand Total' : 'Total'}</span>
            <span>{formatPrice(Number(order.total), currencyCode)}</span>
          </div>
          <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
            <span>Payment</span><span className="capitalize">{order.payment_method} · {order.payment_status}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t pt-4 flex gap-2">
          {(order.status === 'pending' || order.status === 'confirmed') && !order.viewedAsSeller && (
            <button onClick={() => updateStatus.mutate({ status: 'cancelled', note: 'Cancelled by buyer' })}
              disabled={updateStatus.isPending}
              className="px-4 py-2 text-sm border border-[var(--color-error)] text-[var(--color-error)] rounded-[var(--radius-md)] disabled:opacity-50">
              Cancel Order
            </button>
          )}
          {order.status === 'shipped' && (
            <button onClick={() => updateStatus.mutate({ status: 'delivered', note: 'Confirmed by buyer' })}
              disabled={updateStatus.isPending}
              className="px-4 py-2 bg-[var(--color-success)] text-white text-sm rounded-[var(--radius-md)] disabled:opacity-50">
              Confirm Delivery
            </button>
          )}
          {order.status === 'delivered' && !order.viewedAsSeller && (
            <button onClick={() => {
              // Phase 3 P0-3: Navigate to the existing complaint system instead
              // of instantly executing a refund. The complaint flow provides
              // admin review, partial-refund amounts, and proper lifecycle.
              window.location.href = `/marketplace/complaints`;
            }}
              className="px-4 py-2 text-sm border border-orange-300 text-[var(--color-warning-text)] rounded-[var(--radius-md)] disabled:opacity-50">
              File a Complaint / Refund Request
            </button>
          )}
          <span className="text-xs text-[var(--color-text-muted)] self-center ml-2">
            {updateStatus.isPending && 'Updating...'}
            {updateStatus.isError && 'Update failed'}
          </span>
        </div>
      </div>
    </div>
  );
}

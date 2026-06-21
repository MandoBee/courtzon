import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth.store';
import OrganisationForm from '../../components/organisations/OrganisationForm';
import { useToast } from '../../components/ui/Toast';
import { Can } from '../../permissions/Can';
import { useCan } from '../../hooks/useCan';
import { formatPrice } from '../../utils/currency';
import { useTranslation } from '../../i18n';
import SellerProductFormModal from '../../components/marketplace/SellerProductFormModal';

type Tab = 'products' | 'orders' | 'stats' | 'settings' | 'settlements';

export default function SellerDashboardPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { can } = useCan();
  const [tab, setTab] = useState<Tab>('stats');
  const [page, setPage] = useState(1);
  const [orderStatus, setOrderStatus] = useState('');
  const [productStatus, setProductStatus] = useState('');
  const [branchFilter, setBranchFilter] = useState('');

  // Product form modal
  const [showForm, setShowForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);

  // Player activate state
  const [activating, setActivating] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['mp-player-status'],
    queryFn: () => api.get('/marketplace/player/status').then((r) => r.data),
  });

  const { data: orgs } = useQuery({
    queryKey: ['seller-orgs'],
    queryFn: () => api.get('/marketplace/player/status').then((r) => {
      const status = r.data;
      return status.org || null;
    }),
  });

  const org = orgs || profile?.org;

  const { data: stats } = useQuery({
    queryKey: ['mp-seller-stats'],
    queryFn: () => api.get('/marketplace/seller/stats').then((r) => r.data),
    enabled: !!profile?.active,
  });

  const { data: products } = useQuery({
    queryKey: ['mp-seller-products', page, productStatus, branchFilter],
    queryFn: () => api.get('/marketplace/seller/products', { params: { page, limit: 20, status: productStatus || undefined, branchId: branchFilter || undefined } }).then((r) => r.data),
    enabled: !!profile?.active,
  });

  const { data: sports } = useQuery({
    queryKey: ['mp-sports-marketplace'],
    queryFn: () => api.get('/sports/marketplace').then((r) => r.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['mp-categories'],
    queryFn: () => api.get('/marketplace/categories').then((r) => r.data.data),
  });

  const { data: brands } = useQuery({
    queryKey: ['mp-brands'],
    queryFn: () => api.get('/marketplace/brands').then((r) => r.data),
  });

  const { data: tags } = useQuery({
    queryKey: ['mp-tags'],
    queryFn: () => api.get('/marketplace/tags').then((r) => r.data),
  });

  const { data: branches } = useQuery({
    queryKey: ['org-branches', org?.id],
    queryFn: () => api.get(`/organisations/${org?.id}/branches`).then((r) => r.data?.data || []),
    enabled: !!org?.id,
  });

  const { data: sellerOrders } = useQuery({
    queryKey: ['mp-seller-orders', page, orderStatus],
    queryFn: () => api.get('/marketplace/seller/orders', { params: { page, limit: 20, status: orderStatus || undefined } }).then((r) => r.data),
    enabled: !!profile?.active,
  });

  const { data: settlements, isLoading: settlementsLoading } = useQuery({
    queryKey: ['mp-seller-settlements', page],
    queryFn: () => api.get('/marketplace/seller/settlements', { params: { page, limit: 20 } }).then((r) => r.data),
    enabled: !!profile?.active && tab === 'settlements',
  });

  const { data: settlementBalance } = useQuery({
    queryKey: ['mp-seller-settlement-balance'],
    queryFn: () => api.get('/marketplace/seller/settlements/balance').then((r) => r.data),
    enabled: !!profile?.active && tab === 'settlements',
  });

  const requestSettlement = useMutation({
    mutationFn: () => api.post('/marketplace/seller/settlements'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mp-seller-settlements'] });
      queryClient.invalidateQueries({ queryKey: ['mp-seller-settlement-balance'] });
      showToast('Settlement requested successfully!');
    },
    onError: (err) => { showToast('Failed to request settlement: ' + (err as any).message, 'error'); },
  });

  const activatePlayerSell = useMutation({
    mutationFn: () => api.post('/marketplace/player/activate').then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mp-player-status'] });
      setActivating(false);
      showToast('Selling account activated!');
    },
    onError: (err) => { showToast('Failed to activate: ' + (err as any).message, 'error'); setActivating(false); },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingProductId(null);
  };

  const deleteProduct = useMutation({
    mutationFn: (productId: number) => api.delete(`/marketplace/products/${productId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mp-seller-products'] });
      queryClient.invalidateQueries({ queryKey: ['mp-seller-stats'] });
      showToast('Product deleted!');
    },
    onError: (err) => { showToast('Failed to delete product: ' + (err as any).message, 'error'); },
  });

  const updateOrderStatus = useMutation({
    mutationFn: ({ orderId, status, note, tracking }: any) =>
      api.put(`/marketplace/orders/${orderId}/status`, { status, note, trackingNumber: tracking?.number, shippingCarrier: tracking?.carrier }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mp-seller-orders'] }); showToast('Order status updated!'); },
    onError: (err) => { showToast('Failed to update order: ' + (err as any).message, 'error'); },
  });

  if (profileLoading) return <div className="text-center py-8">{t('seller.dashboard.loading')}</div>;

  // No selling account yet
  if (!profile?.active) {
    const isSeller = user?.isSeller || can('marketplace.sell');
    if (isSeller) {
      return (
        <div className="max-w-lg mx-auto bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-6 space-y-4 text-center">
          <div className="text-4xl mb-2">⏳</div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Pending Admin Approval</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Your seller account has been submitted for review. A super admin will approve your account shortly. You'll be notified once approved.</p>
        </div>
      );
    }
    return (
      <div className="max-w-lg mx-auto bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-6 space-y-4">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Start Selling</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Activate your free player seller account. You can list up to 5 products for free with no subscription needed.</p>
        <Can permission="marketplace.sell">
          <button onClick={() => { setActivating(true); activatePlayerSell.mutate(); }}
            disabled={activating}
            className="w-full px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] disabled:opacity-50">
            {activating ? 'Activating...' : 'Activate Free Selling'}
          </button>
        </Can>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{org?.name || 'My Shop'}</h1>
        <div className="flex gap-2 flex-wrap">
          <Can permission="marketplace.seller.stats">
            <button onClick={() => { setTab('stats'); setPage(1); }}
              className={`px-3 py-1.5 text-sm rounded-[var(--radius-md)] capitalize ${
                tab === 'stats' ? 'bg-[var(--color-primary)] text-white' : 'border'
              }`}>{t('seller.stats')}</button>
          </Can>
          <Can permission="marketplace.seller.products-tab">
            <button onClick={() => { setTab('products'); setPage(1); }}
              className={`px-3 py-1.5 text-sm rounded-[var(--radius-md)] capitalize ${
                tab === 'products' ? 'bg-[var(--color-primary)] text-white' : 'border'
              }`}>{t('seller.products')}</button>
          </Can>
          <Can permission="marketplace.seller.orders-tab">
            <button onClick={() => { setTab('orders'); setPage(1); }}
              className={`px-3 py-1.5 text-sm rounded-[var(--radius-md)] capitalize ${
                tab === 'orders' ? 'bg-[var(--color-primary)] text-white' : 'border'
              }`}>{t('seller.orders')}</button>
          </Can>
          <Can permission="marketplace.seller.settings">
            <button onClick={() => { setTab('settings'); setPage(1); }}
              className={`px-3 py-1.5 text-sm rounded-[var(--radius-md)] capitalize ${
                tab === 'settings' ? 'bg-[var(--color-primary)] text-white' : 'border'
              }`}>Shop Settings</button>
          </Can>
          <Can permission="marketplace.seller.settlements">
            <button onClick={() => { setTab('settlements'); setPage(1); }}
              className={`px-3 py-1.5 text-sm rounded-[var(--radius-md)] capitalize ${
                tab === 'settlements' ? 'bg-[var(--color-primary)] text-white' : 'border'
              }`}>{t('seller.settlements')}</button>
          </Can>
        </div>
      </div>

      {/* Free plan message */}
      {profile?.subscription && Number(profile.subscription.price) === 0 && (
        <div className="bg-[var(--color-info-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4">
          <p className="text-sm text-[var(--color-info-text)] text-[var(--color-info-text)]">
            You are on the <strong>Player Free Sell</strong> plan — you can list up to <strong>5 products</strong> for free.
            {profile.productCount >= 5 && (
              <span className="block mt-1">You've reached the limit. <button className="underline font-semibold">Upgrade to a seller plan</button> to list more.</span>
            )}
          </p>
        </div>
      )}

      {/* Stats Tab */}
      {tab === 'stats' && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Orders', value: stats.total_orders },
            { label: 'Completed', value: stats.completed_orders },
            { label: 'Revenue', value: formatPrice(Number(stats.total_revenue)) },
            { label: 'Commission', value: formatPrice(Number(stats.total_commission)) },
            { label: 'Pending Orders', value: stats.pending_orders },
            { label: 'Active Listings', value: stats.active_listings },
          ].map((s) => (
            <div key={s.label} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
              <p className="text-xs text-[var(--color-text-muted)]">{s.label}</p>
              <p className="text-lg font-bold text-[var(--color-text)]">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Products Tab */}
      {tab === 'products' && (
        <div className="space-y-4">
          <Can permission="marketplace.seller.create-product">
            <button onClick={() => { setEditingProductId(null); setShowForm(true); }}
              className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)]">
              {t('seller.add_product')}
            </button>
          </Can>

          <div className="flex flex-wrap items-center gap-3 mb-4">
            {/* Product Status Tabs */}
            <div className="flex items-center gap-1 bg-[var(--color-surface)] border rounded-lg p-1 w-fit">
              {['', 'active', 'pending'].map((s) => (
                <button key={s} onClick={() => { setProductStatus(s); setPage(1); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${productStatus === s ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
                  {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
                </button>
              ))}
            </div>
            {/* Branch Filter */}
            <Can permission="marketplace.seller.branch-select">
              <select value={branchFilter} onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
                className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[150px]">
                <option value="">All Branches</option>
                {(Array.isArray(branches) ? branches : []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Can>
          </div>
          {/* Product List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products?.data?.map((p: any) => (
              <div key={p.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
                <p className="font-medium text-sm">{p.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{p.category_name}</p>
                <p className="text-sm font-bold mt-1">{formatPrice(Number(p.price), p.currency_code)}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.status === 'active' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                    p.status === 'draft' ? 'bg-[var(--color-border)] text-[var(--color-text-muted)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'
                  }`}>{p.status}</span>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingProductId(p.id); setShowForm(true); }}
                      className="text-xs text-[var(--color-info-text)]">{t('common.edit')}</button>
                    <Can permission="marketplace.seller.delete-product">
                      <button onClick={() => deleteProduct.mutate(p.id)}
                        className="text-xs text-[var(--color-error)]">{t('common.delete')}</button>
                    </Can>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {products && products.total > products.limit && (
            <div className="flex justify-between">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="text-sm text-[var(--color-primary)] disabled:opacity-50">{t('common.previous')}</button>
              <span className="text-sm text-[var(--color-text-muted)]">Page {page}</span>
              <button onClick={() => setPage((p) => p + 1)}
                className="text-sm text-[var(--color-primary)]">{t('common.next')}</button>
            </div>
          )}
        </div>
      )}

      {/* Orders Tab */}
      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {['', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map((s) => (
              <button key={s} onClick={() => { setOrderStatus(s); setPage(1); }}
                className={`px-2 py-1 text-xs rounded-full border ${
                  orderStatus === s ? 'bg-[var(--color-primary)] text-white' : ''
                }`}>{s || 'All'}</button>
            ))}
          </div>

          {sellerOrders?.data?.length ? (
            <div className="space-y-3">
              {sellerOrders.data.map((order: any) => {
                const items = order.items || [];
                const shipping = Number(order.shipping_cost || 0);
                const subtotal = Number(order.subtotal || 0);
                return (
                <div key={order.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
                  {/* Header */}
                  <div className="flex items-center gap-3 p-3 border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                    <span className="font-mono text-[var(--color-text)]">#{order.public_id?.slice(0, 8) || order.id}</span>
                    <span>{new Date(order.created_at).toLocaleDateString('en-GB')}</span>
                    <span>{order.buyer_name}{order.buyer_phone ? ` · ${order.buyer_phone}` : ''}</span>
                    <span className="flex-1" />
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      order.status === 'pending' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' :
                      order.status === 'processing' ? 'bg-indigo-100 text-indigo-700' :
                      order.status === 'shipped' ? 'bg-purple-100 text-purple-700' :
                      order.status === 'delivered' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : ''
                    }`}>{order.status}</span>
                    <Can permission="marketplace.seller.manage-orders">
                      <div className="flex gap-1.5">
                        {order.status === 'confirmed' && (
                          <button onClick={() => updateOrderStatus.mutate({ orderId: order.id, status: 'processing', note: 'Processing order' })}
                            className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">Start Processing</button>
                        )}
                        {order.status === 'processing' && (
                          <button onClick={() => updateOrderStatus.mutate({ orderId: order.id, status: 'shipped', note: 'Shipped', tracking: { carrier: 'Default', number: `TRK${Date.now()}` } })}
                            className="px-2 py-1 bg-purple-600 text-white rounded text-xs">Mark Shipped</button>
                        )}
                      </div>
                    </Can>
                  </div>

                  {/* Items */}
                  {items.map((item: any, idx: number) => {
                    const images = (() => { try { return JSON.parse(item.images || '[]'); } catch { return []; } })();
                    return (
                      <div key={idx} className={`flex gap-3 px-4 py-3 ${idx > 0 ? 'border-t border-[var(--color-border)]' : ''}`}>
                        {images[0] ? (
                          <img src={images[0]} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
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
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">{t('seller.no_orders')}</p>
          )}

          {sellerOrders && sellerOrders.total > sellerOrders.limit && (
            <div className="flex justify-between">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="text-sm text-[var(--color-primary)] disabled:opacity-50">{t('common.previous')}</button>
              <span className="text-sm text-[var(--color-text-muted)]">Page {page}</span>
              <button onClick={() => setPage((p) => p + 1)}
                className="text-sm text-[var(--color-primary)]">{t('common.next')}</button>
            </div>
          )}
        </div>
      )}

      {/* Settlements Tab */}
      {tab === 'settlements' && (
        <div className="space-y-4">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--color-text-muted)]">Available Balance</p>
              <p className="text-xl font-bold text-[var(--color-text)]">
                {settlementBalance ? (Number(settlementBalance.available_balance) - Number(settlementBalance.pending_settlements)).toFixed(2) : '0.00'}
              </p>
              {settlementBalance && Number(settlementBalance.pending_settlements) > 0 && (
                <p className="text-xs text-[var(--color-text-muted)]">{Number(settlementBalance.pending_settlements).toFixed(2)} pending settlement</p>
              )}
            </div>
            <Can permission="marketplace.seller.request-settlement">
              <button onClick={() => requestSettlement.mutate()} disabled={requestSettlement.isPending || (settlementBalance && Number(settlementBalance.available_balance) - Number(settlementBalance.pending_settlements) <= 0)}
                className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] disabled:opacity-50">
                {requestSettlement.isPending ? 'Requesting...' : 'Request Settlement'}
              </button>
            </Can>
          </div>

          {settlementsLoading ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('seller.loading_settlements')}</p>
          ) : !settlements?.data?.length ? (
            <p className="text-sm text-[var(--color-text-muted)]">No settlements yet.</p>
          ) : (
            <div className="space-y-3">
              {settlements.data.map((s: any) => (
                <div key={s.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        {formatPrice(Number(s.amount), s.currency_code)}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {new Date(s.requested_at || s.created_at).toLocaleDateString('en-GB')}
                        {s.notes && ` · ${s.notes}`}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      s.status === 'paid' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                      s.status === 'approved' ? 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]' :
                      s.status === 'rejected' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' :
                      s.status === 'cancelled' ? 'bg-[var(--color-border)] text-[var(--color-text-muted)]' :
                      'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'
                    }`}>{s.status}</span>
                  </div>
                  {s.fee > 0 && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">Fee: {Number(s.fee).toFixed(2)} · Net: {Number(s.net_amount).toFixed(2)}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {settlements && settlements.total > settlements.limit && (
            <div className="flex justify-between">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="text-sm text-[var(--color-primary)] disabled:opacity-50">{t('common.previous')}</button>
              <span className="text-sm text-[var(--color-text-muted)]">Page {page}</span>
              <button onClick={() => setPage((p) => p + 1)}
                className="text-sm text-[var(--color-primary)]">{t('common.next')}</button>
            </div>
          )}
        </div>
      )}

      {/* Settings Tab (org editing) */}
      {tab === 'settings' && (
        <OrganisationForm orgId={org?.id || null} context="seller" onClose={() => { queryClient.invalidateQueries({ queryKey: ['mp-player-status'] }); }} />
      )}

      <SellerProductFormModal
        open={showForm}
        onClose={resetForm}
        editId={editingProductId}
        sports={sports || []}
        categories={categories || []}
        brands={brands || []}
        tags={tags || []}
        orgId={org?.id || null}
      />
    </div>
  );
}

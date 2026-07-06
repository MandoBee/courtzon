import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { useTranslation } from '../../i18n';
import { useToast } from '../../components/ui/Toast';
import { Modal } from '../../components/ui/Modal';
import PaymobPixelCard from '../../components/payment/PaymobPixelCard';
import PaymentStatusPoller from '../../components/payment/PaymentStatusPoller';
import { usePaymentConfirm } from '../../hooks/usePaymentConfirm';

function AddressFormModal({ open, address, onClose, onDone }: { open: boolean; address?: any; onClose: () => void; onDone: (id: number) => void }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const isEdit = !!address;
  const [form, setForm] = useState({
    label: '', fullName: '', phone: '', streetAddress: '', provinceId: '', cityId: '',
  });
  useEffect(() => {
    if (open) {
      setForm({
        label: address?.label || '', fullName: address?.full_name || '', phone: address?.phone || '',
        streetAddress: address?.street_address || '', provinceId: String(address?.province_id || ''),
        cityId: String(address?.city_id || ''),
      });
    }
  }, [open, address]);

  const { data: provinces } = useQuery({
    queryKey: ['mp-address-provinces'],
    queryFn: () => api.get('/marketplace/provinces').then((r) => r.data.data || r.data),
    enabled: open,
  });

  const { data: cities } = useQuery({
    queryKey: ['mp-address-cities', form.provinceId],
    queryFn: () => api.get(`/marketplace/provinces/${form.provinceId}/cities`).then((r) => r.data.data || r.data),
    enabled: open && !!form.provinceId,
  });

  const saveAddr = useMutation({
    mutationFn: () => {
      const body = {
        label: form.label || undefined,
        fullName: form.fullName,
        phone: form.phone,
        streetAddress: form.streetAddress,
        city: cities?.find((c: any) => String(c.id) === form.cityId)?.name || '',
        provinceId: form.provinceId ? Number(form.provinceId) : undefined,
        cityId: form.cityId ? Number(form.cityId) : undefined,
      };
      return isEdit
        ? api.put(`/marketplace/addresses/${address.id}`, body)
        : api.post('/marketplace/addresses', body);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['mp-addresses'] });
      showToast(isEdit ? 'Address updated!' : 'Address added!');
      const id = isEdit ? address.id : (res.data?.id || res.data?.addressId || res.data);
      if (id) onDone(id);
      onClose();
    },
    onError: (err: any) => showToast('Failed: ' + (err?.response?.data?.message || err.message), 'error'),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-[var(--color-surface)] rounded-xl shadow-xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-4 text-[var(--color-text)]">{isEdit ? 'Edit Shipping Address' : 'New Shipping Address'}</h3>
        <div className="space-y-3">
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Label (e.g. Home, Work)" className="w-full px-3 py-2 text-sm rounded-lg border" />
          <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Full Name *" className="w-full px-3 py-2 text-sm rounded-lg border" />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone *" className="w-full px-3 py-2 text-sm rounded-lg border" />
          <input value={form.streetAddress} onChange={(e) => setForm({ ...form, streetAddress: e.target.value })} placeholder="Street Address *" className="w-full px-3 py-2 text-sm rounded-lg border" />
          <select value={form.provinceId} onChange={(e) => { setForm({ ...form, provinceId: e.target.value, cityId: '' }); }} className="w-full px-3 py-2 text-sm rounded-lg border bg-[var(--color-bg)]">
            <option value="">Select Province</option>
            {(provinces || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border bg-[var(--color-bg)]" disabled={!form.provinceId}>
            <option value="">Select City</option>
            {(cities || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={() => saveAddr.mutate()} disabled={!form.fullName || !form.phone || !form.streetAddress || !form.provinceId || saveAddr.isPending}
            className="flex-1 px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg disabled:opacity-50">
            {saveAddr.isPending ? 'Saving...' : 'Save Address'}
          </button>
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function CartPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { state: confirmState, confirm: confirmPayment } = usePaymentConfirm();
  const [couponCode, setCouponCode] = useState('');
  const [addressId, setAddressId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editAddress, setEditAddress] = useState<any>(null);
  const [pixelClientSecret, setPixelClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [pollingPaid, setPollingPaid] = useState(false);

  const PAYMENT_OPTIONS = [
    { value: 'card', label: t('cart.payment_card'), icon: '💳' },
    { value: 'online', label: t('cart.payment_online'), icon: '🌐' },
    { value: 'cash', label: t('cart.payment_cash'), icon: '💵' },
  ];

  const { data: cart, isLoading } = useQuery({
    queryKey: ['mp-cart'],
    queryFn: () => api.get('/marketplace/cart').then((r) => r.data),
  });

  const { data: cartSellers } = useQuery({
    queryKey: ['mp-cart-sellers'],
    queryFn: () => api.get('/marketplace/cart/seller-info').then((r) => r.data.data),
  });

  const { data: addresses } = useQuery({
    queryKey: ['mp-addresses'],
    queryFn: () => api.get('/marketplace/addresses').then((r) => r.data.data),
  });

  const { data: couponResult, refetch: validateCoupon } = useQuery({
    queryKey: ['mp-coupon', couponCode],
    queryFn: () => api.post('/marketplace/coupons/validate', { code: couponCode, subtotal: cart?.subtotal || 0 }).then((r) => r.data),
    enabled: false,
    retry: false,
  });

  const { data: shippingResult, isLoading: isShippingLoading } = useQuery({
    queryKey: ['mp-cart-shipping', addressId],
    queryFn: () => api.post('/marketplace/cart/check-shipping', { addressId }).then((r) => r.data),
    enabled: !!addressId,
    retry: false,
  });

  const updateQty = useMutation({
    mutationFn: ({ itemId, qty }: { itemId: number; qty: number }) =>
      api.put(`/marketplace/cart/${itemId}`, { quantity: qty }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mp-cart'] }),
  });

  const removeItem = useMutation({
    mutationFn: (productId: number) => api.delete(`/marketplace/cart/${productId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mp-cart'] }),
  });

  const allFreePlayer = cartSellers?.length > 0 && cartSellers?.every((s: any) => !s.has_paid_plan);

  const checkout = useMutation({
    mutationFn: () => api.post('/marketplace/orders', {
      addressId: addressId || undefined,
      couponCode: couponResult ? couponCode : undefined,
      paymentMethod: paymentMethod || undefined,
      returnUrl: window.location.origin + '/marketplace/orders',
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['mp-cart'] });
      queryClient.invalidateQueries({ queryKey: ['mp-orders'] });
      const data = res.data;
      setOrderId(data.id);

      if (paymentMethod === 'card' || paymentMethod === 'online') {
        if (data.clientSecret) {
          setPixelClientSecret(data.clientSecret);
          setPaymentId(data.paymentId || null);
        } else if (data.paymentUrl) {
          window.location.href = data.paymentUrl;
        } else {
          showToast('Payment gateway did not return a checkout session. Please try again.', 'error');
        }
        return;
      }

      showToast('Order placed successfully!', 'success');
      navigate('/marketplace/orders');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Checkout failed', 'error');
    },
  });

  if (isLoading) return <div className="text-center py-8">{t('cart.loading')}</div>;
  if (!cart?.items?.length && !pixelClientSecret && !pollingPaid && confirmState === 'idle') return (
    <div className="text-center py-12 space-y-4">
      <p className="text-[var(--color-text-muted)]">{t('cart.empty')}</p>
      <Link to="/marketplace" className="text-sm text-[var(--color-primary)]">{t('cart.browse_products')}</Link>
    </div>
  );

  const discount = couponResult?.discount || 0;
  const totalShipping = shippingResult?.total_shipping || 0;
  const total = Math.max(0, cart.subtotal - discount) + totalShipping;
  const cartCurrency = cart.items[0]?.currency_code;
  const unavailableSellerIds = new Set(
    (shippingResult?.sellers || []).filter((s: any) => !s.available).map((s: any) => s.seller_id)
  );
  const hasUnavailableSellers = unavailableSellerIds.size > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{t('cart.title')}</h1>
        <Link to="/marketplace" className="text-sm text-[var(--color-primary)]">{t('cart.continue_shopping')}</Link>
      </div>

      <div className="space-y-3">
        {cart.items.map((item: any) => {
          const basePrice = Number(item.price) || 0;
          const discPrice = item.discounted_price ? Number(item.discounted_price) : null;
          const adjustment = Number(item.price_adjustment || 0);
          const hasDiscount = discPrice !== null && discPrice > 0 && discPrice < basePrice;
          const unitPrice = hasDiscount ? discPrice + adjustment : basePrice + adjustment;
          const seller = cartSellers?.find((s: any) => s.seller_id === item.seller_id);
          const images = (() => {
            try { return JSON.parse(item.images || '[]'); } catch { return []; }
          })();
          const isUnavailable = addressId && unavailableSellerIds.has(item.seller_id);
          return (
            <div key={item.id} className={`bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 flex items-center gap-4 ${isUnavailable ? 'opacity-60' : ''}`}>
              {images[0] && (
                <img src={images[0]} alt={item.name}
                  className="w-14 h-14 object-cover rounded-[var(--radius-md)] flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text)] truncate">{item.name}</p>
                {item.variant_name && (
                  <p className="text-xs text-[var(--color-text-muted)]">{item.variant_name}</p>
                )}
                <p className="text-xs text-[var(--color-text-muted)]">{item.shop_name}</p>
                {hasDiscount ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-sm font-bold text-[var(--color-primary)]">{formatPrice(unitPrice, item.currency_code)}</span>
                    <span className="text-xs text-[var(--color-text-muted)] line-through">{formatPrice(basePrice + adjustment, item.currency_code)}</span>
                  </div>
                ) : (
                  <p className="text-sm font-bold text-[var(--color-text)] mt-0.5">{formatPrice(unitPrice, item.currency_code)}</p>
                )}
                {isUnavailable && (
                  <p className="text-xs text-[var(--color-error)] font-medium mt-1">{t('cart.item_unavailable') || 'Unavailable at this address'}</p>
                )}
              </div>
              <div className="flex items-center border rounded-[var(--radius-md)]">
                <button onClick={() => updateQty.mutate({ itemId: item.id, qty: item.quantity - 1 })}
                  className="px-2 py-1 text-sm">-</button>
                <span className="px-3 py-1 text-sm border-x">{item.quantity}</span>
                <button onClick={() => updateQty.mutate({ itemId: item.id, qty: item.quantity + 1 })}
                  className="px-2 py-1 text-sm">+</button>
              </div>
              <button onClick={() => removeItem.mutate(item.product_id)}
                className="text-sm text-[var(--color-error)]">{t('cart.remove')}</button>
              {seller?.phone && !seller?.has_paid_plan && (
                <div className="flex gap-1">
                  <a href={`tel:${seller.phone}`} title="Call seller"
                    className="p-1.5 bg-[var(--color-success-bg)] text-[var(--color-success-text)] rounded-full text-sm hover:opacity-80">📞</a>
                  <a href={`https://wa.me/${seller.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" title="WhatsApp seller"
                    className="p-1.5 bg-[var(--color-success-bg)] text-[var(--color-success-text)] rounded-full text-sm hover:opacity-80">💬</a>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Coupon */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 flex gap-2">
        <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)}
          placeholder={t('cart.coupon_placeholder')} className="flex-1 px-3 py-2 text-sm rounded-[var(--radius-md)] border" />
        <button onClick={() => validateCoupon()}
          className="px-4 py-2 text-sm border rounded-[var(--radius-md)]">{t('cart.apply')}</button>
        {couponResult && (
          <p className="text-sm text-[var(--color-success)]">Discount: -{formatPrice(discount, cartCurrency)}</p>
        )}
      </div>

      {/* Address Selection */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">{t('cart.shipping_address')}</h3>
          <button onClick={() => setShowAddressForm(true)}
            className="text-xs text-[var(--color-primary)] font-medium">{t('cart.add_address') || '+ Add Address'}</button>
        </div>
        {addresses?.length > 0 ? (
          <div className="space-y-2">
            {addresses.map((a: any) => (
              <label key={a.id} className="flex items-start gap-2 cursor-pointer">
                <input type="radio" name="address" checked={addressId === a.id}
                  onChange={() => setAddressId(a.id)} className="mt-1" />
                <div className="text-sm flex-1">
                  <p className="font-medium">{a.full_name}{a.label ? ` - ${a.label}` : ''}</p>
                  <p className="text-[var(--color-text-muted)]">{a.street_address}, {a.city}</p>
                </div>
                <button type="button" onClick={(e) => { e.preventDefault(); setEditAddress(a); }}
                  className="text-xs text-[var(--color-primary)] self-start mt-1">Edit</button>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">{t('cart.no_addresses') || 'No saved addresses'}</p>
        )}
      </div>

      <AddressFormModal open={showAddressForm || !!editAddress} address={editAddress}
        onClose={() => { setShowAddressForm(false); setEditAddress(null); }}
        onDone={(id) => { setAddressId(id); setShowAddressForm(false); setEditAddress(null); }} />

      {/* Poll order status after Pixel payment */}
      {pollingPaid && orderId && (
        <PaymentStatusPoller
          endpoint={`/marketplace/orders/${orderId}`}
          field="payment_status"
          interval={1500}
          timeout={90000}
          onPaid={() => { setPollingPaid(false); showToast('Order placed successfully!', 'success'); navigate('/marketplace/orders'); }}
          onTimeout={() => { setPollingPaid(false); showToast('Payment confirmation is taking longer than expected. Your order is pending — we will update you shortly.', 'warning'); }}
        />
      )}

      {/* Payment confirming overlay (usePaymentConfirm hook state) */}
      {(confirmState === 'confirming' || confirmState === 'polling') && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-[var(--color-surface)] rounded-xl shadow-xl p-6 text-center space-y-3">
            <div className="animate-spin w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-[var(--color-text-muted)]">
              {confirmState === 'confirming' ? 'Verifying payment...' : 'Waiting for confirmation...'}
            </p>
          </div>
        </div>
      )}

      <Modal open={!!pixelClientSecret} onClose={() => setPixelClientSecret(null)} title="Pay with Card" size="lg">
        {pixelClientSecret && (
          <PaymobPixelCard
            clientSecret={pixelClientSecret}
            containerId="pixel-container-marketplace"
            onComplete={async () => {
              setPixelClientSecret(null);
              showToast('Payment submitted — confirming...', 'info');
              const pmId = paymentId;
              if (pmId) {
                const result = await confirmPayment(pmId);
                if (result.confirmed) {
                  showToast('Order placed successfully!', 'success');
                  navigate('/marketplace/orders');
                  return;
                }
              }
              // Fall back to polling (webhook will complete)
              setPollingPaid(true);
            }}
            onCancel={() => {
              setPixelClientSecret(null);
              showToast('Payment cancelled', 'warning');
            }}
          />
        )}
      </Modal>

      {/* Shipping Check */}
      {addressId && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
          <h3 className="text-sm font-medium mb-2">{t('cart.shipping_info') || 'Shipping'}</h3>
          {isShippingLoading ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('cart.checking_shipping') || 'Checking shipping availability...'}</p>
          ) : shippingResult?.sellers ? (
            <div className="space-y-2">
              {shippingResult.sellers.map((s: any) => (
                <div key={s.seller_id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {s.available ? (
                      <span className="text-[var(--color-success)]">✅</span>
                    ) : (
                      <span className="text-[var(--color-error)]">❌</span>
                    )}
                    <span>{s.shop_name}</span>
                  </div>
                  <span className={s.available ? 'text-[var(--color-text)]' : 'text-[var(--color-error)]'}>
                    {s.available ? (s.price > 0 ? formatPrice(s.price, cartCurrency) : t('cart.free_shipping') || 'Free') : t('cart.cannot_ship') || 'Cannot ship'}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Payment Method & Checkout */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-6 space-y-4">
        <div className="flex justify-between text-sm">
          <span>{t('common.subtotal')}</span><span>{formatPrice(Number(cart.subtotal), cartCurrency)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm text-[var(--color-success)]">
            <span>{t('common.discount')}</span><span>-{formatPrice(discount, cartCurrency)}</span>
          </div>
        )}
        {totalShipping > 0 && (
          <div className="flex justify-between text-sm">
            <span>{t('cart.shipping') || 'Shipping'}</span><span>{formatPrice(totalShipping, cartCurrency)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-lg border-t pt-3">
          <span>{t('common.total')}</span><span>{formatPrice(total, cartCurrency)}</span>
        </div>

        {allFreePlayer && (
          <div className="bg-[var(--color-info-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 space-y-3">
            <p className="text-sm text-[var(--color-info-text)] text-[var(--color-info-text)] font-medium">{t('cart.seller_free_plan_note')}</p>
            <p className="text-sm text-[var(--color-info-text)] text-[var(--color-info-text)]">{t('cart.contact_seller_note')}</p>
            <div className="space-y-2">
              {cartSellers?.filter((s: any) => s.phone).map((s: any) => (
                <div key={s.seller_id} className="flex items-center gap-3 text-sm">
                  <span className="font-medium text-[var(--color-text)]">{s.org_name || 'Seller'}</span>
                  <a href={`tel:${s.phone}`} title="Call seller"
                    className="p-1.5 bg-[var(--color-success-bg)] text-[var(--color-success-text)] rounded-full hover:opacity-80">📞</a>
                  <a href={`https://wa.me/${s.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" title="WhatsApp seller"
                    className="p-1.5 bg-[var(--color-success-bg)] text-[var(--color-success-text)] rounded-full hover:opacity-80">💬</a>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm text-[var(--color-text-muted)] mb-2">{t('cart.payment_method')}</label>
          <div className="grid grid-cols-4 gap-2">
            {PAYMENT_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setPaymentMethod(opt.value)}
                className={`flex items-center gap-2 px-4 py-3 rounded-[var(--radius-md)] border text-sm font-medium transition-all ${
                  paymentMethod === opt.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-bg)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'
                }`}>
                <span className="text-lg">{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {hasUnavailableSellers && (
          <p className="text-sm text-[var(--color-error)] text-center">{t('cart.unavailable_sellers_warning') || 'Some items cannot be shipped to this address. Remove them or choose a different address.'}</p>
        )}

        <button onClick={() => checkout.mutate()} disabled={checkout.isPending || !addressId || !paymentMethod || hasUnavailableSellers}
          className="w-full py-2.5 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] font-medium disabled:opacity-50">
          {checkout.isPending ? t('common.processing') : 'Place Order'}
        </button>

        {checkout.isError && (
          <p className="text-sm text-[var(--color-error)]">{t('cart.checkout_failed')}</p>
        )}
      </div>
    </div>
  );
}

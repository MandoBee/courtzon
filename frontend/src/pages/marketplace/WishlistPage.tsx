import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { useTranslation } from '../../i18n';
import { useToast } from '../../components/ui/Toast';

export default function WishlistPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: items, isLoading } = useQuery({
    queryKey: ['mp-wishlist'],
    queryFn: () => api.get('/marketplace/wishlist').then((r) => r.data.data),
  });

  const removeFromWishlist = useMutation({
    mutationFn: (productId: number) => api.delete(`/marketplace/wishlist/${productId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mp-wishlist'] });
      showToast('Removed from wishlist', 'info');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to remove', 'error'),
  });

  const addToCart = useMutation({
    mutationFn: (productId: number) => api.post('/marketplace/cart', { productId, quantity: 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mp-cart'] });
      showToast('Added to cart!', 'success');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to add to cart', 'error'),
  });

  if (isLoading) return <div className="text-center py-8">{t('common.loading')}</div>;

  if (!items?.length) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-4xl">🤍</p>
        <p className="text-[var(--color-text-muted)]">Your wishlist is empty</p>
        <Link to="/marketplace" className="text-sm text-[var(--color-primary)]">Browse products</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">My Wishlist</h1>
        <Link to="/marketplace" className="text-sm text-[var(--color-primary)]">Continue shopping</Link>
      </div>

      <div className="space-y-3">
        {items.map((item: any) => {
          const basePrice = Number(item.price) || 0;
          const discPrice = item.discounted_price ? Number(item.discounted_price) : null;
          const hasDiscount = discPrice !== null && discPrice > 0 && discPrice < basePrice;
          const unitPrice = hasDiscount ? discPrice : basePrice;
          const images = (() => { try { return JSON.parse(item.images || '[]'); } catch { return []; } })();
          const isSoldOut = item.status === 'sold_out' || item.status === 'archived';

          return (
            <div key={item.product_id} className={`bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 flex items-center gap-4 ${isSoldOut ? 'opacity-60' : ''}`}>
              {images[0] ? (
                <img src={images[0]} alt={item.name}
                  className="w-16 h-16 object-cover rounded-[var(--radius-md)] flex-shrink-0 cursor-pointer"
                  onClick={() => navigate(`/marketplace/products/${item.product_id}`)} />
              ) : (
                <div className="w-16 h-16 bg-[var(--color-bg)] rounded-[var(--radius-md)] flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <Link to={`/marketplace/products/${item.product_id}`}
                  className="text-sm font-medium text-[var(--color-text)] hover:text-[var(--color-primary)] transition-colors line-clamp-2">
                  {item.name}
                </Link>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{item.shop_name}</p>
                <div className="flex items-center gap-2 mt-1">
                  {hasDiscount ? (
                    <>
                      <span className="text-sm font-bold text-[var(--color-primary)]">{formatPrice(unitPrice, item.currency_code)}</span>
                      <span className="text-xs text-[var(--color-text-muted)] line-through">{formatPrice(basePrice, item.currency_code)}</span>
                    </>
                  ) : (
                    <span className="text-sm font-bold text-[var(--color-text)]">{formatPrice(unitPrice, item.currency_code)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => addToCart.mutate(item.product_id)}
                  disabled={isSoldOut || addToCart.isPending}
                  className="px-3 py-1.5 text-xs font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                  {isSoldOut ? 'Sold Out' : addToCart.isPending ? '...' : t('cart.add_to_cart') || 'Add to Cart'}
                </button>
                <button
                  onClick={() => removeFromWishlist.mutate(item.product_id)}
                  className="p-1.5 text-sm text-[var(--color-error)] hover:bg-[var(--color-error-bg)] rounded-[var(--radius-md)] transition-colors"
                  title="Remove from wishlist"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

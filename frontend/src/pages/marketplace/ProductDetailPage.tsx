import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { useToast } from '../../components/ui/Toast';
import ImageGallery from '../../components/marketplace/ImageGallery';

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [qty, setQty] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');

  const { data: product, isLoading } = useQuery({
    queryKey: ['mp-product', id],
    queryFn: () => api.get(`/marketplace/products/${id}`).then((r) => r.data),
  });

  const { data: reviews } = useQuery({
    queryKey: ['mp-reviews', id],
    queryFn: () => api.get(`/marketplace/products/${id}/reviews`).then((r) => r.data),
  });

  const { data: wishlist } = useQuery({
    queryKey: ['mp-wishlist'],
    queryFn: () => api.get('/marketplace/wishlist').then((r) => r.data.data),
  });

  const wishlistIds = new Set((wishlist || []).map((w: any) => w.product_id));

  const addToCart = useMutation({
    mutationFn: () => api.post('/marketplace/cart', {
      productId: Number(id),
      variantId: selectedVariant || undefined,
      quantity: qty,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mp-cart'] });
      showToast('Added to cart!');
      navigate('/marketplace');
    },
  });

  const toggleWishlist = useMutation({
    mutationFn: () => wishlistIds.has(Number(id))
      ? api.delete(`/marketplace/wishlist/${id}`)
      : api.post(`/marketplace/wishlist/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mp-wishlist'] }),
  });

  const submitReview = useMutation({
    mutationFn: () => api.post(`/marketplace/products/${id}/reviews`, { rating: reviewRating, reviewText }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mp-reviews', id] });
      setReviewText('');
      setReviewRating(5);
    },
  });

  if (isLoading) return <div className="text-center py-8">Loading...</div>;
  if (!product) return <div className="text-center py-8">Product not found</div>;

  const images = (() => {
    try { return JSON.parse(product.images || '[]'); } catch { return []; }
  })();

  const variantsByType: Record<string, any[]> = {};
  if (product.variants) {
    for (const v of product.variants) {
      if (!variantsByType[v.variant_type]) variantsByType[v.variant_type] = [];
      variantsByType[v.variant_type].push(v);
    }
  }

  const selectedVariantObj = product.variants?.find((v: any) => v.id === selectedVariant);
  const basePrice = Number(product.price);
  const discPrice = product.discounted_price ? Number(product.discounted_price) : null;
  const adjustment = Number(selectedVariantObj?.price_adjustment || 0);
  const hasDiscount = discPrice !== null && discPrice > 0 && discPrice < basePrice;
  const salePrice = hasDiscount ? discPrice + adjustment : basePrice + adjustment;
  const originalPrice = basePrice + adjustment;
  const variantStock = selectedVariantObj ? selectedVariantObj.quantity : product.quantity;
  const maxQty = Math.min(10, variantStock);
  const needsVariant = Object.keys(variantsByType).length > 0 && selectedVariant === null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-6">
        <div>
          <ImageGallery images={images} name={product.name} />
        </div>

        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)]">{product.shop_name}</p>
          <h1 className="text-xl font-bold text-[var(--color-text)]">{product.name}</h1>

          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-[var(--color-primary)]">
              {formatPrice(salePrice, product.currency_code)}
            </span>
            {hasDiscount && (
              <>
                <span className="text-sm text-[var(--color-text-muted)] line-through">
                  {formatPrice(originalPrice, product.currency_code)}
                </span>
                <span className="text-xs bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded">
                  -{Math.round((1 - salePrice / originalPrice) * 100)}%
                </span>
              </>
            )}
          </div>

          <p className={`text-sm ${variantStock > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
            {variantStock > 0 ? `In Stock (${variantStock} available)` : 'Out of Stock'}
          </p>

          {/* Variant selectors */}
          {Object.entries(variantsByType).map(([type, variants]) => (
            <div key={type}>
              <p className="text-sm text-[var(--color-text-muted)] mb-1 capitalize">{type}</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v: any) => (
                  <button key={v.id} onClick={() => setSelectedVariant(v.id)}
                    className={`px-3 py-1.5 text-sm rounded-[var(--radius-md)] border transition-colors ${
                      selectedVariant === v.id
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                        : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'
                    }`}
                    title={v.variant_name}>
                    {v.variant_color ? (
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-4 h-4 rounded-full border" style={{ backgroundColor: v.variant_color }} />
                        <span>{v.variant_name}</span>
                        {v.price_adjustment > 0 && <span className="text-xs opacity-75">+{v.price_adjustment}</span>}
                      </span>
                    ) : (
                      <>{v.variant_name}{v.price_adjustment > 0 && ` +${v.price_adjustment}`}</>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Variant selection prompt */}
          {Object.keys(variantsByType).length > 0 && selectedVariant === null && (
            <p className="text-xs text-[var(--color-warning)]">Please select {Object.keys(variantsByType).join(' and ')} before adding to cart</p>
          )}

          {/* Quantity and Add to Cart */}
          <div className="flex items-center gap-3">
            <div className="flex items-center border rounded-[var(--radius-md)]">
              <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-3 py-2 text-sm">-</button>
              <span className="px-4 py-2 text-sm border-x">{qty}</span>
              <button onClick={() => setQty(Math.min(maxQty, qty + 1))} className="px-3 py-2 text-sm">+</button>
            </div>
            <button onClick={() => addToCart.mutate()} disabled={variantStock === 0 || addToCart.isPending || needsVariant}
              className="flex-1 px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] disabled:opacity-50">
              {addToCart.isPending ? 'Adding...' : 'Add to Cart'}
            </button>
            <button onClick={() => toggleWishlist.mutate()} className="px-3 py-2 border rounded-[var(--radius-md)] text-lg">
              {wishlistIds.has(Number(id)) ? '❤️' : '🤍'}
            </button>
          </div>
        </div>
      </div>

      {/* Description */}
      {product.description && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-6">
          <h2 className="font-semibold text-[var(--color-text)] mb-2">Description</h2>
          <p className="text-sm text-[var(--color-text-muted)] whitespace-pre-wrap">{product.description}</p>
        </div>
      )}

      {/* Video */}
      {product.video_url && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-6">
          <h2 className="font-semibold text-[var(--color-text)] mb-2">Video</h2>
          <video src={product.video_url} controls className="w-full max-h-96 rounded-[var(--radius-md)]" />
        </div>
      )}

      {/* Reviews */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-6">
        <h2 className="font-semibold text-[var(--color-text)] mb-4">Reviews</h2>
        {reviews?.data?.length ? (
          <div className="space-y-3 mb-6">
            {reviews.data.map((r: any) => (
              <div key={r.id} className="border-b border-[var(--color-border)] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">{r.user_name}</span>
                  <span className="text-xs">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                </div>
                {r.review_text && <p className="text-sm text-[var(--color-text-muted)] mt-1">{r.review_text}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)] mb-4">No reviews yet.</p>
        )}

        <div className="border-t border-[var(--color-border)] pt-4 space-y-3">
          <h3 className="text-sm font-medium text-[var(--color-text)]">Write a Review</h3>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star} onClick={() => setReviewRating(star)}
                className={`text-lg ${star <= reviewRating ? 'text-yellow-400' : 'text-[var(--color-text-muted)]'}`}>
                ★
              </button>
            ))}
          </div>
          <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)}
            placeholder="Share your experience..." rows={3}
            className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border" />
          <button onClick={() => submitReview.mutate()} disabled={submitReview.isPending}
            className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] disabled:opacity-50">
            {submitReview.isPending ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      </div>
    </div>
  );
}


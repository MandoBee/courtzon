import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import ImageGallery from '../../components/marketplace/ImageGallery';

export default function PlayerProductDetailPage() {
  const { id } = useParams();

  const { data: product, isLoading } = useQuery({
    queryKey: ['mp-product', id],
    queryFn: () => api.get(`/marketplace/products/${id}`).then((r) => r.data),
  });

  if (isLoading) return <div className="text-center py-8">Loading...</div>;
  if (!product) return <div className="text-center py-8">Product not found</div>;

  const images = (() => {
    try { return JSON.parse(product.images || '[]'); } catch { return product.images || []; }
  })();

  const phone = product.seller_phone || '';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-sm text-[var(--color-text-muted)]">
        <Link to="/marketplace" className="text-[var(--color-primary)]">Marketplace</Link> / Players / {product.name}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] p-6">
        <div>
          <ImageGallery images={images} name={product.name} />
        </div>

        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)]">{product.shop_name}</p>
          <h1 className="text-xl font-bold text-[var(--color-text)]">{product.name}</h1>

          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-[var(--color-primary)]">
              {product.discounted_price && Number(product.discounted_price) > 0 && Number(product.discounted_price) < Number(product.price)
                ? formatPrice(Number(product.discounted_price), product.currency_code)
                : formatPrice(Number(product.price), product.currency_code)}
            </span>
            {product.discounted_price && Number(product.discounted_price) > 0 && Number(product.discounted_price) < Number(product.price) && (
              <>
                <span className="text-sm text-[var(--color-text-muted)] line-through">
                  {formatPrice(Number(product.price), product.currency_code)}
                </span>
                <span className="text-xs bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded">
                  -{Math.round((1 - Number(product.discounted_price) / Number(product.price)) * 100)}%
                </span>
              </>
            )}
          </div>

          <p className={`text-sm ${product.quantity > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
            {product.quantity > 0 ? `In Stock (${product.quantity} available)` : 'Out of Stock'}
          </p>

          {/* Contact Seller */}
          <div className="bg-[var(--color-info-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 space-y-3">
            <p className="text-sm text-[var(--color-info-text)] text-[var(--color-info-text)] font-medium">
              This product is listed by a player on a free selling plan.
            </p>
            <p className="text-sm text-[var(--color-info-text)] text-[var(--color-info-text)]">
              Contact the seller directly to arrange purchase and delivery.
            </p>
            {phone && (
              <div className="flex gap-3">
                <a href={`tel:${phone}`} title="Call seller"
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] hover:bg-[var(--color-primary)]">
                  <span>📞</span> Call
                </a>
                <a href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" title="WhatsApp seller"
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] hover:bg-[var(--color-primary)]">
                  <span>💬</span> WhatsApp
                </a>
              </div>
            )}
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
    </div>
  );
}

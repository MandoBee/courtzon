import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { formatPrice } from '../../../utils/currency';
import { EntityImage } from '../../../components/ui';

export default function AdminProductDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [status, setStatus] = useState('');

  const { data: product, isLoading } = useQuery({
    queryKey: ['admin-product', id],
    queryFn: () => api.get(`/marketplace/products/${id}`).then((r: any) => r.data),
    enabled: !!id,
  });

  const updateStatus = useMutation({
    mutationFn: (newStatus: string) => api.put(`/marketplace/admin/products/${id}/status`, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-product', id] });
      showToast('Status updated!');
    },
    onError: (err: any) => showToast('Failed: ' + getErrorMessage(err), 'error'),
  });

  if (isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading product...</p>;
  if (!product) return <p className="text-sm text-red-500">Product not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/admin/marketplace/products" className="text-sm text-[var(--color-primary)]">&larr; Back to Products</Link>
        <h1 className="text-xl font-bold text-[var(--color-text)]">{product.name}</h1>
      </div>

      {/* Product Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 space-y-3">
            <h2 className="font-semibold text-sm">Product Information</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-[var(--color-text-muted)]">Category:</span> {product.category_name}</div>
              <div><span className="text-[var(--color-text-muted)]">Brand:</span> {product.brand_name || '-'}</div>
              <div><span className="text-[var(--color-text-muted)]">Sport:</span> {product.sport_id ? `#${product.sport_id}` : '-'}</div>
              <div><span className="text-[var(--color-text-muted)]">Seller:</span> {product.shop_name || `#${product.seller_id}`}</div>
              <div><span className="text-[var(--color-text-muted)]">Price:</span> {formatPrice(Number(product.price), product.currency_code)}</div>
              <div><span className="text-[var(--color-text-muted)]">Discounted:</span> {product.discounted_price ? formatPrice(Number(product.discounted_price), product.currency_code) : '-'}</div>
              <div><span className="text-[var(--color-text-muted)]">Quantity:</span> {product.quantity}</div>
              <div><span className="text-[var(--color-text-muted)]">Status:</span>
                <select value={status || product.status} onChange={(e: any) => { setStatus(e.target.value); updateStatus.mutate(e.target.value); }}
                  className="ml-2 px-2 py-0.5 text-xs border rounded">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              {product.description && (
                <div className="col-span-2"><span className="text-[var(--color-text-muted)]">Description:</span> {product.description}</div>
              )}
            </div>
            {product.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-[var(--color-text-muted)]">Tags:</span>
                {product.tags.map((t: any) => (
                  <span key={t.id} className="px-2 py-0.5 text-xs bg-[var(--color-primary)]/10 rounded-full">{t.name}</span>
                ))}
              </div>
            )}
          </div>

          {/* Specs */}
          {product.specs?.length > 0 && (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
              <h2 className="font-semibold text-sm mb-3">Specifications</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {product.specs.map((s: any, i: number) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-[var(--color-text-muted)] min-w-[100px]">{s.spec_name}:</span>
                    <span>{s.spec_value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Variants */}
          {product.variants?.length > 0 && (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
              <h2 className="font-semibold text-sm mb-3">Variants ({product.variants.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-[var(--color-text-muted)]">
                    <th className="text-left py-1 px-2">Name</th>
                    <th className="text-left py-1 px-2">Type</th>
                    <th className="text-right py-1 px-2">Price Adj.</th>
                    <th className="text-right py-1 px-2">Qty</th>
                    <th className="text-left py-1 px-2">SKU</th>
                    <th className="text-center py-1 px-2">Color</th>
                  </tr></thead>
                  <tbody>
                    {product.variants.map((v: any) => (
                      <tr key={v.id} className="border-b border-[var(--color-border)]">
                        <td className="py-1 px-2">{v.variant_name}</td>
                        <td className="py-1 px-2 text-[var(--color-text-muted)]">{v.variant_type}</td>
                        <td className="py-1 px-2 text-right">{v.price_adjustment > 0 ? `+${v.price_adjustment}` : v.price_adjustment}</td>
                        <td className="py-1 px-2 text-right">{v.quantity}</td>
                        <td className="py-1 px-2 text-[var(--color-text-muted)]">{v.sku || '-'}</td>
                        <td className="py-1 px-2 text-center">{v.variant_color ? <span style={{ backgroundColor: v.variant_color }} className="inline-block w-4 h-4 rounded-full border" title={v.variant_color} /> : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Images */}
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
            <h2 className="font-semibold text-sm mb-3">Images</h2>
            {product.images?.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {(product.images || []).map((url: string, i: number) => (
                  <EntityImage key={i} src={url} name={product?.name || 'Product'} className="w-full aspect-square rounded-[var(--radius-md)] text-2xl" />
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)]">No images</p>
            )}
          </div>
          {product.images2?.length > 0 && (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
              <h2 className="font-semibold text-sm mb-2">Media Gallery ({product.images2.length})</h2>
              <div className="grid grid-cols-2 gap-2">
                {product.images2.map((img: any) => (
                  <div key={img.id}>
                    <EntityImage src={img.media_url} name={img.alt_text || product?.name || 'Image'} className="w-full aspect-square rounded-[var(--radius-md)] text-xl" />
                    {img.is_primary === 1 && <span className="text-xs text-[var(--color-info-text)]">Primary</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Related Products */}
      {product.related?.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4">
          <h2 className="font-semibold text-sm mb-3">Related Products ({product.related.length})</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {product.related.map((r: any) => (
              <div key={r.id} className="border rounded-[var(--radius-md)] p-2">
                <span className="text-xs text-[var(--color-text-muted)] block">{r.relation_type}</span>
                <p className="text-xs font-medium truncate">{r.related_product_name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{Number(r.related_product_price).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

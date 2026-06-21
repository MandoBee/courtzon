import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { useCan } from '../../hooks/useCan';
import { formatPrice } from '../../utils/currency';
import ProductFormModal from '../../components/marketplace/PlayerProductFormModal';

interface PlayerProduct {
  id: number;
  name: string;
  description: string | null;
  price: number;
  condition_status: string | null;
  images: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function PlayerProductsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { can } = useCan();
  const [editing, setEditing] = useState<PlayerProduct | null>(null);
  const [adding, setAdding] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const { data: status } = useQuery({
    queryKey: ['mp-player-status'],
    queryFn: () => api.get('/marketplace/player/status').then((r) => r.data),
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ['mp-player-products', statusFilter],
    queryFn: () => api.get('/marketplace/player/products', { params: { status: statusFilter || undefined } }).then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: number) => api.patch(`/marketplace/player/products/${productId}/sold`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mp-player-products'] });
      showToast('Product marked as sold');
    },
    onError: (err) => {
      showToast('Failed: ' + ((err as any)?.response?.data?.message || (err as any).message), 'error');
    },
  });

  const totalCount = (products || []).length;

  if (!can('marketplace.player-products.manage')) return <Navigate to="/marketplace" replace />;
  if (status && !status.active) return <Navigate to="/marketplace" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/marketplace" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">&larr; Back to Marketplace</Link>
          <h1 className="text-xl font-bold text-[var(--color-text)] mt-1">My Products</h1>
        </div>
        <button
          onClick={() => setAdding(true)}
          disabled={totalCount >= 5}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[var(--gradient-primary)] rounded-xl disabled:opacity-40 hover:opacity-90 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          Add Product ({totalCount}/5)
        </button>
      </div>

      {totalCount >= 5 && (
        <p className="text-sm text-[var(--color-warning)] bg-[var(--color-warning-bg)]/20 border border-[var(--color-warning)]/30 rounded-[var(--radius-md)] px-4 py-2">
          You've reached the 5-item limit. Mark some products as sold to free up slots.
        </p>
      )}

      {/* Status Tabs */}
      <div className="flex items-center gap-1 bg-[var(--color-surface)] border rounded-lg p-1 w-fit">
        {['', 'active', 'pending'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${statusFilter === s ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 h-48" />
          ))}
        </div>
      ) : !products?.length ? (
        <div className="text-center py-16">
          <p className="text-[var(--color-text-muted)] text-lg mb-2">No products yet</p>
          <p className="text-[var(--color-text-muted)] text-sm">Tap "Add Product" to list your first item for sale.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(products || []).map((p: PlayerProduct) => (
            <div key={p.id} className="flex flex-col bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4">
              {p.images && (() => { try { const imgs = JSON.parse(p.images); if (imgs?.[0]) return <img src={imgs[0]} alt="" className="w-full h-40 object-cover rounded-xl mb-3" />; } catch {} return null; })()}
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-[var(--color-text)] text-sm line-clamp-2">{p.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    p.status === 'active' ? 'bg-[var(--color-success-bg)] text-[var(--color-success)]' :
                    p.status === 'sold' ? 'bg-[var(--color-text-muted)]/20 text-[var(--color-text-muted)]' :
                    'bg-[var(--color-warning-bg)] text-[var(--color-warning)]'
                  }`}>
                    {p.status === 'sold' ? 'Sold' : p.status}
                  </span>
                </div>
                {p.description && <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-2">{p.description}</p>}
              </div>
              <div className="flex items-center justify-between pt-2 mt-3 border-t border-[var(--color-border)]">
                <span className="font-bold text-[var(--color-text)]">{formatPrice(p.price, 'EGP')}</span>
                {p.status === 'active' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditing(p)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors text-[var(--color-text)]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { if (confirm('Mark this product as sold?')) deleteMutation.mutate(p.id); }}
                      disabled={deleteMutation.isPending}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-error)] text-white hover:opacity-90 transition-all"
                    >
                      Sold
                    </button>
                  </div>
                )}
                {p.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditing(p)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors text-[var(--color-text)]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { if (confirm('Mark this product as sold?')) deleteMutation.mutate(p.id); }}
                      disabled={deleteMutation.isPending}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--color-error)] text-white hover:opacity-90 transition-all"
                    >
                      Sold
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <ProductFormModal
          product={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['mp-player-products'] });
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { useToast } from '../../components/ui/Toast';
import { Can } from '../../permissions/Can';
import { EntityImage } from '../../components/ui';
import UpgradeRequestModal from '../../components/subscription/UpgradeRequestModal';
import OrgProductFormModal from '../../components/marketplace/OrgProductFormModal';

export default function OrgMarketplacePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [page, setPage] = useState(1);
  const [sportFilter, setSportFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const { data: prods, isLoading } = useQuery({
    queryKey: ['org-products', orgId, page, sportFilter, statusFilter, branchFilter],
    queryFn: () => api.get(`/org/${orgId}/products`, { params: { page, limit: 20, sportId: sportFilter || undefined, status: statusFilter || undefined, branchId: branchFilter || undefined } }).then((r) => r.data),
    enabled: !!orgId,
  });

  const { data: sports } = useQuery({ queryKey: ['mp-sports-marketplace'], queryFn: () => api.get('/sports/marketplace').then((r) => r.data) });
  const { data: categories } = useQuery({ queryKey: ['mp-cats-org'], queryFn: () => api.get('/marketplace/categories').then((r) => r.data.data) });
  const { data: brands } = useQuery({ queryKey: ['mp-brands'], queryFn: () => api.get('/marketplace/brands').then((r) => r.data) });
  const { data: tags } = useQuery({ queryKey: ['mp-tags'], queryFn: () => api.get('/marketplace/tags').then((r) => r.data) });

  const { data: branches } = useQuery({
    queryKey: ['org-branches', orgId],
    queryFn: () => api.get(`/organisations/${orgId}/branches`).then((r) => r.data?.data || []),
    enabled: !!orgId,
  });

  const handleClose = () => {
    setShowForm(false);
    setEditId(null);
  };
  const delMut = useMutation({
    mutationFn: (id: number) => api.delete(`/marketplace/products/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['org-products'] }); showToast('Product deleted!'); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to delete', 'error'),
  });

  const getImg = (p: any) => { try { return JSON.parse(p.images || '[]')[0]; } catch { return Array.isArray(p.images) ? p.images[0] : ''; } };

  const total = prods?.total || 0;
  const pages = Math.ceil(total / 20);

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid org</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Products</h1>
        <Can permission="marketplace.seller.create-product">
          <button onClick={() => { setEditId(null); setShowForm(true); }} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90">+ Add Product</button>
        </Can>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-[var(--color-surface)] border rounded-lg p-1">
          {['', 'active', 'pending'].map((s) => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${statusFilter === s ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
            </button>
          ))}
        </div>
        <select value={sportFilter} onChange={(e) => { setSportFilter(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[150px]">
          <option value="">All Sports</option>
          {(Array.isArray(sports) ? sports : []).map((s: any) => <option key={s.id} value={s.id}>{s.icon && !s.icon.startsWith('/') ? s.icon + ' ' : ''}{s.name}</option>)}
        </select>
        <Can permission="marketplace.seller.branch-select">
          <select value={branchFilter} onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm min-w-[150px]">
            <option value="">All Branches</option>
            {(Array.isArray(branches) ? branches : []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Can>
      </div>

      <OrgProductFormModal
        open={showForm}
        onClose={handleClose}
        orgId={orgId}
        editId={editId}
        sports={Array.isArray(sports) ? sports : []}
        categories={Array.isArray(categories) ? categories : []}
        brands={Array.isArray(brands) ? brands : []}
        tags={Array.isArray(tags) ? tags : []}
        onUpgrade={() => setShowUpgradeModal(true)}
      />

      {isLoading ? (
        <div className="animate-pulse h-40 bg-[var(--color-border)] bg-[var(--color-surface)] rounded-xl" />
      ) : !prods?.data?.length ? (
        <div className="bg-[var(--color-surface)] rounded-xl p-8 text-center border"><p className="text-[var(--color-text-muted)]">No products. Click + Add Product to create one.</p></div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {prods.data.map((p: any) => (
            <div key={p.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden hover:shadow-md transition-shadow group">
              <div className="aspect-square bg-[var(--color-border)] bg-[var(--color-surface)] relative">
                <EntityImage src={getImg(p)} name={p.name} className="w-full h-full rounded-none text-2xl" />
              </div>
              <div className="p-3 space-y-1">
                <p className="text-sm font-medium text-[var(--color-text)] truncate">{p.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{p.category_name || '-'}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[var(--color-primary)]">
                    {p.discounted_price ? (
                      <><span className="line-through text-[var(--color-text-muted)] text-xs mr-1">{formatPrice(Number(p.price), p.currency_code)}</span>{formatPrice(Number(p.discounted_price), p.currency_code)}</>
                    ) : formatPrice(Number(p.price), p.currency_code)}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'active' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : p.status === 'draft' ? 'bg-[var(--color-border)] text-[var(--color-text-muted)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'}`}>{p.status}</span>
                </div>
                {p.condition_status && <p className="text-[10px] text-[var(--color-text-muted)] capitalize">{p.condition_status.replace('_', ' ')}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <Can permission="marketplace.seller.create-product"><button onClick={() => { setEditId(p.id); setShowForm(true); }} className="text-xs text-[var(--color-primary)] hover:underline">Edit</button></Can>
                  <Can permission="marketplace.seller.delete-product"><button onClick={() => { if (confirm('Delete?')) delMut.mutate(p.id); }} className="text-xs text-[var(--color-error)] hover:underline">Delete</button></Can>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-[var(--color-text-muted)]">Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of {total}</span>
          {pages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page <= 1} className="px-2 py-1.5 text-xs border rounded disabled:opacity-30">«</button>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 text-xs border rounded disabled:opacity-30">Prev</button>
              <span className="text-xs text-[var(--color-text-muted)] px-2">{page}/{pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="px-3 py-1.5 text-xs border rounded disabled:opacity-30">Next</button>
              <button onClick={() => setPage(pages)} disabled={page >= pages} className="px-2 py-1.5 text-xs border rounded disabled:opacity-30">»</button>
            </div>
          )}
        </div>
      )}
      {orgId && (
        <UpgradeRequestModal
          orgId={parseInt(orgId, 10)}
          open={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}
    </div>
  );
}

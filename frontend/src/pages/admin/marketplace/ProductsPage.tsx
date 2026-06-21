import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../../../services/api';
import { formatPrice } from '../../../utils/currency';
import AdminProductEditModal from '../../../components/marketplace/AdminProductEditModal';

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-marketplace-products', search, statusFilter, sellerId, categoryId, page, limit],
    queryFn: () => api.get('/marketplace/admin/products', { params: { search: search || undefined, status: statusFilter || undefined, sellerId: sellerId || undefined, categoryId: categoryId || undefined, page, limit } }).then((r: any) => r.data),
  });

  const { data: sellers } = useQuery({
    queryKey: ['admin-marketplace-sellers-list'],
    queryFn: () => api.get('/marketplace/admin/sellers', { params: { limit: 500 } }).then((r: any) => r.data.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['admin-marketplace-categories'],
    queryFn: () => api.get('/marketplace/categories').then((r: any) => r.data.data),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.put(`/marketplace/admin/products/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-marketplace-products'] }),
  });

  const deleteProduct = useMutation({
    mutationFn: (id: number) => api.delete(`/marketplace/admin/products/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-marketplace-products'] }),
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Products</h1>
      </div>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-4 py-2"><input value={search} onChange={(e: any) => { setSearch(e.target.value); setPage(1); }} placeholder="Search..." className="w-full px-2 py-1.5 text-xs rounded border" /></th>
              <th className="px-4 py-2"><select value={sellerId} onChange={(e: any) => { setSellerId(e.target.value); setPage(1); }} className="w-full px-2 py-1.5 text-xs rounded border"><option value="">All</option>{sellers?.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}</select></th>
              <th className="px-4 py-2"><select value={categoryId} onChange={(e: any) => { setCategoryId(e.target.value); setPage(1); }} className="w-full px-2 py-1.5 text-xs rounded border"><option value="">All</option>{categories?.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}</select></th>
              <th className="px-4 py-2"></th>
              <th className="px-4 py-2"><select value={statusFilter} onChange={(e: any) => { setStatusFilter(e.target.value); setPage(1); }} className="w-full px-2 py-1.5 text-xs rounded border"><option value="">All</option><option value="pending">Pending</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></th>
              <th className="px-4 py-2"></th>
            </tr>
            <tr className="border-b bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-2 font-medium text-[var(--color-text-muted)]">Product</th>
              <th className="text-left px-4 py-2 font-medium text-[var(--color-text-muted)]">Seller</th>
              <th className="text-left px-4 py-2 font-medium text-[var(--color-text-muted)]">Category</th>
              <th className="text-left px-4 py-2 font-medium text-[var(--color-text-muted)]">Price</th>
              <th className="text-left px-4 py-2 font-medium text-[var(--color-text-muted)]">Status</th>
              <th className="text-right px-4 py-2 font-medium text-[var(--color-text-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data?.data?.map((p: any) => (
              <tr key={p.id} className="hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3 font-medium"><Link to={`/admin/marketplace/products/${p.id}`} className="text-[var(--color-primary)] hover:underline">{p.name}</Link></td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{p.org_name || p.owner_name}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{p.category_name}</td>
                <td className="px-4 py-3">{formatPrice(Number(p.price), p.currency_code)}</td>
                <td className="px-4 py-3">
                  <select value={p.status} onChange={(e: any) => updateStatus.mutate({ id: p.id, status: e.target.value })}
                    className={`text-xs px-2 py-1 border rounded ${
                      p.status === 'pending' ? 'bg-yellow-50 border-yellow-300 text-yellow-700' :
                      p.status === 'active' ? 'bg-green-50 border-green-300 text-green-700' :
                      p.status === 'archived' ? 'bg-gray-50 border-gray-300 text-gray-500' : ''
                    }`}>
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setEditingProduct(p)} className="text-xs text-[var(--color-primary)] mr-3 hover:underline">Edit</button>
                  <button onClick={() => { if (confirm('Delete this product?')) deleteProduct.mutate(p.id); }} className="text-xs text-red-500">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">Rows:</span>
          <select value={limit} onChange={(e: any) => { setLimit(Number(e.target.value)); setPage(1); }} className="px-2 py-1 text-xs rounded border">
            {[10, 20, 50, 100].map((n: any) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {data && data.total > limit && (
          <div className="flex items-center gap-3">
            <button onClick={() => setPage((p: any) => Math.max(1, p - 1))} disabled={page <= 1} className="text-sm text-[var(--color-primary)] disabled:opacity-50">Previous</button>
            <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {Math.ceil(data.total / limit)}</span>
            <button onClick={() => setPage((p: any) => p + 1)} disabled={page >= Math.ceil(data.total / limit)} className="text-sm text-[var(--color-primary)] disabled:opacity-50">Next</button>
          </div>
        )}
        {data && <span className="text-xs text-[var(--color-text-muted)]">{data.total} total</span>}
      </div>

      {editingProduct && <AdminProductEditModal product={editingProduct} onClose={() => setEditingProduct(null)} />}
    </div>
  );
}

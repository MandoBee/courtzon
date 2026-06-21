import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Modal, Spinner, EntityImage } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

function compressImage(file: File, maxDim = 1200, quality = 0.8): Promise<Blob> {
  return new Promise((resolve: any, reject: any) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = (height / width) * maxDim; width = maxDim; }
        else { width = (width / height) * maxDim; height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((b: any) => b ? resolve(b) : reject(new Error('Compression failed')), 'image/webp', quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

interface ProductCategory {
  id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: number;
  parent_name: string | null;
}

export default function ProductCategoriesPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [parentId, setParentId] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [uploading, setUploading] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'order' | 'parent' | 'active'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [view, setView] = useState<'basic' | 'tree'>('basic');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'product-categories'],
    queryFn: () => api.get('/admin/product-categories').then((r: any) => r.data.data),
  });

  const categories: ProductCategory[] = data || [];
  const sorted = [...categories].sort((a: any, b: any) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'name') return a.name.localeCompare(b.name) * dir;
    if (sortBy === 'order') return (a.sort_order - b.sort_order) * dir;
    if (sortBy === 'parent') return (a.parent_name || '\0').localeCompare(b.parent_name || '\0') * dir;
    if (sortBy === 'active') return (a.is_active - b.is_active) * dir;
    return 0;
  });
  const total = sorted.length;
  const pagedCategories = sorted.slice((page - 1) * limit, page * limit);

  const buildTree = (): (ProductCategory & { children: ProductCategory[] })[] => {
    const map = new Map<number, ProductCategory & { children: ProductCategory[] }>();
    const roots: (ProductCategory & { children: ProductCategory[] })[] = [];
    for (const c of categories) map.set(c.id, { ...c, children: [] });
    for (const c of categories) {
      const node = map.get(c.id)!;
      if (c.parent_id && map.has(c.parent_id)) map.get(c.parent_id)!.children.push(node);
      else roots.push(node);
    }
    return roots;
  };
  const categoryTree = buildTree();

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/admin/product-categories', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'product-categories'] }); resetForm(); showToast('Created successfully!'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/admin/product-categories/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'product-categories'] }); resetForm(); showToast('Updated successfully!'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/product-categories/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'product-categories'] }); setDeleteId(null); showToast('Deleted!'); },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: number }) => api.put(`/admin/product-categories/${id}`, { isActive: isActive ? 0 : 1 }),
    onSuccess: (_data: any, variables: any) => { queryClient.invalidateQueries({ queryKey: ['admin', 'product-categories'] }); showToast(variables.isActive ? 'Deactivated!' : 'Activated!'); },
  });

  const resetForm = () => {
    setShowForm(false); setEditing(null); setName(''); setSlug('');
    setParentId(''); setDescription(''); setImageUrl(''); setSortOrder('0');
  };

  const openEdit = (c: ProductCategory) => {
    setEditing(c); setName(c.name); setSlug(c.slug);
    setParentId(c.parent_id ? String(c.parent_id) : '');
    setDescription(c.description || ''); setImageUrl(c.image_url || '');
    setSortOrder(String(c.sort_order));
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) return;
    const payload = {
      name, slug,
      parentId: parentId ? Number(parentId) : null,
      description: description || undefined,
      imageUrl: imageUrl || undefined,
      sortOrder: parseInt(sortOrder) || 0,
    };
    if (editing) { updateMutation.mutate({ id: editing.id, data: payload }); }
    else { createMutation.mutate(payload); }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  };

  const renderTreeRows = (nodes: any[], depth: number): React.ReactNode[] => {
    return nodes.flatMap((node: any) => {
      const hasChildren = node.children.length > 0;
      const isExpanded = expandedIds.has(node.id);
      const row = (
        <tr key={node.id} className="hover:bg-[var(--color-bg)]/30 border-l-2 border-transparent">
          <td className="px-4 py-3 font-medium text-[var(--color-text)]">
            <div className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
              {hasChildren ? (
                <button type="button" onClick={() => toggleExpand(node.id)}
                  className="w-4 h-4 flex items-center justify-center text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] shrink-0">
                  {isExpanded ? '▾' : '▸'}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              {node.name}
            </div>
          </td>
          <td className="px-4 py-3 text-[var(--color-text-muted)]">{node.parent_name || <span className="italic">Root</span>}</td>
          <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">{node.sort_order}</td>
          <td className="px-4 py-3 text-center">
            <button onClick={() => toggleActive.mutate({ id: node.id, isActive: node.is_active })}
              className={`px-2 py-0.5 text-xs rounded-full cursor-pointer border-0 ${node.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
              {node.is_active ? 'Active' : 'Inactive'}
            </button>
          </td>
          <td className="px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => openEdit(node)}>Edit</Button>
              <Button variant="ghost" onClick={() => setDeleteId(node.id)}
                className="text-[var(--color-error)]">Delete</Button>
            </div>
          </td>
        </tr>
      );
      const children = hasChildren && isExpanded ? renderTreeRows(node.children, depth + 1) : [];
      return [row, ...children];
    });
  };

  if (isLoading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Product Categories</h1>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>+ New Category</Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit}
          className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editing ? 'Edit Category' : 'New Category'}</h3>
          <p className="text-xs text-[var(--color-text-muted)] mb-4">
            Note: Category names should <strong>not</strong> include the sport name prefix (e.g., use "Rackets" not "Padel Rackets").
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Can permission="product-categories.edit.name">
              <div className="col-span-2">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label>
                <input value={name} onChange={(e: any) => handleNameChange(e.target.value)}
                  placeholder="e.g. Rackets" required
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </Can>
            <Can permission="product-categories.edit.parent-category">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Parent Category</label>
                <select value={parentId} onChange={(e: any) => setParentId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="">None (top-level)</option>
                  {categories.filter((c: any) => !c.parent_id).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </Can>
            <Can permission="product-categories.edit.sort-order">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Sort Order</label>
                <input type="number" value={sortOrder} onChange={(e: any) => setSortOrder(e.target.value)}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm w-24" />
              </div>
            </Can>
            <Can permission="product-categories.edit.description">
              <div className="col-span-2">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label>
                <textarea value={description} onChange={(e: any) => setDescription(e.target.value)}
                  rows={2} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
              </div>
            </Can>
            <Can permission="product-categories.edit.icon">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Image</label>
                <input ref={fileInputRef} type="file" accept="image/*"
                onChange={async (e: any) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    const blob = await compressImage(file);
                    const fd = new FormData();
                    fd.append('file', blob, 'category.webp');
                    const res = await api.post('/upload/marketplace/0/product-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                    setImageUrl(res.data.url);
                  } catch { alert('Failed to upload image'); }
                  setUploading(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="w-full text-sm" />
              {uploading && <p className="text-xs text-[var(--color-text-muted)] mt-1">Uploading...</p>}
              {(imageUrl as string) && (
                <div className="mt-2 relative inline-block">
                  <EntityImage src={imageUrl} name={name || 'Category'} className="w-16 h-16 rounded-[var(--radius-md)] text-xl" />
                  <button type="button" onClick={() => setImageUrl('')}
                    className="absolute -top-1.5 -right-1.5 bg-[var(--color-error)] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">&times;</button>
                </div>
              )}
            </div>
          </Can>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Can permission={editing ? 'product-categories.edit' : 'product-categories.create'}>
              <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
                {editing ? 'Update' : 'Create'}
              </Button>
            </Can>
            <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="flex items-center gap-1 px-4 pt-3 pb-1 border-b border-[var(--color-border)]">
          <button
            type="button"
            onClick={() => setView('basic')}
            className={`text-xs px-2.5 py-1 rounded ${view === 'basic' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
          >
            Basic View
          </button>
          <button
            type="button"
            onClick={() => setView('tree')}
            className={`text-xs px-2.5 py-1 rounded ${view === 'tree' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
          >
            Tree View
          </button>
        </div>

        {view === 'basic' ? (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)] cursor-pointer select-none" onClick={() => { if (sortBy === 'name') setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy('name'); setSortDir('asc'); } }}>
                    <span className="inline-flex items-center gap-1">Name{sortBy === 'name' ? <span className="text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span> : <span className="text-xs opacity-20">▲</span>}</span>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)] cursor-pointer select-none" onClick={() => { if (sortBy === 'parent') setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy('parent'); setSortDir('asc'); } }}>
                    <span className="inline-flex items-center gap-1">Parent{sortBy === 'parent' ? <span className="text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span> : <span className="text-xs opacity-20">▲</span>}</span>
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)] cursor-pointer select-none" onClick={() => { if (sortBy === 'order') setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy('order'); setSortDir('asc'); } }}>
                    <span className="inline-flex items-center gap-1">Order{sortBy === 'order' ? <span className="text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span> : <span className="text-xs opacity-20">▲</span>}</span>
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)] cursor-pointer select-none" onClick={() => { if (sortBy === 'active') setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy('active'); setSortDir('asc'); } }}>
                    <span className="inline-flex items-center gap-1">Active{sortBy === 'active' ? <span className="text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span> : <span className="text-xs opacity-20">▲</span>}</span>
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pagedCategories.map((c: any) => (
                  <tr key={c.id} className={`hover:bg-[var(--color-bg)]/30 ${editing?.id === c.id ? 'bg-[var(--color-primary)]/10 border-l-2 border-[var(--color-primary)]' : 'border-l-2 border-transparent'}`}>
                    <td className="px-4 py-3 font-medium text-[var(--color-text)]">{c.name}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{c.parent_name || <span className="italic">Top-level</span>}</td>
                    <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">{c.sort_order}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive.mutate({ id: c.id, isActive: c.is_active })}
                        className={`px-2 py-0.5 text-xs rounded-full cursor-pointer border-0 ${c.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                        <Button variant="ghost" onClick={() => setDeleteId(c.id)}
                          className="text-[var(--color-error)]">Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {!total && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No categories found</p>}
          </>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)] w-1/3">Name</th>
                <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Parent</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Order</th>
                <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">Active</th>
                <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {renderTreeRows(categoryTree, 0)}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {view === 'basic' && (
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">Rows:</span>
            <select value={limit} onChange={(e: any) => { setLimit(Number(e.target.value)); setPage(1); }} className="px-2 py-1 text-xs rounded border">
              {[10, 20, 50, 100].map((n: any) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          {total > limit && (
            <div className="flex items-center gap-3">
              <button onClick={() => setPage((p: any) => Math.max(1, p - 1))} disabled={page <= 1} className="text-sm text-[var(--color-primary)] disabled:opacity-50">Previous</button>
              <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {Math.ceil(total / limit)}</span>
              <button onClick={() => setPage((p: any) => p + 1)} disabled={page >= Math.ceil(total / limit)} className="text-sm text-[var(--color-primary)] disabled:opacity-50">Next</button>
            </div>
          )}
          <span className="text-xs text-[var(--color-text-muted)]">{total} total</span>
        </div>
      )}

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Category">
        <p className="text-sm text-[var(--color-text-muted)] mb-2">Are you sure? Child categories will be unlinked but not deleted.</p>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">This will set the category as inactive.</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={() => deleteMutation.mutate(deleteId!)} loading={deleteMutation.isPending}
            className="bg-[var(--color-error)] text-white">Deactivate</Button>
        </div>
      </Modal>
    </div>
  );
}

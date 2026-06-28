import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';

interface Props {
  product: any;
  onClose: () => void;
}

export default function AdminProductEditModal({ product, onClose }: Props) {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [discountedPrice, setDiscountedPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [currencyCode, setCurrencyCode] = useState('EGP');
  const [status, setStatus] = useState('');
  const [sportId, setSportId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [conditionStatus, setConditionStatus] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data: sports } = useQuery({
    queryKey: ['admin-sports-marketplace'],
    queryFn: () => api.get('/sports/marketplace').then((r: any) => r.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get('/marketplace/categories', {}).then((r: any) => r.data?.data || r.data || []),
  });

  const { data: brands } = useQuery({
    queryKey: ['admin-brands'],
    queryFn: () => api.get('/marketplace/brands').then((r: any) => r.data),
  });

  const { data: tags } = useQuery({
    queryKey: ['admin-tags'],
    queryFn: () => api.get('/marketplace/tags').then((r: any) => r.data),
  });

  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setDescription(product.description || '');
      setPrice(product.price || '');
      setDiscountedPrice(product.discounted_price || '');
      setQuantity(product.quantity ?? '1');
      setCurrencyCode(product.currency_code || 'EGP');
      setStatus(product.status || 'pending');
      setSportId(product.sport_id || '');
      setCategoryId(product.category_id || '');
      setBrandId(product.brand_id || '');
      setConditionStatus(product.condition_status || '');
      try { if (product.images) setImages(typeof product.images === 'string' ? JSON.parse(product.images) : product.images); } catch {}
    }
  }, [product]);

  useEffect(() => {
    if (product) {
      api.get(`/marketplace/products/${product.id}`).then((r: any) => {
        const p = r.data;
        if (p.tags) setSelectedTagIds(p.tags.map((t: any) => t.id));
      }).catch(() => {});
    }
  }, [product]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => api.put(`/marketplace/admin/products/${product.id}`, data).then((r: any) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-marketplace-products'] });
      onClose();
    },
  });

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-50 border-yellow-300 text-yellow-700',
    active: 'bg-green-50 border-green-300 text-green-700',
    draft: 'bg-gray-50 border-gray-300 text-gray-500',
    archived: 'bg-gray-50 border-gray-300 text-gray-500',
    sold: 'bg-red-50 border-red-300 text-red-700',
    out_of_stock: 'bg-orange-50 border-orange-300 text-orange-700',
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || images.length >= 5) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/upload/marketplace/0/product-image', fd);
      setImages((prev) => [...prev, r.data.url]);
    } catch { setUploading(false); }
    finally { setUploading(false); }
  };

  const removeImage = (index: number) => setImages((prev) => prev.filter((_, i) => i !== index));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      name: name || undefined,
      description: description || undefined,
      price: price ? Number(price) : undefined,
      discountedPrice: discountedPrice ? Number(discountedPrice) : undefined,
      quantity: quantity ? Number(quantity) : undefined,
      currencyCode: currencyCode || undefined,
      status,
      sportId: sportId ? Number(sportId) : null,
      categoryId: categoryId ? Number(categoryId) : undefined,
      brandId: brandId ? Number(brandId) : null,
      conditionStatus: conditionStatus || null,
      tagIds: selectedTagIds.length ? selectedTagIds : undefined,
      images: images.length > 0 ? images : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--color-text)]">Edit Product #{product.id}</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className={`w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border font-medium ${statusColors[status] || ''}`}>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
                <option value="sold">Sold</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none resize-none" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Price</label>
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} min="0" step="0.01"
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Discounted</label>
              <input type="number" value={discountedPrice} onChange={(e) => setDiscountedPrice(e.target.value)} min="0" step="0.01"
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Qty</label>
              <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} min="0"
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Sport</label>
              <select value={sportId} onChange={(e) => { setSportId(e.target.value); setCategoryId(''); }}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]">
                <option value="">None</option>
                {(sports || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]">
                <option value="">None</option>
                {(Array.isArray(categories) ? categories : []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Brand</label>
              <select value={brandId} onChange={(e) => setBrandId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]">
                <option value="">None</option>
                {(brands || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Condition</label>
            <select value={conditionStatus} onChange={(e) => setConditionStatus(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]">
              <option value="">Not specified</option>
              {['new','like_new','good','fair','used'].map((c) => <option key={c} value={c}>{c.replace('_',' ')}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Tags</label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {(tags || []).map((t: any) => (
                <button key={t.id} type="button"
                  onClick={() => setSelectedTagIds((prev) => prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id])}
                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                    selectedTagIds.includes(t.id) ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]'
                  }`}>{t.name}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">Images ({images.length}/5)</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {images.map((url, i) => (
                <div key={i} className="relative group">
                  <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-[var(--color-border)]" />
                  <button type="button" onClick={() => removeImage(i)} className="absolute -top-1.5 -right-1.5 bg-[var(--color-error)] text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
                </div>
              ))}
            </div>
            {images.length < 5 && (
              <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] cursor-pointer transition-colors text-[var(--color-text-muted)]">
                {uploading ? 'Uploading...' : '+ Add Image'}
                <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
              </label>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-bg)] transition-all text-[var(--color-text)]">Cancel</button>
            <button type="submit" disabled={saveMutation.isPending}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[var(--gradient-primary)] rounded-xl disabled:opacity-40 hover:opacity-90 transition-all">
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

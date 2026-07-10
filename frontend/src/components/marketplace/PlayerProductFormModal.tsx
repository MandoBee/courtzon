import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../ui/Toast';

interface PlayerProduct {
  id: number;
  name: string;
  description: string | null;
  price: number;
  condition_status: string | null;
  images: string | null;
  sport_id?: number;
  category_id?: number;
  brand_id?: number;
  tag_ids?: string | null;
}

interface Props {
  product: PlayerProduct | null;
  onClose: () => void;
  onSaved: () => void;
}

const CONDITIONS = [
  { value: 'new', label: 'New' },
  { value: 'like_new', label: 'Like New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'used', label: 'Used' },
];

export default function PlayerProductFormModal({ product, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const isEdit = !!product;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [conditionStatus, setConditionStatus] = useState('');
  const [sportId, setSportId] = useState('');
  const [parentCategoryId, setParentCategoryId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data: sports } = useQuery({
    queryKey: ['mp-sports-marketplace'],
    queryFn: () => api.get('/sports/marketplace').then((r) => r.data),
  });

  const { data: parentCategories = [] } = useQuery({
    queryKey: ['mp-categories-root'],
    queryFn: () => api.get('/marketplace/categories', { params: { parentId: 'null' } }).then((r) => r.data?.data || r.data || []),
  });

  const { data: childCategories = [] } = useQuery({
    queryKey: ['mp-categories-children', parentCategoryId],
    queryFn: () => parentCategoryId
      ? api.get('/marketplace/categories', { params: { parentId: parentCategoryId } }).then((r) => r.data?.data || r.data || [])
      : Promise.resolve([]),
    enabled: !!parentCategoryId,
  });

  const { data: brands } = useQuery({
    queryKey: ['mp-brands'],
    queryFn: () => api.get('/marketplace/brands').then((r) => r.data),
  });

  const { data: tags } = useQuery({
    queryKey: ['mp-tags'],
    queryFn: () => api.get('/marketplace/tags').then((r) => r.data),
  });

  useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description || '');
      setPrice(String(product.price));
      setConditionStatus(product.condition_status || '');
      setSportId(product.sport_id ? String(product.sport_id) : '');
      setBrandId(product.brand_id ? String(product.brand_id) : '');
      if (product.tag_ids) { setSelectedTagIds(String(product.tag_ids).split(',').map(Number).filter(Boolean)); }
      try { if (product.images) setImages(JSON.parse(product.images)); } catch {}
      if (product.category_id) {
        api.get(`/marketplace/categories/${product.category_id}`).then((r) => {
          const cat = r.data;
          if (cat?.parent_id) {
            setParentCategoryId(String(cat.parent_id));
            setCategoryId(String(product.category_id));
          } else {
            setParentCategoryId(String(product.category_id));
            setCategoryId(String(product.category_id));
          }
        }).catch(() => {});
      }
    }
  }, [product]);

  const mutation = useMutation({
    mutationFn: (data: any) => {
      if (isEdit) {
        return api.put(`/marketplace/player/products/${product!.id}`, data).then((r) => r.data);
      }
      return api.post('/marketplace/player/products', data).then((r) => r.data);
    },
    onSuccess: () => {
      showToast(isEdit ? 'Product updated!' : 'Product listed!');
      onSaved();
    },
    onError: (err) => {
      showToast('Failed: ' + ((err as any)?.response?.data?.message || (err as any).message), 'error');
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || images.length >= 5) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/upload/marketplace/0/product-image', fd);
      setImages((prev) => [...prev, r.data.url]);
    } catch {
      showToast('Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !price) return;
    mutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      price: Number(price),
      conditionStatus: conditionStatus || undefined,
      sportId: sportId ? Number(sportId) : undefined,
      categoryId: categoryId ? Number(categoryId) : parentCategoryId ? Number(parentCategoryId) : undefined,
      brandId: brandId ? Number(brandId) : undefined,
      tagIds: selectedTagIds.length ? selectedTagIds : undefined,
      images: images.length > 0 ? images : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--color-text)]">{isEdit ? 'Edit Product' : 'Add Product'}</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Product Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tennis Racket Pro"
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your item..."
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Sport</label>
              <select
                value={sportId}
                onChange={(e) => { setSportId(e.target.value); setParentCategoryId(''); setCategoryId(''); }}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none"
              >
                <option value="">Select Sport</option>
                {(sports || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
                Category Group <span className="text-xs text-[var(--color-text-muted)] font-normal">(step 1)</span>
              </label>
              <select
                value={parentCategoryId}
                onChange={(e) => { setParentCategoryId(e.target.value); setCategoryId(''); }}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none"
              >
                <option value="">Select group...</option>
                {(Array.isArray(parentCategories) ? parentCategories : []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          {parentCategoryId && childCategories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">
                Category <span className="text-xs text-[var(--color-text-muted)] font-normal">(step 2)</span>
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none"
              >
                <option value="">Select category...</option>
                {(Array.isArray(childCategories) ? childCategories : []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {parentCategoryId && childCategories.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)] px-2 py-1 border border-dashed border-[var(--color-border)] rounded-[var(--radius-md)]">
              Selected: {((Array.isArray(parentCategories) ? parentCategories : []) as any[]).find((c: any) => String(c.id) === parentCategoryId)?.name || 'Category'}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Brand</label>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none"
              >
                <option value="">Select Brand</option>
                {(brands || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Condition</label>
              <select
                value={conditionStatus}
                onChange={(e) => setConditionStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none"
              >
                <option value="">Not specified</option>
                {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Price (EGP) *</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:ring-2 focus:ring-[var(--color-primary)]/30 outline-none"
                required
              />
            </div>
            <div></div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Tags</label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {(tags || []).map((t: any) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTagIds((prev) => prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id])}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    selectedTagIds.includes(t.id)
                      ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Images ({images.length}/5)</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {images.map((url, i) => (
                <div key={i} className="relative group">
                  <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-[var(--color-border)]" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 bg-[var(--color-error)] text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    &times;
                  </button>
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
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-medium border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-bg)] transition-all text-[var(--color-text)]">
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !name.trim() || !price}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[var(--gradient-primary)] rounded-xl disabled:opacity-40 hover:opacity-90 transition-all"
            >
              {mutation.isPending ? 'Saving...' : isEdit ? 'Update' : 'List Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

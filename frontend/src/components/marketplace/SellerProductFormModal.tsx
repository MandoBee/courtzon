import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { EntityImage } from '../ui';
import { Can } from '../../permissions/Can';

interface Props {
  open: boolean;
  onClose: () => void;
  editId: number | null;
  sports: any[];
  categories: any[];
  brands: any[];
  tags: any[];
  orgId?: number | null;
}

function compressImage(file: File, maxDim = 1200, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
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
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Compression failed')), 'image/webp', quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function SellerProductFormModal({ open, onClose, editId, sports, categories, brands, tags, orgId }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ name: '', description: '', sportId: '', categoryId: '', brandId: '', price: '', discountedPrice: '', quantity: '1', currencyCode: 'EGP', gender: 'unisex', condition: '', branchId: '' });
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  const [variantGroups, setVariantGroups] = useState<{ type: string; items: { tempId: string; variantName: string; priceAdjustment: string; quantity: string; sku: string; variantColor: string }[] }[]>([]);

  const addVariantGroup = (type: string) => {
    setVariantGroups((prev) => [...prev, { type, items: [] }]);
  };

  const addVariantItem = (groupIdx: number) => {
    setVariantGroups((prev) => {
      const copy = [...prev];
      copy[groupIdx] = { ...copy[groupIdx], items: [...copy[groupIdx].items, { tempId: Math.random().toString(36).slice(2), variantName: '', priceAdjustment: '0', quantity: '1', sku: '', variantColor: '#000000' }] };
      return copy;
    });
  };

  const updateVariantItem = (groupIdx: number, itemIdx: number, field: string, value: string) => {
    setVariantGroups((prev) => {
      const copy = [...prev];
      copy[groupIdx] = { ...copy[groupIdx], items: copy[groupIdx].items.map((item, i) => i === itemIdx ? { ...item, [field]: value } : item) };
      return copy;
    });
  };

  const removeVariantItem = (groupIdx: number, itemIdx: number) => {
    setVariantGroups((prev) => {
      const copy = [...prev];
      copy[groupIdx] = { ...copy[groupIdx], items: copy[groupIdx].items.filter((_, i) => i !== itemIdx) };
      return copy;
    });
  };

  const removeVariantGroup = (groupIdx: number) => {
    setVariantGroups((prev) => prev.filter((_, i) => i !== groupIdx));
  };

  const { data: branches } = useQuery({
    queryKey: ['org-branches', orgId],
    queryFn: () => api.get(`/organisations/${orgId}/branches`).then((r) => r.data?.data || []),
    enabled: !!orgId,
  });

  const { data: productDetail } = useQuery({
    queryKey: ['product-detail', editId],
    queryFn: () => api.get(`/marketplace/products/${editId}`).then((r) => r.data),
    enabled: !!editId && open,
  });

  useEffect(() => {
    if (!productDetail) return;
    const detail = productDetail.data || productDetail;
    setForm({
      name: detail.name || '', description: detail.description || '',
      sportId: detail.sport_id ? String(detail.sport_id) : '',
      categoryId: detail.category_id ? String(detail.category_id) : '',
      brandId: detail.brand_id ? String(detail.brand_id) : '',
      price: String(detail.price || ''),
      discountedPrice: detail.discounted_price ? String(detail.discounted_price) : '',
      quantity: String(detail.quantity || '1'),
      currencyCode: detail.currency_code || 'EGP',
      gender: detail.gender || 'unisex',
      condition: detail.condition_status || detail.condition || '',
      branchId: detail.branch_id ? String(detail.branch_id) : '',
    });
    setSelectedTagIds((detail.tags || []).map((t: any) => t.id));
    try { setImageUrls(JSON.parse(detail.images || '[]')); } catch { setImageUrls([]); }
    if (detail.variants?.length) {
      const groups: Record<string, any[]> = {};
      for (const v of detail.variants) {
        const gt = v.variant_type || 'other';
        if (!groups[gt]) groups[gt] = [];
        groups[gt].push({
          id: v.id,
          tempId: Math.random().toString(36).slice(2),
          variantName: v.variant_name || '',
          priceAdjustment: String(v.price_adjustment || '0'),
          quantity: String(v.quantity || '1'),
          sku: v.sku || '',
          variantColor: v.variant_color || '#000000',
        });
      }
      setVariantGroups(Object.entries(groups).map(([type, items]) => ({ type, items })));
    } else {
      setVariantGroups([]);
    }
  }, [productDetail]);

  const resetForm = () => {
    setForm({ name: '', description: '', sportId: '', categoryId: '', brandId: '', price: '', discountedPrice: '', quantity: '1', currencyCode: 'EGP', gender: 'unisex', condition: '', branchId: '' });
    setSelectedTagIds([]);
    setImageUrls([]);
    setVariantGroups([]);
  };

  const uploadImage = useMutation({
    mutationFn: async (file: Blob) => {
      const fd = new FormData();
      fd.append('file', file, 'product.webp');
      const res = await api.post('/upload/marketplace/0/product-image', fd);
      return res.data.url as string;
    },
  });

  const createProduct = useMutation({
    mutationFn: () => {
      const variantsPayload = variantGroups.flatMap((g) =>
        g.items.map((item) => ({
          variantName: item.variantName,
          variantType: g.type,
          priceAdjustment: Number(item.priceAdjustment) || 0,
          quantity: Number(item.quantity) || 0,
          sku: item.sku || undefined,
          variantColor: g.type === 'color' ? item.variantColor : undefined,
        })).filter((v) => v.variantName)
      );
      return api.post('/marketplace/products', {
        categoryId: Number(form.categoryId), sportId: form.sportId ? Number(form.sportId) : undefined,
        name: form.name, description: form.description,
        price: Number(form.price), discountedPrice: form.discountedPrice ? Number(form.discountedPrice) : undefined,
        quantity: Number(form.quantity), currencyCode: form.currencyCode,
        images: imageUrls.filter(Boolean),
        brandId: form.brandId ? Number(form.brandId) : undefined,
        gender: form.gender,
        condition: form.condition || undefined,
        tagIds: selectedTagIds.length ? selectedTagIds : undefined,
        branchId: form.branchId ? Number(form.branchId) : undefined,
        variants: variantsPayload.length ? variantsPayload : [],
      }).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mp-seller-products'] });
      queryClient.invalidateQueries({ queryKey: ['mp-seller-stats'] });
      resetForm();
      onClose();
      showToast('Product uploaded and pending admin approval');
    },
    onError: (err) => { showToast('Failed to create product: ' + (err as any).message, 'error'); },
  });

  const updateProduct = useMutation({
    mutationFn: () => {
      const variantsPayload = variantGroups.flatMap((g) =>
        g.items.map((item) => ({
          id: (item as any).id || undefined,
          variantName: item.variantName,
          variantType: g.type,
          priceAdjustment: Number(item.priceAdjustment) || 0,
          quantity: Number(item.quantity) || 0,
          sku: item.sku || undefined,
          variantColor: g.type === 'color' ? item.variantColor : undefined,
        })).filter((v) => v.variantName)
      );
      return api.put(`/marketplace/products/${editId}`, {
        categoryId: form.categoryId ? Number(form.categoryId) : undefined, sportId: form.sportId ? Number(form.sportId) : undefined,
        name: form.name, description: form.description,
        price: Number(form.price), discountedPrice: form.discountedPrice ? Number(form.discountedPrice) : undefined,
        quantity: Number(form.quantity), currencyCode: form.currencyCode,
        images: imageUrls.filter(Boolean),
        brandId: form.brandId ? Number(form.brandId) : undefined,
        gender: form.gender,
        condition: form.condition || undefined,
        tagIds: selectedTagIds.length ? selectedTagIds : undefined,
        branchId: form.branchId ? Number(form.branchId) : undefined,
        variants: variantsPayload.length ? variantsPayload : [],
      }).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mp-seller-products'] });
      queryClient.invalidateQueries({ queryKey: ['mp-seller-stats'] });
      resetForm();
      onClose();
      showToast('Product updated and pending admin re-approval');
    },
    onError: (err) => { showToast('Failed to update product: ' + (err as any).message, 'error'); },
  });

  return (
    <Modal open={open} onClose={onClose} title={editId ? 'Edit Product' : 'New Product'} size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label><input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>
          <div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Price *</label><input type="number" value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>
          <div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Discount Price</label><input type="number" value={form.discountedPrice} onChange={(e) => setForm({...form, discountedPrice: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>
          <div className="md:col-span-4"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label><textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} rows={3} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>

          <div className="md:col-span-1"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Sport</label><select value={form.sportId} onChange={(e) => { setForm({...form, sportId: e.target.value, categoryId: ''}); }} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"><option value="">Select...</option>{(Array.isArray(sports) ? sports : []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="md:col-span-2"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Category *</label>
            <select value={form.categoryId} onChange={(e) => setForm({...form, categoryId: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
              <option value="">Select...</option>
              {(Array.isArray(categories) ? categories : []).filter((c: any) => c.parent_id === null).map((parent: any) => (
                <optgroup key={parent.id} label={parent.name} className="text-[var(--color-text-muted)] italic">
                  {categories.filter((c: any) => c.parent_id === parent.id).map((child: any) => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="md:col-span-1"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Brand</label><select value={form.brandId} onChange={(e) => setForm({...form, brandId: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"><option value="">Select...</option>{(Array.isArray(brands) ? brands : []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>

          <Can permission="marketplace.seller.branch-select">
            <div className="md:col-span-1"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Branch</label><select value={form.branchId} onChange={(e) => setForm({...form, branchId: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"><option value="">All Branches</option>{(Array.isArray(branches) ? branches : []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          </Can>

          <div className="md:col-span-1"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Gender</label><select value={form.gender} onChange={(e) => setForm({...form, gender: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"><option value="male">Male</option><option value="female">Female</option><option value="unisex">Unisex</option></select></div>
          <div className="md:col-span-1"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Quantity</label><input type="number" value={form.quantity} onChange={(e) => setForm({...form, quantity: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>
          <div className="md:col-span-2"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Condition</label><select value={form.condition} onChange={(e) => setForm({...form, condition: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"><option value="">Select...</option><option value="new">New</option><option value="like_new">Like New</option><option value="good">Good</option><option value="fair">Fair</option><option value="used">Used</option></select></div>

          <div className="md:col-span-4">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Tags</label>
            <div className="flex flex-wrap gap-2">
              {(Array.isArray(tags) ? tags : []).map((t: any) => (
                <button key={t.id} type="button" onClick={() => setSelectedTagIds((prev) => prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id])}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${selectedTagIds.includes(t.id) ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]'}`}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Images</label>
            <input ref={fileInputRef} type="file" accept="image/*" multiple
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;
                const remaining = 5 - imageUrls.length;
                if (files.length > remaining) { alert(`You can only add ${remaining} more image(s).`); return; }
                setUploadingImages(true);
                for (const f of files) {
                  try {
                    const blob = await compressImage(f);
                    const url = await uploadImage.mutateAsync(blob);
                    setImageUrls((prev) => [...prev, url]);
                  } catch { alert(`Failed to upload ${f.name}`); }
                }
                setUploadingImages(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              disabled={imageUrls.length >= 5 || uploadingImages}
              className="hidden" />
            <div className="flex flex-wrap gap-2">
              {imageUrls.map((url, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border">
                  <EntityImage src={url} name={form.name || 'Product'} className="w-full h-full rounded-lg text-sm" />
                  <button onClick={() => setImageUrls((p) => p.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 bg-[var(--color-error)] text-white rounded-full text-xs flex items-center justify-center">x</button>
                </div>
              ))}
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingImages || imageUrls.length >= 5}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-[var(--color-border)] flex items-center justify-center text-2xl text-[var(--color-text-muted)] hover:border-[var(--color-primary)]">
                {uploadingImages ? '...' : '+'}
              </button>
            </div>
            {uploadingImages && <p className="text-xs text-[var(--color-text-muted)]">Uploading images...</p>}
          </div>
          <div className="md:col-span-4 border-t border-[var(--color-border)] pt-4">
            <label className="block text-xs font-medium text-[var(--color-text)] mb-2">Variants (optional)</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {['size', 'color', 'other'].map((t) => (
                <button key={t} type="button" onClick={() => addVariantGroup(t)}
                  className="px-3 py-1 text-xs border rounded-[var(--radius-md)] capitalize hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
                  + Add {t}
                </button>
              ))}
            </div>
            {variantGroups.map((group, gi) => (
              <div key={`${group.type}-${gi}`} className="mb-4 p-3 bg-[var(--color-bg)] rounded-[var(--radius-md)] border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium capitalize text-[var(--color-text)]">{group.type}</span>
                  <button type="button" onClick={() => removeVariantGroup(gi)} className="text-xs text-[var(--color-error)]">Remove Group</button>
                </div>
                {group.items.length === 0 && <p className="text-xs text-[var(--color-text-muted)] mb-2">No items yet</p>}
                {group.items.map((item, ii) => (
                  <div key={item.tempId} className="flex items-center gap-2 mb-2 flex-wrap">
                    <input value={item.variantName} onChange={(e) => updateVariantItem(gi, ii, 'variantName', e.target.value)}
                      placeholder="Name (e.g. M, Red)" className="w-28 px-2 py-1 text-xs border rounded-[var(--radius-md)] bg-[var(--color-bg)]" />
                    {group.type === 'color' && (
                      <input type="color" value={item.variantColor} onChange={(e) => updateVariantItem(gi, ii, 'variantColor', e.target.value)}
                        className="w-8 h-8 p-0 border rounded cursor-pointer" />
                    )}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[var(--color-text-muted)]">+</span>
                      <input type="number" value={item.priceAdjustment} onChange={(e) => updateVariantItem(gi, ii, 'priceAdjustment', e.target.value)}
                        placeholder="Price adj." className="w-20 px-2 py-1 text-xs border rounded-[var(--radius-md)] bg-[var(--color-bg)]" />
                    </div>
                    <input type="number" value={item.quantity} onChange={(e) => updateVariantItem(gi, ii, 'quantity', e.target.value)}
                      placeholder="Qty" className="w-16 px-2 py-1 text-xs border rounded-[var(--radius-md)] bg-[var(--color-bg)]" />
                    <input value={item.sku} onChange={(e) => updateVariantItem(gi, ii, 'sku', e.target.value)}
                      placeholder="SKU" className="w-20 px-2 py-1 text-xs border rounded-[var(--radius-md)] bg-[var(--color-bg)]" />
                    <button type="button" onClick={() => removeVariantItem(gi, ii)} className="text-xs text-[var(--color-error)]">&times;</button>
                  </div>
                ))}
                <button type="button" onClick={() => addVariantItem(gi)} className="text-xs text-[var(--color-primary)] mt-1">+ Add item</button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button onClick={() => editId ? updateProduct.mutate() : createProduct.mutate()}
            disabled={createProduct.isPending || updateProduct.isPending || uploadingImages}
            className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] disabled:opacity-50">
            {editId
              ? (updateProduct.isPending ? 'Updating...' : 'Update Product')
              : (createProduct.isPending ? 'Creating...' : 'Create Product')}
          </button>
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

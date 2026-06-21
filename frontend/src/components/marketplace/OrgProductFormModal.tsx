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
  orgId: string;
  editId: number | null;
  sports: any[];
  categories: any[];
  brands: any[];
  tags: any[];
  onUpgrade?: () => void;
}

export default function OrgProductFormModal({ open, onClose, orgId: _orgId, editId, sports, categories, brands, tags, onUpgrade }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [f, setF] = useState({ name: '', desc: '', sportId: '', catId: '', brandId: '', price: '', discPrice: '', qty: '1', curr: 'EGP', condition: '', gender: 'unisex', branchId: '' });
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [imgs, setImgs] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

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
    queryKey: ['org-branches', _orgId],
    queryFn: () => api.get(`/organisations/${_orgId}/branches`).then((r) => r.data?.data || []),
    enabled: !!_orgId,
  });

  const { data: productDetail } = useQuery({
    queryKey: ['product-detail', editId],
    queryFn: () => api.get(`/marketplace/products/${editId}`).then((r) => r.data),
    enabled: !!editId && open,
  });

  useEffect(() => {
    if (!productDetail) return;
    const p = productDetail.data || productDetail;
    setF({
      name: p.name || '', desc: p.description || '',
      sportId: p.sport_id ? String(p.sport_id) : '',
      catId: p.category_id ? String(p.category_id) : '',
      brandId: p.brand_id ? String(p.brand_id) : '',
      price: String(p.price || ''),
      discPrice: p.discounted_price ? String(p.discounted_price) : '',
      qty: String(p.quantity || '1'),
      curr: p.currency_code || 'EGP',
      condition: p.condition_status || p.condition || '',
      gender: p.gender || 'unisex',
      branchId: p.branch_id ? String(p.branch_id) : '',
    });
    const parseTagIds = (p: any): number[] => {
      if (Array.isArray(p.tag_ids)) return p.tag_ids.map(Number);
      if (typeof p.tag_ids === 'string') return p.tag_ids.split(',').map(Number).filter(Boolean);
      if (Array.isArray(p.tags)) return p.tags.map((t: any) => t.id || t).filter(Boolean);
      return [];
    };
    setSelectedTags(parseTagIds(p));
    const parseImages = (raw: any): string[] => {
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
      return [];
    };
    setImgs(parseImages(p.images));
    if (Array.isArray(p.variants) && p.variants.length) {
      const groups: Record<string, { type: string; items: any[] }> = {};
      p.variants.forEach((v: any) => {
        const type = v.variant_type || v.type || 'other';
        if (!groups[type]) groups[type] = { type, items: [] };
        groups[type].items.push({
          tempId: Math.random().toString(36).slice(2),
          variantName: v.variant_name || v.name || '',
          priceAdjustment: String(v.price_adjustment ?? v.priceAdjustment ?? 0),
          quantity: String(v.quantity ?? 1),
          sku: v.sku || '',
          variantColor: v.variant_color || v.color || '#000000',
          id: v.id,
        });
      });
      setVariantGroups(Object.values(groups));
    }
  }, [productDetail]);

  const reset = () => {
    setF({ name: '', desc: '', sportId: '', catId: '', brandId: '', price: '', discPrice: '', qty: '1', curr: 'EGP', condition: '', gender: 'unisex', branchId: '' });
    setSelectedTags([]); setImgs([]); setVariantGroups([]);
  };

  const mkPayload = () => {
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
    return {
      name: f.name, description: f.desc,
      categoryId: Number(f.catId), sportId: f.sportId ? Number(f.sportId) : undefined,
      price: Number(f.price), discountedPrice: f.discPrice ? Number(f.discPrice) : undefined,
      quantity: Number(f.qty), currencyCode: f.curr,
      images: imgs.filter(Boolean),
      brandId: f.brandId ? Number(f.brandId) : undefined,
      branchId: f.branchId ? Number(f.branchId) : undefined,
      condition: f.condition || undefined,
      gender: f.gender,
      tagIds: selectedTags.length ? selectedTags : undefined,
      variants: variantsPayload.length ? variantsPayload : [],
    };
  };

  const createMut = useMutation({
    mutationFn: () => api.post('/marketplace/products', mkPayload()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['org-products'] }); reset(); onClose(); showToast('Product uploaded and pending admin approval'); },
    onError: (e: any) => {
      if (e?.response?.status === 409) {
        showToast(e?.response?.data?.message || 'Limit reached', 'warning');
        onUpgrade?.();
      } else {
        showToast(e?.response?.data?.message || 'Failed to create', 'error');
      }
    },
  });

  const updateMut = useMutation({
    mutationFn: () => api.put(`/marketplace/products/${editId}`, mkPayload()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['org-products'] }); reset(); onClose(); showToast('Product updated and pending admin re-approval'); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to update', 'error'),
  });

  const compressAndUpload = async (file: File) => {
    const img = new Image();
    return new Promise<string>((resolve, reject) => {
      img.onload = async () => {
        let w = img.width, h = img.height;
        if (w > 1200 || h > 1200) { if (w > h) { h = (h / w) * 1200; w = 1200; } else { w = (w / h) * 1200; h = 1200; } }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) return reject(new Error('Canvas error'));
        ctx.drawImage(img, 0, 0, w, h);
        c.toBlob(async (b) => {
          if (!b) return reject(new Error('Blob error'));
          const fd = new FormData(); fd.append('file', b, 'prod.webp');
          const res = await api.post('/upload/marketplace/0/product-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          resolve(res.data.url as string);
        }, 'image/webp', 0.8);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const handleImg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try { const url = await compressAndUpload(file); setImgs((p) => [...p, url]); } catch { showToast('Upload failed', 'error'); }
    }
    setUploading(false); if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Modal open={open} onClose={onClose} title={editId ? 'Edit Product' : 'New Product'} size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Name *</label><input value={f.name} onChange={(e) => setF({...f, name: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>
          <div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Price *</label><input type="number" value={f.price} onChange={(e) => setF({...f, price: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>
          <div><label className="block text-xs text-[var(--color-text-muted)] mb-1">Discount Price</label><input type="number" value={f.discPrice} onChange={(e) => setF({...f, discPrice: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>
          <div className="md:col-span-4"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Description</label><textarea value={f.desc} onChange={(e) => setF({...f, desc: e.target.value})} rows={3} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>

          <div className="md:col-span-1"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Sport</label><select value={f.sportId} onChange={(e) => setF({...f, sportId: e.target.value, catId: ''})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"><option value="">Select...</option>{(Array.isArray(sports) ? sports : []).map((s: any) => <option key={s.id} value={s.id}>{s.icon && !s.icon.startsWith('/') ? s.icon + ' ' : ''}{s.name}</option>)}</select></div>
          <div className="md:col-span-2"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Category *</label>
            <select value={f.catId} onChange={(e) => setF({...f, catId: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
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
          <div className="md:col-span-1"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Brand</label><select value={f.brandId} onChange={(e) => setF({...f, brandId: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"><option value="">Select...</option>{(Array.isArray(brands) ? brands : []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>

          <Can permission="marketplace.seller.branch-select">
            <div className="md:col-span-1"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Branch</label><select value={f.branchId} onChange={(e) => setF({...f, branchId: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"><option value="">All Branches</option>{(Array.isArray(branches) ? branches : []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          </Can>

          <div className="md:col-span-1"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Gender</label><select value={f.gender} onChange={(e) => setF({...f, gender: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"><option value="male">Male</option><option value="female">Female</option><option value="unisex">Unisex</option></select></div>
          <div className="md:col-span-1"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Quantity</label><input type="number" value={f.qty} onChange={(e) => setF({...f, qty: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" /></div>
          <div className="md:col-span-2"><label className="block text-xs text-[var(--color-text-muted)] mb-1">Condition</label><select value={f.condition} onChange={(e) => setF({...f, condition: e.target.value})} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"><option value="">Select...</option><option value="new">New</option><option value="like_new">Like New</option><option value="good">Good</option><option value="fair">Fair</option><option value="used">Used</option></select></div>

          <div className="md:col-span-4">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Tags</label>
            <div className="flex flex-wrap gap-2">
              {(Array.isArray(tags) ? tags : []).map((t: any) => (
                <button key={t.id} type="button" onClick={() => setSelectedTags((prev) => prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id])}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${selectedTags.includes(t.id) ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]'}`}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Images</label>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImg} className="hidden" />
            <div className="flex flex-wrap gap-2">
              {imgs.map((url, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border">
                  <EntityImage src={url} name={f.name || 'Product'} className="w-full h-full rounded-lg text-sm" />
                  <button onClick={() => setImgs((p) => p.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 bg-[var(--color-error)] text-white rounded-full text-xs flex items-center justify-center">x</button>
                </div>
              ))}
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || imgs.length >= 5}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-[var(--color-border)] flex items-center justify-center text-2xl text-[var(--color-text-muted)] hover:border-[var(--color-primary)]">
                {uploading ? '...' : '+'}
              </button>
            </div>
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
          <button onClick={() => editId ? updateMut.mutate() : createMut.mutate()} disabled={createMut.isPending || updateMut.isPending} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">{editId ? (updateMut.isPending ? 'Saving...' : 'Update') : (createMut.isPending ? 'Creating...' : 'Create')}</button>
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

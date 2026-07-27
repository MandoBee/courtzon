import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Pagination } from '../../../components/ui/Pagination';

interface LineItem {
  variant_id: number;
  variant_name: string;
  sku: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

interface PurchaseOrder {
  id: number;
  supplier_name: string;
  warehouse_name: string;
  status: string;
  total_cost: number;
  notes: string;
  created_at: string;
  items: LineItem[];
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 border-gray-300',
  submitted: 'bg-blue-100 text-blue-700 border-blue-300',
  approved: 'bg-green-100 text-green-700 border-green-300',
  received: 'bg-teal-100 text-teal-700 border-teal-300',
  cancelled: 'bg-red-100 text-red-600 border-red-300',
};

export default function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [variantSearch, setVariantSearch] = useState('');
  const [variantResults, setVariantResults] = useState<any[]>([]);
  const [addQty, setAddQty] = useState('1');
  const [addCost, setAddCost] = useState('0');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'purchase-orders', page, pageSize, search],
    queryFn: () => api.get('/admin/inventory/purchase-orders', { params: { page, limit: pageSize, search: search || undefined } }).then((r: any) => r.data),
  });

  const { data: suppliers } = useQuery({
    queryKey: ['admin', 'suppliers', 'list'],
    queryFn: () => api.get('/admin/inventory/suppliers', { params: { limit: 500 } }).then((r: any) => r.data.data),
  });

  const { data: warehouses } = useQuery({
    queryKey: ['admin', 'warehouses', 'list'],
    queryFn: () => api.get('/admin/inventory/warehouses', { params: { limit: 500 } }).then((r: any) => r.data.data),
  });

  const searchVariants = async (q: string) => {
    setVariantSearch(q);
    if (q.length < 2) { setVariantResults([]); return; }
    try {
      const res = await api.get('/admin/inventory/variants/search', { params: { q } });
      setVariantResults(res.data.data || []);
    } catch { setVariantResults([]); }
  };

  const addLineItem = (v: any) => {
    if (lineItems.find((li) => li.variant_id === v.id)) return;
    setLineItems([...lineItems, { variant_id: v.id, variant_name: v.name, sku: v.sku || '', quantity: parseInt(addQty) || 1, unit_cost: parseFloat(addCost) || 0, total_cost: (parseInt(addQty) || 1) * (parseFloat(addCost) || 0) }]);
    setVariantSearch(''); setVariantResults([]); setAddQty('1'); setAddCost('0');
  };

  const removeLineItem = (variantId: number) => {
    setLineItems(lineItems.filter((li) => li.variant_id !== variantId));
  };

  const updateLineItem = (variantId: number, field: 'quantity' | 'unit_cost', value: string) => {
    setLineItems(lineItems.map((li) => {
      if (li.variant_id !== variantId) return li;
      const qty = field === 'quantity' ? parseInt(value) || 0 : li.quantity;
      const cost = field === 'unit_cost' ? parseFloat(value) || 0 : li.unit_cost;
      return { ...li, [field]: field === 'quantity' ? qty : cost, total_cost: qty * cost };
    }));
  };

  const totalCost = lineItems.reduce((sum, li) => sum + li.total_cost, 0);

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/admin/inventory/purchase-orders', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] }); setShowCreate(false); resetCreateForm(); showToast(t('inventory.purchase_orders.created')); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.put(`/admin/inventory/purchase-orders/${id}/status`, { status }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] }); showToast(t('inventory.purchase_orders.status_updated')); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const resetCreateForm = () => {
    setSupplierId(''); setWarehouseId(''); setNotes(''); setLineItems([]); setVariantSearch(''); setVariantResults([]);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !warehouseId || lineItems.length === 0) return;
    createMutation.mutate({ supplier_id: parseInt(supplierId), warehouse_id: parseInt(warehouseId), notes: notes || undefined, items: lineItems.map((li) => ({ variant_id: li.variant_id, quantity: li.quantity, unit_cost: li.unit_cost })) });
  };

  if (isLoading) return <SkeletonRow count={5} />;

  const orders: PurchaseOrder[] = data?.data || [];
  const total = data?.total || 0;

  const formatDate = (d: string) => new Date(d).toLocaleDateString();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('inventory.purchase_orders.title')}</h1>
        <div className="flex items-center gap-3">
          <input value={search} onChange={(e: any) => { setSearch(e.target.value); setPage(1); }} placeholder={t('common.search')} className="px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)]" />
          <Can permission="inventory.purchase-orders.manage">
            <button onClick={() => { resetCreateForm(); setShowCreate(true); }} className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90">{t('inventory.purchase_orders.new')}</button>
          </Can>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreateSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{t('inventory.purchase_orders.new')}</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.purchase_orders.supplier')} *</label>
              <select value={supplierId} onChange={(e: any) => setSupplierId(e.target.value)} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="">{t('common.select')}</option>
                {(suppliers || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.purchase_orders.warehouse')} *</label>
              <select value={warehouseId} onChange={(e: any) => setWarehouseId(e.target.value)} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                <option value="">{t('common.select')}</option>
                {(warehouses || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.purchase_orders.notes')}</label>
              <textarea value={notes} onChange={(e: any) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
          </div>

          <div className="mb-4">
            <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">{t('inventory.purchase_orders.line_items')}</h4>
            <div className="flex items-center gap-2 mb-3">
              <input value={variantSearch} onChange={(e: any) => searchVariants(e.target.value)} placeholder={t('inventory.purchase_orders.search_variant')} className="flex-1 px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)]" />
              <input type="number" value={addQty} onChange={(e: any) => setAddQty(e.target.value)} min="1" className="w-20 px-2 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)]" placeholder={t('common.quantity')} />
              <input type="number" step="0.01" value={addCost} onChange={(e: any) => setAddCost(e.target.value)} min="0" className="w-24 px-2 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)]" placeholder={t('common.price')} />
            </div>
            {variantResults.length > 0 && (
              <div className="border rounded-[var(--radius-md)] bg-[var(--color-bg)] max-h-40 overflow-y-auto mb-2">
                {variantResults.map((v: any) => (
                  <button key={v.id} type="button" onClick={() => addLineItem(v)} className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-primary)]/10 border-b last:border-b-0">
                    {v.name} {v.sku ? `(${v.sku})` : ''}
                  </button>
                ))}
              </div>
            )}
            {lineItems.length > 0 && (
              <table className="w-full text-sm border rounded-[var(--radius-md)]">
                <thead>
                  <tr className="border-b bg-[var(--color-bg)]/50">
                    <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">{t('inventory.purchase_orders.variant')}</th>
                    <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">SKU</th>
                    <th className="text-center px-3 py-2 font-medium text-[var(--color-text-muted)]">{t('common.quantity')}</th>
                    <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">{t('inventory.purchase_orders.unit_cost')}</th>
                    <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">{t('common.total')}</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lineItems.map((li) => (
                    <tr key={li.variant_id}>
                      <td className="px-3 py-2">{li.variant_name}</td>
                      <td className="px-3 py-2 text-[var(--color-text-muted)]">{li.sku}</td>
                      <td className="px-3 py-2 text-center">
                        <input type="number" value={li.quantity} onChange={(e) => updateLineItem(li.variant_id, 'quantity', e.target.value)} min="1" className="w-16 px-2 py-1 text-xs border rounded bg-[var(--color-bg)] text-center" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" step="0.01" value={li.unit_cost} onChange={(e) => updateLineItem(li.variant_id, 'unit_cost', e.target.value)} min="0" className="w-24 px-2 py-1 text-xs border rounded bg-[var(--color-bg)] text-right" />
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{li.total_cost.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => removeLineItem(li.variant_id)} className="text-xs text-red-500">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-medium">
                    <td colSpan={4} className="px-3 py-2 text-right">{t('common.total')}:</td>
                    <td className="px-3 py-2 text-right">{totalCost.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90" disabled={createMutation.isPending}>
              {t('common.create')}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">{t('common.cancel')}</button>
          </div>
        </form>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">PO #</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.purchase_orders.supplier')}</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.purchase_orders.warehouse')}</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('common.status')}</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.purchase_orders.total_cost')}</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.purchase_orders.created_date')}</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.map((o: any) => (
              <tr key={o.id} className="hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3 font-medium">PO-{String(o.id).padStart(5, '0')}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{o.supplier_name}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{o.warehouse_name}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${statusColors[o.status] || 'bg-gray-100 text-gray-600'}`}>{o.status}</span>
                </td>
                <td className="px-4 py-3 text-right font-medium">{Number(o.total_cost).toFixed(2)}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{formatDate(o.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <Can permission="inventory.purchase-orders.manage">
                    <button onClick={() => setDetailId(detailId === o.id ? null : o.id)} className="text-xs text-[var(--color-primary)] mr-2 hover:underline">{t('common.view')}</button>
                    {o.status === 'draft' && (
                      <button onClick={() => statusMutation.mutate({ id: o.id, status: 'submitted' })} className="text-xs text-blue-600 mr-2 hover:underline">{t('inventory.purchase_orders.submit')}</button>
                    )}
                    {o.status === 'submitted' && (
                      <>
                        <button onClick={() => statusMutation.mutate({ id: o.id, status: 'approved' })} className="text-xs text-green-600 mr-2 hover:underline">{t('inventory.purchase_orders.approve')}</button>
                        <button onClick={() => statusMutation.mutate({ id: o.id, status: 'cancelled' })} className="text-xs text-red-500 mr-2 hover:underline">{t('inventory.purchase_orders.cancel')}</button>
                      </>
                    )}
                    {o.status === 'approved' && (
                      <button onClick={() => statusMutation.mutate({ id: o.id, status: 'received' })} className="text-xs text-teal-600 mr-2 hover:underline">{t('inventory.purchase_orders.receive')}</button>
                    )}
                  </Can>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_data')}</p>}
      </div>
      <div className="mt-4">
        <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </div>

      {detailId && (
        <DetailModal orderId={detailId} onClose={() => setDetailId(null)} t={t} />
      )}
    </div>
  );
}

function DetailModal({ orderId, onClose, t }: { orderId: number; onClose: () => void; t: (key: string) => string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'purchase-order', orderId],
    queryFn: () => api.get(`/admin/inventory/purchase-orders/${orderId}`).then((r: any) => r.data.data),
  });

  if (isLoading) return <SkeletonRow count={3} />;
  if (!data) return null;

  const formatDate = (d: string) => new Date(d).toLocaleDateString();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-xl)] p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">PO-{String(data.id).padStart(5, '0')}</h3>
          <button onClick={onClose} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">{t('common.close')}</button>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div><span className="text-[var(--color-text-muted)]">{t('inventory.purchase_orders.supplier')}:</span> <span className="font-medium">{data.supplier_name}</span></div>
          <div><span className="text-[var(--color-text-muted)]">{t('inventory.purchase_orders.warehouse')}:</span> <span className="font-medium">{data.warehouse_name}</span></div>
          <div><span className="text-[var(--color-text-muted)]">{t('common.status')}:</span> <span className={`px-2 py-0.5 text-xs rounded-full border ${statusColors[data.status] || ''}`}>{data.status}</span></div>
          <div><span className="text-[var(--color-text-muted)]">{t('inventory.purchase_orders.created_date')}:</span> <span className="font-medium">{formatDate(data.created_at)}</span></div>
          {data.notes && <div className="col-span-2"><span className="text-[var(--color-text-muted)]">{t('inventory.purchase_orders.notes')}:</span> <span>{data.notes}</span></div>}
        </div>
        <h4 className="text-sm font-medium text-[var(--color-text)] mb-2">{t('inventory.purchase_orders.items')}</h4>
        <table className="w-full text-sm border rounded-[var(--radius-md)]">
          <thead>
            <tr className="border-b bg-[var(--color-bg)]/50">
              <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">{t('inventory.purchase_orders.variant')}</th>
              <th className="text-left px-3 py-2 font-medium text-[var(--color-text-muted)]">SKU</th>
              <th className="text-center px-3 py-2 font-medium text-[var(--color-text-muted)]">{t('common.quantity')}</th>
              <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">{t('inventory.purchase_orders.unit_cost')}</th>
              <th className="text-right px-3 py-2 font-medium text-[var(--color-text-muted)]">{t('common.total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(data.items || []).map((item: any) => (
              <tr key={item.variant_id || item.id}>
                <td className="px-3 py-2">{item.variant_name}</td>
                <td className="px-3 py-2 text-[var(--color-text-muted)]">{item.sku || '—'}</td>
                <td className="px-3 py-2 text-center">{item.quantity}</td>
                <td className="px-3 py-2 text-right">{Number(item.unit_cost).toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-medium">{Number(item.total_cost).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td colSpan={4} className="px-3 py-2 text-right">{t('common.total')}:</td>
              <td className="px-3 py-2 text-right">{Number(data.total_cost).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

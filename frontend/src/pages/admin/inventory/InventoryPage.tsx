import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';
import { Pagination } from '../../../components/ui/Pagination';
import { Modal } from '../../../components/ui/Modal';
import {
  InventoryErrorState,
  InventoryOrgGate,
  InventoryOrgSelector,
  useInventoryCan,
  useInventoryOrg,
} from './InventoryOrgContext';

type Tab = 'stock' | 'adjust' | 'transfer' | 'logs';

export default function InventoryPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('stock');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const org = useInventoryOrg();
  const canAny = useInventoryCan();
  const apiBase = org.apiBase ?? '/admin/inventory';

  const tabs: { key: Tab; label: string; permissions: string[] }[] = [
    { key: 'stock', label: t('inventory.stock.title'), permissions: ['inventory.stock.view'] },
    { key: 'adjust', label: t('inventory.stock.adjust'), permissions: ['inventory.stock.adjust', 'inventory.stock.manage'] },
    { key: 'transfer', label: t('inventory.stock.transfer'), permissions: ['inventory.transfers.create', 'inventory.stock.manage'] },
    { key: 'logs', label: t('inventory.stock.logs'), permissions: org.mode === 'org' ? ['inventory.logs.view'] : ['inventory.stock.view'] },
  ];

  const visibleTabs = tabs.filter((tabDef) => canAny(...tabDef.permissions));
  const effectiveTab = visibleTabs.some((tabDef) => tabDef.key === tab)
    ? tab
    : visibleTabs[0]?.key;

  // Never keep a stale tab selected after the organisation or effective
  // capabilities change (e.g. Organisation A had "adjust", Organisation B does
  // not). The content below is also re-gated, so a hidden tab can never render.
  useEffect(() => {
    if (effectiveTab && effectiveTab !== tab) setTab(effectiveTab);
  }, [effectiveTab, tab]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('inventory.stock.title')}</h1>
        <InventoryOrgSelector org={org} />
      </div>
      <div className="flex gap-1 mb-6 border-b border-[var(--color-border)]">
        {visibleTabs.map((tabDef) => (
          <button key={tabDef.key} onClick={() => { setTab(tabDef.key); setPage(1); }} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${effectiveTab === tabDef.key ? 'border-[var(--color-primary)] text-[var(--color-primary)]' : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>{tabDef.label}</button>
        ))}
      </div>
      <InventoryOrgGate org={org}>
        {effectiveTab === 'stock' && canAny('inventory.stock.view') && <StockLevelsTab orgId={org.orgId} apiBase={apiBase} scopeParams={org.scopeParams ?? { orgId: org.orgId }} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />}
        {effectiveTab === 'adjust' && canAny('inventory.stock.adjust', 'inventory.stock.manage') && <StockAdjustTab orgId={org.orgId} apiBase={apiBase} scopeParams={org.scopeParams ?? { orgId: org.orgId }} />}
        {effectiveTab === 'transfer' && canAny('inventory.transfers.create', 'inventory.stock.manage') && <StockTransferTab orgId={org.orgId} apiBase={apiBase} transfersBase={org.transfersBase ?? '/admin/stock-transfers'} scopeParams={org.scopeParams ?? { orgId: org.orgId }} />}
        {effectiveTab === 'logs' && (org.mode === 'org' ? canAny('inventory.logs.view') : canAny('inventory.stock.view')) && <InventoryLogsTab orgId={org.orgId} apiBase={apiBase} scopeParams={org.scopeParams ?? { orgId: org.orgId }} page={page} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />}
      </InventoryOrgGate>
    </div>
  );
}

function StockLevelsTab({ orgId, apiBase, scopeParams, page, pageSize, setPage, setPageSize }: { orgId: string; apiBase: string; scopeParams: Record<string, string | number>; page: number; pageSize: number; setPage: (p: number) => void; setPageSize: (s: number) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'inventory', 'stock', orgId, page, pageSize, search],
    queryFn: () => api.get(`${apiBase}/stock`, { params: { ...scopeParams, page, limit: pageSize, search: search || undefined } }).then((r: any) => r.data),
    enabled: !!orgId,
  });

  if (isLoading) return <SkeletonRow count={5} />;
  if (isError) return <InventoryErrorState error={error} onRetry={() => refetch()} />;

  const items: any[] = data?.data || [];
  const total = data?.total || 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input value={search} onChange={(e: any) => { setSearch(e.target.value); setPage(1); }} placeholder={t('common.search')} className="px-3 py-1.5 text-sm border rounded-[var(--radius-md)] bg-[var(--color-bg)] max-w-xs" />
      </div>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.variant')}</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">SKU</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.current_stock')}</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.min_level')}</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.max_level')}</th>
              <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.cost_price')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item: any) => {
              const isLow = item.current_stock <= item.min_stock_level;
              return (
                <tr key={item.id} className={`hover:bg-[var(--color-bg)]/30 ${isLow ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                  <td className="px-4 py-3 font-medium">{item.variant_name}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{item.sku || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={isLow ? 'text-red-600 font-semibold' : ''}>{item.current_stock}</span>
                    {isLow && <span className="ml-1 text-xs text-red-500">⚠</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">{item.min_stock_level}</td>
                  <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">{item.max_stock_level || '—'}</td>
                  <td className="px-4 py-3 text-right">{item.cost_price ? Number(item.cost_price).toFixed(2) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_data')}</p>}
      </div>
      <div className="mt-4">
        <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </div>
    </div>
  );
}

function StockAdjustTab({ orgId, apiBase, scopeParams }: { orgId: string; apiBase: string; scopeParams: Record<string, string | number> }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [variantSearch, setVariantSearch] = useState('');
  const [variantResults, setVariantResults] = useState<any[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [newQuantity, setNewQuantity] = useState('');
  const [reason, setReason] = useState('');

  const searchVariants = async (q: string) => {
    setVariantSearch(q);
    if (q.length < 2 || !orgId) { setVariantResults([]); return; }
    try {
      const res = await api.get(`${apiBase}/variants/search`, { params: { ...scopeParams, q } });
      setVariantResults(res.data.data || []);
    } catch { setVariantResults([]); }
  };

  const adjustMutation = useMutation({
    mutationFn: (payload: any) => api.post(`${apiBase}/stock/adjust`, payload, { params: scopeParams }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] }); setSelectedVariant(null); setVariantSearch(''); setNewQuantity(''); setReason(''); showToast(t('inventory.stock.adjusted')); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariant || !newQuantity) return;
    adjustMutation.mutate({ variant_id: selectedVariant.id, new_quantity: parseInt(newQuantity), reason: reason || undefined });
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 border max-w-lg">
      <h3 className="font-semibold text-[var(--color-text)] mb-4">{t('inventory.stock.adjust_title')}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.stock.variant')} *</label>
          <input value={variantSearch} onChange={(e: any) => searchVariants(e.target.value)} placeholder={t('inventory.purchase_orders.search_variant')} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
          {variantResults.length > 0 && (
            <div className="border rounded-[var(--radius-md)] bg-[var(--color-bg)] max-h-32 overflow-y-auto mt-1">
              {variantResults.map((v: any) => (
                <button key={v.id} type="button" onClick={() => { setSelectedVariant(v); setVariantSearch(v.name); setVariantResults([]); }} className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-primary)]/10 border-b last:border-b-0">
                  {v.name} {v.sku ? `(${v.sku})` : ''}
                </button>
              ))}
            </div>
          )}
          {selectedVariant && <p className="text-xs text-[var(--color-text-muted)] mt-1">{t('inventory.stock.current_stock')}: {selectedVariant.current_stock ?? '?'}</p>}
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.stock.new_quantity')} *</label>
          <input type="number" value={newQuantity} onChange={(e: any) => setNewQuantity(e.target.value)} min="0" required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.stock.reason')}</label>
          <textarea value={reason} onChange={(e: any) => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
        </div>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90" disabled={adjustMutation.isPending}>
          {t('inventory.stock.adjust')}
        </button>
      </form>
    </div>
  );
}

export function StockTransferTab({ orgId, apiBase, transfersBase, scopeParams }: { orgId: string; apiBase: string; transfersBase: string; scopeParams: Record<string, string | number> }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const canAny = useInventoryCan();
  const [variantSearch, setVariantSearch] = useState('');
  const [variantResults, setVariantResults] = useState<any[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [cancelNotice, setCancelNotice] = useState<{ restored: boolean; restoredQuantity: number } | null>(null);

  const {
    data: pendingTransfers,
    isLoading: transfersLoading,
    isError: transfersIsError,
    error: transfersError,
    refetch: refetchTransfers,
  } = useQuery({
    queryKey: ['admin', 'stock-transfers', orgId, 'pending'],
    queryFn: () => api.get(transfersBase, { params: { ...scopeParams, status: 'pending' } }).then((r: any) => r.data.data || []),
    enabled: !!orgId,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => api.post(`${transfersBase}/${id}/cancel`, {}, { params: scopeParams }),
    onSuccess: (res: any) => {
      const payload = res?.data ?? {};
      const restored = payload.restored === true;
      const restoredQuantity = restored ? Number(payload.restoredQuantity) || 0 : 0;
      setCancelNotice({ restored, restoredQuantity });
      setCancelTarget(null);
      // Refresh pending transfers plus stock levels and movement logs.
      queryClient.invalidateQueries({ queryKey: ['admin', 'stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      showToast(t('inventory.stock.transfer_cancelled'), 'success');
    },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const { data: warehouses } = useQuery({
    queryKey: ['admin', 'warehouses', 'list', orgId],
    queryFn: () => api.get(`${apiBase}/warehouses`, { params: { ...scopeParams, limit: 500 } }).then((r: any) => r.data.data),
    enabled: !!orgId,
  });

  const searchVariants = async (q: string) => {
    setVariantSearch(q);
    if (q.length < 2 || !orgId) { setVariantResults([]); return; }
    try {
      const res = await api.get(`${apiBase}/variants/search`, { params: { ...scopeParams, q } });
      setVariantResults(res.data.data || []);
    } catch { setVariantResults([]); }
  };

  const transferMutation = useMutation({
    mutationFn: (payload: any) => api.post(`${apiBase}/stock/transfer`, payload, { params: scopeParams }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] }); setSelectedVariant(null); setVariantSearch(''); setFromWarehouseId(''); setToWarehouseId(''); setQuantity(''); showToast(t('inventory.stock.transferred')); },
    onError: (err: any) => showToast(getErrorMessage(err), 'error'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariant || !fromWarehouseId || !toWarehouseId || !quantity) return;
    if (fromWarehouseId === toWarehouseId) { showToast(t('inventory.stock.same_warehouse_error'), 'error'); return; }
    transferMutation.mutate({ variant_id: selectedVariant.id, from_warehouse_id: parseInt(fromWarehouseId), to_warehouse_id: parseInt(toWarehouseId), quantity: parseInt(quantity) });
  };

  const pendingOnly = (pendingTransfers || []).filter((tr: any) => tr.status === 'pending');

  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 border max-w-lg">
      <h3 className="font-semibold text-[var(--color-text)] mb-4">{t('inventory.stock.transfer_title')}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.stock.variant')} *</label>
          <input value={variantSearch} onChange={(e: any) => searchVariants(e.target.value)} placeholder={t('inventory.purchase_orders.search_variant')} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
          {variantResults.length > 0 && (
            <div className="border rounded-[var(--radius-md)] bg-[var(--color-bg)] max-h-32 overflow-y-auto mt-1">
              {variantResults.map((v: any) => (
                <button key={v.id} type="button" onClick={() => { setSelectedVariant(v); setVariantSearch(v.name); setVariantResults([]); }} className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-primary)]/10 border-b last:border-b-0">
                  {v.name} {v.sku ? `(${v.sku})` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.stock.from_warehouse')} *</label>
          <select value={fromWarehouseId} onChange={(e: any) => setFromWarehouseId(e.target.value)} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
            <option value="">{t('common.select')}</option>
            {(warehouses || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('inventory.stock.to_warehouse')} *</label>
          <select value={toWarehouseId} onChange={(e: any) => setToWarehouseId(e.target.value)} required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
            <option value="">{t('common.select')}</option>
            {(warehouses || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('common.quantity')} *</label>
          <input type="number" value={quantity} onChange={(e: any) => setQuantity(e.target.value)} min="1" required className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
        </div>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90" disabled={transferMutation.isPending}>
          {t('inventory.stock.transfer')}
        </button>
      </form>
      </div>

      {cancelNotice && (
        <div className={`rounded-[var(--radius-lg)] border p-4 text-sm ${
          cancelNotice.restored
            ? 'border-green-300 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300'
            : 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
        }`}>
          <p className="font-medium">
            {cancelNotice.restored
              ? t('inventory.stock.cancel_transfer_restored', { count: cancelNotice.restoredQuantity })
              : t('inventory.stock.cancel_transfer_not_restored')}
          </p>
          <button type="button" onClick={() => setCancelNotice(null)} className="mt-2 text-xs underline">{t('common.close')}</button>
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-text)]">{t('inventory.stock.pending_transfers')}</h3>
          <button type="button" onClick={() => refetchTransfers()} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">{t('common.refresh')}</button>
        </div>
        {transfersIsError ? (
          <div className="p-4"><InventoryErrorState error={transfersError} onRetry={() => refetchTransfers()} /></div>
        ) : transfersLoading ? (
          <div className="p-4"><SkeletonRow count={3} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[var(--color-bg)]/50">
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.variant')}</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.from_warehouse')}</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.to_warehouse')}</th>
                  <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('common.quantity')}</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.date')}</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingOnly.map((tr: any) => (
                  <tr key={tr.id} className="hover:bg-[var(--color-bg)]/30">
                    <td className="px-4 py-3 font-medium">{tr.variant_name || `#${tr.variant_id}`}{tr.sku ? ` (${tr.sku})` : ''}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{tr.from_warehouse_name || '—'}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">{tr.to_warehouse_name || '—'}</td>
                    <td className="px-4 py-3 text-center">{tr.quantity}</td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] whitespace-nowrap">{tr.created_at ? new Date(tr.created_at).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {canAny('inventory.transfers.cancel', 'inventory.stock.manage') && (
                        <button type="button" onClick={() => setCancelTarget(tr)} className="text-xs text-red-600 hover:underline">{t('inventory.stock.cancel_transfer')}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pendingOnly.length === 0 && (
              <p className="text-center py-6 text-sm text-[var(--color-text-muted)]">{t('inventory.stock.no_pending_transfers')}</p>
            )}
          </div>
        )}
      </div>

      <Modal
        open={cancelTarget !== null}
        onClose={() => { if (!cancelMutation.isPending) setCancelTarget(null); }}
        title={t('inventory.stock.cancel_transfer_title')}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCancelTarget(null)} disabled={cancelMutation.isPending} className="px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-[var(--radius-md)]">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => { if (cancelTarget) cancelMutation.mutate(cancelTarget.id); }}
              disabled={cancelMutation.isPending}
              className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-[var(--radius-md)] disabled:opacity-60"
            >
              {cancelMutation.isPending ? '…' : t('inventory.stock.cancel_transfer')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-[var(--color-text)]">{t('inventory.stock.cancel_transfer_confirm')}</p>
        {cancelTarget && (
          <p className="text-xs text-[var(--color-text-muted)] mt-2">
            {cancelTarget.variant_name || `#${cancelTarget.variant_id}`} · {cancelTarget.quantity}
          </p>
        )}
      </Modal>
    </div>
  );
}

function InventoryLogsTab({ orgId, apiBase, scopeParams, page, pageSize, setPage, setPageSize }: { orgId: string; apiBase: string; scopeParams: Record<string, string | number>; page: number; pageSize: number; setPage: (p: number) => void; setPageSize: (s: number) => void }) {
  const { t } = useTranslation();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'inventory', 'logs', orgId, page, pageSize],
    queryFn: () => api.get(`${apiBase}/stock/logs`, { params: { ...scopeParams, page, limit: pageSize } }).then((r: any) => r.data),
    enabled: !!orgId,
  });

  if (isLoading) return <SkeletonRow count={5} />;
  if (isError) return <InventoryErrorState error={error} onRetry={() => refetch()} />;

  const logs: any[] = data?.data || [];
  const total = data?.total || 0;

  const formatDate = (d: string) => new Date(d).toLocaleString();

  return (
    <div>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[var(--color-bg)]/50">
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.variant')}</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.warehouse')}</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.movement_type')}</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.quantity_change')}</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.before')}</th>
              <th className="text-center px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.after')}</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.reason')}</th>
              <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">{t('inventory.stock.date')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.map((log: any) => (
              <tr key={log.id} className="hover:bg-[var(--color-bg)]/30">
                <td className="px-4 py-3 font-medium">{log.variant_name}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)]">{log.warehouse_name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs rounded-full border ${
                    log.movement_type === 'adjustment' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                    log.movement_type === 'in' ? 'bg-green-100 text-green-700 border-green-300' :
                    log.movement_type === 'out' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                    log.movement_type === 'reservation' ? 'bg-purple-100 text-purple-700 border-purple-300' :
                    log.movement_type === 'return' ? 'bg-teal-100 text-teal-700 border-teal-300' :
                    'bg-gray-100 text-gray-600 border-gray-300'
                  }`}>{log.movement_type}</span>
                </td>
                <td className="px-4 py-3 text-center font-medium">{log.quantity_change > 0 ? `+${log.quantity_change}` : log.quantity_change}</td>
                <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">{log.quantity_before}</td>
                <td className="px-4 py-3 text-center text-[var(--color-text-muted)]">{log.quantity_after}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)] max-w-[200px] truncate">{log.reason || '—'}</td>
                <td className="px-4 py-3 text-[var(--color-text-muted)] whitespace-nowrap">{formatDate(log.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!logs.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">{t('common.no_data')}</p>}
      </div>
      <div className="mt-4">
        <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </div>
    </div>
  );
}

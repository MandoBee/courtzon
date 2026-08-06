import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { useToast } from '../../components/ui/Toast';
import { SkeletonRow } from '../../components/ui/Skeleton';

type Tab = 'settings' | 'feature-flags' | 'health' | 'cache' | 'queues' | 'audit';

export default function SystemAdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('settings');
  const [selectedCategory, setSelectedCategory] = useState('');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">{t('admin.system.title')}</h1>

      <div className="flex gap-2 flex-wrap border-b border-[var(--color-border)] pb-2">
        {(['settings', 'feature-flags', 'health', 'cache', 'queues', 'audit'] as Tab[]).map(tabId => (
          <button key={tabId} onClick={() => setTab(tabId)} className={`px-4 py-2 text-sm font-medium rounded-t-lg ${tab === tabId ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>{t(`admin.system.tab.${tabId}`)}</button>
        ))}
      </div>

      {tab === 'settings' && <SettingsPanel selectedCategory={selectedCategory} onCategoryChange={setSelectedCategory} />}
      {tab === 'feature-flags' && <FeatureFlagsPanel />}
      {tab === 'health' && <HealthPanel />}
      {tab === 'cache' && <CachePanel />}
      {tab === 'queues' && <QueuesPanel />}
      {tab === 'audit' && <AuditPanel />}
    </div>
  );
}

function SettingsPanel({ selectedCategory, onCategoryChange }: { selectedCategory: string; onCategoryChange: (c: string) => void }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: meta } = useQuery({ queryKey: ['settings-metadata'], queryFn: () => api.get('/admin/settings/metadata').then(r => r.data), staleTime: 30000 });

  const updateMut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => api.put(`/admin/settings/${key}`, { value }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-settings'] }); queryClient.invalidateQueries({ queryKey: ['settings-metadata'] }); showToast(t('admin.system.setting_updated')); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Error', 'error'),
  });

  const categories = meta?.data?.categories || [];
  let settings = meta?.data?.settings || [];

  if (selectedCategory) settings = settings.filter((s: any) => (s.category || 'general') === selectedCategory);
  if (search) settings = settings.filter((s: any) => s.key.toLowerCase().includes(search.toLowerCase()) || (s.display_name || '').toLowerCase().includes(search.toLowerCase()) || (s.description || '').toLowerCase().includes(search.toLowerCase()));

  const grouped: Record<string, any[]> = {};
  for (const s of settings) {
    const cat = s.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(s);
  }

  const renderInput = (s: any) => {
    const vt = s.value_type || 'string';
    if (vt === 'boolean') {
      return <button onClick={() => updateMut.mutate({ key: s.key, value: s.value === true || s.value === 'true' ? 'false' : 'true' })} className={`px-3 py-1 text-xs rounded-full font-medium transition ${s.value === true || s.value === 'true' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{(s.value === true || s.value === 'true') ? 'ON' : 'OFF'}</button>;
    }
    if (vt === 'enum' && s.allowed_values) {
      const opts = s.allowed_values.split(',').map((o: string) => o.trim());
      return <select defaultValue={String(s.value)} onChange={e => updateMut.mutate({ key: s.key, value: e.target.value })} className="w-full px-2 py-1 text-xs border rounded">{opts.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>;
    }
    if (vt === 'number' || vt === 'decimal') {
      return <input type="number" defaultValue={s.value} onBlur={e => { if (e.target.value !== String(s.value)) updateMut.mutate({ key: s.key, value: e.target.value }); }} min={s.min_value} max={s.max_value} step={vt === 'decimal' ? '0.01' : '1'} className="w-full px-2 py-1 text-xs border rounded" />;
    }
    if (vt === 'text' || vt === 'json') {
      return <textarea defaultValue={s.value} rows={2} onBlur={e => { if (e.target.value !== String(s.value)) updateMut.mutate({ key: s.key, value: e.target.value }); }} className="w-full px-2 py-1 text-xs border rounded font-mono" />;
    }
    return <input defaultValue={s.value} onBlur={e => { if (e.target.value !== s.value) updateMut.mutate({ key: s.key, value: e.target.value }); }} className="w-full px-2 py-1 text-xs border rounded" placeholder={s.placeholder} />;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <input placeholder={t('admin.system.search_settings')} value={search} onChange={e => setSearch(e.target.value)} className="px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl w-64" />
        <select value={selectedCategory} onChange={e => onCategoryChange(e.target.value)} className="px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl">
          <option value="">{t('admin.system.all_categories')}</option>
          {categories.map((c: string) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {Object.entries(grouped).map(([cat, catSettings]) => (
        <div key={cat}>
          <h3 className="text-sm font-semibold text-[var(--color-text)] uppercase tracking-wider mb-2 px-1">{cat}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {catSettings.map((s: any) => (
              <div key={s.key} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-[var(--color-text)]">{s.display_name || s.key}</span>
                    {s.unit && <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg)] px-1.5 py-0.5 rounded">{s.unit}</span>}
                    {s.scope && s.scope !== 'global' && <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">{s.scope}</span>}
                  </div>
                  {(s.description || s.help_text) && <p className="text-[10px] text-[var(--color-text-muted)] mb-2">{s.help_text || s.description}</p>}
                  <p className="text-[10px] text-[var(--color-text-muted)]/60 font-mono">{s.key}</p>
                </div>
                <div className="mt-2">
                  {s.is_editable ? renderInput(s) : <p className="text-sm font-medium text-[var(--color-text)]">{String(s.value)}{s.unit ? ` ${s.unit}` : ''}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FeatureFlagsPanel() {
  const { t } = useTranslation(); const { showToast } = useToast(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-feature-flags'], queryFn: () => api.get('/admin/feature-flags').then(r => r.data) });
  const toggleMut = useMutation({
    mutationFn: (id: number) => api.post(`/admin/feature-flags/${id}/toggle`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-feature-flags'] }); showToast(t('admin.system.flag_toggled')); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Error', 'error'),
  });
  const flags = data?.data || [];
  return (
    <div className="space-y-2">
      {flags.map((f: any) => (
        <div key={f.id} className="flex items-center justify-between bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] px-4 py-3">
          <div><p className="text-sm font-medium">{f.feature_key}</p><p className="text-xs text-[var(--color-text-muted)]">{f.description || ''}</p></div>
          <button onClick={() => toggleMut.mutate(f.id)} className={`px-3 py-1 text-xs rounded-full ${f.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{f.is_enabled ? 'ON' : 'OFF'}</button>
        </div>
      ))}
      {flags.length === 0 && <p className="text-sm text-[var(--color-text-muted)] text-center py-8">{t('admin.system.empty_flags')}</p>}
    </div>
  );
}

function HealthPanel() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({ queryKey: ['admin-health'], queryFn: () => api.get('/admin/health').then(r => r.data), refetchInterval: 30000 });
  if (isLoading) return <SkeletonRow count={6} />;
  const h = data?.data || {};
  const checks = [
    { label: t('admin.system.health.database'), status: h.database === 'ok' },
    { label: t('admin.system.health.redis'), status: h.redis === 'ok' },
    { label: t('admin.system.health.memory'), value: `${h.memoryUsagePercent || 0}%` },
    { label: t('admin.system.health.uptime'), value: `${Math.floor((h.uptime || 0) / 3600)}h` },
    { label: t('admin.system.health.sockets'), value: `${h.socketConnections || 0}` },
    { label: t('admin.system.health.version'), value: h.appVersion || 'unknown' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {checks.map(c => (
        <div key={c.label} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
          <p className="text-xs text-[var(--color-text-muted)]">{c.label}</p>
          <p className="text-lg font-bold mt-1">{'status' in c ? (c.status ? '✅' : '❌') : c.value}</p>
        </div>
      ))}
    </div>
  );
}

function CachePanel() {
  const { t } = useTranslation(); const { showToast } = useToast(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-cache'], queryFn: () => api.get('/admin/cache').then(r => r.data) });
  const clearMut = useMutation({
    mutationFn: () => api.post('/admin/cache/clear'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-cache'] }); showToast(t('admin.system.cache_cleared')); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Error', 'error'),
  });
  const stats = data?.data || {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[{ label: 'Keys', value: stats.keys }, { label: 'Memory', value: stats.memory }, { label: 'Hits', value: stats.hits }, { label: 'Misses', value: stats.misses }].map(s => (
          <div key={s.label} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-text-muted)]">{s.label}</p><p className="text-lg font-bold mt-1">{s.value ?? '-'}</p>
          </div>
        ))}
      </div>
      <button onClick={() => { if (confirm(t('admin.system.cache_clear_confirm'))) clearMut.mutate(); }} className="px-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--color-error)] text-white">{t('admin.system.clear_cache')}</button>
    </div>
  );
}

function QueuesPanel() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-queues'], queryFn: () => api.get('/admin/queues').then(r => r.data), refetchInterval: 10000 });
  if (isLoading) return <SkeletonRow count={4} />;
  const queues = data?.data || [];
  return (
    <div className="space-y-2">
      {queues.map((q: any) => (
        <div key={q.name} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center justify-between"><p className="text-sm font-medium">{q.name}</p></div>
          <div className="flex gap-4 mt-2 text-xs text-[var(--color-text-muted)]">
            <span>Waiting: {q.waiting ?? 0}</span><span>Active: {q.active ?? 0}</span>
            <span>Completed: {q.completed ?? 0}</span><span>Failed: {q.failed ?? 0}</span><span>Delayed: {q.delayed ?? 0}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditPanel() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['admin-audit', page], queryFn: () => api.get('/admin/audit-logs', { params: { page, limit: 20 } }).then(r => r.data) });
  if (isLoading) return <SkeletonRow count={5} />;
  const logs = data?.data || [];
  const pag = data?.pagination || {};
  return (
    <div className="space-y-2">
      {logs.map((l: any) => (
        <div key={l.id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-[var(--color-text-muted)]">{l.action}</span>
            <span className="text-xs text-[var(--color-text-muted)]">{new Date(l.created_at).toLocaleString()}</span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{l.entity_type} #{l.entity_id} by user {l.actor_id}</p>
        </div>
      ))}
      {pag.totalPages > 1 && <div className="flex justify-center gap-2 mt-4">{Array.from({ length: pag.totalPages }, (_, i) => i + 1).map(p => <button key={p} onClick={() => setPage(p)} className={`px-3 py-1 text-xs rounded ${page === p ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg)]'}`}>{p}</button>)}</div>}
    </div>
  );
}

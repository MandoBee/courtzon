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

  const { data: settingsData } = useQuery({ queryKey: ['admin-settings', selectedCategory, search], queryFn: () => api.get('/admin/settings', { params: { category: selectedCategory || undefined, q: search || undefined } }).then(r => r.data) });
  const { data: categories } = useQuery({ queryKey: ['admin-setting-categories'], queryFn: () => api.get('/admin/settings/categories').then(r => r.data) });

  const updateMut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => api.put(`/admin/settings/${key}`, { value }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-settings'] }); showToast(t('admin.system.setting_updated')); },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Error', 'error'),
  });

  const settings = settingsData?.data || [];
  const cats = categories?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <input placeholder={t('admin.system.search_settings')} value={search} onChange={e => setSearch(e.target.value)} className="px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl w-64" />
        <select value={selectedCategory} onChange={e => onCategoryChange(e.target.value)} className="px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl">
          <option value="">{t('admin.system.all_categories')}</option>
          {cats.map((c: string) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {settings.map((s: any) => (
          <div key={s.key} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
            <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase">{s.category}</label>
            <p className="text-sm font-medium mt-1">{s.key}</p>
            {s.description && <p className="text-xs text-[var(--color-text-muted)] mt-1">{s.description}</p>}
            {s.is_editable ? (
              <div className="flex gap-2 mt-2">
                {s.value_type === 'boolean' ? (
                  <button onClick={() => updateMut.mutate({ key: s.key, value: s.value === 'true' ? 'false' : 'true' })} className={`px-3 py-1 text-xs rounded-full ${s.value === 'true' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.value === 'true' ? 'ON' : 'OFF'}</button>
                ) : (
                  <input defaultValue={s.value} onBlur={e => { if (e.target.value !== s.value) updateMut.mutate({ key: s.key, value: e.target.value }); }} className="w-full px-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg" />
                )}
              </div>
            ) : (
              <p className="text-sm mt-2 text-[var(--color-text-muted)]">{s.value}</p>
            )}
          </div>
        ))}
      </div>
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

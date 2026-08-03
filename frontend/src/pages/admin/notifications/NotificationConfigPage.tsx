import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';

type Tab = 'settings' | 'retry' | 'rules' | 'providers';

export default function NotificationConfigPage() {
  const [tab, setTab] = useState<Tab>('settings');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'settings', label: 'Global Settings' },
    { key: 'retry', label: 'Retry Policies' },
    { key: 'rules', label: 'Rules' },
    { key: 'providers', label: 'Providers' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-6">Notification Configuration</h1>
      <div className="flex gap-1 mb-6 border-b">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-[var(--radius-md)] transition-colors ${tab === t.key ? 'bg-[var(--color-surface)] text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'settings' && <GlobalSettingsPanel />}
      {tab === 'retry' && <RetryPoliciesPanel />}
      {tab === 'rules' && <RulesPanel />}
      {tab === 'providers' && <ProvidersPanel />}
    </div>
  );
}

// ── Global Settings Panel ──

function GlobalSettingsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notif-settings'], queryFn: () => api.get('/admin/notifications/config/settings').then((r) => r.data.data) });
  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => api.put(`/admin/notifications/config/settings/${key}`, { value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notif-settings'] }); },
  });

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="p-4 border-b"><h2 className="font-semibold text-[var(--color-text)]">Platform Settings</h2></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)]"><tr>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Setting</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)] w-[100px]">Value</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Description</th>
            <Can permission="notifications.config.manage"><th className="text-right px-4 py-2 text-xs font-medium text-[var(--color-text-muted)] w-[80px]">Action</th></Can>
          </tr></thead>
          <tbody>{data?.map((r: any) => <SettingRow key={r.setting_key} row={r} onSave={(v) => mutation.mutate({ key: r.setting_key, value: v })} />)}</tbody>
        </table>
      </div>
    </div>
  );
}

function SettingRow({ row, onSave }: { row: any; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(row.setting_value);
  const isBool = row.setting_value === 'true' || row.setting_value === 'false';

  if (!editing) {
    return (
      <tr className="border-t hover:bg-[var(--color-bg)]/50">
        <td className="px-4 py-2 font-mono text-xs text-[var(--color-text)]">{row.setting_key}</td>
        <td className="px-4 py-2"><span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isBool ? (row.setting_value === 'true' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]') : 'bg-[var(--color-bg)] text-[var(--color-text)]'}`}>{row.setting_value}</span></td>
        <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">{row.description}</td>
        <Can permission="notifications.config.manage"><td className="px-4 py-2 text-right"><button onClick={() => { setVal(row.setting_value); setEditing(true); }} className="text-[10px] px-2 py-1 border rounded-[var(--radius-md)] text-[var(--color-text)] hover:bg-[var(--color-bg)]">Edit</button></td></Can>
      </tr>
    );
  }
  return (
    <tr className="border-t bg-[var(--color-primary)]/5">
      <td className="px-4 py-2 font-mono text-xs">{row.setting_key}</td>
      <td className="px-4 py-2">{isBool
        ? <select value={val} onChange={(e) => setVal(e.target.value)} className="w-full px-2 py-1 border rounded-[var(--radius-md)] text-xs bg-[var(--color-bg)]"><option value="true">true</option><option value="false">false</option></select>
        : <input type="text" value={val} onChange={(e) => setVal(e.target.value)} className="w-full px-2 py-1 border rounded-[var(--radius-md)] text-xs bg-[var(--color-bg)]" />}
      </td>
      <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">{row.description}</td>
      <Can permission="notifications.config.manage"><td className="px-4 py-2 text-right flex gap-1 justify-end"><button onClick={() => { onSave(val); setEditing(false); }} className="text-[10px] px-2 py-1 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)]">Save</button><button onClick={() => setEditing(false)} className="text-[10px] px-2 py-1 border rounded-[var(--radius-md)]">Cancel</button></td></Can>
    </tr>
  );
}

// ── Retry Policies Panel ──

function RetryPoliciesPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notif-retry'], queryFn: () => api.get('/admin/notifications/config/retry-policies').then((r) => r.data.data) });
  const deleteMut = useMutation({ mutationFn: (id: number) => api.delete(`/admin/notifications/config/retry-policies/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-retry'] }) });
  const createMut = useMutation({ mutationFn: (d: any) => api.post('/admin/notifications/config/retry-policies', d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['notif-retry'] }); setShowCreate(false); setForm({ policyKey: '', categorySlug: '', maxRetries: 3, retryDelayMs: 30000, exponentialBackoff: 1, maxDelayMs: 300000 }); } });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ policyKey: '', categorySlug: '', maxRetries: 3, retryDelayMs: 30000, exponentialBackoff: 1, maxDelayMs: 300000 });

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="font-semibold text-[var(--color-text)]">Retry Policies</h2>
        <Can permission="notifications.config.manage"><button onClick={() => setShowCreate(true)} className="px-3 py-1 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium">+ New</button></Can>
      </div>
      {showCreate && (
        <div className="p-4 border-b bg-[var(--color-bg)]">
          <div className="grid grid-cols-6 gap-2 text-xs">
            <div><label className="block text-[10px] font-medium text-[var(--color-text-muted)]">Key</label><input type="text" value={form.policyKey} onChange={(e) => setForm({ ...form, policyKey: e.target.value })} className="w-full px-2 py-1 border rounded-[var(--radius-md)] bg-[var(--color-surface)]" /></div>
            <div><label className="block text-[10px] font-medium text-[var(--color-text-muted)]">Category</label><input type="text" placeholder="(any)" value={form.categorySlug} onChange={(e) => setForm({ ...form, categorySlug: e.target.value })} className="w-full px-2 py-1 border rounded-[var(--radius-md)] bg-[var(--color-surface)]" /></div>
            <div><label className="block text-[10px] font-medium text-[var(--color-text-muted)]">Max Retries</label><input type="number" value={form.maxRetries} onChange={(e) => setForm({ ...form, maxRetries: Number(e.target.value) })} className="w-full px-2 py-1 border rounded-[var(--radius-md)] bg-[var(--color-surface)]" /></div>
            <div><label className="block text-[10px] font-medium text-[var(--color-text-muted)]">Delay (ms)</label><input type="number" value={form.retryDelayMs} onChange={(e) => setForm({ ...form, retryDelayMs: Number(e.target.value) })} className="w-full px-2 py-1 border rounded-[var(--radius-md)] bg-[var(--color-surface)]" /></div>
            <div><label className="block text-[10px] font-medium text-[var(--color-text-muted)]">Backoff</label><select value={form.exponentialBackoff} onChange={(e) => setForm({ ...form, exponentialBackoff: Number(e.target.value) })} className="w-full px-2 py-1 border rounded-[var(--radius-md)] bg-[var(--color-surface)]"><option value={1}>On</option><option value={0}>Off</option></select></div>
            <div className="flex items-end gap-1"><button onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.policyKey} className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs disabled:opacity-50">Add</button><button onClick={() => setShowCreate(false)} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">Cancel</button></div>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)]"><tr>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Policy Key</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Category</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Max Retries</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Delay (ms)</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Backoff</th>
            <Can permission="notifications.config.manage"><th className="text-right px-4 py-2 text-xs font-medium text-[var(--color-text-muted)] w-[100px]"></th></Can>
          </tr></thead>
          <tbody>{(data || []).map((r: any) => (
            <tr key={r.id} className="border-t hover:bg-[var(--color-bg)]/50">
              <td className="px-4 py-2 font-mono text-xs text-[var(--color-text)]">{r.policy_key}</td>
              <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">{r.category_slug || '(any)'}</td>
              <td className="px-4 py-2 text-xs">{r.max_retries}</td>
              <td className="px-4 py-2 text-xs">{r.retry_delay_ms}</td>
              <td className="px-4 py-2 text-xs">{r.exponential_backoff ? 'Yes' : 'No'}</td>
              <Can permission="notifications.config.manage"><td className="px-4 py-2 text-right"><button onClick={() => { if (confirm('Delete?')) deleteMut.mutate(r.id); }} className="text-[10px] px-2 py-1 border rounded-[var(--radius-md)] text-[var(--color-error-text)] hover:bg-[var(--color-error-bg)]">Delete</button></td></Can>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── Rules Panel ──

function RulesPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notif-rules'], queryFn: () => api.get('/admin/notifications/config/rules').then((r) => r.data.data) });
  const toggleMut = useMutation({ mutationFn: ({ id, ...d }: { id: number; isActive: boolean }) => api.put(`/admin/notifications/config/rules/${id}`, d), onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-rules'] }) });
  const deleteMut = useMutation({ mutationFn: (id: number) => api.delete(`/admin/notifications/config/rules/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-rules'] }) });

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="p-4 border-b"><h2 className="font-semibold text-[var(--color-text)]">Notification Rules</h2></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)]"><tr>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">#</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Name</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Event</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Action</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)] w-[80px]">Status</th>
            <Can permission="notifications.config.manage"><th className="text-right px-4 py-2 text-xs font-medium text-[var(--color-text-muted)] w-[80px]"></th></Can>
          </tr></thead>
          <tbody>{(data || []).map((r: any) => (
            <tr key={r.id} className={`border-t hover:bg-[var(--color-bg)]/50 ${!r.is_active ? 'opacity-50' : ''}`}>
              <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">{r.priority}</td>
              <td className="px-4 py-2 text-sm text-[var(--color-text)]">{r.name}</td>
              <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">{r.event_name || r.category_slug || '(all)'}</td>
              <td className="px-4 py-2"><span className="text-xs px-1.5 py-0.5 rounded font-mono bg-[var(--color-bg)] text-[var(--color-text)]">{r.action}</span></td>
              <td className="px-4 py-2">
                <Can permission="notifications.config.manage">
                  <button onClick={() => toggleMut.mutate({ id: r.id, isActive: !r.is_active })} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors ${r.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'}`}>
                    {r.is_active ? 'Active' : 'Inactive'}
                  </button>
                </Can>
                {!r.is_active && <span className="text-[10px] ml-1 text-[var(--color-text-muted)]">Inactive</span>}
              </td>
              <Can permission="notifications.config.manage"><td className="px-4 py-2 text-right"><button onClick={() => { if (confirm('Delete?')) deleteMut.mutate(r.id); }} className="text-[10px] px-2 py-1 border rounded-[var(--radius-md)] text-[var(--color-error-text)] hover:bg-[var(--color-error-bg)]">Delete</button></td></Can>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── Providers Panel ──

function ProvidersPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notif-providers'], queryFn: () => api.get('/admin/notifications/config/providers').then((r) => r.data.data) });
  const upMut = useMutation({ mutationFn: ({ id, ...d }: any) => api.put(`/admin/notifications/config/providers/${id}`, d), onSuccess: () => qc.invalidateQueries({ queryKey: ['notif-providers'] }) });

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="p-4 border-b"><h2 className="font-semibold text-[var(--color-text)]">Channel Providers</h2></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-bg)]"><tr>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Provider</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)]">Channel</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)] w-[80px]">Priority</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)] w-[100px]">Status</th>
            <Can permission="notifications.config.manage"><th className="text-left px-4 py-2 text-xs font-medium text-[var(--color-text-muted)] w-[80px]"></th></Can>
          </tr></thead>
          <tbody>{(data || []).map((r: any) => (
            <tr key={r.id} className={`border-t hover:bg-[var(--color-bg)]/50 ${!r.is_enabled ? 'opacity-50' : ''}`}>
              <td className="px-4 py-2 text-sm font-medium text-[var(--color-text)]">{r.slug}</td>
              <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">{r.channel}</td>
              <td className="px-4 py-2 text-xs">{r.priority}</td>
              <td className="px-4 py-2">
                <Can permission="notifications.config.manage">
                  <button onClick={() => upMut.mutate({ id: r.id, isEnabled: !r.is_enabled })} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors ${r.is_enabled ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'}`}>
                    {r.is_enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </Can>
              </td>
              <Can permission="notifications.config.manage"><td className="px-4 py-2"><input type="number" defaultValue={r.priority} onBlur={(e) => upMut.mutate({ id: r.id, priority: Number(e.target.value) })} className="w-16 px-2 py-1 border rounded-[var(--radius-md)] text-xs bg-[var(--color-bg)]" /></td></Can>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

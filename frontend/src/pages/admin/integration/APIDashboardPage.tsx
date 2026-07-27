import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { SkeletonRow } from '../../../components/ui/Skeleton';

interface ApiKey {
  id: number;
  name: string;
  key_prefix: string;
  is_active: number;
  last_used_at: string | null;
  created_at: string;
  rate_limit: number | null;
  scopes: string | null;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
      <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-[var(--color-text)] mt-1">{value}</p>
    </div>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function APIDashboardPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<{ id: number; name: string; api_key: string } | null>(null);

  const { data: keys, isLoading } = useQuery({
    queryKey: ['admin', 'api-keys'],
    queryFn: () => api.get('/api/v1/api-keys').then(r => r.data || []),
  });

  const list: ApiKey[] = Array.isArray(keys) ? keys : [];

  const total = list.length;
  const active = list.filter(k => k.is_active).length;
  const lastUsed = list.reduce((latest, k) => {
    if (!k.last_used_at) return latest;
    return !latest || new Date(k.last_used_at) > new Date(latest) ? k.last_used_at : latest;
  }, '');

  const createMutation = useMutation({
    mutationFn: (n: string) => api.post('/api/v1/api-keys', { name: n }),
    onSuccess: (r) => {
      showToast('API key created!', 'success');
      setNewKey({ id: r.data.id, name: r.data.name, api_key: r.data.api_key });
      setShowCreate(false);
      setName('');
      qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to create key', 'error'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/v1/api-keys/${id}`),
    onSuccess: () => {
      showToast('API key revoked', 'info');
      qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || 'Failed to revoke key', 'error'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--color-text)]">API Keys</h1>
        <div className="flex items-center gap-3">
          <a href="/admin/webhooks" className="text-sm text-[var(--color-primary)] hover:underline">Webhooks</a>
          <a href="/docs/api" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--color-primary)] hover:underline">API Docs</a>
          <Can permission="integration.api-keys.manage">
            <button onClick={() => { setNewKey(null); setShowCreate(!showCreate); }} className="btn-primary text-sm">
              {showCreate ? 'Cancel' : '+ Create API Key'}
            </button>
          </Can>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Keys" value={total} />
        <StatCard label="Active Keys" value={active} />
        <StatCard label="Last Used" value={lastUsed ? formatDateTime(lastUsed) : 'Never'} />
      </div>

      {showCreate && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-4">
          <div>
            <label className="text-xs text-[var(--color-text-muted)]">Key Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Production CLI"
              className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg"
            />
          </div>
          <button
            onClick={() => createMutation.mutate(name)}
            disabled={createMutation.isPending || !name.trim()}
            className="btn-primary text-sm"
          >
            {createMutation.isPending ? 'Creating...' : 'Generate Key'}
          </button>
        </div>
      )}

      {newKey && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl p-5 space-y-3">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Key created: <span className="font-mono">{newKey.name}</span></p>
          <div className="bg-white dark:bg-[var(--color-bg)] rounded-lg p-3 border border-amber-200 dark:border-amber-700">
            <code className="text-sm font-mono break-all text-amber-900 dark:text-amber-100 select-all">{newKey.api_key}</code>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">Save this key — it will not be shown again.</p>
          <button onClick={() => setNewKey(null)} className="text-xs text-[var(--color-text-muted)] hover:underline">Dismiss</button>
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        {isLoading ? <SkeletonRow count={4} /> : list.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-text-muted)] text-center">No API keys created yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Key Prefix</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Last Used</th>
                <th className="text-left px-4 py-3">Created</th>
                <th className="text-left px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((k) => (
                <tr key={k.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{k.name}</td>
                  <td className="px-4 py-3 text-xs font-mono text-[var(--color-text-muted)]">{k.key_prefix}...</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      k.is_active
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    }`}>
                      {k.is_active ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{formatDateTime(k.last_used_at)}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{formatDate(k.created_at)}</td>
                  <td className="px-4 py-3">
                    <Can permission="integration.api-keys.manage">
                      {k.is_active ? (
                        <button
                          onClick={() => { if (confirm(`Revoke "${k.name}"? This cannot be undone.`)) revokeMutation.mutate(k.id); }}
                          className="text-xs text-[var(--color-error)] hover:underline"
                        >
                          Revoke
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)]">—</span>
                      )}
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

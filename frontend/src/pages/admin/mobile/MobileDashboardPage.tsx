import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

export default function MobileDashboardPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ['mobile-dashboard'],
    queryFn: () => api.get('/admin/mobile/dashboard').then(r => r.data?.data),
  });

  const { data: versions } = useQuery({
    queryKey: ['mobile-versions'],
    queryFn: () => api.get('/admin/mobile/versions').then(r => r.data?.data),
  });

  const { data: configs } = useQuery({
    queryKey: ['mobile-config'],
    queryFn: () => api.get('/admin/mobile/config').then(r => r.data?.data),
  });

  const { data: pushLogData } = useQuery({
    queryKey: ['mobile-push-log'],
    queryFn: () => api.get('/admin/mobile/push-log').then(r => r.data?.data),
  });

  const [configKey, setConfigKey] = useState('');
  const [configValue, setConfigValue] = useState('');
  const [configDescription, setConfigDescription] = useState('');

  const createConfig = useMutation({
    mutationFn: (body: any) => api.post('/admin/mobile/config', body),
    onSuccess: () => {
      showToast('Config created');
      setConfigKey(''); setConfigValue(''); setConfigDescription('');
      queryClient.invalidateQueries({ queryKey: ['mobile-config'] });
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed', 'error'),
  });

  const [versionForm, setVersionForm] = useState({ version: '', buildNumber: '', platform: 'ios', minVersion: '', isForced: false, isActive: true, releaseNotes: '', downloadUrl: '' });

  const createVersion = useMutation({
    mutationFn: (body: any) => api.post('/admin/mobile/versions', body),
    onSuccess: () => {
      showToast('Version created');
      setVersionForm({ version: '', buildNumber: '', platform: 'ios', minVersion: '', isForced: false, isActive: true, releaseNotes: '', downloadUrl: '' });
      queryClient.invalidateQueries({ queryKey: ['mobile-versions'] });
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed', 'error'),
  });

  if (dashLoading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Mobile Dashboard</h1>

      {/* Stat Cards */}
      {dashboard && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
            <div className="text-sm text-[var(--color-text-muted)]">Total Push Tokens</div>
            <div className="text-3xl font-bold mt-1">{dashboard.totalPushTokens}</div>
          </div>
          {dashboard.platformBreakdown?.map((p: any) => (
            <div key={p.platform} className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
              <div className="text-sm text-[var(--color-text-muted)] capitalize">{p.platform || 'Unknown'}</div>
              <div className="text-3xl font-bold mt-1">{p.count}</div>
            </div>
          ))}
          <div className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
            <div className="text-sm text-[var(--color-text-muted)]">App Versions</div>
            <div className="text-3xl font-bold mt-1">{dashboard.totalAppVersions}</div>
          </div>
        </div>
      )}

      {/* Push Today Stats */}
      {dashboard?.pushToday && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
            <div className="text-sm text-green-600 dark:text-green-400">Sent Today</div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-300">{dashboard.pushToday.sent}</div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
            <div className="text-sm text-blue-600 dark:text-blue-400">Delivered Today</div>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{dashboard.pushToday.delivered}</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
            <div className="text-sm text-red-600 dark:text-red-400">Failed Today</div>
            <div className="text-2xl font-bold text-red-700 dark:text-red-300">{dashboard.pushToday.failed}</div>
          </div>
        </div>
      )}

      {/* App Versions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">App Versions</h2>
          <Can permission="mobile.versions.manage">
            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--color-primary)]">+ New Version</summary>
              <div className="mt-2 p-3 border border-[var(--color-border)] rounded-lg space-y-2 bg-[var(--color-bg)]">
                <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Version" value={versionForm.version} onChange={e => setVersionForm(p => ({ ...p, version: e.target.value }))} />
                <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Build Number" value={versionForm.buildNumber} onChange={e => setVersionForm(p => ({ ...p, buildNumber: e.target.value }))} />
                <select className="w-full px-2 py-1 border rounded text-sm" value={versionForm.platform} onChange={e => setVersionForm(p => ({ ...p, platform: e.target.value }))}>
                  <option value="ios">iOS</option>
                  <option value="android">Android</option>
                  <option value="web">Web</option>
                </select>
                <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Min Version" value={versionForm.minVersion} onChange={e => setVersionForm(p => ({ ...p, minVersion: e.target.value }))} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={versionForm.isForced} onChange={e => setVersionForm(p => ({ ...p, isForced: e.target.checked }))} /> Force Update</label>
                <textarea className="w-full px-2 py-1 border rounded text-sm" placeholder="Release Notes" value={versionForm.releaseNotes} onChange={e => setVersionForm(p => ({ ...p, releaseNotes: e.target.value }))} />
                <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Download URL" value={versionForm.downloadUrl} onChange={e => setVersionForm(p => ({ ...p, downloadUrl: e.target.value }))} />
                <button className="px-3 py-1 bg-[var(--color-primary)] text-white rounded text-sm" onClick={() => createVersion.mutate(versionForm)}>Create</button>
              </div>
            </details>
          </Can>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-2">Version</th>
                <th className="text-left py-2 px-2">Build</th>
                <th className="text-left py-2 px-2">Platform</th>
                <th className="text-left py-2 px-2">Min Ver</th>
                <th className="text-left py-2 px-2">Forced</th>
                <th className="text-left py-2 px-2">Active</th>
                <th className="text-left py-2 px-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {versions?.map((v: any) => (
                <tr key={v.id} className="border-b border-[var(--color-border)]">
                  <td className="py-2 px-2">{v.version}</td>
                  <td className="py-2 px-2">{v.build_number}</td>
                  <td className="py-2 px-2 capitalize">{v.platform}</td>
                  <td className="py-2 px-2">{v.min_version}</td>
                  <td className="py-2 px-2">{v.is_forced ? 'Yes' : 'No'}</td>
                  <td className="py-2 px-2">{v.is_active ? 'Yes' : 'No'}</td>
                  <td className="py-2 px-2">{v.created_at?.slice(0, 10)}</td>
                </tr>
              ))}
              {(!versions || versions.length === 0) && <tr><td colSpan={7} className="py-4 text-center text-[var(--color-text-muted)]">No versions found</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Remote Config */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Remote Config</h2>
          <Can permission="mobile.config.manage">
            <details className="text-sm">
              <summary className="cursor-pointer text-[var(--color-primary)]">+ New Config</summary>
              <div className="mt-2 p-3 border border-[var(--color-border)] rounded-lg space-y-2 bg-[var(--color-bg)]">
                <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Config Key" value={configKey} onChange={e => setConfigKey(e.target.value)} />
                <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Config Value" value={configValue} onChange={e => setConfigValue(e.target.value)} />
                <input className="w-full px-2 py-1 border rounded text-sm" placeholder="Description" value={configDescription} onChange={e => setConfigDescription(e.target.value)} />
                <button className="px-3 py-1 bg-[var(--color-primary)] text-white rounded text-sm" onClick={() => createConfig.mutate({ configKey, configValue, description: configDescription })}>Create</button>
              </div>
            </details>
          </Can>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-2">Key</th>
                <th className="text-left py-2 px-2">Value</th>
                <th className="text-left py-2 px-2">Description</th>
                <th className="text-left py-2 px-2">Platform</th>
                <th className="text-left py-2 px-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {configs?.map((c: any) => (
                <tr key={c.id} className="border-b border-[var(--color-border)]">
                  <td className="py-2 px-2 font-mono text-xs">{c.config_key}</td>
                  <td className="py-2 px-2 font-mono text-xs max-w-[200px] truncate">{c.config_value}</td>
                  <td className="py-2 px-2 text-xs">{c.description}</td>
                  <td className="py-2 px-2 capitalize text-xs">{c.platform || 'All'}</td>
                  <td className="py-2 px-2 text-xs">{c.is_active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
              {(!configs || configs.length === 0) && <tr><td colSpan={5} className="py-4 text-center text-[var(--color-text-muted)]">No config found</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Push Log */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Push Log</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left py-2 px-2">Token</th>
                <th className="text-left py-2 px-2">Platform</th>
                <th className="text-left py-2 px-2">Status</th>
                <th className="text-left py-2 px-2">Error</th>
                <th className="text-left py-2 px-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {pushLogData?.map((l: any) => (
                <tr key={l.id} className="border-b border-[var(--color-border)]">
                  <td className="py-2 px-2 font-mono text-xs max-w-[120px] truncate">{l.token}</td>
                  <td className="py-2 px-2 capitalize text-xs">{l.platform || '-'}</td>
                  <td className="py-2 px-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      l.status === 'delivered' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      l.status === 'sent' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      l.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      'bg-gray-100 dark:bg-gray-800'
                    }`}>{l.status}</span>
                  </td>
                  <td className="py-2 px-2 text-xs max-w-[150px] truncate">{l.error_message || '-'}</td>
                  <td className="py-2 px-2 text-xs">{l.created_at?.slice(0, 19)}</td>
                </tr>
              ))}
              {(!pushLogData || pushLogData.length === 0) && <tr><td colSpan={5} className="py-4 text-center text-[var(--color-text-muted)]">No push log entries</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

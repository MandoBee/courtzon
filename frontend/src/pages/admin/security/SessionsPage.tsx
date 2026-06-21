import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Card, Badge, Modal, Spinner, Pagination } from '../../../components/ui';

export default function SessionsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'security', 'sessions', page],
    queryFn: () => api.get('/admin/security/sessions', { params: { limit: pageSize, offset: (page - 1) * pageSize } }).then(r => r.data),
  });

  const { data: suspicious } = useQuery({
    queryKey: ['admin', 'security', 'sessions', 'suspicious'],
    queryFn: () => api.get('/admin/security/sessions/suspicious').then(r => r.data?.data ?? []),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => api.post(`/admin/security/sessions/${id}/revoke`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'security', 'sessions'] });
      setSelectedSession(null);
    },
  });

  const sessions = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const formatUA = (ua: string) => {
    if (!ua) return 'Unknown';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return ua.slice(0, 40);
  };

  if (isLoading) return <Spinner size="lg" />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Active Sessions</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{total} active sessions</p>
        </div>
      </div>

      {suspicious?.length > 0 && (
        <Card className="p-4 mb-4 border-l-4 border-red-500">
          <h3 className="text-sm font-semibold text-[var(--color-error-text)] mb-2">Suspicious Sessions ({suspicious.length})</h3>
          <div className="space-y-2">
            {suspicious.slice(0, 5).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text)]">{s.full_name} ({s.email})</span>
                <span className="text-[var(--color-text-muted)]">{s.ip_address}</span>
                <button onClick={() => revokeMutation.mutate(s.id)} className="text-[var(--color-error-text)] hover:underline">Revoke</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">IP</th>
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="px-4 py-3 font-medium">Last Activity</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sessions.map((s: any) => (
                <tr key={s.id} className="hover:bg-[var(--color-bg)]/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-[var(--color-text)] font-medium">{s.full_name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{s.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs">{s.ip_address}</span>
                    {s.ip_country && <span className="text-[10px] text-[var(--color-text-muted)] ml-1">({s.ip_country})</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text)]">
                    {s.device_name || formatUA(s.user_agent)}
                    {s.os && <span className="text-[var(--color-text-muted)]"> · {s.os}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
                    {new Date(s.last_activity_at || s.created_at).toLocaleString('en-GB')}
                  </td>
                  <td className="px-4 py-3">
                    {s.suspicious ? <Badge variant="danger">Suspicious</Badge> : <Badge variant="success">Active</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedSession(s)}
                      className="text-xs text-[var(--color-primary)] hover:underline mr-2">Details</button>
                    <button
                      onClick={() => { if (confirm('Revoke this session?')) revokeMutation.mutate(s.id); }}
                      className="text-xs text-[var(--color-error-text)] hover:underline">Revoke</button>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-[var(--color-text-muted)]">No active sessions</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} />
        </div>
      )}

      <Modal open={!!selectedSession} onClose={() => setSelectedSession(null)} title="Session Details" size="md">
        {selectedSession && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-[var(--color-text-muted)]">User</p><p className="font-medium">{selectedSession.full_name}</p></div>
              <div><p className="text-xs text-[var(--color-text-muted)]">Email</p><p>{selectedSession.email}</p></div>
              <div><p className="text-xs text-[var(--color-text-muted)]">IP Address</p><p className="font-mono">{selectedSession.ip_address}</p></div>
              <div><p className="text-xs text-[var(--color-text-muted)]">Country</p><p>{selectedSession.ip_country || '—'}</p></div>
              <div><p className="text-xs text-[var(--color-text-muted)]">Device</p><p>{selectedSession.device_name || selectedSession.os || '—'}</p></div>
              <div><p className="text-xs text-[var(--color-text-muted)]">Browser</p><p>{selectedSession.browser || formatUA(selectedSession.user_agent)}</p></div>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">User Agent</p>
              <p className="text-[10px] text-[var(--color-text-muted)] break-all">{selectedSession.user_agent || '—'}</p>
            </div>
            <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
              <span>Created: {new Date(selectedSession.created_at).toLocaleString('en-GB')}</span>
              <span>Expires: {new Date(selectedSession.expires_at).toLocaleString('en-GB')}</span>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => { revokeMutation.mutate(selectedSession.id); }}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-[var(--radius-md)] hover:bg-red-700">
                Revoke Session
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

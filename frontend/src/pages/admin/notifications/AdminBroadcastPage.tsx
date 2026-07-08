import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Card, Modal, Spinner } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

interface Broadcast {
  id: number;
  title: string;
  body: string;
  broadcast_type: string;
  priority: string;
  scope: string;
  scheduled_at: string | null;
  is_active: boolean;
  created_at: string;
  created_by: number;
}

interface BroadcastsResponse {
  data: Broadcast[];
}

export default function AdminBroadcastPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('info');
  const [priority, setPriority] = useState('normal');
  const [scope, setScope] = useState<'all' | 'role'>('all');
  const [roleSlug, setRoleSlug] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'notifications', 'broadcasts'],
    queryFn: () =>
      api.get('/admin/notifications/broadcasts').then((r) => {
        const body = r.data as BroadcastsResponse;
        return body;
      }),
  });

  const broadcastMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      body: string;
      type: string;
      priority: string;
      target: { scope: string; roleSlug?: string };
      scheduledAt?: string;
    }) => api.post('/admin/notifications/broadcast', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications', 'broadcasts'] });
      setShowForm(false);
      setTitle('');
      setBody('');
      setType('info');
      setPriority('normal');
      setScope('all');
      setRoleSlug('');
      setScheduledAt('');
      showToast('Broadcast sent successfully');
    },
    onError: (err: any) => showToast(err.response?.data?.message || 'Broadcast failed', 'error'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => api.put(`/admin/notifications/broadcasts/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications', 'broadcasts'] });
      showToast('Broadcast cancelled');
    },
    onError: (err: any) => showToast(err.response?.data?.message || 'Cancel failed', 'error'),
  });

  const broadcasts = data?.data || [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Notification Broadcasts</h1>
        <Can permission="notifications.broadcast">
          <Button onClick={() => setShowForm(true)}>+ New Broadcast</Button>
        </Can>
      </div>

      {isLoading ? (
        <Spinner />
      ) : broadcasts.length === 0 ? (
        <Card>
          <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">
            No broadcasts yet. Create one to notify users.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Title</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Priority</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Scope</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Scheduled</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {broadcasts.map((b) => (
                  <tr key={b.id} className="hover:bg-[var(--color-bg)]/30">
                    <td className="px-3 py-2 text-[var(--color-text)]">{b.title}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-primary-bg)]">
                        {b.broadcast_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{b.priority}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{b.scope}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">
                      {b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : 'Immediate'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          b.is_active
                            ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]'
                            : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'
                        }`}
                      >
                        {b.is_active ? 'Active' : 'Cancelled'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {b.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelMutation.mutate(b.id)}
                          loading={cancelMutation.isPending}
                        >
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Broadcast">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="reminder">Reminder</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Target</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'all' | 'role')}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
            >
              <option value="all">All Users</option>
              <option value="role">By Role</option>
            </select>
          </div>
          {scope === 'role' && (
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Role Slug</label>
              <input
                value={roleSlug}
                onChange={(e) => setRoleSlug(e.target.value)}
                placeholder="e.g. seller, admin"
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
              />
            </div>
          )}
          <Can permission="notifications.schedule">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Schedule (optional)</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
              />
            </div>
          </Can>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              disabled={!title || !body}
              loading={broadcastMutation.isPending}
              onClick={() =>
                broadcastMutation.mutate({
                  title,
                  body,
                  type,
                  priority,
                  target: { scope, roleSlug: scope === 'role' ? roleSlug : undefined },
                  scheduledAt: scheduledAt || undefined,
                })
              }
            >
              Send Broadcast
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

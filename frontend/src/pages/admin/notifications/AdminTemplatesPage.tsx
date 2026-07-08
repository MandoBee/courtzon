import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button, Card, Modal, Spinner } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';

interface NotificationTemplate {
  id: number;
  eventName: string;
  locale: string;
  categorySlug: string;
  type: string;
  priority: string;
  titleTemplate: string;
  bodyTemplate: string | null;
  actionKey: string | null;
  routePattern: string | null;
  imageUrl: string | null;
  actions: any[] | null;
  version: number;
}

interface TemplateVersion {
  id: number;
  templateId: number;
  version: number;
  titleTemplate: string;
  bodyTemplate: string | null;
  actionKey: string | null;
  routePattern: string | null;
  createdAt: string;
}

interface TemplatesResponse {
  data: NotificationTemplate[];
}

interface VersionsResponse {
  data: TemplateVersion[];
}

export default function AdminTemplatesPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [versionsModalId, setVersionsModalId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'notifications', 'templates'],
    queryFn: () =>
      api.get('/admin/notifications/templates').then((r) => {
        const body = r.data as TemplatesResponse;
        return body;
      }),
  });

  const { data: versionsData } = useQuery({
    queryKey: ['admin', 'notifications', 'templates', versionsModalId, 'versions'],
    queryFn: () =>
      api.get(`/admin/notifications/templates/${versionsModalId}/versions`).then((r) => {
        const body = r.data as VersionsResponse;
        return body;
      }),
    enabled: versionsModalId !== null,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: number; titleTemplate: string; bodyTemplate: string }) =>
      api.put(`/admin/notifications/templates/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications', 'templates'] });
      setEditingId(null);
      showToast('Template updated');
    },
    onError: (err: any) =>
      showToast(err.response?.data?.message || 'Update failed', 'error'),
  });

  const rollbackMutation = useMutation({
    mutationFn: ({ id, targetVersion }: { id: number; targetVersion: number }) =>
      api.post(`/admin/notifications/templates/${id}/rollback`, { targetVersion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications', 'templates'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications', 'templates', versionsModalId, 'versions'] });
      showToast('Template rolled back');
    },
    onError: (err: any) =>
      showToast(err.response?.data?.message || 'Rollback failed', 'error'),
  });

  const templates = data?.data || [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Notification Templates</h1>
        <span className="text-sm text-[var(--color-text-muted)]">{templates.length} templates</span>
      </div>

      {isLoading ? (
        <Spinner />
      ) : templates.length === 0 ? (
        <Card>
          <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">
            No templates found. They are seeded from the notification system.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Event</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Category</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Title</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Body</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Locale</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Version</th>
                  <th className="text-left px-3 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--color-bg)]/30">
                    <td className="px-3 py-2 font-mono text-xs text-[var(--color-text)] truncate max-w-[160px]" title={t.eventName}>
                      {t.eventName}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{t.categorySlug}</td>
                    <td className="px-3 py-2 text-[var(--color-text)] truncate max-w-[200px]" title={t.titleTemplate}>
                      {t.titleTemplate}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)] truncate max-w-[200px]" title={t.bodyTemplate || ''}>
                      {t.bodyTemplate || '-'}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">{t.locale}</td>
                    <td className="px-3 py-2 text-[var(--color-text-muted)]">v{t.version}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(t.id);
                            setEditTitle(t.titleTemplate);
                            setEditBody(t.bodyTemplate || '');
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setVersionsModalId(t.id)}
                        >
                          History
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={editingId !== null}
        onClose={() => setEditingId(null)}
        title="Edit Template"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Title Template</label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Body Template</label>
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
            <Button
              disabled={!editTitle}
              loading={updateMutation.isPending}
              onClick={() =>
                editingId &&
                updateMutation.mutate({ id: editingId, titleTemplate: editTitle, bodyTemplate: editBody })
              }
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={versionsModalId !== null}
        onClose={() => setVersionsModalId(null)}
        title="Version History"
      >
        {!versionsData ? (
          <Spinner />
        ) : versionsData.data?.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No version history available.</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {versionsData?.data?.map((v) => (
              <div key={v.id} className="p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)] border border-[var(--color-border)]">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[var(--color-text)]">v{v.version}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {new Date(v.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text)] truncate" title={v.titleTemplate}>
                  Title: {v.titleTemplate}
                </p>
                {v.bodyTemplate && (
                  <p className="text-xs text-[var(--color-text-muted)] truncate mt-0.5" title={v.bodyTemplate}>
                    Body: {v.bodyTemplate}
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    if (versionsModalId !== null) {
                      rollbackMutation.mutate({ id: versionsModalId, targetVersion: v.version });
                    }
                  }}
                  loading={rollbackMutation.isPending}
                >
                  Rollback to this version
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

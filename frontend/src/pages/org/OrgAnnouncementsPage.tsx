import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { getErrorMessage } from '../../utils/errors';

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const PRIORITY_CLASSES: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
};

const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-500',
  published: 'bg-green-100 text-green-700',
};

export default function OrgAnnouncementsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formPriority, setFormPriority] = useState('normal');
  const [formPublish, setFormPublish] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: announcements, isLoading } = useQuery({
    queryKey: ['org-announcements', orgId],
    queryFn: () => api.get(`/org/${orgId}/announcements`).then((r) => r.data?.data || []),
    enabled: !!orgId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['org-announcements', orgId] });

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = { title: formTitle, content: formContent, priority: formPriority, published: formPublish };
      if (editing) {
        return api.put(`/org/${orgId}/announcements/${editing.id}`, body);
      }
      return api.post(`/org/${orgId}/announcements`, body);
    },
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
      setEditing(null);
      showToast(editing ? 'Announcement updated' : 'Announcement created');
    },
    onError: (err) => showToast(getErrorMessage(err, 'Failed to save announcement'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/org/${orgId}/announcements/${id}`),
    onSuccess: () => { invalidate(); setDeleteId(null); showToast('Announcement deleted', 'warning'); },
    onError: (err) => showToast(getErrorMessage(err, 'Failed to delete'), 'error'),
  });

  const publishMutation = useMutation({
    mutationFn: (id: number) => api.post(`/org/${orgId}/announcements/${id}/publish`),
    onSuccess: () => { invalidate(); showToast('Announcement published'); },
    onError: (err) => showToast(getErrorMessage(err, 'Failed to publish'), 'error'),
  });

  const openCreate = () => {
    setEditing(null);
    setFormTitle('');
    setFormContent('');
    setFormPriority('normal');
    setFormPublish(false);
    setModalOpen(true);
  };

  const openEdit = (a: any) => {
    setEditing(a);
    setFormTitle(a.title || '');
    setFormContent(a.content || '');
    setFormPriority(a.priority || 'normal');
    setFormPublish(a.status === 'published');
    setModalOpen(true);
  };

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;

  const rows: any[] = announcements || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">📢 Announcements</h1>
        <Can permission="org.announcements.manage">
          <button onClick={openCreate} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90">
            + New Announcement
          </button>
        </Can>
      </div>

      {isLoading ? (
        <div className="animate-pulse h-40 bg-[var(--color-surface)] rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No announcements yet.</p>
      ) : (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Title</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Priority</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Published At</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a: any) => (
                  <tr key={a.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    <td className="px-4 py-3 text-[var(--color-text)] font-medium">{a.title}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${PRIORITY_CLASSES[a.priority] || ''}`}>
                        {PRIORITY_LABELS[a.priority] || a.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_CLASSES[a.status] || ''}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)]">
                      {a.published_at ? new Date(a.published_at).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Can permission="org.announcements.manage">
                        <div className="flex items-center justify-end gap-2">
                          {a.status !== 'published' && (
                            <button
                              onClick={() => publishMutation.mutate(a.id)}
                              disabled={publishMutation.isPending}
                              className="px-2 py-1 text-xs rounded border border-green-300 bg-green-50 text-green-700 hover:opacity-80 disabled:opacity-40"
                            >
                              Publish
                            </button>
                          )}
                          <button onClick={() => openEdit(a)} className="px-2 py-1 text-xs border rounded hover:bg-[var(--color-primary)]/10">Edit</button>
                          <button
                            onClick={() => setDeleteId(a.id)}
                            className="px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </Can>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Announcement' : 'New Announcement'}>
        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Title *</span>
            <input
              required value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Announcement title"
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Content *</span>
            <textarea
              required value={formContent} onChange={(e) => setFormContent(e.target.value)}
              placeholder="Announcement content"
              rows={4}
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Priority</span>
              <select value={formPriority} onChange={(e) => setFormPriority(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                checked={formPublish}
                onChange={(e) => setFormPublish(e.target.checked)}
                className="accent-[var(--color-primary)]"
              />
              <span className="text-sm text-[var(--color-text)]">Publish immediately</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-[var(--color-text-muted)]">Cancel</button>
            <button type="submit" disabled={saveMutation.isPending}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Announcement">
        <p className="text-sm text-[var(--color-text-muted)]">Are you sure you want to delete this announcement? This action cannot be undone.</p>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm text-[var(--color-text-muted)]">Cancel</button>
          <button
            onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
            disabled={deleteMutation.isPending}
            className="px-4 py-2 bg-[var(--color-error)] text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

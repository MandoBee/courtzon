import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { getErrorMessage } from '../../utils/errors';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OrgDocumentsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ['org-documents', orgId],
    queryFn: () => api.get(`/org/${orgId}/documents`).then((r) => r.data?.data || []),
    enabled: !!orgId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['org-documents', orgId] });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/org/${orgId}/documents`, fd);
    },
    onSuccess: () => { invalidate(); showToast('Document uploaded'); },
    onError: (err) => showToast(getErrorMessage(err, 'Failed to upload document'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/org/${orgId}/documents/${id}`),
    onSuccess: () => { invalidate(); setDeleteId(null); showToast('Document deleted', 'warning'); },
    onError: (err) => showToast(getErrorMessage(err, 'Failed to delete document'), 'error'),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;

  const rows: any[] = documents || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">📄 Documents</h1>
        <Can permission="org.documents.manage">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {uploadMutation.isPending ? 'Uploading…' : '+ Upload Document'}
          </button>
        </Can>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png"
      />

      {isLoading ? (
        <div className="animate-pulse h-40 bg-[var(--color-surface)] rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No documents uploaded yet.</p>
      ) : (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-[var(--color-text-muted)]">Uploaded</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Size</th>
                  <th className="text-right px-4 py-3 font-medium text-[var(--color-text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d: any) => {
                  const ext = d.file_name?.split('.').pop()?.toUpperCase() || '—';
                  return (
                    <tr key={d.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                      <td className="px-4 py-3 text-[var(--color-text)] font-medium">{d.file_name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-muted)]">{ext}</span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)]">
                        {d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--color-text-muted)]">{d.file_size ? formatFileSize(d.file_size) : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Can permission="org.documents.manage">
                          {d.file_url && (
                            <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 text-xs border rounded hover:bg-[var(--color-primary)]/10 mr-2">
                              View
                            </a>
                          )}
                          <button
                            onClick={() => setDeleteId(d.id)}
                            className="px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </Can>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Document">
        <p className="text-sm text-[var(--color-text-muted)]">Are you sure you want to delete this document? This action cannot be undone.</p>
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

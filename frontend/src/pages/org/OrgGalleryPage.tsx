import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { getErrorMessage } from '../../utils/errors';

export default function OrgGalleryPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: images, isLoading } = useQuery({
    queryKey: ['org-gallery', orgId],
    queryFn: () => api.get(`/org/${orgId}/gallery`).then((r) => r.data?.data || []),
    enabled: !!orgId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['org-gallery', orgId] });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('image', file);
      return api.post(`/org/${orgId}/gallery`, fd);
    },
    onSuccess: () => { invalidate(); showToast('Image uploaded'); },
    onError: (err) => showToast(getErrorMessage(err, 'Failed to upload image'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/org/${orgId}/gallery/${id}`),
    onSuccess: () => { invalidate(); setDeleteId(null); showToast('Image deleted', 'warning'); },
    onError: (err) => showToast(getErrorMessage(err, 'Failed to delete image'), 'error'),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;

  const items: any[] = images || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">🖼️ Gallery</h1>
        <Can permission="org.gallery.manage">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {uploadMutation.isPending ? 'Uploading…' : '+ Upload Image'}
          </button>
        </Can>
      </div>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept="image/*" />

      {isLoading ? (
        <div className="animate-pulse h-40 bg-[var(--color-surface)] rounded-xl" />
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No images in the gallery yet.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((img: any) => (
            <div key={img.id} className="group relative bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] overflow-hidden">
              <button onClick={() => setPreviewUrl(img.image_url || img.url)} className="w-full block">
                <img
                  src={img.image_url || img.url}
                  alt={img.caption || img.file_name || 'Gallery image'}
                  className="w-full h-40 object-cover"
                />
              </button>
              <div className="p-2 flex items-center justify-between">
                <span className="text-xs text-[var(--color-text-muted)] truncate">{img.caption || img.file_name || ''}</span>
                <Can permission="org.gallery.manage">
                  <button
                    onClick={() => setDeleteId(img.id)}
                    className="text-xs text-[var(--color-error)] hover:underline shrink-0 ml-1"
                  >
                    Delete
                  </button>
                </Can>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Image">
        <p className="text-sm text-[var(--color-text-muted)]">Are you sure you want to delete this image? This action cannot be undone.</p>
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

      <Modal open={previewUrl !== null} onClose={() => setPreviewUrl(null)} title="Image Preview" size="xl">
        {previewUrl && (
          <img src={previewUrl} alt="Preview" className="w-full h-auto rounded" />
        )}
      </Modal>
    </div>
  );
}

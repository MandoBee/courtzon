import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { EntityImage } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { getErrorMessage } from '../../utils/errors';

export default function OrgProfilePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data: profile, isLoading } = useQuery({
    queryKey: ['org-profile', orgId],
    queryFn: () => api.get(`/org/${orgId}/profile`).then((r) => r.data),
    enabled: !!orgId,
  });

  const mutation = useMutation({
    mutationFn: (body: any) => api.put(`/org/${orgId}/profile`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-profile', orgId] });
      qc.invalidateQueries({ queryKey: ['org-info', orgId] });
      setEditOpen(false);
      showToast('Profile updated');
    },
    onError: (err) => showToast(getErrorMessage(err, 'Failed to update profile'), 'error'),
  });

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-surface)] rounded-xl" />;
  if (!profile) return <div className="text-[var(--color-text-muted)]">Organisation not found</div>;

  const openEdit = () => {
    setForm({ name: profile.name, description: profile.description, email: profile.email, phone: profile.phone, website: profile.website });
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Club Profile</h1>
        <Can permission="org.settings.edit">
          <button onClick={openEdit} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90">Edit Profile</button>
        </Can>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        {profile.cover_image_url && (
          <div className="h-48 w-full overflow-hidden">
            <img src={profile.cover_image_url} alt="Cover" className="w-full h-full object-cover" />
          </div>
        )}
        <div className={`p-6 ${profile.cover_image_url ? '-mt-16' : ''} relative`}>
          <div className="flex items-start gap-6">
            <EntityImage src={profile.logo_url} name={profile.name} className="w-24 h-24 rounded-xl border-4 border-[var(--color-surface)] shadow-lg" />
            <div className="flex-1 min-w-0 pt-4">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-[var(--color-text)]">{profile.name}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${profile.is_verified ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                  {profile.is_verified ? 'Verified' : 'Unverified'}
                </span>
              </div>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">{profile.slug}</p>
              {profile.description && <p className="text-sm text-[var(--color-text)] mt-3">{profile.description}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Contact</h3>
          <dl className="space-y-2 text-sm">
            {profile.email && <><dt className="text-[var(--color-text-muted)]">Email</dt><dd className="text-[var(--color-text)]">{profile.email}</dd></>}
            {profile.phone && <><dt className="text-[var(--color-text-muted)] mt-2">Phone</dt><dd className="text-[var(--color-text)]">{profile.phone}</dd></>}
            {profile.website && <><dt className="text-[var(--color-text-muted)] mt-2">Website</dt><dd className="text-[var(--color-text)]">{profile.website}</dd></>}
          </dl>
        </div>
        <div className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
          <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Details</h3>
          <dl className="space-y-2 text-sm">
            {profile.org_type_name && <><dt className="text-[var(--color-text-muted)]">Type</dt><dd className="text-[var(--color-text)]">{profile.org_type_name}</dd></>}
            {profile.country_name && <><dt className="text-[var(--color-text-muted)] mt-2">Country</dt><dd className="text-[var(--color-text)]">{profile.country_name}</dd></>}
          </dl>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Profile">
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-3">
          <Can permission="organisations.edit.name">
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Name</span>
              <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
            </label>
          </Can>
          <Can permission="organisations.edit.description">
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Description</span>
              <textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
            </label>
          </Can>
          <Can permission="organisations.edit.email">
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Email</span>
              <input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
            </label>
          </Can>
          <Can permission="organisations.edit.phone">
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Phone</span>
              <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
            </label>
          </Can>
          <Can permission="organisations.edit.website">
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Website</span>
              <input value={form.website || ''} onChange={(e) => setForm({ ...form, website: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
            </label>
          </Can>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2 text-sm text-[var(--color-text-muted)]">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {mutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

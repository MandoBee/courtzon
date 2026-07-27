import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { SkeletonRow } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';

export default function RefereeProfilePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['referee-profile'],
    queryFn: () => api.get('/referee/profile').then((r) => r.data),
  });

  const [bio, setBio] = useState('');
  const [certificationsStr, setCertificationsStr] = useState('');
  const [sports, setSports] = useState('');

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.put('/referee/profile', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referee-profile'] });
      showToast(t('referee.profile.updated', 'Profile updated successfully'));
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || t('common.error', 'Something went wrong'), 'error');
    },
  });

  const handleSave = () => {
    let certs: any[] = [];
    try { certs = JSON.parse(certificationsStr); } catch { certs = []; }
    updateMutation.mutate({ bio, certifications: certs, sports });
  };

  if (isLoading) return <div className="py-8"><SkeletonRow count={4} /></div>;

  return (
    <div className="space-y-5 md:space-y-6 pb-4 max-w-2xl">
      <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">
        {t('referee.profile.title', 'Referee Profile')}
      </h1>

      <Can permission="referee.profile.view">
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)]">{t('referee.profile.bio', 'Bio')}</label>
            <p className="text-sm text-[var(--color-text)]">{profile?.bio || '—'}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)]">{t('referee.profile.certifications', 'Certifications')}</label>
            <p className="text-sm text-[var(--color-text)]">
              {profile?.certifications?.length ? profile.certifications.map((c: any) => typeof c === 'string' ? c : c.name || c.title).join(', ') : '—'}
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)]">{t('referee.profile.sports', 'Sports')}</label>
            <p className="text-sm text-[var(--color-text)]">{profile?.sports || '—'}</p>
          </div>
        </div>
      </Can>

      <Can permission="referee.profile.update">
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">{t('referee.profile.edit_title', 'Edit Profile')}</h2>

          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)]">{t('referee.profile.bio', 'Bio')}</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text)]"
              rows={3}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)]">{t('referee.profile.certifications', 'Certifications (JSON array)')}</label>
            <input
              value={certificationsStr}
              onChange={(e) => setCertificationsStr(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text)]"
              placeholder='[{"name": "FIFA Referee", "year": 2024}]'
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)]">{t('referee.profile.sports', 'Sports')}</label>
            <input
              value={sports}
              onChange={(e) => setSports(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-[var(--color-text)]"
              placeholder="Football, Basketball"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50"
          >
            {updateMutation.isPending ? t('common.saving', 'Saving...') : t('common.save_changes', 'Save Changes')}
          </button>
        </div>
      </Can>
    </div>
  );
}

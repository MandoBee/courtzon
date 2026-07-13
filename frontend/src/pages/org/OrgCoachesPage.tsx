import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { Can } from '../../permissions/Can';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';

const statusBadge: Record<string, string> = {
  accepted: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  pending: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  rejected: 'bg-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-surface)] text-[var(--color-text-muted)]',
};

export default function OrgCoachesPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [coachId, setCoachId] = useState<number | ''>('');
  const [coachSplit, setCoachSplit] = useState('70');
  const [orgSplit, setOrgSplit] = useState('30');
  const [hourlyRate, setHourlyRate] = useState('');

  const { data: coaches, isLoading } = useQuery({
    queryKey: ['org-coaches', orgId],
    queryFn: () => api.get(`/org/${orgId}/coaches`).then((r) => r.data?.data || []),
    enabled: !!orgId,
  });

  const { data: directory } = useQuery({
    queryKey: ['org-coach-directory', orgId],
    queryFn: () => api.get(`/org/${orgId}/coaches/directory`).then((r) => r.data?.data || []),
    enabled: !!orgId && inviteOpen,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['org-coaches', orgId] });
    qc.invalidateQueries({ queryKey: ['org-coach-directory', orgId] });
  };
  const errMsg = (err: any) => err?.response?.data?.message || err?.message || 'Request failed';

  const inviteMutation = useMutation({
    mutationFn: () => api.post(`/org/${orgId}/coaches/invite`, {
      coachId: Number(coachId),
      coachSplitPct: Number(coachSplit),
      orgSplitPct: Number(orgSplit),
      hourlyRate: hourlyRate ? Number(hourlyRate) : undefined,
    }),
    onSuccess: () => { invalidate(); setInviteOpen(false); setCoachId(''); showToast('Invite sent to coach'); },
    onError: (err) => showToast('Failed to send invite: ' + errMsg(err), 'error'),
  });

  const removeMutation = useMutation({
    mutationFn: (cId: number) => api.delete(`/org/${orgId}/coaches/${cId}`),
    onSuccess: () => { invalidate(); showToast('Coach agreement removed', 'warning'); },
    onError: (err) => showToast('Failed to remove: ' + errMsg(err), 'error'),
  });

  if (!orgId) return <div>Invalid organisation</div>;
  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-border)] bg-[var(--color-surface)] rounded-xl" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">🎾 Coaches</h1>
        <Can permission="org.coaches.manage">
          <button onClick={() => { setCoachId(''); setCoachSplit('70'); setOrgSplit('30'); setHourlyRate(''); setInviteOpen(true); }}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90">
            + Invite Coach
          </button>
        </Can>
      </div>

      <p className="text-sm text-[var(--color-text-muted)]">
        Invite approved coaches to your organisation with a revenue split. The coach must accept the invite before the agreement becomes active.
      </p>

      {!coaches?.length ? (
        <p className="text-[var(--color-text-muted)]">No coach agreements yet.</p>
      ) : (
        <div className="grid gap-3">
          {coaches.map((c: any) => (
            <div key={c.id} className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)] flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-text)] truncate">{c.coach_name || '—'}</p>
                <p className="text-xs text-[var(--color-text-muted)] truncate">
                  {c.coach_email}
                  {(c.hourly_rate || c.coach_global_rate) && <> • {formatPrice(Number(c.hourly_rate || c.coach_global_rate), c.currency_code)}/hr</>}
                  {c.hourly_rate ? ' (org rate)' : ''}
                  {' • '}Coach {c.coach_split_pct}% / Org {c.org_split_pct}%
                  {c.initiated_by === 'org' ? ' • org-initiated' : ' • coach-initiated'}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[c.status] || statusBadge.rejected}`}>
                  {c.status === 'accepted' ? 'Active' : c.status === 'pending' ? 'Pending' : 'Rejected'}
                </span>
                <Can permission="org.coaches.manage">
                  <button
                    onClick={() => { if (confirm(`Remove agreement with ${c.coach_name || c.coach_email}?`)) removeMutation.mutate(c.coach_id); }}
                    className="text-sm text-[var(--color-error)] hover:underline"
                  >
                    Remove
                  </button>
                </Can>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Coach">
        <form onSubmit={(e) => { e.preventDefault(); if (coachId) inviteMutation.mutate(); }} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Coach *</span>
            <select required value={coachId} onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : '';
              setCoachId(id);
              const coach = (directory || []).find((d: any) => d.coach_id === id);
              setHourlyRate(coach?.hourly_rate ? String(coach.hourly_rate) : '');
            }}
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]">
              <option value="">Select a coach</option>
              {(directory || []).map((d: any) => (
                <option key={d.coach_id} value={d.coach_id}>
                  {d.full_name} ({d.email})
                </option>
              ))}
            </select>
            {directory && directory.length === 0 && (
              <span className="text-xs text-[var(--color-text-muted)]">No invitable coaches available.</span>
            )}
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Hourly rate (optional — overrides coach's default)</span>
            <input type="number" min="0" step="0.01" value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              placeholder={coachId ? `Coach's default rate` : 'Select a coach first'}
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Coach split (%)</span>
              <input type="number" min="0" max="100" value={coachSplit}
                onChange={(e) => { setCoachSplit(e.target.value); setOrgSplit(String(100 - Number(e.target.value || 0))); }}
                className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Org split (%)</span>
              <input type="number" min="0" max="100" value={orgSplit}
                onChange={(e) => { setOrgSplit(e.target.value); setCoachSplit(String(100 - Number(e.target.value || 0))); }}
                className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setInviteOpen(false)} className="px-4 py-2 text-sm text-[var(--color-text-muted)]">Cancel</button>
            <button type="submit" disabled={inviteMutation.isPending || !coachId}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {inviteMutation.isPending ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';
import { getErrorMessage } from '../../utils/errors';

export default function OrgWorkingHoursPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [expandedBranch, setExpandedBranch] = useState<number | null>(null);
  const [editBranchId, setEditBranchId] = useState<number | null>(null);
  const [editOpening, setEditOpening] = useState('');
  const [editClosing, setEditClosing] = useState('');

  const { data: branches, isLoading } = useQuery({
    queryKey: ['org-working-hours', orgId],
    queryFn: () => api.get(`/org/${orgId}/working-hours`).then((r) => r.data || []),
    enabled: !!orgId,
  });

  const mutation = useMutation({
    mutationFn: ({ branchId, opening_time, closing_time }: any) =>
      api.put(`/org/${orgId}/branches/${branchId}/hours`, { opening_time, closing_time }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-working-hours', orgId] });
      setEditBranchId(null);
      showToast('Hours updated');
    },
    onError: (err) => showToast(getErrorMessage(err, 'Failed to update hours'), 'error'),
  });

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-surface)] rounded-xl" />;

  const items: any[] = branches || [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Working Hours</h1>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No branches found.</p>
      ) : (
        <div className="grid gap-4">
          {items.map((b: any) => (
            <div key={b.id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
              <button
                onClick={() => setExpandedBranch(expandedBranch === b.id ? null : b.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-[var(--color-bg)] transition-colors text-left"
              >
                <div>
                  <p className="font-medium text-[var(--color-text)]">{b.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {b.opening_time ? b.opening_time.slice(0, 5) : '—'} – {b.closing_time ? b.closing_time.slice(0, 5) : '—'}
                    {b.timezone ? ` (${b.timezone})` : ''}
                  </p>
                </div>
                <span className="text-[var(--color-text-muted)] text-lg">{expandedBranch === b.id ? '−' : '+'}</span>
              </button>

              {expandedBranch === b.id && (
                <div className="px-4 pb-4 border-t border-[var(--color-border)] pt-3 space-y-4">
                  <div className="flex items-center gap-2">
                    <Can permission="org.branches.manage">
                      <button
                        onClick={() => { setEditBranchId(b.id); setEditOpening(b.opening_time || ''); setEditClosing(b.closing_time || ''); }}
                        className="text-xs px-3 py-1.5 border border-[var(--color-border)] rounded-md hover:bg-[var(--color-primary)]/10 font-medium"
                      >
                        Edit Hours
                      </button>
                    </Can>
                  </div>

                  {b.holidays && b.holidays.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2">Holidays</p>
                      <div className="space-y-1">
                        {b.holidays.map((h: any) => (
                          <div key={h.id} className="text-xs text-[var(--color-text)] flex items-center gap-2">
                            <span>{h.holiday_date?.split('T')[0]}</span>
                            {h.name && <span className="text-[var(--color-text-muted)]">({h.name})</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {b.resources && b.resources.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2">Resource Hours</p>
                      <div className="space-y-1.5">
                        {b.resources.map((r: any) => (
                          <div key={r.id} className="flex items-center justify-between text-sm bg-[var(--color-bg)] rounded-md px-3 py-2">
                            <span className="text-[var(--color-text)]">{r.name} {r.sport_name ? `(${r.sport_name})` : ''}</span>
                            <span className="text-[var(--color-text-muted)] text-xs">
                              {r.opening_time ? r.opening_time.slice(0, 5) : '—'} – {r.closing_time ? r.closing_time.slice(0, 5) : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {editBranchId === b.id && (
                    <div className="border border-[var(--color-border)] rounded-md p-3 space-y-2">
                      <div className="flex gap-2">
                        <label className="flex-1">
                          <span className="text-xs text-[var(--color-text-muted)]">Opening</span>
                          <input type="time" value={editOpening} onChange={(e) => setEditOpening(e.target.value)}
                            className="mt-1 w-full px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
                        </label>
                        <label className="flex-1">
                          <span className="text-xs text-[var(--color-text-muted)]">Closing</span>
                          <input type="time" value={editClosing} onChange={(e) => setEditClosing(e.target.value)}
                            className="mt-1 w-full px-2 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
                        </label>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditBranchId(null)} className="text-xs text-[var(--color-text-muted)]">Cancel</button>
                        <button onClick={() => mutation.mutate({ branchId: b.id, opening_time: editOpening, closing_time: editClosing })}
                          disabled={mutation.isPending}
                          className="text-xs px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-md font-medium disabled:opacity-50">
                          {mutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

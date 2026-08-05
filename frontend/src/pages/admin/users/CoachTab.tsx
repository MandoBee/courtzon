import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Button } from '../../../components/ui';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { formatPrice } from '../../../utils/currency';
import { getErrorMessage } from '../../../utils/errors';

interface CoachTabProps {
  userId: number;
  coachData: any;
  sports: any[];
  isCoach: boolean;
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const STATUS_BADGE: Record<string, string> = {
  approved: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  accepted: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  completed: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  pending: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  scheduled: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  confirmed: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  in_progress: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  rejected: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  cancelled: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  no_show: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  none: 'bg-[var(--color-border)] text-[var(--color-text-muted)]',
};

function Badge({ value, map = STATUS_BADGE, fallback = 'bg-[var(--color-border)] text-[var(--color-text-muted)]' }: { value: any; map?: Record<string, string>; fallback?: string }) {
  return (
    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${map[String(value)] || fallback}`}>
      {value == null || value === '' ? '—' : String(value).charAt(0).toUpperCase() + String(value).slice(1).replace(/_/g, ' ')}
    </span>
  );
}

function parseJsonSafe(value: any, fallback: any = []) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}

function DetailRow({ label, children }: { label: string; children: any }) {
  return (
    <div>
      <label className="block text-xs text-[var(--color-text-muted)] mb-1">{label}</label>
      <div className="text-sm font-medium text-[var(--color-text)]">{children}</div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
      <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
      <div className="text-lg font-bold text-[var(--color-text)]">{value == null || value === '' ? '—' : value}</div>
      {sub && <div className="text-xs text-[var(--color-text-muted)]">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div>
      <h4 className="font-medium text-[var(--color-text)] mb-3">{title}</h4>
      {children}
    </div>
  );
}

export default function CoachTab({ userId, coachData, sports, isCoach }: CoachTabProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const coach = coachData?.coach;
  const agreements = coachData?.agreements || [];
  const availability = coachData?.availability || [];
  const blackouts = coachData?.blackouts || [];
  const reviews = coachData?.reviews || [];
  const sessions = coachData?.sessions || [];
  const summary = coachData?.summary || {};

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId, 'coach'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    queryClient.invalidateQueries({ queryKey: ['admin-coaches'] });
  };

  const assignMutation = useMutation({
    mutationFn: (value: boolean) => api.put(`/admin/users/${userId}`, { isCoach: value }),
    onSuccess: () => { invalidate(); showToast('Coach assignment updated!'); },
    onError: (err: any) => showToast('Failed to update coach assignment: ' + getErrorMessage(err), 'error'),
  });

  const approveMutation = useMutation({
    mutationFn: () => api.patch(`/admin/users/${userId}/coach/approve`),
    onSuccess: () => { invalidate(); showToast('Coach application approved!'); },
    onError: (err: any) => showToast('Failed to approve: ' + getErrorMessage(err), 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => api.patch(`/admin/users/${userId}/coach/reject`, { reason }),
    onSuccess: () => { invalidate(); showToast('Coach application rejected.'); },
    onError: (err: any) => showToast('Failed to reject: ' + getErrorMessage(err), 'error'),
  });

  const verifyMutation = useMutation({
    mutationFn: () => api.patch(`/coaches/${coach?.id}/verify`),
    onSuccess: () => { invalidate(); showToast('Coach verified!'); },
    onError: (err: any) => showToast('Failed to verify: ' + getErrorMessage(err), 'error'),
  });

  const toggleMutation = useMutation({
    mutationFn: () => api.patch(`/coaches/${coach?.id}/toggle`),
    onSuccess: () => { invalidate(); showToast('Availability toggled!'); },
    onError: (err: any) => showToast('Failed to toggle: ' + getErrorMessage(err), 'error'),
  });

  const sportIds = parseJsonSafe(coach?.sports);
  const coachSportNames = sportIds
    .map((id: any) => sports.find((s: any) => s.id === Number(id))?.name)
    .filter(Boolean);
  const certifications = parseJsonSafe(coach?.certifications);

  const upcoming = sessions.filter((s: any) => ['scheduled', 'confirmed', 'in_progress'].includes(s.status));
  const previous = sessions.filter((s: any) => ['completed', 'cancelled', 'no_show'].includes(s.status));

  const toggle = (
    <Can permission="coaches.assign">
      <label className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" className="sr-only peer" checked={!!isCoach} onChange={(e: any) => assignMutation.mutate(e.target.checked)} />
        <div className="w-9 h-5 bg-[var(--color-border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--color-border)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]" />
      </label>
    </Can>
  );

  if (!coach) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-muted)]">This user is not a coach.</p>
        <div className="flex items-center gap-3">
          {toggle}
          <span className="text-sm font-medium text-[var(--color-text)]">Assign as Coach</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {toggle}
          <span className="text-sm font-medium text-[var(--color-text)]">Assign as Coach</span>
          <Badge value={coach.status} />
        </div>
        <div className="flex items-center gap-2">
          {coach.status === 'pending' && (
            <Can permission="coaches.approve">
              <Button onClick={() => approveMutation.mutate()} loading={approveMutation.isPending} className="!px-3 !py-1.5 text-xs">Approve</Button>
              <Button
                variant="ghost"
                className="!px-3 !py-1.5 text-xs !text-[var(--color-error)]"
                loading={rejectMutation.isPending}
                onClick={() => {
                  const reason = window.prompt('Rejection reason (optional):') ?? '';
                  rejectMutation.mutate(reason);
                }}
              >
                Reject
              </Button>
            </Can>
          )}
          {coach.status === 'approved' && !coach.is_verified && (
            <Can permission="coaches.verify">
              <Button onClick={() => verifyMutation.mutate()} loading={verifyMutation.isPending} className="!px-3 !py-1.5 text-xs">Verify</Button>
            </Can>
          )}
          {coach.status === 'approved' && (
            <Can permission="coaches.toggle">
              <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => toggleMutation.mutate()} loading={toggleMutation.isPending}>
                {coach.is_available ? 'Disable' : 'Enable'}
              </Button>
            </Can>
          )}
        </div>
      </div>

      {coach.status === 'rejected' && coach.rejected_reason && (
        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-error-bg)]">
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">Rejection Reason</label>
          <p className="text-sm text-[var(--color-text)]">{coach.rejected_reason}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Approval Status" value={coach.status} />
        <StatCard label="Verification" value={coach.is_verified ? 'Verified' : 'Not Verified'} />
        <StatCard label="Availability" value={coach.is_available ? 'Available' : 'Unavailable'} />
        <StatCard label="Rating" value={coach.rating_avg ? `${Number(coach.rating_avg).toFixed(1)} ★` : '—'} sub={`${coach.rating_count || 0} reviews`} />
      </div>

      <Section title="Profile">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DetailRow label="Experience">{coach.experience_years ? `${coach.experience_years} years` : '—'}</DetailRow>
          <DetailRow label="Hourly Rate">
            {coach.hourly_rate != null ? `${formatPrice(Number(coach.hourly_rate))}/hr` : '—'}
          </DetailRow>
          <DetailRow label="Coach Since">{coach.created_at ? new Date(coach.created_at).toLocaleDateString('en-GB') : '—'}</DetailRow>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Coach Bio</label>
            <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">{coach.bio || '—'}</p>
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Sports</label>
            {coachSportNames.length ? (
              <div className="flex flex-wrap gap-2">
                {coachSportNames.map((name: any) => (
                  <span key={name} className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]">{name}</span>
                ))}
              </div>
            ) : <p className="text-sm text-[var(--color-text-muted)]">—</p>}
          </div>
          {certifications.length > 0 && (
            <div className="md:col-span-3">
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Certifications</label>
              <div className="space-y-1">
                {certifications.map((c: any, i: number) => (
                  <p key={i} className="text-sm text-[var(--color-text)]">
                    • {typeof c === 'string' ? c : c?.name || JSON.stringify(c)}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Organization Agreements">
        {!agreements.length ? (
          <p className="text-sm text-[var(--color-text-muted)]">No organization agreements</p>
        ) : (
          <div className="space-y-2">
            {agreements.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between bg-[var(--color-bg)] px-3 py-2.5 rounded-[var(--radius-md)]">
                <div>
                  <div className="text-sm font-medium text-[var(--color-text)]">{a.organisation_name}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    Coach: {a.coach_split_pct}% • Org: {a.org_split_pct}%{a.hourly_rate != null ? ` • ${a.hourly_rate}/hr` : ''}
                  </div>
                </div>
                <Badge value={a.status} map={{ accepted: STATUS_BADGE.approved, pending: STATUS_BADGE.pending, rejected: STATUS_BADGE.rejected }} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Weekly Availability">
        {!availability.length && !blackouts.length ? (
          <p className="text-sm text-[var(--color-text-muted)]">No availability configured</p>
        ) : (
          <div className="space-y-2">
            {DAY_LABELS.map((day, i) => {
              const slots = availability.filter((a: any) => a.day_of_week === i);
              if (!slots.length) return null;
              return (
                <div key={day} className="flex items-center gap-3 bg-[var(--color-bg)] px-3 py-2 rounded-[var(--radius-md)]">
                  <span className="text-sm font-medium text-[var(--color-text)] w-24">{day}</span>
                  <span className="text-sm text-[var(--color-text-muted)]">
                    {slots.map((s: any) => `${s.start_time} - ${s.end_time}`).join(', ')}
                  </span>
                </div>
              );
            })}
            {blackouts.map((b: any) => (
              <div key={b.id} className="flex items-center gap-3 bg-[var(--color-warning-bg)] px-3 py-2 rounded-[var(--radius-md)]">
                <span className="text-sm font-medium text-[var(--color-warning-text)] w-24">Blackout</span>
                <span className="text-sm text-[var(--color-text-muted)]">{b.blackout_date}{b.reason ? ` — ${b.reason}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Sessions" value={summary.total_sessions ?? 0} />
        <StatCard label="Upcoming" value={summary.upcoming_sessions ?? 0} />
        <StatCard label="Completed" value={summary.completed_sessions ?? 0} />
        <StatCard label="Total Players" value={summary.total_players ?? 0} />
        <StatCard label="Total Hours" value={summary.total_hours ?? 0} />
        <StatCard label="Cancellations" value={summary.cancelled_sessions ?? 0} />
        <StatCard label="No-Shows" value={summary.no_show_sessions ?? 0} />
        <StatCard label="Completion Rate" value={summary.completion_rate != null ? `${Math.round(Number(summary.completion_rate))}%` : '—'} />
      </div>

      <Section title="Earnings Summary (Read Only)">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard label="Total Revenue" value={summary.total_revenue != null ? formatPrice(Number(summary.total_revenue)) : '—'} />
          <StatCard label="Total Coach Earnings" value={summary.total_earnings != null ? formatPrice(Number(summary.total_earnings)) : '—'} />
          <StatCard label="Pending Revenue" value={summary.pending_revenue != null ? formatPrice(Number(summary.pending_revenue)) : '—'} />
        </div>
      </Section>

      <Section title="Current & Upcoming Sessions">
        {!upcoming.length ? (
          <p className="text-sm text-[var(--color-text-muted)]">No upcoming sessions</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between bg-[var(--color-bg)] px-3 py-2 rounded-[var(--radius-md)]">
                <div>
                  <div className="text-sm font-medium text-[var(--color-text)]">
                    {new Date(s.start_time).toLocaleDateString('en-GB')} · {new Date(s.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {s.player_name || '—'}{s.organisation_name ? ` · ${s.organisation_name}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <Badge value={s.status} />
                  {s.price != null && <div className="text-xs text-[var(--color-text-muted)] mt-1">{formatPrice(Number(s.price), s.currency_code)}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Previous Sessions">
        {!previous.length ? (
          <p className="text-sm text-[var(--color-text-muted)]">No previous sessions</p>
        ) : (
          <div className="space-y-2">
            {previous.slice(0, 20).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between bg-[var(--color-bg)] px-3 py-2 rounded-[var(--radius-md)]">
                <div>
                  <div className="text-sm font-medium text-[var(--color-text)]">
                    {new Date(s.start_time).toLocaleDateString('en-GB')} · {new Date(s.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {s.player_name || '—'}{s.organisation_name ? ` · ${s.organisation_name}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <Badge value={s.status} />
                  {s.price != null && <div className="text-xs text-[var(--color-text-muted)] mt-1">{formatPrice(Number(s.price), s.currency_code)}</div>}
                </div>
              </div>
            ))}
            {previous.length > 20 && <p className="text-xs text-[var(--color-text-muted)]">Showing 20 of {previous.length}</p>}
          </div>
        )}
      </Section>

      <Section title={`Rating & Reviews (${reviews.length})`}>
        {!reviews.length ? (
          <p className="text-sm text-[var(--color-text-muted)]">No reviews yet</p>
        ) : (
          <div className="space-y-2">
            {reviews.map((r: any) => (
              <div key={r.id} className="bg-[var(--color-bg)] px-3 py-2.5 rounded-[var(--radius-md)]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--color-text)]">{r.player_name || 'Player'}</span>
                  <span className="text-xs text-[var(--color-warning-text)]">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                </div>
                {r.review_text && <p className="text-sm text-[var(--color-text-muted)] mt-1">{r.review_text}</p>}
                <p className="text-xs text-[var(--color-text-muted)] mt-1">{new Date(r.created_at).toLocaleDateString('en-GB')}</p>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

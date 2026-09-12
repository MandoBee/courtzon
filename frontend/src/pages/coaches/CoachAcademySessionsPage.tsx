import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { coachAcademyApi, type CoachAcademySession, type SessionRosterRow, type SessionAttendanceSummary } from '../../services/academy';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';
import { useTranslation } from '../../i18n';
import { getErrorMessage } from '../../utils/errors';
import { SkeletonRow } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';

const SESSION_BADGES: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-green-100 text-green-700',
  completed: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-700',
};

const ATTENDANCE_BADGES: Record<string, string> = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  excused: 'bg-amber-100 text-amber-700',
  late: 'bg-purple-100 text-purple-700',
};

const ATTENDANCE_OPTIONS = ['present', 'absent', 'excused', 'late'];

export default function CoachAcademySessionsPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['coach', 'academy', 'sessions'],
    queryFn: () => coachAcademyApi.getSessions(),
  });

  const { data: rosterData, isLoading: loadingRoster } = useQuery({
    queryKey: ['coach', 'academy', 'roster', selectedId],
    queryFn: () => coachAcademyApi.getRoster(selectedId!),
    enabled: selectedId != null,
    retry: false,
  });

  const selected = sessions?.find((s: CoachAcademySession) => s.id === selectedId);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['coach', 'academy', 'sessions'] });
    qc.invalidateQueries({ queryKey: ['coach', 'academy', 'roster'] });
  };

  const startMutation = useMutation({
    mutationFn: (id: number) => coachAcademyApi.startSession(id),
    onSuccess: () => { invalidate(); showToast(t('admin.academy.session_started')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });
  const completeMutation = useMutation({
    mutationFn: (id: number) => coachAcademyApi.completeSession(id),
    onSuccess: () => { invalidate(); showToast(t('admin.academy.session_completed')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string | null }) => coachAcademyApi.cancelSession(id, reason),
    onSuccess: () => { invalidate(); setCancelTarget(null); setCancelReason(''); showToast(t('admin.academy.session_cancelled')); },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const markAttendance = useMutation({
    mutationFn: ({ sessionId, row, status }: { sessionId: number; row: SessionRosterRow; status: string }) =>
      row.attendance_id
        ? coachAcademyApi.updateAttendance(row.attendance_id, { attendance_status: status })
        : coachAcademyApi.markAttendance({ group_session_id: sessionId, enrollment_id: row.enrollment_id, attendance_status: status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coach', 'academy', 'roster'] }),
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const summary: SessionAttendanceSummary | null = rosterData?.summary ?? null;
  const roster: SessionRosterRow[] = rosterData?.data ?? [];
  const canEdit = selected?.status === 'in_progress';

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-[var(--color-text)]">{t('coach.academy.title')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border overflow-x-auto">
          {isLoading ? <SkeletonRow count={5} /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-[var(--color-text-muted)]">
                  <th className="text-left px-3 py-2">{t('admin.academy.session_date')}</th>
                  <th className="text-left px-3 py-2">{t('admin.academy.group')}</th>
                  <th className="text-left px-3 py-2">{t('admin.academy.schedule_window')}</th>
                  <th className="text-center px-3 py-2">{t('admin.academy.attendance_status')}</th>
                </tr>
              </thead>
              <tbody>
                {(sessions ?? []).map((s: CoachAcademySession) => (
                  <tr key={s.id} onClick={() => setSelectedId(s.id)}
                    className={`border-b last:border-0 cursor-pointer hover:bg-[var(--color-bg)] ${selectedId === s.id ? 'bg-[var(--color-bg)]' : ''}`}>
                    <td className="px-3 py-2 text-xs">{s.session_date}</td>
                    <td className="px-3 py-2 text-xs">{s.group_name || `#${s.group_id}`}</td>
                    <td className="px-3 py-2 text-xs">{s.start_time && s.end_time ? `${s.start_time}–${s.end_time}` : '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${SESSION_BADGES[s.status] || ''}`}>
                        {t(`admin.academy.session_status_${s.status}`)}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!sessions || sessions.length === 0) && (
                  <tr><td colSpan={4} className="text-center py-8 text-xs text-[var(--color-text-muted)]">{t('coach.academy.no_sessions')}</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-4">
          {!selected ? (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-6 text-center text-xs text-[var(--color-text-muted)]">
              {t('admin.academy.session_select')}
            </div>
          ) : (
            <>
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{selected.group_name || `#${selected.group_id}`}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      {selected.program_name || ''} · {selected.session_date} {selected.start_time && selected.end_time ? `${selected.start_time}–${selected.end_time}` : ''}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${SESSION_BADGES[selected.status] || ''}`}>
                    {t(`admin.academy.session_status_${selected.status}`)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selected.status === 'scheduled' && (
                    <Can permission="academy.coach.session.manage">
                      <button onClick={() => startMutation.mutate(selected.id)} disabled={startMutation.isPending}
                        className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-50">
                        {t('admin.academy.session_start')}
                      </button>
                    </Can>
                  )}
                  {selected.status === 'in_progress' && (
                    <Can permission="academy.coach.session.manage">
                      <button onClick={() => completeMutation.mutate(selected.id)} disabled={completeMutation.isPending}
                        className="px-3 py-1.5 bg-teal-600 text-white rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-50">
                        {t('admin.academy.session_complete')}
                      </button>
                    </Can>
                  )}
                  {(selected.status === 'scheduled' || selected.status === 'in_progress') && (
                    <Can permission="academy.coach.session.manage">
                      <button onClick={() => setCancelTarget(selected.id)}
                        className="px-3 py-1.5 border border-red-300 text-red-700 rounded-[var(--radius-md)] text-xs">
                        {t('admin.academy.session_cancel')}
                      </button>
                    </Can>
                  )}
                </div>
              </div>

              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4 space-y-3">
                <h3 className="text-xs font-semibold text-[var(--color-text)]">{t('admin.academy.session_summary')}</h3>
                {summary && (
                  <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 text-xs">
                    <div className="rounded-[var(--radius-md)] border p-2"><div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.session_total')}</div><div className="font-semibold">{summary.total}</div></div>
                    <div className="rounded-[var(--radius-md)] border p-2"><div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.session_present')}</div><div className="font-semibold text-green-700">{summary.present}</div></div>
                    <div className="rounded-[var(--radius-md)] border p-2"><div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.session_absent')}</div><div className="font-semibold text-red-700">{summary.absent}</div></div>
                    <div className="rounded-[var(--radius-md)] border p-2"><div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.session_excused')}</div><div className="font-semibold text-amber-700">{summary.excused}</div></div>
                    <div className="rounded-[var(--radius-md)] border p-2"><div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.session_late')}</div><div className="font-semibold text-purple-700">{summary.late}</div></div>
                    <div className="rounded-[var(--radius-md)] border p-2"><div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.session_unmarked')}</div><div className="font-semibold text-gray-600">{summary.unmarked}</div></div>
                    <div className="rounded-[var(--radius-md)] border p-2"><div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.session_progress')}</div><div className="font-semibold">{summary.progress}%</div></div>
                  </div>
                )}
              </div>

              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border overflow-x-auto">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <h3 className="text-xs font-semibold text-[var(--color-text)]">{t('admin.academy.session_roster')}</h3>
                  {!canEdit && <span className="text-[10px] text-[var(--color-text-muted)]">{t('admin.academy.session_attendance_locked')}</span>}
                </div>
                {loadingRoster ? <SkeletonRow count={3} /> : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-[var(--color-text-muted)]">
                        <th className="text-left px-3 py-2">{t('admin.academy.player')}</th>
                        <th className="text-center px-3 py-2">{t('admin.academy.attendance_status')}</th>
                        {canEdit && <th className="text-right px-3 py-2">{t('common.actions')}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((row) => (
                        <tr key={row.enrollment_id} className="border-b last:border-0">
                          <td className="px-3 py-2 text-xs font-medium">{row.player_name || `#${row.player_id}`}</td>
                          <td className="px-3 py-2 text-center">
                            {row.attendance_status ? (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ATTENDANCE_BADGES[row.attendance_status] || ''}`}>{row.attendance_status}</span>
                            ) : <span className="text-[10px] text-[var(--color-text-muted)]">—</span>}
                          </td>
                          {canEdit && (
                            <td className="px-3 py-2 text-right space-x-1">
                              <Can permission="academy.coach.attendance.manage">
                                {ATTENDANCE_OPTIONS.map((opt) => (
                                  <button key={opt} onClick={() => markAttendance.mutate({ sessionId: selected.id, row, status: opt })}
                                    disabled={markAttendance.isPending}
                                    className={`text-[10px] px-1.5 py-0.5 rounded hover:opacity-80 ${ATTENDANCE_BADGES[opt] || 'bg-gray-100'}`}>
                                    {opt}
                                  </button>
                                ))}
                              </Can>
                            </td>
                          )}
                        </tr>
                      ))}
                      {roster.length === 0 && <tr><td colSpan={3} className="text-center py-6 text-xs text-[var(--color-text-muted)]">{t('admin.academy.session_no_roster')}</td></tr>}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        open={cancelTarget != null}
        onClose={() => { setCancelTarget(null); setCancelReason(''); }}
        title={t('admin.academy.session_cancel')}
        size="sm"
        footer={
          <div className="flex items-center gap-2 justify-end">
            <button onClick={() => { setCancelTarget(null); setCancelReason(''); }} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">{t('common.cancel')}</button>
            <button
              onClick={() => cancelTarget && cancelMutation.mutate({ id: cancelTarget, reason: cancelReason.trim() || null })}
              disabled={cancelMutation.isPending}
              className="px-3 py-1.5 bg-red-600 text-white rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-50">
              {t('admin.academy.session_cancel')}
            </button>
          </div>
        }
      >
        <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.session_cancel_reason')}</label>
        <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
          className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
      </Modal>
    </div>
  );
}
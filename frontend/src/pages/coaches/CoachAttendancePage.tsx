import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { SkeletonRow } from '../../components/ui';
import { Can } from '../../permissions/Can';

export default function CoachAttendancePage() {
  const { t } = useTranslation();

  const { data: attendanceData, isLoading: attLoading } = useQuery({
    queryKey: ['coach-attendance'],
    queryFn: () => api.get('/coach/attendance').then((r) => r.data),
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['coach-statistics'],
    queryFn: () => api.get('/coach/statistics').then((r) => r.data),
  });

  const isLoading = attLoading || statsLoading;

  if (isLoading) return <div className="py-8"><SkeletonRow count={6} /></div>;

  const stats = statsData || {};
  const attendance = attendanceData || {};
  const completionRate = attendance?.completionRate ?? attendance?.completion_rate ?? 0;
  const breakdown = attendance?.breakdown || {
    completed: 0,
    cancelled: 0,
    no_show: 0,
  };
  const total = (breakdown.completed || 0) + (breakdown.cancelled || 0) + (breakdown.no_show || 0);

  const getBarWidth = (val: number) => (total > 0 ? (val / total) * 100 : 0);

  return (
    <div className="space-y-5 md:space-y-6 pb-4 max-w-4xl">
      <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text)]">
        {t('coach.attendance.title', 'Attendance & Statistics')}
      </h1>

      <Can permission="coach.attendance.view">
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-[var(--color-text-muted)]">{t('coach.attendance.completion_rate', 'Session Completion Rate')}</span>
            <span className="text-lg font-bold text-[var(--color-text)]">{completionRate}%</span>
          </div>
          <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-success)] rounded-full transition-all"
              style={{ width: `${Math.min(completionRate, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-text-muted)]">{t('coach.attendance.total_sessions', 'Total Sessions')}</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{stats.totalSessions ?? stats.total_sessions ?? 0}</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-text-muted)]">{t('coach.attendance.total_players', 'Total Players')}</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{stats.totalPlayers ?? stats.total_players ?? 0}</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
            <p className="text-xs text-[var(--color-text-muted)]">{t('coach.attendance.total_hours', 'Total Hours')}</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{stats.totalHours ?? stats.total_hours ?? 0}</p>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">
            {t('coach.attendance.breakdown', 'Attendance Breakdown')}
          </h2>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-[var(--color-success)]">{t('coach.attendance.completed', 'Completed')}</span>
                <span className="text-[var(--color-text)]">{breakdown.completed ?? 0}</span>
              </div>
              <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--color-success)] rounded-full transition-all" style={{ width: `${getBarWidth(breakdown.completed || 0)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-[var(--color-warning)]">{t('coach.attendance.cancelled', 'Cancelled')}</span>
                <span className="text-[var(--color-text)]">{breakdown.cancelled ?? 0}</span>
              </div>
              <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--color-warning)] rounded-full transition-all" style={{ width: `${getBarWidth(breakdown.cancelled || 0)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-red-500">{t('coach.attendance.no_show', 'No Show')}</span>
                <span className="text-[var(--color-text)]">{breakdown.no_show ?? 0}</span>
              </div>
              <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${getBarWidth(breakdown.no_show || 0)}%` }} />
              </div>
            </div>
          </div>
        </div>
      </Can>
    </div>
  );
}

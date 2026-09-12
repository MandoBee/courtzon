import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { publicAcademyApi, type PublicAcademySession } from '../../../services/academy';
import { useTranslation } from '../../../i18n';
import { SkeletonRow } from '../../../components/ui/Skeleton';

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

export default function MyAcademySessionsPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['my', 'academy', 'sessions'],
    queryFn: () => publicAcademyApi.mySessions(),
  });

  if (isLoading) return <div className="space-y-3"><SkeletonRow count={4} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--color-text)]">{t('player.academy.my_sessions')}</h1>
        <Link to="/my/academy" className="text-xs text-[var(--color-primary)] hover:underline">{t('player.academy.my_academy')}</Link>
      </div>

      {isError || !data || data.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">{t('player.academy.no_sessions')}</p>
      ) : (
        <div className="space-y-2">
          {data.map((s: PublicAcademySession) => (
            <div key={s.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{s.program_name || '-'}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {s.group_name ? `${t('player.academy.group')}: ${s.group_name}` : ''} · {s.session_date}
                    {s.start_time && s.end_time ? ` · ${s.start_time}–${s.end_time}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${SESSION_BADGES[s.session_status] || ''}`}>
                  {t(`player.academy.session_${s.session_status}`)}
                </span>
              </div>
              <div className="mt-2">
                {s.attendance_status ? (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ATTENDANCE_BADGES[s.attendance_status] || ''}`}>
                    {t(`player.academy.attendance_${s.attendance_status}`)}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                    {t('player.academy.attendance_unmarked')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
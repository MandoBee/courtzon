import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { publicAcademyApi, type PublicAcademyAttendance } from '../../../services/academy';
import { useTranslation } from '../../../i18n';
import { SkeletonRow } from '../../../components/ui/Skeleton';

const ATTENDANCE_BADGES: Record<string, string> = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  excused: 'bg-amber-100 text-amber-700',
  late: 'bg-purple-100 text-purple-700',
};

export default function MyAcademyAttendancePage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['my', 'academy', 'attendance'],
    queryFn: () => publicAcademyApi.myAttendance(),
  });

  if (isLoading) return <div className="space-y-3"><SkeletonRow count={4} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--color-text)]">{t('player.academy.my_attendance')}</h1>
        <Link to="/my/academy" className="text-xs text-[var(--color-primary)] hover:underline">{t('player.academy.my_academy')}</Link>
      </div>

      {isError || !data || data.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">{t('player.academy.no_attendance')}</p>
      ) : (
        <div className="space-y-2">
          {data.map((a: PublicAcademyAttendance) => (
            <div key={a.attendance_id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{a.program_name || '-'}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {a.group_name ? `${t('player.academy.group')}: ${a.group_name} · ` : ''}{a.session_date}
                    {a.start_time && a.end_time ? ` · ${a.start_time}–${a.end_time}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${ATTENDANCE_BADGES[a.attendance_status] || ''}`}>
                  {t(`player.academy.attendance_${a.attendance_status}`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
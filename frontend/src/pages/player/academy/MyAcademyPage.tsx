import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { publicAcademyApi, type PublicAcademyEnrollment } from '../../../services/academy';
import AcademyPaymentPanel from '../../../components/academy/AcademyPaymentPanel';
import { Can } from '../../../permissions/Can';
import { useTranslation } from '../../../i18n';
import { SkeletonRow } from '../../../components/ui/Skeleton';

const ENROLLMENT_BADGES: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  waiting: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-teal-100 text-teal-700',
};

export default function MyAcademyPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['my', 'academy', 'enrollments'],
    queryFn: () => publicAcademyApi.myEnrollments(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--color-text)]">{t('player.academy.my_academy')}</h1>
        <Link to="/academy" className="text-xs text-[var(--color-primary)] hover:underline">{t('player.academy.view_programs')}</Link>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link to="/my/academy/sessions" className="px-2 py-1 rounded-full bg-[var(--color-surface)] border hover:border-[var(--color-primary)]/40">
          {t('player.academy.my_sessions')}
        </Link>
        <Link to="/my/academy/attendance" className="px-2 py-1 rounded-full bg-[var(--color-surface)] border hover:border-[var(--color-primary)]/40">
          {t('player.academy.my_attendance')}
        </Link>
      </div>

      {isLoading ? <SkeletonRow count={3} /> : isError || !data ? (
        <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">{t('player.academy.no_enrollments')}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">{t('player.academy.no_enrollments')}</p>
      ) : (
        <div className="space-y-2">
          {data.map((e: PublicAcademyEnrollment) => (
            <div key={e.id} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to={`/academy/${e.programId}`} className="text-sm font-semibold text-[var(--color-text)] hover:text-[var(--color-primary)]">
                    {e.programName}
                  </Link>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {[e.programCode, e.groupName ? `${t('player.academy.group')}: ${e.groupName}` : null].filter(Boolean).join(' · ') || '-'}
                  </div>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${ENROLLMENT_BADGES[e.status] || ''}`}>
                  {t(`player.academy.status_${e.status}`)}
                </span>
              </div>

              {e.status === 'waiting' && e.waitingOrder != null && (
                <p className="mt-2 text-xs font-medium text-[var(--color-primary)]">
                  {t('player.academy.waitlist_position', { n: e.waitingOrder })}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                {e.status === 'confirmed' ? (
                  <Can permission="academy.payment.view">
                    <AcademyPaymentPanel enrollmentId={e.id} />
                  </Can>
                ) : e.paymentState === 'confirmed' ? (
                  <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700">{t('player.academy.payment_confirmed')}</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{t('player.academy.payment_pending')}</span>
                )}
                {e.enrolledAt && <span>{t('player.academy.enrolled_at')}: {new Date(e.enrolledAt).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
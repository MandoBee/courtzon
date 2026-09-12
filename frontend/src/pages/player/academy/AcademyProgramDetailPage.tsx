import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { publicAcademyApi } from '../../../services/academy';
import AcademyPaymentPanel from '../../../components/academy/AcademyPaymentPanel';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';
import { useTranslation } from '../../../i18n';
import { getErrorMessage } from '../../../utils/errors';
import { SkeletonRow } from '../../../components/ui/Skeleton';

export default function AcademyProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const programId = Number(id);
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const { data: program, isLoading, isError } = useQuery({
    queryKey: ['academy', 'public', 'program', programId],
    queryFn: () => publicAcademyApi.getProgram(programId),
    enabled: programId > 0,
    retry: false,
  });

  const { data: myEnrollments } = useQuery({
    queryKey: ['my', 'academy', 'enrollments'],
    queryFn: () => publicAcademyApi.myEnrollments(),
  });
  const existing = myEnrollments?.find((e) => e.programId === programId);

  const enroll = useMutation({
    mutationFn: () => publicAcademyApi.enroll(programId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['my', 'academy', 'enrollments'] });
      qc.invalidateQueries({ queryKey: ['academy', 'public', 'program', programId] });
      if (res.status === 'confirmed') showToast(t('player.academy.enrollment_success'));
      else showToast(t('player.academy.enrollment_waitlisted'));
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  if (isLoading) return <div className="space-y-3"><SkeletonRow count={3} /></div>;
  if (isError || !program) {
    return (
      <div className="space-y-3 py-8 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">{t('player.academy.not_found')}</p>
        <Link to="/academy" className="text-xs text-[var(--color-primary)] hover:underline">{t('player.academy.back_to_browse')}</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/academy" className="text-xs text-[var(--color-primary)] hover:underline">{t('player.academy.back_to_browse')}</Link>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-[var(--color-text)]">{program.name}</h1>
            <div className="text-xs text-[var(--color-text-muted)] mt-1">
              {[program.category, program.level, program.season].filter(Boolean).join(' · ') || '-'}
            </div>
          </div>
          {program.isFull && (
            <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{t('player.academy.at_capacity')}</span>
          )}
        </div>

        {program.description && <p className="text-sm text-[var(--color-text-muted)]">{program.description}</p>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-[var(--radius-md)] border p-2">
            <div className="text-[var(--color-text-muted)] text-[10px]">{t('player.academy.price')}</div>
            <div className="font-semibold">{program.price > 0 ? `${program.price} ${program.currency}` : t('player.academy.free')}</div>
          </div>
          <div className="rounded-[var(--radius-md)] border p-2">
            <div className="text-[var(--color-text-muted)] text-[10px]">{t('player.academy.category')}</div>
            <div className="font-semibold">{program.category}</div>
          </div>
          <div className="rounded-[var(--radius-md)] border p-2">
            <div className="text-[var(--color-text-muted)] text-[10px]">{t('player.academy.level')}</div>
            <div className="font-semibold">{program.level || '-'}</div>
          </div>
          <div className="rounded-[var(--radius-md)] border p-2">
            <div className="text-[var(--color-text-muted)] text-[10px]">{t('player.academy.season')}</div>
            <div className="font-semibold">{program.season || '-'}</div>
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] border p-3 text-xs text-[var(--color-text-muted)]">
          {program.isUnlimited
            ? t('player.academy.unlimited')
            : `${program.confirmedCount}/${program.capacity} · ${program.availableSeats} ${t('player.academy.seats_available')}`}
        </div>

        {existing && (
          <div className="rounded-[var(--radius-md)] border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${existing.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {t(`player.academy.status_${existing.status}`)}
              </span>
              {existing.status === 'waiting' && existing.waitingOrder != null && (
                <p className="text-xs font-medium">{t('player.academy.waitlist_position', { n: existing.waitingOrder })}</p>
              )}
            </div>

            {existing.status === 'confirmed' && (
              <Can permission="academy.payment.view">
                <AcademyPaymentPanel enrollmentId={existing.id} />
              </Can>
            )}
            {existing.status === 'confirmed' && existing.paymentState === 'pending' && (
              <p className="text-[11px] text-[var(--color-text-muted)]">{t('player.academy.payment_pending')}</p>
            )}
          </div>
        )}

        {!existing && (
          <Can permission="academy.self_enroll">
            <button
              onClick={() => enroll.mutate()}
              disabled={enroll.isPending}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50"
            >
              {t('player.academy.enroll')}
            </button>
          </Can>
        )}
      </div>
    </div>
  );
}
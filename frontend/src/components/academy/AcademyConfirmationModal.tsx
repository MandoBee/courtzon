import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Can } from '../../permissions/Can';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../i18n';
import { getErrorMessage } from '../../utils/errors';
import {
  academyConfirmationApi,
  type AcademyConfirmationBlocker,
  type AcademyConfirmationReadiness,
} from '../../services/academy';

interface Props {
  programId: number;
  open: boolean;
  onClose: () => void;
}

const BLOCKER_STYLES: Record<string, string> = {
  ALREADY_CONFIRMED: 'bg-gray-100 text-gray-700',
  MISSING_SCHEDULE: 'bg-red-100 text-red-700',
  MISSING_COACH: 'bg-amber-100 text-amber-700',
  INVALID_COACH: 'bg-red-100 text-red-700',
  MISSING_COMPENSATION: 'bg-amber-100 text-amber-700',
  MISSING_COURT: 'bg-red-100 text-red-700',
  UNRESOLVED_COURT_CONFLICT: 'bg-red-100 text-red-700',
  UNRESOLVED_DST: 'bg-purple-100 text-purple-700',
  UNRESOLVED_PENDING_HOLD: 'bg-orange-100 text-orange-700',
  UNPAID_ENROLLMENT: 'bg-red-100 text-red-700',
  BELOW_MINIMUM: 'bg-amber-100 text-amber-700',
  ABOVE_MAXIMUM: 'bg-amber-100 text-amber-700',
  CONCURRENT_MODIFICATION: 'bg-gray-100 text-gray-700',
};

export default function AcademyConfirmationModal({ programId, open, onClose }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [overrideBelow, setOverrideBelow] = useState(false);
  const [overrideAbove, setOverrideAbove] = useState(false);
  const [reason, setReason] = useState('');

  const { data: readiness, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'academy', 'confirmation-readiness', programId],
    queryFn: () => academyConfirmationApi.getReadiness(programId),
    enabled: open && programId > 0,
    retry: false,
  });

  const markPaid = useMutation({
    mutationFn: (enrollmentId: number) => academyConfirmationApi.markEnrollmentPaid(enrollmentId),
    onSuccess: () => {
      showToast(t('admin.academy.confirmation_payment_acknowledged'));
      refetch();
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const confirm = useMutation({
    mutationFn: (r: AcademyConfirmationReadiness) => academyConfirmationApi.confirm(programId, {
      expected_snapshot_token: r.snapshotToken,
      override_below_min: overrideBelow,
      override_above_max: overrideAbove,
      reason: (overrideBelow || overrideAbove) && reason.trim() ? reason.trim() : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'academy', 'programs'] });
      showToast(t('admin.academy.confirmation_success'));
      onClose();
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const needsOverrideReason = (overrideBelow || overrideAbove) && !reason.trim();

  function renderBlocker(b: AcademyConfirmationBlocker) {
    const labelKey = `admin.academy.confirmation_blocker_${b.code}`;
    const name = b.entityName ? `${b.entityName}${b.entityId ? ` #${b.entityId}` : ''}` : null;
    return (
      <li key={`${b.code}-${b.entityId ?? 'x'}`} className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 min-w-0">
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${BLOCKER_STYLES[b.code] || 'bg-red-100 text-red-700'}`}>
            {t(labelKey)}
          </span>
          {name && <span className="text-[11px] text-[var(--color-text-muted)] truncate">{name}</span>}
        </div>
        {b.detail && <span className="text-[10px] text-[var(--color-text-muted)] text-right shrink-0 max-w-[40%] truncate" title={b.detail}>{b.detail}</span>}
      </li>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('admin.academy.confirmation_readiness_title')}
      size="lg"
      footer={
        <div className="flex items-center gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">{t('common.cancel')}</button>
          <Can permission="academy.manage">
            <button
              onClick={() => readiness && confirm.mutate(readiness)}
              disabled={!readiness || !readiness.ready || needsOverrideReason || confirm.isPending}
              className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-50">
              {confirm.isPending ? t('common.loading') : t('admin.academy.confirmation_submit')}
            </button>
          </Can>
        </div>
      }
    >
      {isLoading ? (
        <div className="text-sm text-[var(--color-text-muted)] py-6 text-center">{t('admin.academy.confirmation_loading')}</div>
      ) : !readiness ? (
        <div className="text-sm text-[var(--color-text-muted)] py-6 text-center">{t('admin.academy.no_programs')}</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${readiness.ready ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {readiness.ready ? t('admin.academy.confirmation_ready') : t('admin.academy.confirmation_not_ready')}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">{readiness.programName}</span>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-[var(--color-text)] mb-2">{t('admin.academy.confirmation_overview')}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="rounded-[var(--radius-md)] border p-2">
                <div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.confirmation_stats_groups')}</div>
                <div className="font-semibold">{readiness.stats.activeGroups}</div>
              </div>
              <div className="rounded-[var(--radius-md)] border p-2">
                <div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.confirmation_stats_schedules')}</div>
                <div className="font-semibold">{readiness.stats.schedules}</div>
              </div>
              <div className="rounded-[var(--radius-md)] border p-2">
                <div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.confirmation_stats_sessions')}</div>
                <div className="font-semibold">{readiness.stats.futureSessions}</div>
              </div>
              <div className="rounded-[var(--radius-md)] border p-2">
                <div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.confirmation_stats_finalizable')}</div>
                <div className="font-semibold">{readiness.stats.finalizableSessions}</div>
              </div>
              <div className="rounded-[var(--radius-md)] border p-2">
                <div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.confirmation_stats_enrollments')}</div>
                <div className="font-semibold">{readiness.stats.confirmedEnrollments}</div>
              </div>
              <div className="rounded-[var(--radius-md)] border p-2">
                <div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.confirmation_stats_unpaid')}</div>
                <div className={`font-semibold ${readiness.stats.unpaidEnrollments > 0 ? 'text-red-600' : ''}`}>{readiness.stats.unpaidEnrollments}</div>
              </div>
            </div>
          </div>

          {readiness.blockers.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">{t('admin.academy.confirmation_no_blockers')}</p>
          ) : (
            <div>
              <p className="text-xs text-[var(--color-text-muted)] mb-2">{t('admin.academy.confirmation_blockers')}</p>
              <ul className="space-y-1.5">
                {readiness.blockers.map(renderBlocker)}
              </ul>
            </div>
          )}

          {readiness.blockers.some((b) => b.code === 'UNPAID_ENROLLMENT') && (
            <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-2 space-y-1">
              <p className="text-[11px] font-medium text-red-700">{t('admin.academy.confirmation_stats_unpaid')}</p>
              <Can permission="academy.enroll">
                <div className="flex flex-wrap gap-1.5">
                  {readiness.blockers
                    .filter((b) => b.code === 'UNPAID_ENROLLMENT')
                    .map((b) => (
                      <button
                        key={b.entityId}
                        onClick={() => b.entityId && markPaid.mutate(b.entityId)}
                        disabled={markPaid.isPending}
                        className="text-[10px] px-2 py-1 rounded bg-white border border-red-300 text-red-700 hover:opacity-80 disabled:opacity-50">
                        {t('admin.academy.confirmation_mark_paid')} {b.entityName ?? `#${b.entityId}`}
                      </button>
                    ))}
                </div>
              </Can>
            </div>
          )}

          {readiness.blockers.some((b) => b.code === 'BELOW_MINIMUM') && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={overrideBelow} onChange={(e) => setOverrideBelow(e.target.checked)} />
              {t('admin.academy.confirmation_override_below')}
            </label>
          )}
          {readiness.blockers.some((b) => b.code === 'ABOVE_MAXIMUM') && (
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={overrideAbove} onChange={(e) => setOverrideAbove(e.target.checked)} />
              {t('admin.academy.confirmation_override_above')}
            </label>
          )}
          {(overrideBelow || overrideAbove) && (
            <div>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('admin.academy.confirmation_override_reason')}
                className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white"
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
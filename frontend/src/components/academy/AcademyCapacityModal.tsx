import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../ui/Modal';
import { Can } from '../../permissions/Can';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../i18n';
import { getErrorMessage } from '../../utils/errors';
import { academyCapacityApi } from '../../services/academy';

interface Props {
  programId: number;
  open: boolean;
  onClose: () => void;
}

export default function AcademyCapacityModal({ programId, open, onClose }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [removeReason, setRemoveReason] = useState('');
  const [showRemove, setShowRemove] = useState(false);

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'academy', 'capacity', programId],
    queryFn: () => academyCapacityApi.getStatus(programId),
    enabled: open && programId > 0,
    retry: false,
  });

  const setOverride = useMutation({
    mutationFn: () => academyCapacityApi.setOverride(programId, {
      amount: Number(amount),
      until: until ? new Date(until).toISOString() : null,
      reason,
    }),
    onSuccess: () => {
      showToast(t('admin.academy.capacity_override_saved'));
      setAmount(''); setUntil(''); setReason(''); setShowRemove(false);
      refetch();
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const removeOverride = useMutation({
    mutationFn: () => academyCapacityApi.removeOverride(programId, removeReason),
    onSuccess: () => {
      showToast(t('admin.academy.capacity_override_removed'));
      setRemoveReason(''); setShowRemove(false);
      refetch();
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  function invalidateAndClose() {
    qc.invalidateQueries({ queryKey: ['admin', 'academy', 'programs'] });
    onClose();
  }

  const canSave = Number(amount) > 0 && reason.trim().length > 0;
  const canRemove = removeReason.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={invalidateAndClose}
      title={t('admin.academy.capacity_title')}
      size="md"
      footer={
        <div className="flex items-center gap-2 justify-end">
          <button onClick={invalidateAndClose} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">{t('common.cancel')}</button>
        </div>
      }
    >
      {isLoading ? (
        <div className="text-sm text-[var(--color-text-muted)] py-6 text-center">{t('common.loading')}</div>
      ) : !status ? (
        <div className="text-sm text-[var(--color-text-muted)] py-6 text-center">{t('admin.academy.no_programs')}</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded-[var(--radius-md)] border p-2">
              <div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.capacity_original')}</div>
              <div className="font-semibold">{status.originalCapacity === 0 ? t('admin.academy.capacity_unlimited') : status.originalCapacity}</div>
            </div>
            <div className="rounded-[var(--radius-md)] border p-2">
              <div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.capacity_effective')}</div>
              <div className="font-semibold">{status.effectiveCapacity === 0 ? t('admin.academy.capacity_unlimited') : status.effectiveCapacity}</div>
            </div>
            <div className="rounded-[var(--radius-md)] border p-2">
              <div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.capacity_confirmed')}</div>
              <div className="font-semibold">{status.confirmedCount}</div>
            </div>
            <div className="rounded-[var(--radius-md)] border p-2">
              <div className="text-[var(--color-text-muted)] text-[10px]">{t('admin.academy.capacity_available')}</div>
              <div className={`font-semibold ${status.availableSeats === 0 && status.effectiveCapacity > 0 ? 'text-red-600' : ''}`}>
                {status.availableSeats < 0 ? t('admin.academy.capacity_unlimited') : status.availableSeats}
              </div>
            </div>
          </div>

          {status.override.active && (
            <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-2 text-xs space-y-0.5">
              <div className="font-semibold text-amber-700">{t('admin.academy.capacity_override_active')}: +{status.override.amount}</div>
              {status.override.until && (
                <div className="text-[var(--color-text-muted)]">{t('admin.academy.capacity_override_expiry')}: {new Date(status.override.until).toLocaleString()}</div>
              )}
              {status.override.reason && (
                <div className="text-[var(--color-text-muted)]">{t('admin.academy.capacity_override_reason')}: {status.override.reason}</div>
              )}
            </div>
          )}

          <Can permission="academy.capacity.override">
            {!status.override.active && !showRemove && (
              <div className="space-y-2 rounded-[var(--radius-md)] border p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.capacity_override_amount')}</label>
                    <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.capacity_override_until')}</label>
                    <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.capacity_override_reason')}</label>
                  <input value={reason} onChange={(e) => setReason(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
                </div>
                <button onClick={() => setOverride.mutate()} disabled={!canSave || setOverride.isPending}
                  className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-50">
                  {t('admin.academy.capacity_override_save')}
                </button>
              </div>
            )}

            {status.override.active && !showRemove && (
              <button onClick={() => setShowRemove(true)} className="px-3 py-1.5 border border-red-300 text-red-700 rounded-[var(--radius-md)] text-xs">
                {t('admin.academy.capacity_override_remove')}
              </button>
            )}

            {showRemove && (
              <div className="space-y-2 rounded-[var(--radius-md)] border border-red-200 p-3">
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{t('admin.academy.capacity_override_remove_reason')}</label>
                <input value={removeReason} onChange={(e) => setRemoveReason(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-[var(--radius-md)] border text-sm bg-white" />
                <div className="flex gap-2">
                  <button onClick={() => removeOverride.mutate()} disabled={!canRemove || removeOverride.isPending}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-50">
                    {t('admin.academy.capacity_override_remove')}
                  </button>
                  <button onClick={() => { setShowRemove(false); setRemoveReason(''); }} className="px-3 py-1.5 border rounded-[var(--radius-md)] text-xs">{t('common.cancel')}</button>
                </div>
              </div>
            )}
          </Can>
        </div>
      )}
    </Modal>
  );
}
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { publicAcademyApi } from '../../services/academy';
import { Can } from '../../permissions/Can';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../i18n';
import { getErrorMessage } from '../../utils/errors';
import { formatPrice } from '../../utils/currency';
import WalletPaymentOption from '../payment/WalletPaymentOption';
import { usePaymentConfirm } from '../../hooks/usePaymentConfirm';
import PaymentStatusPoller from '../payment/PaymentStatusPoller';
import PaymobPixelCard from '../payment/PaymobPixelCard';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

/**
 * G8.4 — Player self-service Academy payment panel.
 *
 * Renders the authoritative payment state for the player's own enrollment and
 * the Pay Now flow (wallet / card). The backend is authoritative: amounts and
 * eligibility come ONLY from `/my/academy/enrollments/:id/payment`; the client
 * never sends or calculates financial values.
 */
export default function AcademyPaymentPanel({ enrollmentId }: { enrollmentId: number }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [method, setMethod] = useState<'wallet' | 'card'>('wallet');
  const [pixelSecret, setPixelSecret] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const { confirm: confirmPayment } = usePaymentConfirm();

  const { data: state, isLoading, isError, refetch } = useQuery({
    queryKey: ['my', 'academy', 'payment', enrollmentId],
    queryFn: () => publicAcademyApi.getMyEnrollmentPayment(enrollmentId),
    enabled: enrollmentId > 0,
    retry: false,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['my', 'academy', 'payment', enrollmentId] });
    qc.invalidateQueries({ queryKey: ['my', 'academy', 'enrollments'] });
  };

  const pay = useMutation({
    mutationFn: (m: 'wallet' | 'card') =>
      publicAcademyApi.payMyEnrollment(enrollmentId, {
        paymentMethod: m,
        idempotencyKey: `academy_pay_${enrollmentId}_${Date.now()}`,
      }),
    onSuccess: (res) => {
      if (res.status === 'already_paid' || res.status === 'paid') {
        refresh();
        showToast(t('player.academy.payment_success'));
        return;
      }
      if (res.status === 'pending' && res.paymentId) {
        setPaymentId(res.paymentId);
        const secret = res.clientSecret ?? '';
        if (secret && !secret.startsWith('mock')) {
          setPixelSecret(secret);
        } else {
          void runConfirm(res.paymentId);
        }
      }
    },
    onError: (err) => showToast(getErrorMessage(err), 'error'),
  });

  const runConfirm = async (pmId: number) => {
    setPolling(true);
    const result = await confirmPayment(pmId);
    setPolling(false);
    if (result.confirmed) {
      refresh();
      showToast(t('player.academy.payment_success'));
    } else if (result.state === 'failed') {
      showToast(t('player.academy.payment_failed'), 'error');
    } else if (result.pending || result.state === 'timeout') {
      showToast(t('player.academy.payment_processing_short'), 'warning');
    }
  };

  const onCardComplete = async () => {
    if (paymentId) {
      setPixelSecret(null);
      await runConfirm(paymentId);
    }
  };

  if (isLoading) return null;
  if (isError || !state) {
    return <p className="text-xs text-[var(--color-text-muted)]">{t('player.academy.payment_unavailable')}</p>;
  }

  if (state.paymentState === 'free') {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">{t('player.academy.no_payment_required')}</span>
      </div>
    );
  }
  if (state.paymentState === 'paid') {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">{t('player.academy.payment_confirmed')}</span>
        <span className="text-[var(--color-text-muted)]">{t('player.academy.payment_success')}</span>
      </div>
    );
  }
  if (state.paymentState === 'processing') {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">{t('player.academy.payment_processing')}</span>
        <span className="text-[var(--color-text-muted)]">{t('player.academy.payment_processing_note')}</span>
      </div>
    );
  }
  if (state.paymentState === 'unavailable') {
    return (
      <div className="space-y-2">
        <span className="inline-block px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-medium">{t('player.academy.payment_unavailable')}</span>
        <div>
          <Button size="sm" variant="ghost" onClick={() => refetch()}>{t('player.academy.try_again')}</Button>
        </div>
      </div>
    );
  }

  // ── unpaid → Pay Now ──
  const amount = state.amount ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">{t('player.academy.payment_required')}</span>
        <span className="text-sm font-semibold">{amount > 0 ? formatPrice(amount, state.currency) : '—'}</span>
      </div>

      <Can permission="academy.payment.charge">
        <div className="space-y-2">
          <div className="flex gap-2">
            <WalletPaymentOption amount={amount} selected={method === 'wallet'} onClick={() => setMethod('wallet')} disabled={pay.isPending} />
            <button
              type="button"
              onClick={() => setMethod('card')}
              disabled={pay.isPending}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 p-2 rounded-[var(--radius-md)] border transition-colors ${
                method === 'card'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                  : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="text-sm">💳</span>
                <span className="text-xs font-medium text-[var(--color-text)]">{t('player.academy.card')}</span>
              </div>
              <span className="text-[10px] text-[var(--color-text-muted)]">{t('player.academy.card_note')}</span>
            </button>
          </div>

          <Button
            variant="primary"
            loading={pay.isPending}
            disabled={pay.isPending || (method === 'wallet' && amount <= 0)}
            onClick={() => pay.mutate(method)}
          >
            {t('player.academy.pay_now')}
          </Button>
        </div>
      </Can>
      {!state.availableMethods.includes('card') && (
        <p className="text-[10px] text-[var(--color-text-muted)]">{t('player.academy.payment_unavailable')}</p>
      )}

      {polling && paymentId && (
        <PaymentStatusPoller
          endpoint={`/payments/status/${paymentId}`}
          isComplete={(d: any) => !!d?.paymentStatus && d.paymentStatus === 'paid'}
          interval={1500}
          timeout={90000}
          onPaid={() => {
            setPolling(false);
            refresh();
            showToast(t('player.academy.payment_success'));
          }}
          onTimeout={() => {
            setPolling(false);
            showToast(t('player.academy.payment_processing_short'), 'warning');
          }}
        />
      )}

      <Modal open={!!pixelSecret} onClose={() => setPixelSecret(null)} title={t('player.academy.card')} size="lg">
        {pixelSecret && (
          <PaymobPixelCard
            clientSecret={pixelSecret}
            beforePaymentComplete={async () => true}
            onComplete={onCardComplete}
            onCancel={() => {
              setPixelSecret(null);
              showToast(t('player.academy.payment_cancelled'), 'warning');
            }}
          />
        )}
      </Modal>
    </div>
  );
}
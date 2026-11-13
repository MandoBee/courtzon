import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useCan } from '../../../hooks/useCan';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { formatPrice } from '../../../utils/currency';

interface RefundCase {
  id: number;
  public_id: string;
  domain: string;
  source_type: string;
  source_id: number;
  organisation_id: number;
  requested_by: number;
  approved_by: number | null;
  reason: string;
  status: string;
  operational_status: string;
  payout_status: string;
  currency: string;
  canceled_value_cents: number;
  approved_refund_cents: number;
  paid_cents: number;
  rejected_reason: string | null;
  aggregate_version: number;
  created_at: string;
}

interface RefundLine {
  id: number;
  line_no: number;
  line_type: string;
  source_id: number;
  canceled_value_cents: number;
  approved_cents: number;
  operational_status: string;
  cancellation_ref: string | null;
}

interface RefundPayout {
  id: number;
  method: string;
  amount_cents: number;
  status: string;
  reference: string | null;
  evidence_url: string | null;
  executed_by: number | null;
  executed_at: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  REQUESTED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  UNDER_REVIEW: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  APPROVED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  OPERATIONAL_PROCESSING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  PAYOUT_PENDING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  PARTIALLY_COMPLETED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const newIdempotencyKey = (prefix: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`;

export default function RefundDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { can } = useCan();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const canView = can('refunds.view');

  const [rejectReason, setRejectReason] = useState('');
  const [payoutForm, setPayoutForm] = useState({
    method: 'bank_transfer',
    amount: '',
    reference: '',
    evidenceUrl: '',
  });
  const [failReasons, setFailReasons] = useState<Record<number, string>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ['refund-case', id],
    queryFn: () => api.get(`/refunds/${id}`).then((r) => r.data.data),
    enabled: canView && Boolean(id),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['refund-case', id] });
    void queryClient.invalidateQueries({ queryKey: ['refund-cases'] });
  };

  const onError = (error: any) =>
    showToast(error?.response?.data?.message || t('refunds.toast.failed', 'Operation failed'), 'error');

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/refunds/${id}/approve`),
    onSuccess: () => {
      showToast(t('refunds.toast.approved', 'Refund case approved; operational cancellation started'));
      invalidate();
    },
    onError,
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/refunds/${id}/reject`, { reason: rejectReason }),
    onSuccess: () => {
      showToast(t('refunds.toast.rejected', 'Refund case rejected'));
      invalidate();
    },
    onError,
  });

  const retryMutation = useMutation({
    mutationFn: () => api.post(`/refunds/${id}/retry-operational`),
    onSuccess: () => {
      showToast(t('refunds.toast.retried', 'Cancellation retried'));
      invalidate();
    },
    onError,
  });

  const payoutMutation = useMutation({
    mutationFn: () =>
      api.post(`/refunds/${id}/payouts`, {
        method: payoutForm.method,
        amountCents: Math.round(Number(payoutForm.amount) * 100),
        reference: payoutForm.reference || null,
        evidenceUrl: payoutForm.evidenceUrl || null,
        idempotencyKey: newIdempotencyKey('payout'),
      }),
    onSuccess: () => {
      showToast(t('refunds.toast.payoutRecorded', 'Payout recorded; a different user must confirm it'));
      setPayoutForm({ method: 'bank_transfer', amount: '', reference: '', evidenceUrl: '' });
      invalidate();
    },
    onError,
  });

  const confirmMutation = useMutation({
    mutationFn: (payoutId: number) => api.post(`/refunds/${id}/payouts/${payoutId}/confirm`),
    onSuccess: () => {
      showToast(t('refunds.toast.payoutConfirmed', 'Payout confirmed'));
      invalidate();
    },
    onError,
  });

  const failMutation = useMutation({
    mutationFn: (payoutId: number) =>
      api.post(`/refunds/${id}/payouts/${payoutId}/fail`, {
        reason: failReasons[payoutId] || t('refunds.payout.failedDefault', 'Transfer failed'),
      }),
    onSuccess: () => {
      showToast(t('refunds.toast.payoutFailed', 'Payout marked as failed'));
      invalidate();
    },
    onError,
  });

  if (!canView) return null;

  if (isLoading) {
    return <div className="p-6 text-sm text-[var(--color-text-muted)]">{t('refunds.loading', 'Loading…')}</div>;
  }

  if (isError || !data) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-[var(--color-text-muted)]">{t('refunds.notFound', 'Refund case not found')}</p>
        <Link to="/admin/refunds" className="text-[var(--color-primary)] text-sm">
          {t('refunds.back', 'Back to refund cases')}
        </Link>
      </div>
    );
  }

  const record: RefundCase = data.case;
  const lines: RefundLine[] = data.lines ?? [];
  const payouts: RefundPayout[] = data.payouts ?? [];
  const remaining = record.approved_refund_cents - record.paid_cents;
  const canApprove = record.status === 'REQUESTED' || record.status === 'UNDER_REVIEW';
  const canPayout = record.operational_status === 'COMPLETED' && remaining > 0;

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/admin/refunds" className="text-xs text-[var(--color-primary)]">
            {t('refunds.back', 'Back to refund cases')}
          </Link>
          <h1 className="text-xl font-bold text-[var(--color-text)] mt-1 font-mono">{record.public_id}</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            {t(`refunds.domain.${record.domain}`, record.domain)} · {record.source_type} #{record.source_id} ·{' '}
            {t('refunds.table.organisation', 'Organisation')} #{record.organisation_id}
          </p>
        </div>
        <span className={`px-3 py-1 rounded text-xs font-medium ${STATUS_BADGE[record.status] ?? ''}`}>
          {t(`refunds.status.${record.status}`, record.status)}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[var(--color-surface)] rounded-xl p-4 shadow-[var(--shadow-md)] space-y-2 text-sm">
          <h2 className="font-semibold">{t('refunds.summary', 'Summary')}</h2>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">{t('refunds.summary.canceled', 'Cancelled value')}</span>
            <span>{formatPrice(record.canceled_value_cents / 100, record.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">{t('refunds.summary.approved', 'Approved refund')}</span>
            <span>{formatPrice(record.approved_refund_cents / 100, record.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">{t('refunds.summary.paid', 'Paid')}</span>
            <span>{formatPrice(record.paid_cents / 100, record.currency)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>{t('refunds.summary.remaining', 'Remaining')}</span>
            <span>{formatPrice(remaining / 100, record.currency)}</span>
          </div>
          <div className="pt-2 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)] space-y-1">
            <div>
              {t('refunds.summary.operational', 'Cancellation')}: {t(`refunds.operational.${record.operational_status}`, record.operational_status)}
            </div>
            <div>
              {t('refunds.summary.payout', 'Payout')}: {t(`refunds.operational.${record.payout_status}`, record.payout_status)}
            </div>
            <div>{t('refunds.summary.reason', 'Reason')}: {record.reason}</div>
            {record.rejected_reason && (
              <div className="text-red-600">{t('refunds.summary.rejectedReason', 'Rejection')}: {record.rejected_reason}</div>
            )}
          </div>
        </div>

        <div className="bg-[var(--color-surface)] rounded-xl p-4 shadow-[var(--shadow-md)] space-y-2 text-sm lg:col-span-2">
          <h2 className="font-semibold">{t('refunds.lines', 'Service lines')}</h2>
          <table className="w-full text-xs">
            <thead className="text-left text-[var(--color-text-muted)]">
              <tr>
                <th className="py-1">#</th>
                <th className="py-1">{t('refunds.lines.unit', 'Unit')}</th>
                <th className="py-1">{t('refunds.lines.canceled', 'Cancelled')}</th>
                <th className="py-1">{t('refunds.lines.approved', 'Approved')}</th>
                <th className="py-1">{t('refunds.lines.status', 'Status')}</th>
                <th className="py-1">{t('refunds.lines.reference', 'Cancellation ref')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-t border-[var(--color-border)]">
                  <td className="py-1.5">{line.line_no}</td>
                  <td className="py-1.5">{line.line_type} #{line.source_id}</td>
                  <td className="py-1.5">{formatPrice(line.canceled_value_cents / 100, record.currency)}</td>
                  <td className="py-1.5">{formatPrice(line.approved_cents / 100, record.currency)}</td>
                  <td className="py-1.5">{t(`refunds.operational.${line.operational_status}`, line.operational_status)}</td>
                  <td className="py-1.5 font-mono">{line.cancellation_ref ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl p-4 shadow-[var(--shadow-md)] space-y-3">
        <h2 className="font-semibold text-sm">{t('refunds.actions', 'Actions')}</h2>
        <div className="flex flex-wrap gap-2">
          <Can permission="refunds.approve">
            {canApprove && (
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {t('refunds.approve', 'Approve')}
              </button>
            )}
          </Can>
          <Can permission="refunds.retry">
            {record.operational_status === 'FAILED' && record.status !== 'COMPLETED' && (
              <button
                onClick={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
                className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm"
              >
                {t('refunds.retry', 'Retry cancellation')}
              </button>
            )}
          </Can>
        </div>

        <Can permission="refunds.reject">
          {canApprove && (
            <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <label className="text-xs font-medium flex-1 min-w-[220px]">
                {t('refunds.rejectReason', 'Rejection reason')}
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="input input-bordered w-full mt-1"
                />
              </label>
              <button
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending || rejectReason.trim().length < 3}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {t('refunds.reject', 'Reject')}
              </button>
            </div>
          )}
        </Can>

        <Can permission="refunds.payout">
          {canPayout && (
            <form
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[var(--color-border)]"
              onSubmit={(e) => {
                e.preventDefault();
                payoutMutation.mutate();
              }}
            >
              <label className="text-xs font-medium">
                {t('refunds.payout.method', 'Payout method')}
                <select
                  value={payoutForm.method}
                  onChange={(e) => setPayoutForm({ ...payoutForm, method: e.target.value })}
                  className="input input-bordered w-full mt-1"
                >
                  <option value="bank_transfer">{t('refunds.payout.bankTransfer', 'Bank transfer')}</option>
                  <option value="cash">{t('refunds.payout.cash', 'Cash')}</option>
                </select>
              </label>
              <label className="text-xs font-medium">
                {t('refunds.payout.amount', 'Amount')} ({record.currency})
                <input
                  required
                  inputMode="decimal"
                  value={payoutForm.amount}
                  onChange={(e) => setPayoutForm({ ...payoutForm, amount: e.target.value })}
                  className="input input-bordered w-full mt-1"
                />
              </label>
              <label className="text-xs font-medium">
                {t('refunds.payout.reference', 'Transfer reference')}
                <input
                  value={payoutForm.reference}
                  onChange={(e) => setPayoutForm({ ...payoutForm, reference: e.target.value })}
                  className="input input-bordered w-full mt-1"
                />
              </label>
              <label className="text-xs font-medium">
                {t('refunds.payout.evidence', 'Payment evidence URL')}
                <input
                  value={payoutForm.evidenceUrl}
                  onChange={(e) => setPayoutForm({ ...payoutForm, evidenceUrl: e.target.value })}
                  className="input input-bordered w-full mt-1"
                />
              </label>
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={payoutMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50"
                >
                  {t('refunds.payout.record', 'Record payout')}
                </button>
              </div>
            </form>
          )}
        </Can>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl p-4 shadow-[var(--shadow-md)] space-y-2">
        <h2 className="font-semibold text-sm">{t('refunds.payouts', 'Payouts')}</h2>
        {payouts.length === 0 && (
          <p className="text-xs text-[var(--color-text-muted)]">{t('refunds.payouts.empty', 'No payouts recorded')}</p>
        )}
        {payouts.map((payout) => (
          <div key={payout.id} className="border-t border-[var(--color-border)] pt-2 text-sm space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">
                  {formatPrice(payout.amount_cents / 100, record.currency)} ·{' '}
                  {t(`refunds.payout.${payout.method}`, payout.method)}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {t('refunds.payout.status', 'Status')}: {t(`refunds.operational.${payout.status}`, payout.status)}
                  {payout.reference ? ` · ${payout.reference}` : ''}
                  {payout.evidence_url ? (
                    <>
                      {' · '}
                      <a
                        href={payout.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--color-primary)]"
                      >
                        {t('refunds.payout.evidenceLink', 'Evidence')}
                      </a>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Can permission="refunds.payout.confirm">
                  {payout.status === 'PROCESSING' && (
                    <button
                      onClick={() => confirmMutation.mutate(payout.id)}
                      disabled={confirmMutation.isPending}
                      className="px-3 py-1.5 rounded bg-green-600 text-white text-xs font-medium disabled:opacity-50"
                    >
                      {t('refunds.payout.confirm', 'Confirm payout')}
                    </button>
                  )}
                </Can>
                <Can permission="refunds.payout">
                  {payout.status === 'PROCESSING' && (
                    <div className="flex items-center gap-1">
                      <input
                        value={failReasons[payout.id] ?? ''}
                        onChange={(e) => setFailReasons({ ...failReasons, [payout.id]: e.target.value })}
                        placeholder={t('refunds.payout.failedReason', 'Failure reason')}
                        className="input input-bordered text-xs py-1"
                      />
                      <button
                        onClick={() => failMutation.mutate(payout.id)}
                        disabled={failMutation.isPending}
                        className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-medium disabled:opacity-50"
                      >
                        {t('refunds.payout.fail', 'Mark failed')}
                      </button>
                    </div>
                  )}
                </Can>
              </div>
            </div>
          </div>
        ))}
        <p className="text-xs text-[var(--color-text-muted)]">
          {t(
            'refunds.payout.separation',
            'Approval and payout confirmation must be completed by different users.',
          )}
        </p>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useCan } from '../../../hooks/useCan';
import { useTranslation } from '../../../i18n';
import { useToast } from '../../../components/ui/Toast';
import { Modal } from '../../../components/ui/Modal';
import { Can } from '../../../permissions/Can';
import { ExportCsvButton } from '../../../components/ui/ExportCsvButton';
import { formatPrice } from '../../../utils/currency';

const DOMAINS = ['booking', 'tournament', 'academy', 'marketplace', 'membership'] as const;
const STATUSES = [
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'OPERATIONAL_PROCESSING',
  'PAYOUT_PENDING',
  'PARTIALLY_COMPLETED',
  'COMPLETED',
  'FAILED',
] as const;

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

interface RefundCaseRow {
  id: number;
  public_id: string;
  domain: string;
  source_type: string;
  source_id: number;
  organisation_id: number;
  status: string;
  operational_status: string;
  payout_status: string;
  currency: string;
  canceled_value_cents: number;
  approved_refund_cents: number;
  paid_cents: number;
  created_at: string;
}

export default function RefundListPage() {
  const { t } = useTranslation();
  const { can } = useCan();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const canView = can('refunds.view');

  const [statusFilter, setStatusFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [organisationId, setOrganisationId] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    organisationId: '',
    domain: 'booking',
    sourceType: 'booking',
    sourceId: '',
    reason: '',
    lineSourceId: '',
    canceledValue: '',
    approvedValue: '',
  });

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      status: statusFilter || undefined,
      domain: domainFilter || undefined,
      organisationId: organisationId || undefined,
    }),
    [page, statusFilter, domainFilter, organisationId],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['refund-cases', params],
    queryFn: () => api.get('/refunds', { params }).then((r) => r.data),
    enabled: canView,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const sourceId = Number(form.sourceId);
      const canceledValueCents = Math.round(Number(form.canceledValue) * 100);
      const approvedCents = Math.round(Number(form.approvedValue) * 100);
      return api.post('/refunds', {
        organisationId: Number(form.organisationId),
        domain: form.domain,
        sourceType: form.sourceType,
        sourceId,
        reason: form.reason,
        currency: 'EGP',
        idempotencyKey:
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `refund-${Date.now()}-${sourceId}`,
        lines: [
          {
            lineType: form.sourceType,
            sourceId: Number(form.lineSourceId || form.sourceId),
            canceledValueCents,
            approvedCents,
          },
        ],
      });
    },
    onSuccess: () => {
      showToast(t('refunds.toast.requested', 'Refund case created'));
      setCreateOpen(false);
      setForm({
        organisationId: '',
        domain: 'booking',
        sourceType: 'booking',
        sourceId: '',
        reason: '',
        lineSourceId: '',
        canceledValue: '',
        approvedValue: '',
      });
      void queryClient.invalidateQueries({ queryKey: ['refund-cases'] });
    },
    onError: (error: any) => {
      showToast(error?.response?.data?.message || t('refunds.toast.failed', 'Operation failed'), 'error');
    },
  });

  if (!canView) return null;

  const rows: RefundCaseRow[] = data?.data ?? [];
  const total = Number(data?.total ?? 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">{t('refunds.title', 'Refund Cases')}</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            {t(
              'refunds.subtitle',
              'Institution-funded refunds. The owning organisation bears the cost; CourtZon records the payout reference only.',
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Can permission="refunds.export">
            {organisationId ? (
              <ExportCsvButton
                endpoint="/refunds/export"
                params={{
                  organisationId,
                  status: statusFilter || undefined,
                  domain: domainFilter || undefined,
                }}
                filename="refunds"
                label={t('refunds.export', 'Export CSV')}
              />
            ) : null}
          </Can>
          <Can permission="refunds.request">
            <button
              onClick={() => setCreateOpen(true)}
              className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium"
            >
              {t('refunds.request', 'Request Refund')}
            </button>
          </Can>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="input input-bordered text-sm"
          aria-label={t('refunds.filter.status', 'Filter by status')}
        >
          <option value="">{t('refunds.filter.allStatuses', 'All statuses')}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`refunds.status.${status}`, status)}
            </option>
          ))}
        </select>
        <select
          value={domainFilter}
          onChange={(e) => {
            setDomainFilter(e.target.value);
            setPage(1);
          }}
          className="input input-bordered text-sm"
          aria-label={t('refunds.filter.domain', 'Filter by domain')}
        >
          <option value="">{t('refunds.filter.allDomains', 'All domains')}</option>
          {DOMAINS.map((domain) => (
            <option key={domain} value={domain}>
              {t(`refunds.domain.${domain}`, domain)}
            </option>
          ))}
        </select>
        <input
          value={organisationId}
          onChange={(e) => {
            setOrganisationId(e.target.value.replace(/[^0-9]/g, ''));
            setPage(1);
          }}
          inputMode="numeric"
          placeholder={t('refunds.filter.organisation', 'Organisation ID')}
          className="input input-bordered text-sm w-44"
          aria-label={t('refunds.filter.organisation', 'Organisation ID')}
        />
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl shadow-[var(--shadow-md)] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
            <tr>
              <th className="p-3">{t('refunds.table.reference', 'Reference')}</th>
              <th className="p-3">{t('refunds.table.domain', 'Domain')}</th>
              <th className="p-3">{t('refunds.table.source', 'Source')}</th>
              <th className="p-3">{t('refunds.table.status', 'Status')}</th>
              <th className="p-3">{t('refunds.table.approved', 'Approved')}</th>
              <th className="p-3">{t('refunds.table.paid', 'Paid')}</th>
              <th className="p-3">{t('refunds.table.created', 'Created')}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-[var(--color-text-muted)]">
                  {t('refunds.loading', 'Loading…')}
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-[var(--color-text-muted)]">
                  {t('refunds.empty', 'No refund cases found')}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--color-border)] last:border-0">
                <td className="p-3 font-mono text-xs">{row.public_id}</td>
                <td className="p-3">{t(`refunds.domain.${row.domain}`, row.domain)}</td>
                <td className="p-3 text-xs">
                  {row.source_type} #{row.source_id}
                  <div className="text-[var(--color-text-muted)]">
                    {t('refunds.table.organisation', 'Organisation')} #{row.organisation_id}
                  </div>
                </td>
                <td className="p-3">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${STATUS_BADGE[row.status] ?? ''}`}
                  >
                    {t(`refunds.status.${row.status}`, row.status)}
                  </span>
                </td>
                <td className="p-3">{formatPrice(row.approved_refund_cents / 100, row.currency)}</td>
                <td className="p-3">{formatPrice(row.paid_cents / 100, row.currency)}</td>
                <td className="p-3 text-xs text-[var(--color-text-muted)]">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="p-3 text-right">
                  <Link to={`/admin/refunds/${row.id}`} className="text-[var(--color-primary)] text-xs font-medium">
                    {t('refunds.table.open', 'Open')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
        <span>{t('refunds.total', 'Total')}: {total}</span>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="px-3 py-1.5 rounded border border-[var(--color-border)] disabled:opacity-40"
          >
            {t('refunds.previous', 'Previous')}
          </button>
          <button
            disabled={page * 20 >= total}
            onClick={() => setPage((current) => current + 1)}
            className="px-3 py-1.5 rounded border border-[var(--color-border)] disabled:opacity-40"
          >
            {t('refunds.next', 'Next')}
          </button>
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('refunds.request', 'Request Refund')}
        size="lg"
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-medium">
              {t('refunds.form.organisation', 'Organisation ID')}
              <input
                required
                inputMode="numeric"
                value={form.organisationId}
                onChange={(e) => setForm({ ...form, organisationId: e.target.value.replace(/[^0-9]/g, '') })}
                className="input input-bordered w-full mt-1"
              />
            </label>
            <label className="text-xs font-medium">
              {t('refunds.form.domain', 'Domain')}
              <select
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value, sourceType: e.target.value })}
                className="input input-bordered w-full mt-1"
              >
                {DOMAINS.map((domain) => (
                  <option key={domain} value={domain}>
                    {t(`refunds.domain.${domain}`, domain)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              {t('refunds.form.sourceType', 'Service unit type')}
              <input
                required
                value={form.sourceType}
                onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
                className="input input-bordered w-full mt-1"
              />
            </label>
            <label className="text-xs font-medium">
              {t('refunds.form.sourceId', 'Service unit ID')}
              <input
                required
                inputMode="numeric"
                value={form.sourceId}
                onChange={(e) => setForm({ ...form, sourceId: e.target.value.replace(/[^0-9]/g, '') })}
                className="input input-bordered w-full mt-1"
              />
            </label>
            <label className="text-xs font-medium">
              {t('refunds.form.canceledValue', 'Cancelled service value')}
              <input
                required
                inputMode="decimal"
                value={form.canceledValue}
                onChange={(e) => setForm({ ...form, canceledValue: e.target.value })}
                className="input input-bordered w-full mt-1"
              />
            </label>
            <label className="text-xs font-medium">
              {t('refunds.form.approvedValue', 'Approved refund amount')}
              <input
                required
                inputMode="decimal"
                value={form.approvedValue}
                onChange={(e) => setForm({ ...form, approvedValue: e.target.value })}
                className="input input-bordered w-full mt-1"
              />
            </label>
            <label className="text-xs font-medium sm:col-span-2">
              {t('refunds.form.lineSourceId', 'Line service unit ID (optional, defaults to the case source)')}
              <input
                inputMode="numeric"
                value={form.lineSourceId}
                onChange={(e) => setForm({ ...form, lineSourceId: e.target.value.replace(/[^0-9]/g, '') })}
                className="input input-bordered w-full mt-1"
              />
            </label>
          </div>
          <label className="text-xs font-medium block">
            {t('refunds.form.reason', 'Reason')}
            <textarea
              required
              minLength={3}
              maxLength={500}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="input input-bordered w-full mt-1 h-24"
            />
          </label>
          <p className="text-xs text-[var(--color-text-muted)]">
            {t(
              'refunds.form.hint',
              'The owning organisation pays the refund by cash or bank transfer. Original payment, settlement and accounting records are never changed.',
            )}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm">
              {t('refunds.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50"
            >
              {t('refunds.submit', 'Create case')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

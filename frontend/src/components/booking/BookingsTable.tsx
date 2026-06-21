import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getErrorMessage } from '../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { useToast } from '../ui/Toast';
import { formatPrice } from '../../utils/currency';
import { Card, Badge } from '../ui';
import { useTranslation } from '../../i18n';
import type { ApiData, PaginatedResult } from '../../types/api';
import type { BranchSummary, OrganisationSummary, ResourceSummary } from '../../types/admin/common';
import type { AdminBookingRow } from '../../types/admin/booking';

const BOOKING_TYPE_OPTIONS = ['public_match', 'private_match', 'academy', 'clinic', 'coach_session'];
const BOOKING_STATUS_OPTIONS = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
const PAYMENT_STATUS_OPTIONS = ['pending', 'paid', 'refunded', 'partially_refunded', 'failed', 'penalty'];
const PAGE_SIZES = [10, 20, 30, 50];

const statusBadgeVariant: Record<string, 'warning' | 'success' | 'danger' | 'info' | 'default'> = {
  pending: 'warning',
  confirmed: 'info',
  completed: 'success',
  cancelled: 'danger',
  no_show: 'danger',
};

const paymentBadgeVariant: Record<string, 'warning' | 'success' | 'danger' | 'info' | 'default'> = {
  pending: 'warning',
  paid: 'success',
  refunded: 'info',
  partially_refunded: 'warning',
  failed: 'danger',
  penalty: 'danger',
};

const formatCurrency = (amount: string | number) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return isNaN(num) ? '-' : formatPrice(num);
};

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface BookingsTableProps {
  context: 'admin' | 'org';
}

export default function BookingsTable({ context }: BookingsTableProps) {
  const { orgId } = useParams<{ orgId: string }>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [filterOrgId, setFilterOrgId] = useState<number | ''>('');
  const [filterBranchId, setFilterBranchId] = useState<number | ''>('');
  const [filterResourceId, setFilterResourceId] = useState<number | ''>('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [filterBookingType, setFilterBookingType] = useState('');
  const [search, setSearch] = useState('');

  const debouncedSearch = useDebounce(search, 300);
  const isAdmin = context === 'admin';

  const { data: orgs } = useQuery({
    queryKey: ['admin', 'organisations'],
    queryFn: () => api.get<ApiData<OrganisationSummary[]>>('/organisations').then((r) => r.data.data),
    enabled: isAdmin,
  });

  const branchQueryEnabled = isAdmin ? !!filterOrgId : true;

  const { data: branches } = useQuery({
    queryKey: isAdmin ? ['admin', 'branches', filterOrgId] : ['admin', 'branches', 'org', orgId],
    queryFn: () => {
      const id = isAdmin ? filterOrgId : orgId;
      return api.get<ApiData<BranchSummary[]>>(`/organisations/${id}/branches`).then((r) => r.data.data);
    },
    enabled: branchQueryEnabled,
  });

  const { data: resources } = useQuery({
    queryKey: ['admin', 'resources', filterBranchId],
    queryFn: () =>
      api.get<ApiData<ResourceSummary[]>>(`/branches/${filterBranchId}/resources`).then((r) => r.data.data),
    enabled: !!filterBranchId,
  });

  const orgList = (orgs || []) as OrganisationSummary[];
  const branchList = (branches || []) as BranchSummary[];
  const resourceList = (resources || []) as ResourceSummary[];

  const queryParams: Record<string, string> = { page: String(page), limit: String(limit) };
  if (isAdmin && filterOrgId) queryParams.orgId = String(filterOrgId);
  if (filterBranchId) queryParams.branchId = String(filterBranchId);
  if (filterResourceId) queryParams.resourceId = String(filterResourceId);
  if (filterDate) queryParams.date = filterDate;
  if (filterStatus) queryParams.status = filterStatus;
  if (filterPayment) queryParams.paymentStatus = filterPayment;
  if (filterBookingType) queryParams.bookingType = filterBookingType;
  if (debouncedSearch) queryParams.q = debouncedSearch;

  const { data: response, isLoading, isFetching } = useQuery({
    queryKey: isAdmin ? ['admin', 'bookings', JSON.stringify(queryParams)] : ['org-bookings', orgId, JSON.stringify(queryParams)],
    queryFn: isAdmin
      ? () =>
          api.get<PaginatedResult<AdminBookingRow>>('/admin/bookings', { params: queryParams }).then((r) => r.data)
      : () =>
          api.get<PaginatedResult<AdminBookingRow>>(`/org/${orgId}/bookings`, { params: queryParams }).then((r) => r.data),
    enabled: isAdmin || !!orgId,
  });

  const bookings = response?.data || [];
  const total: number = response?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/bookings/${id}/status`, { status }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: isAdmin ? ['admin', 'bookings'] : ['org-bookings'] });
      if (variables.status === 'completed') {
        showToast('Booking marked as completed');
      } else if (variables.status === 'cancelled') {
        showToast('Booking cancelled');
      } else if (variables.status === 'no_show') {
        showToast('Booking marked as no-show');
      } else {
        showToast('Booking status updated');
      }
    },
    onError: (err: unknown) => showToast(getErrorMessage(err, 'Failed to update status'), 'error'),
  });

  const updatePaymentMutation = useMutation({
    mutationFn: ({ id, paymentStatus }: { id: number; paymentStatus: string }) =>
      api.patch(`/bookings/${id}/payment`, { paymentStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: isAdmin ? ['admin', 'bookings'] : ['org-bookings'] });
      showToast('Payment status updated');
    },
    onError: (err: unknown) => showToast(getErrorMessage(err, 'Failed to update payment'), 'error'),
  });

  function handleOrgChange(orgId: string) {
    setFilterOrgId(orgId ? Number(orgId) : '');
    setFilterBranchId('');
    setFilterResourceId('');
    setPage(1);
  }

  function handleBranchChange(branchId: string) {
    setFilterBranchId(branchId ? Number(branchId) : '');
    setFilterResourceId('');
    setPage(1);
  }

  function handleLimitChange(newLimit: number) {
    setLimit(newLimit);
    setPage(1);
  }

  const statusPermKey = isAdmin ? 'admin.bookings.update-status' : 'org.bookings.update-status';

  if (!isAdmin && !orgId) return <div className="text-[var(--color-text-muted)]">Invalid organisation</div>;

  const summaryCards = [
    { label: 'Total', value: total, variant: 'default' as const },
    { label: 'Pending', value: bookings.filter((b: AdminBookingRow) => b.booking_status === 'pending').length, variant: 'warning' as const },
    { label: 'Confirmed', value: bookings.filter((b: AdminBookingRow) => b.booking_status === 'confirmed').length, variant: 'info' as const },
    { label: 'Completed', value: bookings.filter((b: AdminBookingRow) => b.booking_status === 'completed').length, variant: 'success' as const },
    { label: 'Revenue', value: formatCurrency(bookings.reduce((sum: number, b: AdminBookingRow) => sum + (Number(b.total_amount) || 0), 0)), variant: 'default' as const },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {summaryCards.map((card) => (
          <Card key={card.label} className="p-4">
            <p className="text-xs text-[var(--color-text-muted)] mb-1">{card.label}</p>
            <p className="text-lg font-bold text-[var(--color-text)] truncate">{card.value}</p>
          </Card>
        ))}
      </div>

      {/* Search + Page Size */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t('booking.search_placeholder')}
            className="w-64 px-3 py-1.5 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]"
          />
          {isFetching && <span className="text-xs text-[var(--color-text-muted)]">{t('common.loading')}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-muted)]">Rows:</span>
          <select value={limit} onChange={(e) => handleLimitChange(Number(e.target.value))}
            className="px-2 py-1 text-xs border rounded bg-[var(--color-surface)] text-[var(--color-text)]">
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table shell — always visible so filters are always accessible */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Filter Row */}
              <tr className="border-b border-[var(--color-border)]">
                {isAdmin && (
                  <td className="p-1.5">
                    <select value={filterOrgId}
                      onChange={(e) => handleOrgChange(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)]">
                      <option value="">All Orgs</option>
                      {orgList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </td>
                )}
                <td className="p-1.5">
                  <select value={filterBranchId}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    disabled={branchQueryEnabled && branchList.length === 0}
                    className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)] disabled:opacity-50">
                    <option value="">All Branches</option>
                    {branchList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </td>
                <td className="p-1.5">
                  <select value={filterResourceId}
                    onChange={(e) => { setFilterResourceId(e.target.value ? Number(e.target.value) : ''); setPage(1); }}
                    disabled={!filterBranchId}
                    className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)] disabled:opacity-50">
                    <option value="">All Resources</option>
                    {resourceList.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </td>
                <td className="p-1.5">
                  <select value={filterBookingType}
                    onChange={(e) => { setFilterBookingType(e.target.value); setPage(1); }}
                    className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)]">
                    <option value="">All Types</option>
                    {BOOKING_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </td>
                <td className="p-1.5" />
                <td className="p-1.5">
                  <input type="date" value={filterDate}
                    onChange={(e) => { setFilterDate(e.target.value); setPage(1); }}
                    className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)]" />
                </td>
                <td className="p-1.5" />
                <td className="p-1.5">
                  <select value={filterStatus}
                    onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                    className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)]">
                    <option value="">All Status</option>
                    {BOOKING_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="p-1.5">
                  <select value={filterPayment}
                    onChange={(e) => { setFilterPayment(e.target.value); setPage(1); }}
                    className="w-full px-2 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)]">
                    <option value="">All Payment</option>
                    {PAYMENT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
              {/* Header Row */}
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                {isAdmin && (
                  <th className="text-left p-3 text-[var(--color-text-muted)] font-medium text-xs uppercase tracking-wider">{t('booking.table.org')}</th>
                )}
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium text-xs uppercase tracking-wider">{t('booking.table.branch')}</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium text-xs uppercase tracking-wider">{t('booking.table.resource')}</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium text-xs uppercase tracking-wider">{t('common.type')}</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium text-xs uppercase tracking-wider">{t('booking.table.user')}</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium text-xs uppercase tracking-wider">{t('common.phone')}</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium text-xs uppercase tracking-wider">{t('common.date')}</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium text-xs uppercase tracking-wider">{t('common.time')}</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium text-xs uppercase tracking-wider">{t('common.amount')}</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium text-xs uppercase tracking-wider">{t('booking.table.payment_method')}</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium text-xs uppercase tracking-wider">{t('common.status')}</th>
                <th className="text-left p-3 text-[var(--color-text-muted)] font-medium text-xs uppercase tracking-wider">{t('booking.table.payment')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={isAdmin ? 12 : 11} className="p-8"><div className="animate-pulse h-32 bg-[var(--color-border)] rounded" /></td></tr>
              ) : !response || !bookings.length ? (
                <tr><td colSpan={isAdmin ? 12 : 11} className="p-8 text-center text-[var(--color-text-muted)]">{t('booking.empty_table')}</td></tr>
              ) : (
                bookings.map((b: AdminBookingRow) => (
                  <tr key={b.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg)]/50 transition-colors">
                    {isAdmin && (
                      <td className="p-3 text-[var(--color-text)] font-medium">{b.organisation_name}</td>
                    )}
                    <td className="p-3 text-[var(--color-text)]">{b.branch_name}</td>
                    <td className="p-3 text-[var(--color-text)]">{b.resource_name}</td>
                    <td className="p-3">
                      <Badge variant="default">{b.booking_type?.replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="p-3 text-[var(--color-text)]">{b.user_name || b.full_name || '-'}</td>
                    <td className="p-3 text-[var(--color-text-muted)]">{b.user_phone || '-'}</td>
                    <td className="p-3 text-[var(--color-text-muted)] whitespace-nowrap">
                      {b.booking_date ? new Date(b.booking_date).toLocaleDateString('en-GB') : '-'}
                    </td>
                    <td className="p-3 text-[var(--color-text-muted)] whitespace-nowrap text-xs">
                      {b.start_time && b.end_time ? `${b.start_time.slice(0, 5)} - ${b.end_time.slice(0, 5)}` : '-'}
                    </td>
                    <td className="p-3 text-[var(--color-text)] font-medium">{formatCurrency(b.total_amount)}</td>
                    <td className="p-3 text-[var(--color-text-muted)] text-xs">
                      {b.payment_method === 'cash' || b.payment_method === 'cod' ? 'COD' : (b.payment_method || '-')}
                    </td>
                    <td className="p-3">
                      <Can permission={statusPermKey} fallback={<Badge variant={statusBadgeVariant[b.booking_status] || 'default'}>{b.booking_status}</Badge>}>
                        <select value={b.booking_status}
                          onChange={(e) => updateStatusMutation.mutate({ id: b.id, status: e.target.value })}
                          className="text-xs px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)] w-full"
                          title={t('booking.change_status')}>
                          {BOOKING_STATUS_OPTIONS.map(s => (
                            <option key={s} value={s} disabled={s === b.booking_status}>{s}</option>
                          ))}
                        </select>
                      </Can>
                    </td>
                    <td className="p-3">
                      {!isAdmin && b.payment_method && b.payment_method !== 'cash' && b.payment_method !== 'cod' ? (
                        <Badge variant={paymentBadgeVariant[b.payment_status] || 'default'}>{b.payment_status}</Badge>
                      ) : (
                        <Can permission={statusPermKey} fallback={<Badge variant={paymentBadgeVariant[b.payment_status] || 'default'}>{b.payment_status}</Badge>}>
                          <select value={b.payment_status}
                            onChange={(e) => updatePaymentMutation.mutate({ id: b.id, paymentStatus: e.target.value })}
                            className="text-xs px-2 py-1 border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)] w-full"
                            title={t('booking.change_payment')}>
                            {PAYMENT_STATUS_OPTIONS.map(s => (
                              <option key={s} value={s} disabled={s === b.payment_status}>{s}</option>
                            ))}
                          </select>
                        </Can>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)]">
              Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)] disabled:opacity-40 hover:bg-[var(--color-bg)] transition-colors">
                Prev
              </button>
              <div className="flex gap-1">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const p = start + i;
                  if (p > totalPages) return null;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-8 h-8 text-xs border rounded transition-colors ${
                        p === page
                          ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg)]'
                      }`}>
                      {p}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-3 py-1 text-xs border border-[var(--color-border)] rounded bg-[var(--color-surface)] text-[var(--color-text)] disabled:opacity-40 hover:bg-[var(--color-bg)] transition-colors">
                {t('common.next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

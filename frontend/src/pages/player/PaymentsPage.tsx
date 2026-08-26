import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { Button, Card } from '../../components/ui';
import { formatPrice } from '../../utils/currency';

/**
 * Player payment history + receipt/details.
 *
 * Uses the real `payment_transactions` columns returned by
 * GET /payments/transactions:
 *   id, user_id, booking_id, order_id, reference_id, reference_type,
 *   payment_method, gateway_provider, gateway_reference, amount, currency,
 *   payment_status, paid_at, cancelled_at, expired_at, created_at, updated_at.
 *
 * The raw `gateway_response` JSON is NEVER exposed by the backend and never
 * rendered here. No accounting calculation is performed client-side — every
 * displayed value comes directly from the backend row.
 */

type Filter = 'all' | 'paid' | 'pending' | 'processing' | 'failed' | 'refunded' | 'cancelled' | 'expired';

const statusColors: Record<string, string> = {
  paid: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  pending: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  processing: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  created: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  refunded: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  failed: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  cancelled: 'bg-gray-100 text-gray-500',
  expired: 'bg-gray-100 text-gray-500',
};

const methodLabels: Record<string, string> = {
  wallet: 'Wallet',
  card: 'Credit/Debit Card',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  online: 'Online Payment',
};

const typeLabels: Record<string, string> = {
  order: 'Marketplace Order',
  booking: 'Booking',
  subscription: 'Subscription',
  wallet_topup: 'Wallet Top-up',
};

function formatMethod(method: string | null): string {
  return methodLabels[method || ''] || method?.replace(/_/g, ' ') || '—';
}

function formatType(type: string | null): string {
  return typeLabels[type || ''] || type?.replace(/_/g, ' ') || 'Other';
}

/** Resolve the route for the related resource (existing routes only). */
function resolveRelatedRoute(p: any): { path: string; label: string } | null {
  if (p.reference_type === 'order' && p.order_id) {
    return { path: `/marketplace/orders/${p.order_id}`, label: 'View Order' };
  }
  if (p.reference_type === 'booking' && p.booking_id) {
    return { path: `/bookings/${p.booking_id}`, label: 'View Booking' };
  }
  if (p.reference_type === 'wallet_topup') {
    return { path: '/my/wallet', label: 'View Wallet' };
  }
  return null;
}

export default function PaymentsPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['my-payments', filter, methodFilter, typeFilter, page],
    queryFn: () => api.get('/payments/transactions', {
      params: {
        page,
        limit: 20,
        ...(filter !== 'all' ? { status: filter } : {}),
        ...(methodFilter !== 'all' ? { paymentMethod: methodFilter } : {}),
        ...(typeFilter !== 'all' ? { referenceType: typeFilter } : {}),
      },
    }).then((r) => r.data),
  });

  const rows: any[] = data?.data || [];

  const statusTabs: { key: Filter; label: string }[] = [
    { key: 'all', label: t('common.all') },
    { key: 'paid', label: t('common.completed') },
    { key: 'pending', label: 'Pending' },
    { key: 'processing', label: 'Processing' },
    { key: 'refunded', label: 'Refunded' },
    { key: 'failed', label: t('common.rejected') || 'Failed' },
  ];

  return (
    <Can permission="player.payments.view">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{t('player.payments.title') || 'Payment History'}</h1>

        <Card>
          {/* Status tabs */}
          <div className="flex flex-wrap gap-1 mb-3 border-b border-[var(--color-border)]">
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setFilter(tab.key); setPage(1); setSelectedId(null); }}
                className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                  filter === tab.key
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Method + type filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={methodFilter}
              onChange={(e) => { setMethodFilter(e.target.value); setPage(1); setSelectedId(null); }}
              className="px-3 py-1.5 text-xs rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]"
            >
              <option value="all">All Methods</option>
              {Object.entries(methodLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); setSelectedId(null); }}
              className="px-3 py-1.5 text-xs rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]"
            >
              <option value="all">All Types</option>
              {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {isLoading ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
          ) : !rows.length ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('player.payments.no_payments') || 'No payments found.'}</p>
          ) : (
            <div className="space-y-2">
              {rows.map((p: any) => (
                <div key={p.id}>
                  <button
                    onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                    className="w-full flex items-center justify-between py-3 px-3 rounded-[var(--radius-md)] hover:bg-[var(--color-bg)] transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-text)] capitalize">{formatType(p.reference_type)}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {new Date(p.created_at).toLocaleDateString('en-GB')} · #{p.id}
                        {p.gateway_reference ? ` · ${p.gateway_reference}` : ''}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{formatMethod(p.payment_method)}</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-semibold text-[var(--color-text)]">
                        {formatPrice(Number(p.amount || 0), p.currency)}
                      </p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium inline-block mt-0.5 ${statusColors[p.payment_status] || ''}`}>
                        {p.payment_status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </button>

                  {/* Receipt / details view */}
                  {selectedId === p.id && (
                    <div className="mx-1 mb-3 px-4 py-4 text-sm bg-[var(--color-bg)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
                      <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-3">Payment Details</h3>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div>
                          <dt className="text-xs text-[var(--color-text-muted)]">Reference</dt>
                          <dd className="text-[var(--color-text)] font-medium">#{p.id}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[var(--color-text-muted)]">Date &amp; Time</dt>
                          <dd className="text-[var(--color-text)] font-medium">{new Date(p.created_at).toLocaleString('en-GB')}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[var(--color-text-muted)]">Amount</dt>
                          <dd className="text-[var(--color-text)] font-medium">{formatPrice(Number(p.amount || 0), p.currency)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[var(--color-text-muted)]">Payment Method</dt>
                          <dd className="text-[var(--color-text)] font-medium">{formatMethod(p.payment_method)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[var(--color-text-muted)]">Status</dt>
                          <dd className="text-[var(--color-text)] font-medium capitalize">{p.payment_status?.replace(/_/g, ' ')}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-[var(--color-text-muted)]">Type</dt>
                          <dd className="text-[var(--color-text)] font-medium">{formatType(p.reference_type)}</dd>
                        </div>
                        {p.gateway_reference && (
                          <div>
                            <dt className="text-xs text-[var(--color-text-muted)]">Gateway Reference</dt>
                            <dd className="text-[var(--color-text)] font-medium break-all">{p.gateway_reference}</dd>
                          </div>
                        )}
                        {p.booking_id && (
                          <div>
                            <dt className="text-xs text-[var(--color-text-muted)]">Booking</dt>
                            <dd className="text-[var(--color-text)] font-medium">#{p.booking_id}</dd>
                          </div>
                        )}
                        {p.order_id && (
                          <div>
                            <dt className="text-xs text-[var(--color-text-muted)]">Order</dt>
                            <dd className="text-[var(--color-text)] font-medium">#{p.order_id}</dd>
                          </div>
                        )}
                        {p.reference_type === 'subscription' && p.reference_id && (
                          <div>
                            <dt className="text-xs text-[var(--color-text-muted)]">Subscription</dt>
                            <dd className="text-[var(--color-text)] font-medium">#{p.reference_id}</dd>
                          </div>
                        )}
                        {p.reference_type === 'wallet_topup' && p.reference_id && (
                          <div>
                            <dt className="text-xs text-[var(--color-text-muted)]">Wallet</dt>
                            <dd className="text-[var(--color-text)] font-medium">#{p.reference_id}</dd>
                          </div>
                        )}
                      </dl>

                      {(() => {
                        const related = resolveRelatedRoute(p);
                        return related ? (
                          <Link to={related.path} className="inline-block mt-3 px-3 py-1.5 text-xs bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] hover:opacity-90">
                            {related.label}
                          </Link>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {data && data.total > data.limit && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--color-border)]">
              <Button type="button" variant="ghost" disabled={page <= 1} onClick={() => { setPage((p) => Math.max(1, p - 1)); setSelectedId(null); }}>
                {t('common.previous')}
              </Button>
              <span className="text-sm text-[var(--color-text-muted)]">{t('common.page') || 'Page'} {page} {t('common.of') || 'of'} {Math.ceil(data.total / data.limit)}</span>
              <Button type="button" variant="ghost" disabled={page >= Math.ceil(data.total / data.limit)} onClick={() => { setPage((p) => p + 1); setSelectedId(null); }}>
                {t('common.next')}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </Can>
  );
}
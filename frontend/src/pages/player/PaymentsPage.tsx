import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { Button, Card } from '../../components/ui';
import { formatPrice } from '../../utils/currency';

type PaymentStatus = 'completed' | 'pending' | 'failed' | 'all';

export default function PaymentsPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<PaymentStatus>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['my-payments', filter, page],
    queryFn: () => api.get('/payments/transactions', {
      params: {
        page,
        limit: 20,
        ...(filter !== 'all' ? { status: filter } : {}),
      },
    }).then((r) => r.data),
  });

  const tabs: { key: PaymentStatus; label: string }[] = [
    { key: 'all', label: t('common.all') },
    { key: 'completed', label: t('common.completed') },
    { key: 'pending', label: t('common.pending') },
    { key: 'failed', label: t('common.rejected') || 'Failed' },
  ];

  return (
    <Can permission="player.payments.view">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{t('player.payments.title') || 'Payment History'}</h1>

        <Card>
          <div className="flex gap-1 mb-4 border-b border-[var(--color-border)]">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setFilter(tab.key); setPage(1); }}
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

          {isLoading ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
          ) : !data?.data?.length ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t('player.payments.no_payments') || 'No payments found.'}</p>
          ) : (
            <div className="space-y-2">
              {data.data.map((p: any) => (
                <div key={p.id}>
                  <button
                    onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    className="w-full flex items-center justify-between py-3 px-3 rounded-[var(--radius-md)] hover:bg-[var(--color-bg)] transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-text)] capitalize">
                        {p.type?.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {p.reference || ''} &middot; {new Date(p.created_at || p.date).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-semibold text-[var(--color-text)]">
                        {formatPrice(Number(p.amount || 0), p.currency)}
                      </p>
                      <span className={`text-xs font-medium ${
                        p.status === 'completed' ? 'text-[var(--color-success)]' :
                        p.status === 'pending' ? 'text-[var(--color-warning)]' :
                        'text-[var(--color-error)]'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                  </button>
                  {expandedId === p.id && p.details && (
                    <div className="px-3 pb-3 text-xs text-[var(--color-text-muted)] bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3 mb-2">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(p.details, null, 2)}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {data && data.total > data.limit && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--color-border)]">
              <Button type="button" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {t('common.previous')}
              </Button>
              <span className="text-sm text-[var(--color-text-muted)]">{t('common.page') || 'Page'} {page} {t('common.of') || 'of'} {Math.ceil(data.total / data.limit)}</span>
              <Button type="button" variant="ghost" disabled={page >= Math.ceil(data.total / data.limit)} onClick={() => setPage((p) => p + 1)}>
                {t('common.next')}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </Can>
  );
}

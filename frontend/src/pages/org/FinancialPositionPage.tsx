import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import { Spinner } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useTranslation } from '../../i18n';
import { formatPrice } from '../../utils/currency';

interface BalanceBucket {
  amount: number;
  count: number;
}

interface StatusBalances {
  pending: BalanceBucket;
  available: BalanceBucket;
  held: BalanceBucket;
  reserved: BalanceBucket;
  settled: BalanceBucket;
}

interface CollectorSplit {
  courtzonCollected: number;
  orgCollected: number;
}

export interface PositionSummary {
  organisationId: number;
  balances: StatusBalances;
  earnings: { open: number; lifetime: number } & CollectorSplit;
  commission: { open: number; lifetime: number } & CollectorSplit;
  adjustments: { organisationAdjustments: number; courtzonAdjustments: number };
  position: {
    owedToOrg: number;
    owedByOrg: number;
    net: number;
    direction: 'PAYABLE_TO_ORGANISATION' | 'RECEIVABLE_FROM_ORGANISATION' | 'SETTLED_UP';
    openCount: number;
  };
}

export const POSITION_BUCKET_TOOLTIP: Record<string, string> = {
  available: 'Eligible for settlement — these entitlements have matured and can be included in the next settlement cycle.',
  pending: 'Awaiting maturation — revenue events that have not yet reached eligibility for settlement (e.g., return windows, processing delays).',
  held: 'Frozen due to active complaints or disputes — these funds are temporarily blocked until resolution.',
  reserved: 'Reserved for an active settlement — these entitlements have been allocated to a settlement that is currently being processed.',
  settled: 'Already consumed in a past settlement — these entitlements have been paid out or reconciled.',
};

const DIRECTION_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  PAYABLE_TO_ORGANISATION: { label: 'CourtZon owes you', color: 'text-[var(--color-success)]', icon: '↓' },
  RECEIVABLE_FROM_ORGANISATION: { label: 'You owe CourtZon', color: 'text-[var(--color-error)]', icon: '↑' },
  SETTLED_UP: { label: 'Settled up', color: 'text-[var(--color-text-muted)]', icon: '—' },
};

export const BUCKET_BORDER_COLORS: Record<string, string> = {
  available: 'border-l-[var(--color-success)]',
  pending: 'border-l-[var(--color-warning)]',
  held: 'border-l-[var(--color-error)]',
  reserved: 'border-l-blue-500',
  settled: 'border-l-[var(--color-text-muted)]',
};

export function BalanceCard({ label, bucket, borderClass, tooltipKey }: {
  label: string;
  bucket: BalanceBucket;
  borderClass: string;
  tooltipKey: string;
}) {
  const isEmpty = bucket.amount === 0 && bucket.count === 0;
  return (
    <div
      className={`bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 border-l-4 ${borderClass}`}
      title={POSITION_BUCKET_TOOLTIP[tooltipKey]}
    >
      <p className="text-xs text-[var(--color-text-muted)] mb-1">{label}</p>
      <p className="text-lg font-bold text-[var(--color-text)]">{formatPrice(bucket.amount)}</p>
      {isEmpty ? (
        <p className="text-xs text-[var(--color-text-muted)] mt-1">No entries</p>
      ) : (
        <p className="text-xs text-[var(--color-text-muted)] mt-1">{bucket.count} entitlement{bucket.count !== 1 ? 's' : ''}</p>
      )}
    </div>
  );
}

export function CollectorInfoSection({ position, t }: { position: PositionSummary; t: (k: string, d?: string) => string }) {
  const { earnings, commission } = position;
  if (earnings.open === 0 && commission.open === 0 && earnings.lifetime === 0 && commission.lifetime === 0) {
    return null;
  }

  return (
    <div>
      <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
        {t('financial_position.custody_breakdown', 'Custody Breakdown')}
      </p>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4">
        <p className="text-xs text-[var(--color-text-muted)] mb-3 leading-relaxed">
          {t('financial_position.custody_explanation', 'CourtZon collects fees digitally; you collect cash/COD directly. These columns show how your earnings and platform commissions split across collection methods.')}
        </p>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-[var(--color-text)] mb-1">{t('financial_position.your_earnings', 'Your Earnings')}</p>
            <div className="space-y-1 text-[var(--color-text-muted)]">
              <p>Digital (via CourtZon): <span className="font-medium text-[var(--color-text)]">{formatPrice(earnings.courtzonCollected)}</span></p>
              <p>Cash/COD (direct): <span className="font-medium text-[var(--color-text)]">{formatPrice(earnings.orgCollected)}</span></p>
            </div>
          </div>
          <div>
            <p className="font-medium text-[var(--color-text)] mb-1">{t('financial_position.platform_commission', 'Platform Commission')}</p>
            <div className="space-y-1 text-[var(--color-text-muted)]">
              <p>Digital (via CourtZon): <span className="font-medium text-[var(--color-text)]">{formatPrice(commission.courtzonCollected)}</span></p>
              <p>Cash/COD (direct): <span className="font-medium text-[var(--color-text)]">{formatPrice(commission.orgCollected)}</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FinancialPositionPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { t } = useTranslation();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['org-position', orgId],
    queryFn: () => api.get(`/org/${orgId}/position`).then((r) => r.data?.data || r.data) as Promise<PositionSummary>,
    enabled: !!orgId,
  });

  if (!orgId) {
    return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  }

  if (isLoading) return <Spinner />;

  if (isError) {
    return (
      <Can permission="org.finance.position.view">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)] mb-4">
            {t('financial_position.title', 'Financial Position & Settlement Readiness')}
          </h1>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-8 text-center">
            <p className="text-[var(--color-error)] mb-2 font-medium">
              {t('financial_position.error', 'Failed to load financial position')}
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              {(error as any)?.message || t('financial_position.error_hint', 'Please try again later.')}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-4 px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white hover:opacity-90"
            >
              {t('financial_position.retry', 'Retry')}
            </button>
          </div>
        </div>
      </Can>
    );
  }

  const directionConfig = DIRECTION_CONFIG[data?.position?.direction ?? 'SETTLED_UP'] ?? DIRECTION_CONFIG.SETTLED_UP;
  const hasAnyBalance = data && (
    data.balances.available.amount !== 0 ||
    data.balances.pending.amount !== 0 ||
    data.balances.held.amount !== 0 ||
    data.balances.reserved.amount !== 0 ||
    data.balances.settled.amount !== 0
  );

  return (
    <Can permission="org.finance.position.view">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[var(--color-text)]">
            {t('financial_position.title', 'Financial Position & Settlement Readiness')}
          </h1>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-50"
          >
            {isFetching
              ? t('financial_position.refreshing', 'Refreshing…')
              : t('financial_position.refresh', 'Refresh')}
          </button>
        </div>

        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed max-w-3xl">
          {t('financial_position.explanation', 'Your financial position across all revenue streams — bookings, coach sessions, marketplace orders, and adjustments. Each bucket represents a different stage in the settlement lifecycle.')}
        </p>

        {/* Net Position Banner */}
        {data?.position && (
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide mb-1">
                  {t('financial_position.net_position', 'Net Position')}
                </p>
                <p className={`text-2xl font-bold ${directionConfig.color}`}>
                  {directionConfig.icon} {formatPrice(Math.abs(data.position.net))}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-medium ${directionConfig.color}`}>{directionConfig.label}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t('financial_position.open_entitlements', '{{count}} open entitlements', { count: data.position.openCount })}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-[var(--color-border)] text-sm">
              <div>
                <p className="text-[var(--color-text-muted)]">{t('financial_position.owed_to_org', 'Owed to you (earnings + adjustments)')}</p>
                <p className="font-medium text-[var(--color-text)]">{formatPrice(data.position.owedToOrg)}</p>
              </div>
              <div>
                <p className="text-[var(--color-text-muted)]">{t('financial_position.owed_by_org', 'Owed by you (commissions + adjustments)')}</p>
                <p className="font-medium text-[var(--color-text)]">{formatPrice(data.position.owedByOrg)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Financial Position — 5 Buckets */}
        <div>
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
            {t('financial_position.financial_position', 'Financial Position')}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            {t('financial_position.bucket_explanation', 'Hover over each bucket for details on what funds it represents.')}
          </p>
          {hasAnyBalance ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <BalanceCard label={t('financial_position.available', 'Available')} bucket={data!.balances.available} borderClass={BUCKET_BORDER_COLORS.available} tooltipKey="available" />
              <BalanceCard label={t('financial_position.pending', 'Pending')} bucket={data!.balances.pending} borderClass={BUCKET_BORDER_COLORS.pending} tooltipKey="pending" />
              <BalanceCard label={t('financial_position.held', 'Held')} bucket={data!.balances.held} borderClass={BUCKET_BORDER_COLORS.held} tooltipKey="held" />
              <BalanceCard label={t('financial_position.reserved', 'Reserved')} bucket={data!.balances.reserved} borderClass={BUCKET_BORDER_COLORS.reserved} tooltipKey="reserved" />
              <BalanceCard label={t('financial_position.settled', 'Settled')} bucket={data!.balances.settled} borderClass={BUCKET_BORDER_COLORS.settled} tooltipKey="settled" />
            </div>
          ) : (
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-8 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">
                {t('financial_position.empty', 'No financial entitlements recorded yet. Your position will appear here once revenue events are generated.')}
              </p>
            </div>
          )}
        </div>

        {/* Collector Info / Custody Breakdown */}
        {data && <CollectorInfoSection position={data} t={t} />}

        {/* Settlement Readiness */}
        {data && (
          <div>
            <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
              {t('financial_position.settlement_readiness', 'Settlement Readiness')}
            </p>
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-[var(--color-text-muted)]">{t('financial_position.available_for_settlement', 'Available for settlement')}</p>
                  <p className="font-bold text-[var(--color-text)]">{formatPrice(data.balances.available.amount)}</p>
                </div>
                <div>
                  <p className="text-[var(--color-text-muted)]">{t('financial_position.frozen_by_disputes', 'Frozen by disputes')}</p>
                  <p className="font-bold text-[var(--color-text)]">{formatPrice(data.balances.held.amount)}</p>
                </div>
                <div>
                  <p className="text-[var(--color-text-muted)]">{t('financial_position.already_settled', 'Already settled (lifetime)')}</p>
                  <p className="font-bold text-[var(--color-text)]">{formatPrice(data.balances.settled.amount)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Can>
  );
}

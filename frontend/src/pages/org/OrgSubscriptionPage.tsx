import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { formatPrice } from '../../utils/currency';
import SubscriptionRequestModal from '../../components/subscription/SubscriptionRequestModal';

const billingCycleLabels: Record<string, string> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
};

const paymentMethodLabels: Record<string, string> = {
  card: 'Credit Card',
  cash: 'Cash',
  wallet: 'Wallet',
  bank_transfer: 'Bank Transfer',
  online: 'Online',
};

const statusColors: Record<string, string> = {
  active: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
  suspended: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]',
  pending: 'bg-[var(--color-info-bg)] text-[var(--color-info-text)]',
  expired: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
  cancelled: 'bg-gray-100 text-gray-500',
};

function formatBillingCycle(c?: string | null): string {
  return (billingCycleLabels[c || ''] || c || '—');
}

function formatPaymentMethod(m?: string | null): string {
  return (paymentMethodLabels[m || ''] || m || '—');
}

export default function OrgSubscriptionPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestType, setRequestType] = useState<'NEW_SUBSCRIPTION' | 'PLAN_CHANGE' | 'RENEWAL'>('PLAN_CHANGE');

  const { data: subscription, isLoading, isError, error } = useQuery<any>({
    queryKey: ['org-subscription', orgId],
    queryFn: () => api.get(`/org/${orgId}/subscription`).then(r => r.data),
    enabled: !!orgId,
  });

  const { data: requestsData } = useQuery<any>({
    queryKey: ['org-subscription-requests', orgId],
    queryFn: () => api.get(`/org/${orgId}/subscription/requests`).then(r => r.data),
    enabled: !!orgId,
  });

  const { data: periodsData } = useQuery<any>({
    queryKey: ['org-subscription-periods', orgId],
    queryFn: () => api.get(`/org/${orgId}/subscription/periods`).then(r => r.data),
    enabled: !!orgId,
  });

  const { data: transactionsData } = useQuery<any>({
    queryKey: ['org-transactions', orgId],
    queryFn: () => api.get(`/org/${orgId}/transactions`, { params: { page: 1, limit: 10 } }).then(r => r.data),
    enabled: !!orgId,
  });

  if (!orgId) return <div>Invalid organisation</div>;
  if (isLoading) return <div className="text-sm text-[var(--color-text-muted)] py-8">Loading...</div>;
  if (isError) return (
    <div className="bg-[var(--color-error-bg)] border border-[var(--color-error-border)] rounded-[var(--radius-lg)] p-5 text-center">
      <p className="text-[var(--color-error)] font-medium">Failed to load subscription data</p>
      <p className="text-sm text-[var(--color-text-muted)] mt-1">{(error as any)?.message || 'An unexpected error occurred'}</p>
      <button onClick={() => window.location.reload()} className="mt-3 px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
        Retry
      </button>
    </div>
  );

  const sub = subscription;
  const requests = requestsData?.data || [];
  const periods = periodsData?.data || [];
  const transactions = transactionsData?.data || [];
  const hasPlan = !!sub?.planId;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Subscription</h1>

      {/* Current Plan Card */}
      {sub && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="font-semibold text-lg text-[var(--color-text)]">
                {sub.planName || 'No Plan'}
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-[var(--color-text-muted)]">
                {sub.isUnlimited ? (
                  <span className="text-[var(--color-text)] font-medium">Free</span>
                ) : (
                  sub.priceMonthly != null && (
                    <span className="text-[var(--color-text)] font-medium">
                      {sub.billingCycle === 'yearly' && sub.priceYearly != null
                        ? `${formatPrice(Number(sub.priceYearly))}/yr`
                        : `${formatPrice(Number(sub.priceMonthly))}/mo`}
                    </span>
                  )
                )}
                {sub.billingCycle && (
                  <span>{formatBillingCycle(sub.billingCycle)}</span>
                )}
                {sub.isInternal && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-border)] text-[var(--color-text-muted)]">Internal</span>
                )}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[sub.status] || ''}`}>
                  {sub.status === 'active' ? 'Active' : sub.status === 'suspended' ? 'Suspended' : sub.status === 'pending' ? 'Pending Activation' : sub.status}
                </span>
              </div>
              {/* Expiration */}
              {sub.startDate && (
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  Started: {new Date(sub.startDate).toLocaleDateString('en-GB')}
                </p>
              )}
              {sub.endDate && (
                <p className={`text-xs mt-0.5 ${new Date(sub.endDate) < new Date() ? 'text-[var(--color-error)] font-medium' : 'text-[var(--color-text-muted)]'}`}>
                  {new Date(sub.endDate) < new Date() ? 'Expired: ' : 'Expires: '}
                  {new Date(sub.endDate).toLocaleDateString('en-GB')}
                </p>
              )}
              {/* Payment method / status (only when the backend provides it) */}
              {(sub.paymentMethod || sub.paymentStatus) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-[var(--color-text-muted)]">
                  {sub.paymentMethod && (
                    <span>
                      Payment: <span className="text-[var(--color-text)] font-medium">{formatPaymentMethod(sub.paymentMethod)}</span>
                    </span>
                  )}
                  {sub.paymentStatus && (
                    <span>
                      Status: <span className="text-[var(--color-text)] font-medium capitalize">{sub.paymentStatus.replace(/_/g, ' ')}</span>
                    </span>
                  )}
                </div>
              )}
            </div>
            {sub.pendingRequest ? (
              <div className="bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] rounded-[var(--radius-md)] p-3 text-xs max-w-xs">
                <p className="font-medium mb-1">Pending {sub.pendingRequest.requestType === 'NEW_SUBSCRIPTION' ? 'Subscription' : sub.pendingRequest.requestType === 'RENEWAL' ? 'Renewal' : 'Change'} Request</p>
                <p>{sub.pendingRequest.requestedPlanName && <>To: <strong>{sub.pendingRequest.requestedPlanName}</strong></>}</p>
                <p className="mt-1">Submitted: {new Date(sub.pendingRequest.createdAt).toLocaleDateString('en-GB')}</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Can permission="org.subscription.promote">
                  {hasPlan && (
                    <button
                      onClick={() => { setRequestType('PLAN_CHANGE'); setShowRequestModal(true); }}
                      className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium"
                    >
                      Change Plan
                    </button>
                  )}
                  {!hasPlan && (
                    <button
                      onClick={() => { setRequestType('NEW_SUBSCRIPTION'); setShowRequestModal(true); }}
                      className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-xs font-medium"
                    >
                      Get a Plan
                    </button>
                  )}
                </Can>
                <Can permission="org.subscription.renew">
                  {hasPlan && sub.planId && !sub.upcomingRenewal && (() => {
                    const end = sub.endDate ? new Date(sub.endDate) : null;
                    const now = new Date();
                    const daysLeft = end ? Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                    const expiredish = end && daysLeft !== null && daysLeft < 0;
                    return (
                      <button
                        onClick={() => { setRequestType('RENEWAL'); setShowRequestModal(true); }}
                        className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium ${
                          expiredish || (daysLeft !== null && daysLeft <= 30)
                            ? 'bg-[var(--color-success)] text-white'
                            : 'border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                        }`}
                      >
                        {expiredish ? 'Renew (Expired)' : 'Renew'}
                      </button>
                    );
                  })()}
                </Can>
              </div>
            )}
          </div>

          {/* Features */}
          {sub.features && sub.features.length > 0 && (
            <div className="border-t border-[var(--color-border)] pt-4 mt-2">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Plan Features & Usage</h3>              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {sub.features.map((f: any) => {
                  const isNumeric = f.valueType === 'numeric';
                  const limit = parseInt(f.value, 10);
                  const atLimit = isNumeric && f.usage >= limit && limit > 0 && !isNaN(limit);
                  return (
                    <div key={f.featureKey} className={`p-3 rounded-[var(--radius-md)] text-sm ${atLimit ? 'bg-[var(--color-error-bg)] border border-[var(--color-error-border)]' : 'bg-[var(--color-bg)]'}`}>
                      <p className="text-[var(--color-text-muted)] text-xs mb-1">{f.label}</p>
                      <p className={`font-medium ${atLimit ? 'text-[var(--color-error)]' : 'text-[var(--color-text)]'}`}>
                        {isNumeric
                          ? `${f.usage} / ${f.value === '-1' ? '∞' : f.value}${f.unit ? ` ${f.unit}` : ''}`
                          : f.valueType === 'boolean' ? (f.value === 'true' ? '✓ Included' : '✗ Not included') : f.value}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scheduled renewal — next period already secured */}
      {sub?.upcomingRenewal && (
        <div className="bg-[var(--color-info-bg)] border border-[var(--color-info-border)] rounded-[var(--radius-lg)] p-5">
          <h2 className="font-semibold text-[var(--color-text)] mb-1">Renewal Scheduled</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Your next period{sub.upcomingRenewal.planName ? <> on <strong className="text-[var(--color-text)]">{sub.upcomingRenewal.planName}</strong></> : ''} starts on{' '}
            <strong className="text-[var(--color-text)]">{new Date(sub.upcomingRenewal.startDate).toLocaleDateString('en-GB')}</strong>
            {sub.upcomingRenewal.endDate && <> and runs until {new Date(sub.upcomingRenewal.endDate).toLocaleDateString('en-GB')}</>}.
            No further action is needed.
          </p>
        </div>
      )}

      {/* Subscription Period History */}
      {periods.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-5">
          <h2 className="font-semibold text-[var(--color-text)] mb-3">Subscription History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
                  <th className="pb-2 pr-3 font-medium">Plan</th>
                  <th className="pb-2 pr-3 font-medium">Billing</th>
                  <th className="pb-2 pr-3 font-medium">Amount</th>
                  <th className="pb-2 pr-3 font-medium">Start</th>
                  <th className="pb-2 pr-3 font-medium">End</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p: any) => (
                  <tr key={p.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2 pr-3 text-xs font-medium text-[var(--color-text)]">
                      {p.plan_name}
                      {p.is_internal == 1 && <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-border)] text-[var(--color-text-muted)]">Internal</span>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--color-text-muted)]">{formatBillingCycle(p.billing_cycle)}</td>
                    <td className="py-2 pr-3 text-xs font-medium text-[var(--color-text)]">
                      {Number(p.is_unlimited) === 1 ? 'Free' : (p.price != null ? formatPrice(Number(p.price)) : '—')}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--color-text-muted)]">{p.start_date ? new Date(p.start_date).toLocaleDateString('en-GB') : '—'}</td>
                    <td className="py-2 pr-3 text-xs text-[var(--color-text-muted)]">{p.end_date ? new Date(p.end_date).toLocaleDateString('en-GB') : 'No expiry'}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[p.subscription_status] || ''}`}>{p.subscription_status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Request History */}
      {requests.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-5">
          <h2 className="font-semibold text-[var(--color-text)] mb-3">Request History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Type</th>
                  <th className="pb-2 pr-3 font-medium">Requested Plan</th>
                  <th className="pb-2 pr-3 font-medium">Billing</th>
                  <th className="pb-2 pr-3 font-medium">Amount</th>
                  <th className="pb-2 pr-3 font-medium">Payment</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r: any) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2 pr-3 text-xs text-[var(--color-text-muted)]">{new Date(r.created_at).toLocaleDateString('en-GB')}</td>
                    <td className="py-2 pr-3 text-xs">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        r.request_type === 'NEW_SUBSCRIPTION' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>{r.request_type === 'NEW_SUBSCRIPTION' ? 'New' : r.request_type === 'RENEWAL' ? 'Renewal' : 'Change'}</span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--color-text)]">{r.requested_plan_name || '—'}</td>
                    <td className="py-2 pr-3 text-xs text-[var(--color-text-muted)]">{formatBillingCycle(r.requested_billing_cycle)}</td>
                    <td className="py-2 pr-3 text-xs font-medium text-[var(--color-text)]">
                      {r.requested_price != null ? formatPrice(Number(r.requested_price)) : '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--color-text)]">{formatPaymentMethod(r.chosen_payment_method)}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        r.status === 'approved' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                        r.status === 'rejected' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' :
                        r.status === 'cancelled' ? 'bg-gray-100 text-gray-500' :
                        'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'
                      }`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      {transactions.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-5">
          <h2 className="font-semibold text-[var(--color-text)] mb-3">Recent Financial Activity</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Type</th>
                  <th className="pb-2 pr-3 font-medium">Amount</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx: any) => (
                  <tr key={tx.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="py-2 pr-3 text-xs text-[var(--color-text-muted)]">{new Date(tx.created_at).toLocaleDateString('en-GB')}</td>
                    <td className="py-2 pr-3 text-xs text-[var(--color-text)]">{tx.type || tx.entry_type || '—'}</td>
                    <td className="py-2 pr-3 text-xs font-medium text-[var(--color-text)]">
                      {Number(tx.amount || tx.total || 0).toFixed(2)} {tx.currency_code || 'EGP'}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        (tx.status === 'completed' || tx.status === 'approved') ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
                        tx.status === 'pending' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' :
                        'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'
                      }`}>{tx.status || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <a href={`/org/${orgId}/finance`} className="text-xs text-[var(--color-primary)] mt-3 inline-block hover:underline">
            View all financial activity →
          </a>
        </div>
      )}

      {/* No subscription state */}
      {!sub && (
        <div className="text-center py-12 text-sm text-[var(--color-text-muted)]">
          <p>No subscription information available.</p>
        </div>
      )}

      <SubscriptionRequestModal
        orgId={parseInt(orgId, 10)}
        open={showRequestModal}
        requestType={requestType}
        onClose={() => setShowRequestModal(false)}
      />
    </div>
  );
}

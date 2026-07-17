import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { useToast } from '../ui/Toast';
import SubscriptionRequestModal from './SubscriptionRequestModal';

interface Props {
  orgId: number;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB');
}

function formatPrice(price: number | null | undefined, cycle: string | null | undefined): string {
  if (price == null) return '—';
  return `${Number(price).toFixed(0)} EGP/${cycle === 'yearly' ? 'yr' : 'mo'}`;
}

export default function SubscriptionCard({ orgId }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestType, setRequestType] = useState<'NEW_SUBSCRIPTION' | 'PLAN_CHANGE'>('PLAN_CHANGE');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const { data: sub, isLoading } = useQuery<any>({
    queryKey: ['org-subscription', orgId],
    queryFn: () => api.get(`/org/${orgId}/subscription`).then(r => r.data),
  });

  const { data: requestsData } = useQuery<any>({
    queryKey: ['org-subscription-requests', orgId],
    queryFn: () => api.get(`/org/${orgId}/subscription/requests`).then(r => r.data),
  });

  const cancelMutation = useMutation({
    mutationFn: (requestId: number) =>
      api.post(`/org/${orgId}/subscription/requests/${requestId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['org-subscription-requests'] });
      setConfirmCancel(false);
      showToast('Subscription request cancelled');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to cancel request', 'error'),
  });

  const requests = requestsData?.data || [];
  const latestRequest = requests[0] || null;
  const hasPlan = !!sub?.planId;
  const isExpired = sub?.endDate && new Date(sub.endDate) < new Date();
  const expiringSoon = sub?.endDate && !isExpired && Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 30;
  const daysRemaining = sub?.endDate ? Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const hasRejected = latestRequest?.status === 'rejected';
  const hasCancelled = latestRequest?.status === 'cancelled' && !sub?.pendingRequest;

  const statusBadge = (): { label: string; style: string; ariaLabel: string } => {
    if (sub?.pendingRequest) return { label: 'Pending Review', style: 'bg-blue-100 text-blue-700 border-blue-200', ariaLabel: 'Subscription request pending review' };
    if (isExpired) return { label: 'Expired', style: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)] border-[var(--color-error-border)]', ariaLabel: 'Subscription expired' };
    if (expiringSoon) return { label: 'Expiring Soon', style: 'bg-amber-100 text-amber-700 border-amber-200', ariaLabel: 'Subscription expiring soon' };
    if (sub?.status === 'active') return { label: 'Active', style: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] border-[var(--color-success-border)]', ariaLabel: 'Subscription active' };
    if (sub?.status === 'pending') return { label: 'Pending', style: 'bg-blue-100 text-blue-700 border-blue-200', ariaLabel: 'Subscription pending activation' };
    return { label: 'No Subscription', style: 'bg-gray-100 text-gray-500 border-gray-200', ariaLabel: 'No active subscription' };
  };

  const badge = statusBadge();

  if (isLoading) {
    return (
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-6 animate-pulse" role="status" aria-label="Loading subscription data">
        <div className="h-6 w-48 bg-[var(--color-bg)] rounded mb-4" />
        <div className="h-4 w-32 bg-[var(--color-bg)] rounded mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-12 bg-[var(--color-bg)] rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">📋</span>
            <div>
              <h2 className="text-lg font-bold text-[var(--color-text)]">Subscription</h2>
              <p className="text-xs text-[var(--color-text-muted)]">Manage your organisation's subscription plan</p>
            </div>
          </div>
          <span className={`self-start sm:self-center px-3 py-1 rounded-full text-xs font-semibold border ${badge.style}`} role="status" aria-label={badge.ariaLabel}>
            {badge.label}
          </span>
        </div>

        {/* Rejected/Cancelled banner (above the main state) */}
        {hasRejected && !sub?.pendingRequest && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-[var(--radius-md)] p-3 flex items-start gap-2">
            <span className="shrink-0 mt-0.5" aria-hidden="true">❌</span>
            <div>
              <p className="text-xs font-medium text-red-800">Previous request rejected</p>
              <p className="text-xs text-red-600 mt-0.5">
                {latestRequest.rejection_reason
                  ? `Reason: ${latestRequest.rejection_reason}`
                  : 'Your previous subscription request was not approved.'}
              </p>
            </div>
          </div>
        )}

        {hasCancelled && !sub?.pendingRequest && (
          <div className="mx-6 mt-4 bg-gray-50 border border-gray-200 rounded-[var(--radius-md)] p-3 flex items-start gap-2">
            <span className="shrink-0 mt-0.5" aria-hidden="true">↩️</span>
            <div>
              <p className="text-xs font-medium text-gray-700">Previous request cancelled</p>
              <p className="text-xs text-gray-500 mt-0.5">You cancelled your previous subscription request. You can submit a new one at any time.</p>
            </div>
          </div>
        )}

        {sub?.pendingRequest ? (
          /* ── State: Pending Request ── */
          <div className="px-6 py-5 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-[var(--radius-md)] p-4 flex items-start gap-3">
              <span className="text-lg shrink-0 mt-0.5" aria-hidden="true">⏳</span>
              <div>
                <p className="text-sm font-medium text-blue-800">Subscription Request Under Review</p>
                <p className="text-xs text-blue-600 mt-1">
                  Your request is being reviewed by the administration team. You will be notified once a decision is made. No further requests can be submitted until this one is processed.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sub.planName && (
                <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                  <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Current Plan</p>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{sub.planName}</p>
                </div>
              )}
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Requested Plan</p>
                <p className="text-sm font-semibold text-[var(--color-text)]">{sub.pendingRequest.requestedPlanName || 'Unknown'}</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Request Type</p>
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  {sub.pendingRequest.requestType === 'NEW_SUBSCRIPTION' ? 'New Subscription' : 'Plan Change'}
                </p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Submitted</p>
                <p className="text-sm font-semibold text-[var(--color-text)]">{formatDate(sub.pendingRequest.createdAt)}</p>
              </div>
            </div>

            {/* Cancel button */}
            {!confirmCancel ? (
              <button
                onClick={() => setConfirmCancel(true)}
                className="text-xs text-[var(--color-error)] hover:underline font-medium"
                aria-label="Cancel pending subscription request"
              >
                Cancel this request
              </button>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-[var(--radius-md)]">
                <p className="text-xs text-red-700 flex-1">Are you sure you want to cancel this request?</p>
                <button
                  onClick={() => cancelMutation.mutate(sub.pendingRequest.id)}
                  disabled={cancelMutation.isPending}
                  className="px-3 py-1.5 bg-[var(--color-error)] text-white rounded-[var(--radius-md)] text-xs font-medium disabled:opacity-50"
                  aria-label="Confirm cancel request"
                >
                  {cancelMutation.isPending ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
                <button
                  onClick={() => setConfirmCancel(false)}
                  className="px-3 py-1.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-xs"
                  aria-label="Keep request"
                >
                  Keep Request
                </button>
              </div>
            )}
          </div>

        ) : !hasPlan || isExpired ? (
          /* ── State: No Plan / Expired ── */
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0 mt-0.5" aria-hidden="true">{isExpired ? '⏰' : '📭'}</span>
              <div>
                <h3 className="text-lg font-bold text-[var(--color-text)]">
                  {isExpired ? 'Your Subscription Has Expired' : 'No Active Subscription'}
                </h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  {isExpired
                    ? 'Renew your subscription to regain access to premium features including advanced reporting, staff management, and marketplace selling.'
                    : 'Subscribe to unlock premium features for your organisation. Choose a plan that fits your needs.'}
                </p>
              </div>
            </div>

            {isExpired && sub?.planName && (
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Last Plan</p>
                <p className="text-sm font-semibold text-[var(--color-text)]">{sub.planName}</p>
              </div>
            )}

            <Can permission="subscription.request">
              <button
                onClick={() => {
                  setRequestType('NEW_SUBSCRIPTION');
                  setShowRequestModal(true);
                }}
                className="w-full sm:w-auto px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2"
                aria-label={isExpired ? 'Renew subscription' : 'Request a subscription'}
              >
                {isExpired ? 'Renew Subscription' : 'Request Subscription'}
              </button>
            </Can>

            {!isExpired && !hasPlan && (
              <div className="bg-amber-50 border border-amber-200 rounded-[var(--radius-md)] p-3 text-xs text-amber-700">
                <span className="font-medium">⚙️ Limited functionality</span>
                <p className="mt-0.5">Some features such as advanced reporting, staff management, and marketplace selling require an active subscription plan.</p>
              </div>
            )}
          </div>

        ) : (
          /* ── State: Active Subscription ── */
          <div className="px-6 py-5 space-y-4">
            {/* Plan info grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Plan</p>
                <p className="text-sm font-bold text-[var(--color-text)]">{sub.planName || '—'}</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Price</p>
                <p className="text-sm font-bold text-[var(--color-text)]">
                  {sub.isUnlimited ? 'Free' : formatPrice(sub.priceMonthly || sub.priceYearly, sub.billingCycle)}
                </p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Billing</p>
                <p className="text-sm font-bold text-[var(--color-text)] capitalize">{sub.billingCycle || 'Monthly'}</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Started</p>
                <p className="text-sm font-bold text-[var(--color-text)]">{formatDate(sub.startDate)}</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Expires</p>
                <p className={`text-sm font-bold ${isExpired ? 'text-[var(--color-error)]' : expiringSoon ? 'text-amber-600' : 'text-[var(--color-text)]'}`}>
                  {formatDate(sub.endDate)}
                </p>
              </div>
            </div>

            {/* Days remaining */}
            {daysRemaining !== null && (
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                isExpired ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' :
                expiringSoon ? 'bg-amber-50 text-amber-700' :
                'bg-[var(--color-bg)] text-[var(--color-text-muted)]'
              }`} role="status" aria-label={isExpired ? 'Subscription expired' : `${daysRemaining} days remaining`}>
                {isExpired ? 'Expired' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`}
              </div>
            )}

            {/* Features */}
            {sub.features && sub.features.length > 0 && (
              <div>
                <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-2">Plan Features &amp; Usage</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {sub.features.map((f: any) => {
                    const isNumeric = f.valueType === 'numeric';
                    const limit = parseInt(f.value, 10);
                    const atLimit = isNumeric && f.usage >= limit && limit > 0 && !isNaN(limit);
                    return (
                      <div key={f.featureKey}
                        className={`flex items-center justify-between text-xs p-2 rounded ${
                          atLimit ? 'bg-[var(--color-error-bg)] border border-[var(--color-error-border)]' : 'bg-[var(--color-bg)]'
                        }`}
                      >
                        <span className="text-[var(--color-text-muted)]">{f.label}</span>
                        <span className={`font-medium ml-2 ${atLimit ? 'text-[var(--color-error)]' : 'text-[var(--color-text)]'}`}>
                          {isNumeric
                            ? `${f.usage}/${f.value === '-1' || isNaN(limit) ? '∞' : f.value}${f.unit ? ` ${f.unit}` : ''}`
                            : f.valueType === 'boolean'
                              ? (f.value === 'true' ? '✓' : '—')
                              : String(f.value || '—')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-2">
              <Can permission="subscription.request">
                <button
                  onClick={() => {
                    setRequestType('PLAN_CHANGE');
                    setShowRequestModal(true);
                  }}
                  className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2"
                  aria-label="Change current subscription plan"
                >
                  Change Plan
                </button>
              </Can>
            </div>
          </div>
        )}

        {/* Footer links */}
        <div className="px-6 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/30 flex flex-wrap items-center gap-4">
          {requests.length > 0 && (
            <Link
              to={`/org/${orgId}/subscription`}
              className="text-xs text-[var(--color-primary)] hover:underline font-medium"
            >
              View request history & details →
            </Link>
          )}
          {!requests.length && !sub?.pendingRequest && (
            <span className="text-xs text-[var(--color-text-muted)]">
              No previous requests
            </span>
          )}
        </div>
      </div>

      <SubscriptionRequestModal
        orgId={orgId}
        open={showRequestModal}
        requestType={requestType}
        onClose={() => setShowRequestModal(false)}
      />
    </>
  );
}

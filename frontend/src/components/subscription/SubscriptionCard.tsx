import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import SubscriptionRequestModal from './SubscriptionRequestModal';

interface Props {
  orgId: number;
}

export default function SubscriptionCard({ orgId }: Props) {
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestType, setRequestType] = useState<'NEW_SUBSCRIPTION' | 'PLAN_CHANGE'>('PLAN_CHANGE');

  const { data: sub, isLoading } = useQuery<any>({
    queryKey: ['org-subscription', orgId],
    queryFn: () => api.get(`/org/${orgId}/subscription`).then(r => r.data),
  });

  const { data: requestsData } = useQuery<any>({
    queryKey: ['org-subscription-requests', orgId],
    queryFn: () => api.get(`/org/${orgId}/subscription/requests`).then(r => r.data),
  });

  const requests = requestsData?.data || [];
  const hasPlan = !!sub?.planId;
  const isExpired = sub?.endDate && new Date(sub.endDate) < new Date();
  const expiringSoon = sub?.endDate && !isExpired && Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 30;
  const daysRemaining = sub?.endDate ? Math.ceil((new Date(sub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  const statusBadge = () => {
    if (sub?.pendingRequest) {
      return { label: 'Pending Review', style: 'bg-blue-100 text-blue-700 border-blue-200' };
    }
    if (isExpired) {
      return { label: 'Expired', style: 'bg-[var(--color-error-bg)] text-[var(--color-error-text)] border-[var(--color-error-border)]' };
    }
    if (expiringSoon) {
      return { label: 'Expiring Soon', style: 'bg-amber-100 text-amber-700 border-amber-200' };
    }
    if (sub?.status === 'active') {
      return { label: 'Active', style: 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] border-[var(--color-success-border)]' };
    }
    if (sub?.status === 'pending') {
      return { label: 'Pending', style: 'bg-blue-100 text-blue-700 border-blue-200' };
    }
    return { label: 'Inactive', style: 'bg-gray-100 text-gray-500 border-gray-200' };
  };

  const badge = statusBadge();

  if (isLoading) {
    return (
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-6 animate-pulse">
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
            <div className="text-2xl">📋</div>
            <div>
              <h2 className="text-lg font-bold text-[var(--color-text)]">Subscription</h2>
              <p className="text-xs text-[var(--color-text-muted)]">Manage your organisation's subscription plan</p>
            </div>
          </div>
          <span className={`self-start sm:self-center px-3 py-1 rounded-full text-xs font-semibold border ${badge.style}`}>
            {badge.label}
          </span>
        </div>

        {sub?.pendingRequest ? (
          /* ── State C: Pending Request ── */
          <div className="px-6 py-5 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-[var(--radius-md)] p-4 flex items-start gap-3">
              <span className="text-lg shrink-0 mt-0.5">⏳</span>
              <div>
                <p className="text-sm font-medium text-blue-800">Subscription Request Under Review</p>
                <p className="text-xs text-blue-600 mt-1">
                  Your request is being reviewed by the administration team. You will be notified once a decision is made. No further requests can be submitted until this one is processed.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sub.planName && (
                <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-4">
                  <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-1">Current Plan</p>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{sub.planName}</p>
                </div>
              )}
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-4">
                <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-1">Requested Plan</p>
                <p className="text-sm font-semibold text-[var(--color-text)]">{sub.pendingRequest.requestedPlanName || 'Unknown'}</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-4">
                <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-1">Request Type</p>
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  {sub.pendingRequest.requestType === 'NEW_SUBSCRIPTION' ? 'New Subscription' : 'Plan Change'}
                </p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-4">
                <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-1">Submitted</p>
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  {new Date(sub.pendingRequest.createdAt).toLocaleDateString('en-GB')}
                </p>
              </div>
            </div>
          </div>
        ) : !hasPlan || isExpired ? (
          /* ── State A: No Active Subscription or Expired ── */
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-lg shrink-0 mt-0.5">{isExpired ? '⏰' : '📭'}</span>
              <div>
                <h3 className="text-base font-bold text-[var(--color-text)]">
                  {isExpired ? 'Subscription Expired' : 'No Active Subscription'}
                </h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  {isExpired
                    ? 'Your subscription has expired. Renew to regain access to premium features.'
                    : 'Your organisation is not currently subscribed. Some premium features are unavailable until you subscribe.'}
                </p>
              </div>
            </div>

            {isExpired && sub?.planName && (
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-4">
                <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-1">Previous Plan</p>
                <p className="text-sm font-semibold text-[var(--color-text)]">{sub.planName}</p>
              </div>
            )}

            <Can permission="subscription.request">
              <button
                onClick={() => {
                  setRequestType('NEW_SUBSCRIPTION');
                  setShowRequestModal(true);
                }}
                className="w-full sm:w-auto px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90 transition-opacity"
              >
                {isExpired ? 'Renew Subscription' : 'Request Subscription'}
              </button>
            </Can>

            {!hasPlan && (
              <div className="bg-amber-50 border border-amber-200 rounded-[var(--radius-md)] p-3 text-xs text-amber-700">
                ⚠️ Some features such as advanced reporting, staff management, and marketplace selling require an active subscription plan.
              </div>
            )}
          </div>
        ) : (
          /* ── State B: Active Subscription ── */
          <div className="px-6 py-5 space-y-4">
            {/* Plan info grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Plan</p>
                <p className="text-sm font-bold text-[var(--color-text)]">{sub.planName}</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Price</p>
                <p className="text-sm font-bold text-[var(--color-text)]">
                  {sub.isUnlimited
                    ? 'Free'
                    : sub.priceMonthly != null
                      ? `${Number(sub.priceMonthly).toFixed(0)} EGP/mo`
                      : sub.priceYearly != null
                        ? `${Number(sub.priceYearly).toFixed(0)} EGP/yr`
                        : 'N/A'}
                </p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Billing</p>
                <p className="text-sm font-bold text-[var(--color-text)] capitalize">{sub.billingCycle || 'Monthly'}</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Started</p>
                <p className="text-sm font-bold text-[var(--color-text)]">
                  {sub.startDate ? new Date(sub.startDate).toLocaleDateString('en-GB') : '—'}
                </p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-0.5">Expires</p>
                <p className={`text-sm font-bold ${isExpired ? 'text-[var(--color-error)]' : expiringSoon ? 'text-amber-600' : 'text-[var(--color-text)]'}`}>
                  {sub.endDate ? new Date(sub.endDate).toLocaleDateString('en-GB') : '—'}
                </p>
              </div>
            </div>

            {/* Days remaining */}
            {daysRemaining !== null && (
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                isExpired ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' :
                expiringSoon ? 'bg-amber-50 text-amber-700' :
                'bg-[var(--color-bg)] text-[var(--color-text-muted)]'
              }`}>
                <span>{isExpired ? 'Expired' : `${daysRemaining} days remaining`}</span>
              </div>
            )}

            {/* Features */}
            {sub.features && sub.features.length > 0 && (
              <div>
                <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-2">Plan Features & Usage</p>
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
                  className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Change Plan
                </button>
              </Can>
            </div>
          </div>
        )}

        {/* Request History Link */}
        {requests.length > 0 && (
          <div className="px-6 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/30">
            <Link
              to={`/org/${orgId}/subscription`}
              className="text-xs text-[var(--color-primary)] hover:underline font-medium"
            >
              View full subscription details & request history →
            </Link>
          </div>
        )}
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

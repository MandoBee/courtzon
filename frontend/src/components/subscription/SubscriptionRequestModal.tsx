import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import LegalConsent from '../legal/LegalConsent';
import BillingPeriodToggle from './BillingPeriodToggle';
import PaymobPixelCard from '../payment/PaymobPixelCard';
import PaymentStatusPoller from '../payment/PaymentStatusPoller';
import { usePaymentConfirm } from '../../hooks/usePaymentConfirm';
import { Can } from '../../permissions/Can';
import type { BillingPeriod } from '../../utils/subscription-pricing';

interface Props {
  orgId: number;
  open: boolean;
  onClose: () => void;
  requestType: 'NEW_SUBSCRIPTION' | 'PLAN_CHANGE' | 'RENEWAL';
  triggerMessage?: string;
}

interface PaymentInfo {
  paymentId: number;
  clientSecret: string;
}

export default function SubscriptionRequestModal({ orgId, open, onClose, requestType, triggerMessage }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { state: confirmState, confirm: confirmPayment } = usePaymentConfirm();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingPeriod>('monthly');
  const [notes, setNotes] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [pollingPaid, setPollingPaid] = useState(false);
  const paymentIdRef = useRef(0);

  const isRenewal = requestType === 'RENEWAL';

  const { data: subscription, isLoading: subLoading } = useQuery<any>({
    queryKey: ['org-subscription', orgId],
    queryFn: () => api.get(`/org/${orgId}/subscription`).then(r => r.data),
    enabled: open,
  });

  const { data: availablePlans, isLoading: plansLoading } = useQuery<any>({
    queryKey: ['org-available-plans', orgId],
    queryFn: () => api.get(`/org/${orgId}/subscription/available-plans`).then(r => r.data.data),
    enabled: open,
  });

  const currentPlan = subscription;
  const currentPlanId = currentPlan?.planId;

  // For renewals, the target plan is fixed to the current plan.
  useEffect(() => {
    if (open && isRenewal && currentPlanId && selectedPlanId !== currentPlanId) {
      setSelectedPlanId(currentPlanId);
    }
  }, [open, isRenewal, currentPlanId, selectedPlanId]);

  // Reset local state whenever the modal reopens.
  useEffect(() => {
    if (open) {
      setNotes('');
      setAgreed(false);
      setPaymentInfo(null);
      setPollingPaid(false);
    }
  }, [open]);

  const requestMutation = useMutation({
    mutationFn: (data: { planId: number; requestType: string; billingCycle: string; notes?: string }) =>
      api.post(`/org/${orgId}/subscription/request`, data),
    onSuccess: (res: any) => {
      const data = res.data;
      queryClient.invalidateQueries({ queryKey: ['org-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['org-subscription-requests'] });

      if (data?.activated) {
        showToast('Subscription activated successfully!');
        onClose();
        return;
      }
      if (data?.payment?.clientSecret) {
        paymentIdRef.current = data.payment.paymentId;
        setPaymentInfo({ paymentId: data.payment.paymentId, clientSecret: data.payment.clientSecret });
        return;
      }
      if (data?.paymentWarning) {
        showToast(data.paymentWarning, 'warning');
      } else {
        showToast('Subscription request submitted! An admin will review it.');
      }
      onClose();
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to submit request', 'error');
    },
  });

  const finishPaid = () => {
    queryClient.invalidateQueries({ queryKey: ['org-subscription'] });
    queryClient.invalidateQueries({ queryKey: ['org-subscription-requests'] });
    showToast('Payment confirmed! Your subscription is now active.');
    setPaymentInfo(null);
    setPollingPaid(false);
    onClose();
  };

  const handlePaymentComplete = async () => {
    const pmId = paymentIdRef.current;
    setPaymentInfo(null);
    if (!pmId) return;
    try {
      const cResult = await confirmPayment(pmId);
      if (cResult.confirmed) {
        finishPaid();
        return;
      }
    } catch {
      // fall through to polling
    }
    setPollingPaid(true);
  };

  const handlePaymentCancel = () => {
    setPaymentInfo(null);
    setPollingPaid(false);
    showToast('Payment cancelled. Your request is still pending admin review.', 'warning');
    onClose();
  };

  const handleSubmit = () => {
    if (!selectedPlanId || !agreed) return;
    requestMutation.mutate({
      planId: selectedPlanId,
      requestType,
      billingCycle,
      notes: notes || undefined,
    });
  };

  const pendingRequest = currentPlan?.pendingRequest;
  const isNew = requestType === 'NEW_SUBSCRIPTION';
  const plans = (availablePlans || []).filter((p: any) => isRenewal ? p.id === currentPlanId : (isNew || p.id !== currentPlanId));

  const selectedPlan = (availablePlans || []).find((p: any) => p.id === selectedPlanId);
  const displayPrice = selectedPlan
    ? (selectedPlan.isUnlimited
      ? 'FREE'
      : billingCycle === 'yearly'
        ? `${Number(selectedPlan.priceYearly ?? 0).toFixed(0)} EGP/yr`
        : `${Number(selectedPlan.priceMonthly ?? 0).toFixed(0)} EGP/mo`)
    : null;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={isRenewal ? 'Renew Subscription' : isNew ? 'Request Subscription' : 'Change Subscription'}
        size="xl"
      >
        {subLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
        ) : (
          <div className="space-y-4">
            {triggerMessage && (
              <div className="bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] rounded-[var(--radius-md)] p-3 text-sm text-[var(--color-warning-text)]">
                {triggerMessage}
              </div>
            )}

            {pendingRequest && (
              <div className="bg-[var(--color-info-bg)] border border-[var(--color-info-border)] rounded-[var(--radius-md)] p-3 text-sm">
                You have a pending {pendingRequest.requestType === 'NEW_SUBSCRIPTION' ? 'subscription' : 'change'} request
                {pendingRequest.requestedPlanName ? <> to <strong>{pendingRequest.requestedPlanName}</strong></> : ''}.
                Please wait for admin review before submitting another.
              </div>
            )}

            {/* Current Plan */}
            {currentPlan?.planName && (
              <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4">
                <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Current Plan: {currentPlan.planName}</h3>
                {isRenewal && (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {currentPlan.endDate
                      ? `Renewing extends your subscription from ${new Date(currentPlan.endDate).toLocaleDateString('en-GB')}.`
                      : 'Your subscription does not have an expiry date.'}
                  </p>
                )}
              </div>
            )}

            {/* Billing cycle */}
            {!pendingRequest && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-text-muted)]">Billing period:</span>
                <BillingPeriodToggle value={billingCycle} onChange={setBillingCycle} permission={null} />
              </div>
            )}

            {/* Available Plans */}
            {plansLoading ? (
              <p className="text-sm text-[var(--color-text-muted)]">Loading plans...</p>
            ) : plans.length > 0 ? (
              <>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">
                  {isRenewal ? 'Renew Current Plan' : isNew ? 'Choose a Plan' : 'Choose a Plan to Switch To'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {plans.map((plan: any) => (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`cursor-pointer border rounded-[var(--radius-lg)] p-4 transition-all ${
                        selectedPlanId === plan.id
                          ? 'border-[var(--color-primary)] shadow-md bg-[var(--color-primary)]/5'
                          : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-bold text-[var(--color-text)]">{plan.planName}</h4>
                        {selectedPlanId === plan.id && (
                          <span className="text-xs text-[var(--color-primary)] font-medium">Selected</span>
                        )}
                      </div>
                      <p className="text-lg font-bold text-[var(--color-primary)] mb-2">
                        {plan.isUnlimited
                          ? 'FREE'
                          : billingCycle === 'yearly'
                            ? plan.priceYearly != null
                              ? `${Number(plan.priceYearly).toFixed(0)} EGP/yr`
                              : 'N/A'
                            : plan.priceMonthly != null
                              ? `${Number(plan.priceMonthly).toFixed(0)} EGP/mo`
                              : 'N/A'}
                      </p>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Any message for the admin..."
                    className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm resize-none"
                    rows={2}
                    maxLength={500}
                  />
                </div>

                <div className="pt-1">
                  <LegalConsent onChange={setAgreed} />
                </div>

                <Can permission="org.subscription.pay">
                  <button
                    onClick={handleSubmit}
                    disabled={!selectedPlanId || requestMutation.isPending || !!pendingRequest || !agreed}
                    className="w-full px-4 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50"
                  >
                    {requestMutation.isPending
                      ? 'Submitting...'
                      : displayPrice === 'FREE'
                        ? 'Activate Plan'
                        : isRenewal
                          ? `Renew — ${displayPrice}`
                          : `Pay — ${displayPrice}`}
                  </button>
                </Can>
              </>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">
                {isRenewal ? 'No active plan to renew.' : 'No other plans available for your organisation type.'}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Card payment modal (same Paymob widget used for booking a court) */}
      <Modal open={!!paymentInfo} onClose={handlePaymentCancel} title="Complete Payment" size="lg">
        {paymentInfo && (
          <div>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              Pay {displayPrice} to {isRenewal ? 'renew' : isNew ? 'activate' : 'switch to'} your plan.
            </p>
            <PaymobPixelCard
              clientSecret={paymentInfo.clientSecret}
              beforePaymentComplete={async () => true}
              onComplete={handlePaymentComplete}
              onCancel={handlePaymentCancel}
            />
          </div>
        )}
      </Modal>

      {/* Payment confirming overlay */}
      {(confirmState === 'confirming' || confirmState === 'polling') && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center">
          <div className="bg-[var(--color-surface)] rounded-xl shadow-xl p-6 text-center space-y-3">
            <div className="animate-spin w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-[var(--color-text-muted)]">Confirming payment...</p>
          </div>
        </div>
      )}

      {/* Fallback polling (webhook will activate the subscription) */}
      {pollingPaid && paymentIdRef.current > 0 && (
        <PaymentStatusPoller
          endpoint={`/payments/status/${paymentIdRef.current}`}
          isComplete={(data: any) => data?.paymentStatus === 'paid'}
          interval={2000}
          timeout={90000}
          onPaid={finishPaid}
          onTimeout={() => {
            setPollingPaid(false);
            showToast('Payment confirmation is taking longer than expected. It will complete shortly.', 'warning');
            onClose();
          }}
        />
      )}
    </>
  );
}

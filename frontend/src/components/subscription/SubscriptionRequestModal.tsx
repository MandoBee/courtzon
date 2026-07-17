import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';

interface Props {
  orgId: number;
  open: boolean;
  onClose: () => void;
  requestType: 'NEW_SUBSCRIPTION' | 'PLAN_CHANGE';
  triggerMessage?: string;
}

export default function SubscriptionRequestModal({ orgId, open, onClose, requestType, triggerMessage }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

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

  const requestMutation = useMutation({
    mutationFn: (data: { planId: number; requestType: string; notes?: string }) =>
      api.post(`/org/${orgId}/subscription/request`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-subscription'] });
      showToast('Subscription request submitted! An admin will review it.');
      onClose();
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to submit request', 'error');
    },
  });

  const handleSubmit = () => {
    if (!selectedPlanId) return;
    requestMutation.mutate({ planId: selectedPlanId, requestType, notes: notes || undefined });
  };

  const currentPlan = subscription;
  const pendingRequest = currentPlan?.pendingRequest;
  const isNew = requestType === 'NEW_SUBSCRIPTION';
  const plans = (availablePlans || []).filter((p: any) => isNew || p.id !== currentPlan?.planId);

  return (
    <Modal open={open} onClose={onClose} title={isNew ? 'Request Subscription' : 'Change Subscription'} size="xl">
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
              {currentPlan.features && currentPlan.features.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {currentPlan.features.map((f: any) => {
                    const isNumeric = f.valueType === 'numeric';
                    const atLimit = isNumeric && f.usage >= parseInt(f.value, 10) && parseInt(f.value, 10) > 0;
                    return (
                      <div key={f.featureKey} className={`flex items-center justify-between text-xs p-1.5 rounded ${atLimit ? 'bg-[var(--color-error-bg)]' : ''}`}>
                        <span className="text-[var(--color-text-muted)]">{f.label}</span>
                        <span className="font-medium text-[var(--color-text)]">
                          {isNumeric
                            ? `${f.usage}/${f.value === '-1' ? '∞' : f.value}`
                            : f.valueType === 'boolean'
                              ? (f.value === 'true' ? '✓' : '✗')
                              : f.value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Available Plans */}
          {plansLoading ? (
            <p className="text-sm text-[var(--color-text-muted)]">Loading plans...</p>
          ) : plans.length > 0 ? (
            <>
              <h3 className="text-sm font-semibold text-[var(--color-text)]">
                {isNew ? 'Choose a Plan' : 'Choose a Plan to Switch To'}
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
                        : plan.priceMonthly != null
                          ? `${Number(plan.priceMonthly).toFixed(0)} EGP/mo`
                          : plan.priceYearly != null
                            ? `${Number(plan.priceYearly).toFixed(0)} EGP/yr`
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

              <button
                onClick={handleSubmit}
                disabled={!selectedPlanId || requestMutation.isPending || !!pendingRequest}
                className="w-full px-4 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50"
              >
                {requestMutation.isPending ? 'Submitting...' : isNew ? 'Request Subscription' : 'Request Change'}
              </button>
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">No other plans available for your organisation type.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

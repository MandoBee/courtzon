import { useState } from 'react';
import { getErrorMessage } from '../../../utils/errors';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useToast } from '../../../components/ui/Toast';
import { Can } from '../../../permissions/Can';
import { formatPrice } from '../../../utils/currency';
import BillingPeriodToggle from '../../../components/subscription/BillingPeriodToggle';
import {
  annualSavingsPercent,
  filterPlansForPeriod,
  maxAnnualSavingsAmongPlans,
  resolveDisplayPrice,
  type BillingPeriod,
} from '../../../utils/subscription-pricing';

const COMMISSION_ENTITIES = [
  { value: 'booking', label: 'Bookings' },
  { value: 'tournament', label: 'Tournaments' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'coach_session', label: 'Coach sessions' },
  { value: 'academy', label: 'Academies' },
] as const;

type PlanFeature = {
  featureKey: string;
  label: string;
  valueType: 'numeric' | 'boolean' | 'tier' | 'text';
  value: string;
  unit: string | null;
  sortOrder: number;
};

type Plan = {
  id: number;
  planName: string;
  priceMonthly: number | null;
  priceYearly: number | null;
  isUnlimited: boolean;
  annualSavingsPercent: number | null;
  applicableOrgTypes: number[];
  isActive: boolean;
  isInternal: boolean;
  createdAt: string;
  commissionRates: { entity: string; rate: number; type: string }[];
  features: PlanFeature[] | null;
};

type PlanForm = {
  planName: string;
  priceMonthly: string;
  priceYearly: string;
  isUnlimited: boolean;
  isInternal: boolean;
  sortOrder: string;
  applicableOrgTypes: number[];
  commissionRates: { entity: string; rate: string; type: string }[];
  features: { featureKey: string; value: string }[];
};

const emptyForm: PlanForm = {
  planName: '', priceMonthly: '', priceYearly: '', isUnlimited: false, isInternal: false, sortOrder: '0',
  applicableOrgTypes: [], commissionRates: [], features: [],
};

function formatFeatureValue(feature: PlanFeature): string {
  const { label, value, valueType, unit } = feature;
  if (valueType === 'boolean') return value === 'true' ? label : '';
  if (value === '' || value == null) return '';
  const num = parseInt(value, 10);
  if (valueType === 'numeric') {
    if (value === '-1' || value === 'unlimited') return `Unlimited ${unit || label}`;
    if (!isNaN(num) && unit) return `Up to ${num} ${unit}`;
    if (!isNaN(num)) return `Up to ${num}`;
  }
  const display = value.charAt(0).toUpperCase() + value.slice(1);
  return `${display} ${label}`;
}

const ENTITY_LABELS: Record<string, string> = {
  marketplace: 'Marketplace commission',
  booking: 'Booking commission',
  academy: 'Academy commission',
  coach_session: 'Coach session commission',
  tournament: 'Tournament commission',
};

export default function SubscriptionPage() {
  const [tab, setTab] = useState<'manage' | 'assign' | 'view'>('manage');

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--color-text)] mb-4">Subscription Management</h1>
      <div className="flex gap-1 mb-6 bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-1 w-fit shadow-[var(--shadow-sm)]">
        <button onClick={() => setTab('manage')}
          className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors ${
            tab === 'manage' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}>Manage Plans</button>
        <button onClick={() => setTab('assign')}
          className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors ${
            tab === 'assign' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}>Assign Plan</button>
        <button onClick={() => setTab('view')}
          className={`px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors ${
            tab === 'view' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}>View Assignments</button>
      </div>
      {tab === 'manage' ? <ManagePlans /> : tab === 'assign' ? <AssignPlan /> : <ViewAssignments />}
    </div>
  );
}

function ManagePlans() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);

  const { data: plans } = useQuery({
    queryKey: ['admin', 'subscription-plans'],
    queryFn: () => api.get('/subscription-plans/all').then(r => r.data.data),
  });

  const { data: orgTypes } = useQuery<any[]>({
    queryKey: ['organisation-types'],
    queryFn: () => api.get('/organisation-types').then(r => r.data.data),
  });

  const { data: featureDefs } = useQuery<any[]>({
    queryKey: ['subscription-features'],
    queryFn: () => api.get('/subscription-features').then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/subscription-plans', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-plans'] }); setShowForm(false); setForm(emptyForm); showToast('Plan created successfully!'); },
    onError: (err: any) => { showToast('Failed to create plan: ' + getErrorMessage(err), 'error'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/subscription-plans/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-plans'] }); setShowForm(false); setEditingId(null); setForm(emptyForm); showToast('Plan updated successfully!'); },
    onError: (err: any) => { showToast('Failed to update plan: ' + getErrorMessage(err), 'error'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/subscription-plans/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-plans'] }); showToast('Plan deleted!'); },
    onError: (err: any) => { showToast('Failed to delete plan: ' + getErrorMessage(err), 'error'); },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/subscription-plans/${id}/toggle`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-plans'] }); showToast('Plan status toggled!'); },
    onError: (err: any) => { showToast('Failed to toggle plan: ' + getErrorMessage(err), 'error'); },
  });

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Delete plan "${name}"? This cannot be undone.`)) deleteMutation.mutate(id);
  };

  const openEdit = (plan: Plan) => {
    setEditingId(plan.id);
    setForm({
      planName: plan.planName,
      priceMonthly: plan.priceMonthly != null ? String(plan.priceMonthly) : '',
      priceYearly: plan.priceYearly != null ? String(plan.priceYearly) : '',
      isUnlimited: !!plan.isUnlimited,
      applicableOrgTypes: Array.isArray(plan.applicableOrgTypes) ? plan.applicableOrgTypes.map(Number) : [],
      isInternal: !!plan.isInternal,
      sortOrder: String((plan as any).sortOrder ?? 0),
      commissionRates: plan.commissionRates.map(r => ({ entity: r.entity, rate: String(Number(r.rate)), type: r.type })),
      features: (plan.features || []).map(f => ({ featureKey: f.featureKey, value: f.value })),
    });
    setShowForm(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const addRate = () => {
    setForm(f => ({ ...f, commissionRates: [...f.commissionRates, { entity: '', rate: '', type: 'percentage' }] }));
  };

  const updateRate = (i: number, field: string, value: string) => {
    const rates = [...form.commissionRates];
    (rates[i] as any)[field] = value;
    setForm(f => ({ ...f, commissionRates: rates }));
  };

  const removeRate = (i: number) => {
    setForm(f => ({ ...f, commissionRates: f.commissionRates.filter((_: any, idx: any) => idx !== i) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      planName: form.planName,
      priceMonthly: form.isUnlimited ? 0 : (form.priceMonthly === '' ? null : parseFloat(form.priceMonthly) || 0),
      priceYearly: form.isUnlimited ? null : (form.priceYearly === '' ? null : parseFloat(form.priceYearly) || 0),
      isUnlimited: form.isUnlimited,
      isInternal: form.isInternal,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
      applicableOrgTypes: form.applicableOrgTypes.map(Number),
      commissionRates: form.commissionRates.map(r => ({
        entity: r.entity,
        rate: parseFloat(r.rate) || 0,
        type: r.type,
      })).filter(r => r.entity),
      features: form.features.filter(f => f.value !== '').map(f => ({
        featureKey: f.featureKey,
        value: f.value,
      })),
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--color-text-muted)]">{plans?.length || 0} plan(s)</p>
        <Can permission="subscription.create">
          <button onClick={openCreate}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">
            + New Plan
          </button>
        </Can>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 mb-6 border border-[var(--color-border)]">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">{editingId ? 'Edit Plan' : 'New Plan'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1">Plan Name</label>
              <input value={form.planName} onChange={e => setForm(f => ({ ...f, planName: e.target.value }))} required
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
            </div>
            <Can permission="subscription.edit.price-monthly">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Monthly price (EGP)</label>
                <input type="number" step="0.01" min="0" value={form.priceMonthly} disabled={form.isUnlimited}
                  onChange={e => setForm(f => ({ ...f, priceMonthly: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm disabled:opacity-50" />
              </div>
            </Can>
            <Can permission="subscription.edit.price-yearly">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Annual price (EGP)</label>
                <input type="number" step="0.01" min="0" value={form.priceYearly} disabled={form.isUnlimited}
                  onChange={e => setForm(f => ({ ...f, priceYearly: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm disabled:opacity-50" />
              </div>
            </Can>
          </div>
          <Can permission="subscription.edit.is-unlimited">
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input type="checkbox" checked={form.isUnlimited}
                onChange={e => setForm(f => ({ ...f, isUnlimited: e.target.checked }))} />
              <span className="text-sm text-[var(--color-text)]">Unlimited / one-time (no renewal billing)</span>
            </label>
          </Can>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[var(--color-text-muted)]">Commission Rates</label>
              <button type="button" onClick={addRate}
                disabled={form.commissionRates.length >= COMMISSION_ENTITIES.length}
                className="text-xs text-[var(--color-primary)] font-medium disabled:opacity-30">
                + Add Rate
              </button>
            </div>
            {form.commissionRates.map((rate: any, i: any) => {
              const selectedEntities = form.commissionRates.filter((_: any, j: any) => j !== i).map(r => r.entity);
              const availableEntities = COMMISSION_ENTITIES.filter(e => !selectedEntities.includes(e.value) || e.value === rate.entity);
              return (
              <div key={i} className="flex items-center gap-2 mb-2">
                <select value={rate.entity} onChange={e => updateRate(i, 'entity', e.target.value)}
                  className="flex-1 px-3 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="">Select entity...</option>
                  {availableEntities.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
                <input type="number" step="0.01" min="0" placeholder="0" value={rate.rate} onChange={e => updateRate(i, 'rate', e.target.value)}
                  className="w-24 px-3 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
                <select value={rate.type} onChange={e => updateRate(i, 'type', e.target.value)}
                  className="px-2 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                  <option value="percentage">%</option>
                  <option value="fixed">Fixed</option>
                </select>
                <button type="button" onClick={() => removeRate(i)} className="text-[var(--color-error)] text-lg px-1">&times;</button>
              </div>
              );
            })}
          </div>
          {featureDefs && featureDefs.length > 0 && (
            <div className="mb-4">
              <label className="block text-xs text-[var(--color-text-muted)] mb-2">Plan Features</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {featureDefs.map((fd: any) => {
                  const feat = form.features.find(f => f.featureKey === fd.featureKey);
                  const currentVal = feat?.value ?? '';
                  const setVal = (val: string) => {
                    setForm(f => {
                      const existing = f.features.filter(x => x.featureKey !== fd.featureKey);
                      return { ...f, features: val === '' ? existing : [...existing, { featureKey: fd.featureKey, value: val }] };
                    });
                  };
                  return (
                    <div key={fd.featureKey} className="flex items-center justify-between gap-2 p-2 bg-[var(--color-bg)] rounded-[var(--radius-md)]">
                      <span className="text-sm text-[var(--color-text)]">{fd.label}</span>
                      {fd.valueType === 'boolean' ? (
                        <select value={currentVal} onChange={e => setVal(e.target.value)}
                          className="px-2 py-1 border rounded-[var(--radius-md)] bg-white text-sm">
                          <option value="">—</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      ) : fd.valueType === 'tier' ? (
                        <select value={currentVal} onChange={e => setVal(e.target.value)}
                          className="px-2 py-1 border rounded-[var(--radius-md)] bg-white text-sm">
                          <option value="">—</option>
                          <option value="basic">Basic</option>
                          <option value="standard">Standard</option>
                          <option value="priority">Priority</option>
                        </select>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input type="text" value={currentVal} onChange={e => setVal(e.target.value)}
                            placeholder={fd.valueType === 'numeric' ? 'e.g. 10 or unlimited' : 'Value'}
                            className="w-28 px-2 py-1 border rounded-[var(--radius-md)] bg-white text-sm" />
                          {fd.unit && <span className="text-xs text-[var(--color-text-muted)]">{fd.unit}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mb-4">
            <label className="block text-xs text-[var(--color-text-muted)] mb-2">Applicable Organisation Types</label>
            <div className="flex flex-wrap gap-2">
              {orgTypes?.map(ot => {
                const isSelected = form.applicableOrgTypes.includes(ot.id);
                return (
                  <button key={ot.id} type="button" onClick={() => {
                    setForm(f => ({
                      ...f,
                      applicableOrgTypes: isSelected
                        ? f.applicableOrgTypes.filter(id => id !== ot.id)
                        : [...f.applicableOrgTypes, ot.id]
                    }));
                  }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      isSelected
                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                        : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]'
                    }`}>
                    {ot.name || ot.slug}
                  </button>
                );
              })}
            </div>
          </div>
          <Can permission="subscription.edit.is-internal">
            <label className="flex items-start gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isInternal}
                onChange={e => setForm(f => ({ ...f, isInternal: e.target.checked }))}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-[var(--color-text)]">Internal plan (admin assignment only)</span>
                <span className="block text-xs text-[var(--color-text-muted)]">
                  Hidden from public registration and pricing pages. Platform admins can still assign it to organisations.
                </span>
              </span>
            </label>
          </Can>
          <div className="mb-4">
            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Sort Order</label>
            <input type="number" min="0" value={form.sortOrder}
              onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
              className="w-24 px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={isPending}
              className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
              {isPending ? 'Saving...' : editingId ? 'Update Plan' : 'Create Plan'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}
              className="px-5 py-2 border rounded-[var(--radius-md)] text-sm">Cancel</button>
            {createMutation.isSuccess && <span className="text-sm text-[var(--color-success-text)]">Created!</span>}
            {updateMutation.isSuccess && <span className="text-sm text-[var(--color-success-text)]">Updated!</span>}
            {createMutation.isError && <span className="text-sm text-[var(--color-error)]">{getErrorMessage(createMutation.error)}</span>}
            {updateMutation.isError && <span className="text-sm text-[var(--color-error)]">{getErrorMessage(updateMutation.error)}</span>}
          </div>
        </form>
      )}

      {plans && plans.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan: Plan) => (
            <PlanCard key={plan.id} plan={plan}
              onEdit={() => openEdit(plan)}
              onDelete={() => handleDelete(plan.id, plan.planName)}
              onToggle={() => toggleMutation.mutate(plan.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, onEdit, onDelete, onToggle }: { plan: Plan; onEdit: () => void; onDelete: () => void; onToggle: () => void }) {
  const savings = plan.annualSavingsPercent ?? annualSavingsPercent(plan.priceMonthly, plan.priceYearly);
  return (
    <div className={`flex h-full min-h-0 flex-col bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 border-2 ${
      plan.isActive ? 'border-transparent' : 'border-red-200 opacity-70'
    }`}>
      <div className="flex items-start justify-between mb-2 shrink-0">
        <h3 className="font-bold text-[var(--color-text)]">{plan.planName}</h3>
        <div className="flex items-center gap-1">
          {plan.isInternal && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]">
              Internal
            </span>
          )}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            plan.isActive ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'
          }`}>
            {plan.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
      <div className="mb-3 shrink-0 space-y-1">
        {plan.isUnlimited ? (
          <p className="text-2xl font-bold text-[var(--color-primary)]">FREE</p>
        ) : (
          <>
            {plan.priceMonthly != null && (
              <p className="text-lg font-bold text-[var(--color-primary)]">
                {Number(plan.priceMonthly) === 0 ? 'FREE' : `${Number(plan.priceMonthly).toFixed(0)}`}
                <span className="text-sm font-normal text-[var(--color-text-muted)]"> EGP/mo</span>
              </p>
            )}
            {plan.priceYearly != null && (
              <p className="text-sm text-[var(--color-text-muted)]">
                <span className="font-semibold text-[var(--color-text)]">{Number(plan.priceYearly).toFixed(0)} EGP/yr</span>
                {savings != null && savings > 0 && (
                  <span className="ml-2 text-[var(--color-success-text)] font-medium">Save {savings}%</span>
                )}
              </p>
            )}
          </>
        )}
      </div>
      <div className="flex-1 min-h-0 space-y-3">
        {plan.commissionRates?.length > 0 && (
          <div className="text-xs text-[var(--color-text-muted)] space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider">Commission</p>
            {plan.commissionRates.map((cr: any, i: any) => (
              <div key={i} className="flex justify-between">
                <span>{ENTITY_LABELS[cr.entity] || cr.entity}</span>
                <span className="font-medium">{cr.rate}{cr.type === 'percentage' ? '%' : ' EGP'}</span>
              </div>
            ))}
          </div>
        )}
        {plan.features && plan.features.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Features</p>
            {plan.features.filter(f => {
              if (f.valueType === 'boolean') return f.value === 'true';
              return f.value !== '' && f.value != null;
            }).map(feat => {
              const label = formatFeatureValue(feat);
              if (!label) return null;
              return (
                <div key={feat.featureKey} className="flex items-start gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <svg className="w-3 h-3 mt-0.5 shrink-0 text-[var(--color-success-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="mt-auto flex shrink-0 items-center gap-2 border-t pt-3">
        <Can permission="subscription.edit">
          <button onClick={onEdit} className="text-xs px-3 py-1.5 border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)]">Edit</button>
        </Can>
        <Can permission="subscription.toggle">
          <button onClick={onToggle} className={`text-xs px-3 py-1.5 border rounded-[var(--radius-md)] hover:bg-[var(--color-bg)] ${
            plan.isActive ? 'text-[var(--color-warning-text)]' : 'text-[var(--color-success-text)]'
          }`}>
            {plan.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </Can>
        <Can permission="subscription.delete">
          <button onClick={onDelete} className="text-xs px-3 py-1.5 border rounded-[var(--radius-md)] text-[var(--color-error)] hover:bg-red-50 ml-auto">Delete</button>
        </Can>
      </div>
    </div>
  );
}

function AssignPlan() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  const { data: orgs } = useQuery({
    queryKey: ['admin', 'organisations'],
    queryFn: () => api.get('/organisations').then((r: any) => r.data.data),
  });

  const { data: plans } = useQuery({
    queryKey: ['admin', 'subscription-plans', 'assignable'],
    queryFn: () => api.get('/subscription-plans/all').then((r: any) => r.data.data.filter((p: any) => p.isActive)),
  });

  const { data: currentSub } = useQuery({
    queryKey: ['org-subscription', selectedOrgId],
    queryFn: () => api.get(`/organisations/${selectedOrgId}/subscription`).then((r: any) => r.data),
    enabled: !!selectedOrgId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { orgId: number; planId: number; billingCycle?: string }) =>
      api.put(`/organisations/${data.orgId}/subscription`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['org-subscription'] }); showToast('Plan assigned successfully!'); },
    onError: (err: any) => { showToast('Failed to assign plan: ' + getErrorMessage(err), 'error'); },
  });

  const handleUpdate = () => {
    if (!selectedOrgId || !selectedPlanId) return;
    updateMutation.mutate({ orgId: selectedOrgId, planId: selectedPlanId, billingCycle: billingPeriod });
  };

  const assignablePlans = (plans || []).filter((p: Plan) => p.isActive && !p.isInternal);
  const recurring = assignablePlans.filter((p: Plan) => !p.isUnlimited);
  const unlimited = assignablePlans.filter((p: Plan) => p.isUnlimited);
  const visibleRecurring = filterPlansForPeriod<Plan>(recurring, billingPeriod);
  const toggleSavings = maxAnnualSavingsAmongPlans(recurring);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5">
        <h2 className="font-semibold text-[var(--color-text)] mb-3">Select Organisation</h2>
        <select
          value={selectedOrgId ?? ''}
          onChange={(e: any) => { setSelectedOrgId(Number(e.target.value) || null); setSelectedPlanId(null); }}
          className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm mb-4"
        >
          <option value="">Choose...</option>
          {orgs?.map((o: any) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>

        {currentSub && currentSub.planName && (
          <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-3">
            <p className="text-xs text-[var(--color-text-muted)] mb-1">Current Plan</p>
            <p className="font-medium text-[var(--color-text)]">{currentSub.planName}</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {currentSub.billingCycle} &middot; {Number(currentSub.price).toFixed(0)} EGP
              {currentSub.endDate && ` until ${currentSub.endDate}`}
            </p>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              currentSub.status === 'active' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
              currentSub.status === 'expired' ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'
            }`}>
              {currentSub.status}
            </span>
          </div>
        )}
      </div>

      <div className="lg:col-span-2">
        {recurring.length > 0 && (
          <div className="mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold text-[var(--color-text)]">Subscription plans</h2>
              <BillingPeriodToggle
                value={billingPeriod}
                onChange={(p) => { setBillingPeriod(p); setSelectedPlanId(null); }}
                savingsPercent={toggleSavings}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {visibleRecurring.map((plan: Plan) => (
                <AssignPlanCard
                  key={plan.id} plan={plan} billingPeriod={billingPeriod}
                  isSelected={selectedPlanId === plan.id}
                  onSelect={() => setSelectedPlanId(plan.id)}
                />
              ))}
            </div>
          </div>
        )}

        {unlimited.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold text-[var(--color-text)] mb-3">Unlimited plans</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {unlimited.map((plan: Plan) => (
                <AssignPlanCard
                  key={plan.id} plan={plan} billingPeriod="monthly"
                  isSelected={selectedPlanId === plan.id}
                  onSelect={() => setSelectedPlanId(plan.id)}
                />
              ))}
            </div>
          </div>
        )}

        {selectedPlanId && (
          <div className="flex items-center gap-3 mt-4">
            <Can permission="subscription.assign">
              <button onClick={handleUpdate} disabled={updateMutation.isPending}
                className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
                {updateMutation.isPending ? 'Updating...' : 'Apply Plan'}
              </button>
            </Can>
            {updateMutation.isSuccess && <span className="text-sm text-[var(--color-success-text)]">Plan assigned</span>}
            {updateMutation.isError && <span className="text-sm text-[var(--color-error)]">{getErrorMessage(updateMutation.error)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function AssignPlanCard({
  plan, billingPeriod, isSelected, onSelect,
}: { plan: Plan; billingPeriod: BillingPeriod; isSelected: boolean; onSelect: () => void }) {
  const price = resolveDisplayPrice(plan, billingPeriod);
  const isFree = plan.isUnlimited || price === 0;
  return (
    <div onClick={onSelect}
      className={`bg-[var(--color-surface)] border-2 rounded-[var(--radius-lg)] p-4 cursor-pointer transition-all ${
        isSelected ? 'border-[var(--color-primary)] shadow-md' : 'border-transparent shadow-[var(--shadow-sm)] hover:border-[var(--color-border)]'
      }`}>
      <h3 className="font-bold text-[var(--color-text)] mb-1">{plan.planName}</h3>
      {plan.isInternal && (
        <span className="inline-block mb-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]">
          Internal
        </span>
      )}
      <p className="text-2xl font-bold text-[var(--color-primary)] mb-3">
        {isFree ? 'FREE' : `${Number(price).toFixed(0)}`}
        {!isFree && !plan.isUnlimited && (
          <span className="text-sm font-normal text-[var(--color-text-muted)]"> EGP/{billingPeriod === 'yearly' ? 'yr' : 'mo'}</span>
        )}
      </p>
      {plan.commissionRates?.length > 0 && (
        <div className="text-xs text-[var(--color-text-muted)] space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider">Commission</p>
          {plan.commissionRates.map((cr: any) => (
            <div key={cr.entity} className="flex justify-between">
              <span>{ENTITY_LABELS[cr.entity] || cr.entity}</span>
              <span className="font-medium">{cr.rate}%</span>
            </div>
          ))}
        </div>
      )}
      {plan.features && plan.features.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Features</p>
          {plan.features.filter(f => {
            if (f.valueType === 'boolean') return f.value === 'true';
            return f.value !== '' && f.value != null;
          }).map(feat => {
            const label = formatFeatureValue(feat);
            if (!label) return null;
            return (
              <div key={feat.featureKey} className="flex items-start gap-1.5 text-xs text-[var(--color-text-muted)]">
                <svg className="w-3 h-3 mt-0.5 shrink-0 text-[var(--color-success-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ViewAssignments() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'organisation-subscriptions'],
    queryFn: () => api.get('/admin/organisation-subscriptions').then(r => r.data.data),
  });

  if (isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>;

  const items = data || [];

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
            <th className="text-left px-4 py-3 font-medium">Organisation</th>
            <th className="text-left px-4 py-3 font-medium">Verified</th>
            <th className="text-left px-4 py-3 font-medium">Active</th>
            <th className="text-left px-4 py-3 font-medium">Plan</th>
            <th className="text-left px-4 py-3 font-medium">Cycle</th>
            <th className="text-left px-4 py-3 font-medium">Price</th>
            <th className="text-left px-4 py-3 font-medium">Start Date</th>
            <th className="text-left px-4 py-3 font-medium">End Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => (
            <tr key={item.org_id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
              <td className="px-4 py-3 font-medium text-[var(--color-text)]">{item.org_name}</td>
              <td className="px-4 py-3">
                <Can permission="subscription.assignments.is-verified">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${item.is_verified ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]'}`}>
                    {item.is_verified ? 'Verified' : 'Pending'}
                  </span>
                </Can>
              </td>
              <td className="px-4 py-3">
                <Can permission="subscription.assignments.is-active">
                  <span className={`w-2 h-2 rounded-full inline-block ${item.is_active ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'}`} title={item.is_active ? 'Active' : 'Suspended'} />
                  <span className="ml-1.5 text-xs text-[var(--color-text-muted)]">{item.is_active ? 'Active' : 'Suspended'}</span>
                </Can>
              </td>
              <td className="px-4 py-3">
                {item.plan_name ? (
                  <span className="font-medium text-[var(--color-text)]">{item.plan_name}</span>
                ) : (
                  <span className="text-[var(--color-text-muted)]">No plan</span>
                )}
              </td>
              <td className="px-4 py-3 text-[var(--color-text-muted)]">{item.billing_cycle || '—'}</td>
              <td className="px-4 py-3 text-[var(--color-text-muted)]">{item.price ? formatPrice(Number(item.price)) : '—'}</td>
              <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{item.start_date ? new Date(item.start_date).toLocaleDateString('en-GB') : '—'}</td>
              <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{item.end_date ? new Date(item.end_date).toLocaleDateString('en-GB') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p className="text-center py-8 text-sm text-[var(--color-text-muted)]">No organisation subscriptions found.</p>}
    </div>
  );
}

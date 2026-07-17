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

const ASSIGN_REASONS = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'support', label: 'Support' },
  { value: 'manual_correction', label: 'Manual Correction' },
  { value: 'compensation', label: 'Compensation' },
  { value: 'testing', label: 'Testing' },
  { value: 'other', label: 'Other' },
] as const;

const FEATURE_COMPARE_KEYS = ['branches', 'staff', 'products', 'resources', 'tournaments', 'academies'] as const;

function getFeatureValue(plan: Plan | null | undefined, key: string): number | null {
  if (!plan?.features) return null;
  const f = plan.features.find((x: any) => x.featureKey === key);
  if (!f || f.valueType !== 'numeric') return null;
  const v = f.value === '-1' || f.value?.toLowerCase() === 'unlimited' ? Infinity : parseInt(f.value, 10);
  return isNaN(v) ? null : v;
}

function getBoolFeature(plan: Plan | null | undefined, key: string): boolean | null {
  if (!plan?.features) return null;
  const f = plan.features.find((x: any) => x.featureKey === key);
  if (!f || f.valueType !== 'boolean') return null;
  return f.value === 'true';
}

function CompareRow({ label, currentVal, newVal, formatter }: { label: string; currentVal: any; newVal: any; formatter?: (v: any) => string }) {
  const fmt = (v: any) => formatter ? formatter(v) : String(v ?? '—');
  const cur = fmt(currentVal);
  const nw = fmt(newVal);
  let color = 'text-[var(--color-text-muted)]';
  let arrow = '—';
  if (currentVal !== newVal && currentVal != null && newVal != null) {
    const isUpgrade = typeof currentVal === 'number' && typeof newVal === 'number' ? newVal > currentVal : newVal !== currentVal;
    color = isUpgrade ? 'text-[var(--color-success-text)]' : 'text-[var(--color-error)]';
    arrow = isUpgrade ? '▲' : '▼';
  }
  return (
    <div className="grid grid-cols-[1fr_80px_80px_30px] gap-2 text-xs py-1 border-b border-[var(--color-border)] last:border-0">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="font-medium text-[var(--color-text)] text-right">{cur}</span>
      <span className="font-medium text-right" style={{ color: currentVal !== newVal && currentVal != null && newVal != null ? (color) : undefined }}>{nw}</span>
      <span className={`text-center ${color}`}>{arrow}</span>
    </div>
  );
}

function AssignPlan() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [step, setStep] = useState<'select' | 'review' | 'done'>('select');
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [planFilter, setPlanFilter] = useState<'public' | 'internal' | 'all'>('all');
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [assignmentReason, setAssignmentReason] = useState<string>('support');
  const [otherReasonText, setOtherReasonText] = useState('');
  const [effectiveDateType, setEffectiveDateType] = useState<'immediate' | 'scheduled'>('immediate');
  const [scheduledDate, setScheduledDate] = useState('');
  const [orgSearch, setOrgSearch] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data: orgs, isLoading: orgsLoading } = useQuery({
    queryKey: ['admin', 'organisations'],
    queryFn: () => api.get('/organisations').then((r: any) => r.data.data),
  });

  const { data: plans } = useQuery({
    queryKey: ['admin', 'subscription-plans', 'assignable'],
    queryFn: () => api.get('/subscription-plans/all').then((r: any) => r.data.data.filter((p: any) => p.isActive)),
  });

  const { data: currentSub, isLoading: subLoading } = useQuery({
    queryKey: ['org-subscription', selectedOrgId],
    queryFn: () => api.get(`/organisations/${selectedOrgId}/subscription`).then((r: any) => r.data),
    enabled: !!selectedOrgId,
  });

  const { data: pendingRequests } = useQuery({
    queryKey: ['admin', 'subscription-requests', 'org', selectedOrgId],
    queryFn: () => api.get('/admin/subscription-requests', { params: { orgId: selectedOrgId, status: 'pending' } }).then((r: any) => r.data.data),
    enabled: !!selectedOrgId,
  });

  const { data: stats } = useQuery({
    queryKey: ['admin', 'subscription-requests', 'stats'],
    queryFn: () => api.get('/admin/subscription-requests/stats').then((r: any) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { orgId: number; planId: number; billingCycle?: string }) =>
      api.put(`/organisations/${data.orgId}/subscription`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-requests'] });
      setStep('done');
      setShowConfirm(false);
      showToast('Plan assigned successfully!');
    },
    onError: (err: any) => {
      setShowConfirm(false);
      showToast('Failed to assign plan: ' + getErrorMessage(err), 'error');
    },
  });

  const cancelRequestMutation = useMutation({
    mutationFn: (reqId: number) => api.post(`/admin/subscription-requests/${reqId}/reject`, { reason: 'Overridden by manual assignment' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'subscription-requests'] }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: () => api.post(`/organisations/${selectedOrgId}/subscription/toggle-status`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-subscription'] });
      showToast('Subscription status toggled');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to toggle status', 'error'),
  });

  const selectedOrg = orgs?.find((o: any) => o.id === selectedOrgId);
  const selectedPlan = plans?.find((p: any) => p.id === selectedPlanId);
  const pendingReq = pendingRequests?.[0];
  const isCurrentPlan = selectedPlanId && currentSub?.planId === selectedPlanId;

  const filteredPlans = (plans || []).filter((p: Plan) => {
    if (planFilter === 'public') return !p.isInternal;
    if (planFilter === 'internal') return p.isInternal;
    return true;
  });
  const recurring = filteredPlans.filter((p: Plan) => !p.isUnlimited);
  const unlimited = filteredPlans.filter((p: Plan) => p.isUnlimited);
  const visibleRecurring = filterPlansForPeriod<Plan>(recurring, billingPeriod);
  const toggleSavings = maxAnnualSavingsAmongPlans(recurring);

  // Downgrade detection
  const isDowngrade = currentSub?.planName && selectedPlan && (() => {
    const curBranch = getFeatureValue(currentSub, 'branches');
    const newBranch = getFeatureValue(selectedPlan, 'branches');
    const curStaff = getFeatureValue(currentSub, 'staff');
    const newStaff = getFeatureValue(selectedPlan, 'staff');
    const curProducts = getFeatureValue(currentSub, 'products');
    const newProducts = getFeatureValue(selectedPlan, 'products');
    if (newBranch != null && curBranch != null && newBranch < curBranch) return true;
    if (newStaff != null && curStaff != null && newStaff < curStaff) return true;
    if (newProducts != null && curProducts != null && newProducts < curProducts) return true;
    return false;
  })();

  const limitConflicts: string[] = [];
  if (currentSub?.planName && selectedPlan) {
    const checks: { key: string; label: string }[] = [
      { key: 'branches', label: 'branches' },
      { key: 'staff', label: 'staff members' },
      { key: 'products', label: 'products' },
      { key: 'resources', label: 'resources' },
    ];
    for (const c of checks) {
      const cur = getFeatureValue(currentSub, c.key);
      const nw = getFeatureValue(selectedPlan, c.key);
      if (cur != null && nw != null && nw < cur) {
        limitConflicts.push(`${c.label}: ${cur === Infinity ? 'Unlimited' : cur} → ${nw === Infinity ? 'Unlimited' : nw}`);
      }
    }
  }

  const handleConfirmAssign = () => {
    if (!selectedOrgId || !selectedPlanId) return;
    if (pendingReq) {
      cancelRequestMutation.mutate(pendingReq.id);
    }
    updateMutation.mutate({ orgId: selectedOrgId, planId: selectedPlanId, billingCycle: billingPeriod });
  };

  const handleClear = () => {
    setSelectedOrgId(null); setSelectedPlanId(null); setStep('select');
    setShowConfirm(false); setAssignmentReason('support'); setOtherReasonText('');
    setEffectiveDateType('immediate'); setScheduledDate(''); setOrgSearch('');
  };

  const daysRemaining = currentSub?.endDate ? Math.ceil((new Date(currentSub.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const isExpired = currentSub?.endDate && new Date(currentSub.endDate) < new Date();

  // Validation
  const validationErrors: string[] = [];
  if (!selectedOrg) validationErrors.push('No organisation selected');
  if (!selectedPlan) validationErrors.push('No plan selected');
  if (selectedPlan && !selectedPlan.isActive) validationErrors.push('Selected plan is inactive');
  if (selectedOrg && !selectedOrg.is_active) validationErrors.push('Organisation is suspended');
  if (isCurrentPlan) validationErrors.push('Organisation already has this plan');
  if (effectiveDateType === 'scheduled' && !scheduledDate) validationErrors.push('Scheduled date required');
  if (assignmentReason === 'other' && !otherReasonText.trim()) validationErrors.push('Please describe the reason');

  const canProceed = validationErrors.length === 0 && !updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Explanation box + Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-blue-50 border border-blue-200 rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
          <span className="text-lg shrink-0 mt-0.5" aria-hidden="true">ℹ️</span>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Manual Assignment — Administrative Override</p>
            <p className="text-blue-600">
              Subscription Requests are submitted by organisations and require approval.
              Manual Assignment bypasses the request workflow and should only be used for administrative or exceptional cases.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="text-center"><p className="text-lg font-bold text-[var(--color-text)]">{stats?.pending ?? '—'}</p><p className="text-[var(--color-text-muted)]">Pending</p></div>
          <div className="text-center"><p className="text-lg font-bold text-[var(--color-text)]">{stats?.approvedToday ?? '—'}</p><p className="text-[var(--color-text-muted)]">Approved today</p></div>
          <div className="text-center"><p className="text-lg font-bold text-[var(--color-text)]">{stats?.activeSubscriptions ?? '—'}</p><p className="text-[var(--color-text-muted)]">Active subs</p></div>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-medium">
        {['select', 'review', 'done'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
              step === s ? 'bg-[var(--color-primary)] text-white' :
              ['select', 'review', 'done'].indexOf(step) > i ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
              'bg-[var(--color-bg)] text-[var(--color-text-muted)]'
            }`}>
              {['select', 'review', 'done'].indexOf(step) > i ? '✓' : i + 1}
            </span>
            <span className={step === s ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}>
              {s === 'select' ? 'Select' : s === 'review' ? 'Review' : 'Done'}
            </span>
            {i < 2 && <span className="w-8 h-px bg-[var(--color-border)] hidden sm:inline" />}
          </div>
        ))}
      </div>

      {step === 'select' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Organisation + Current Subscription */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-5">
              <h2 className="font-semibold text-[var(--color-text)] mb-3">Select Organisation</h2>
              <input type="text" value={orgSearch} onChange={e => setOrgSearch(e.target.value)}
                placeholder="Search by name, email or phone..."
                className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm mb-3"
                aria-label="Search organisations" />
              <div className="max-h-72 overflow-y-auto space-y-1">
                {orgsLoading ? (
                  <p className="text-xs text-[var(--color-text-muted)] py-4 text-center">Loading...</p>
                ) : (orgs || []).filter((o: any) => !orgSearch || o.name?.toLowerCase().includes(orgSearch.toLowerCase()) || o.email?.toLowerCase().includes(orgSearch.toLowerCase()) || o.phone?.includes(orgSearch)).map((o: any) => (
                  <button key={o.id} onClick={() => { setSelectedOrgId(o.id); setSelectedPlanId(null); setShowHistory(false); }}
                    className={`w-full text-left px-3 py-2.5 rounded-[var(--radius-md)] text-sm transition-colors border ${
                      selectedOrgId === o.id ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]' : 'border-transparent hover:bg-[var(--color-bg)] text-[var(--color-text)]'
                    }`} aria-label={`Select organisation ${o.name}`}>
                    <div className="font-medium">{o.name}</div>
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{o.org_type_slug || '—'} {o.email ? `· ${o.email}` : ''}</div>
                  </button>
                ))}
                {(!orgs || orgs.length === 0) && !orgsLoading && <p className="text-xs text-[var(--color-text-muted)] py-4 text-center">No organisations found</p>}
              </div>
            </div>

            {selectedOrgId && (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-5">
                <h2 className="font-semibold text-[var(--color-text)] mb-3">Current Subscription</h2>
                {subLoading ? (
                  <div className="animate-pulse space-y-2"><div className="h-4 w-24 bg-[var(--color-bg)] rounded" /><div className="h-3 w-32 bg-[var(--color-bg)] rounded" /></div>
                ) : currentSub?.planName ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[var(--color-text)]">{currentSub.planName}</span>
                      <button
                        onClick={() => { if (!isExpired) toggleStatusMutation.mutate(); }}
                        disabled={isExpired || toggleStatusMutation.isPending}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                          isExpired ? 'bg-[var(--color-error-bg)] text-[var(--color-error-text)] cursor-not-allowed' :
                          currentSub.status === 'active' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] border-green-200 hover:bg-green-200 cursor-pointer' :
                          'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)] border-yellow-200 hover:bg-yellow-200 cursor-pointer'
                        }`}
                        title={isExpired ? 'Expired subscriptions cannot be toggled' : `Click to change to ${currentSub.status === 'active' ? 'pending' : 'active'}`}
                        aria-label={`Current status: ${isExpired ? 'Expired' : currentSub.status}. Click to toggle.`}
                      >
                        {toggleStatusMutation.isPending ? '...' : (isExpired ? 'Expired' : currentSub.status)}
                      </button>
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] space-y-1">
                      <div className="flex items-center gap-2">
                        <span>Billing: <strong className="text-[var(--color-text)] capitalize">{currentSub.billingCycle || 'Monthly'}</strong></span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700" title="This subscription was assigned directly by Super Admin.">MANUAL OVERRIDE</span>
                      </div>
                      {currentSub.startDate && <p>Started: {new Date(currentSub.startDate).toLocaleDateString('en-GB')}</p>}
                      {currentSub.endDate && <p>Expires: {new Date(currentSub.endDate).toLocaleDateString('en-GB')}{daysRemaining !== null && !isExpired && <span className="ml-2 text-amber-600">({daysRemaining}d)</span>}</p>}
                    </div>
                    <button onClick={() => setShowHistory(!showHistory)} className="text-xs text-[var(--color-primary)] hover:underline font-medium">
                      {showHistory ? 'Hide' : 'View'} Subscription History
                    </button>
                    {showHistory && (
                      <div className="text-xs text-[var(--color-text-muted)] space-y-1.5 border-t pt-2 mt-2">
                        <p className="font-medium text-[var(--color-text)]">Assignment Timeline</p>
                        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[var(--color-success)] shrink-0" /><span>Assigned · {currentSub.startDate ? new Date(currentSub.startDate).toLocaleDateString('en-GB') : '—'} · Super Admin</span></div>
                        <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" /><span>Source: Manual Assignment (Super Admin)</span></div>
                      </div>
                    )}
                  </div>
                ) : (<p className="text-sm text-[var(--color-text-muted)]">No active subscription.</p>)}
              </div>
            )}
          </div>

          {/* Right: Plan Selection */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="font-semibold text-[var(--color-text)]">Select Plan</h2>
                <div className="flex items-center gap-2">
                  {recurring.length > 0 && <BillingPeriodToggle value={billingPeriod} onChange={(p) => { setBillingPeriod(p); setSelectedPlanId(null); }} savingsPercent={toggleSavings} />}
                  <select value={planFilter} onChange={e => { setPlanFilter(e.target.value as any); setSelectedPlanId(null); }}
                    className="px-3 py-1.5 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xs font-medium" aria-label="Filter plans">
                    <option value="all">All Plans</option>
                    <option value="public">Public Plans</option>
                    <option value="internal">Internal Plans</option>
                  </select>
                </div>
              </div>

              {filteredPlans.length === 0 && <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">No plans match the current filter.</p>}

              {visibleRecurring.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-3">
                    {planFilter === 'internal' ? 'Internal Plans' : 'Recurring Plans'}
                    {planFilter === 'all' && recurring.filter((p: Plan) => !p.isInternal).length > 0 && recurring.filter((p: Plan) => p.isInternal).length > 0 && (
                      <span className="ml-2 text-[10px]">({recurring.filter((p: Plan) => !p.isInternal).length} public · {recurring.filter((p: Plan) => p.isInternal).length} internal)</span>
                    )}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {visibleRecurring.map((plan: Plan) => (
                      <AssignPlanCard key={plan.id} plan={plan} billingPeriod={billingPeriod}
                        isSelected={selectedPlanId === plan.id} isCurrentPlan={currentSub?.planId === plan.id}
                        onSelect={() => !isCurrentPlan && setSelectedPlanId(plan.id)} />
                    ))}
                  </div>
                </div>
              )}

              {unlimited.length > 0 && planFilter !== 'internal' && (
                <div><h3 className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-3">Unlimited / Free Plans</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {unlimited.map((plan: Plan) => (
                      <AssignPlanCard key={plan.id} plan={plan} billingPeriod="monthly"
                        isSelected={selectedPlanId === plan.id} isCurrentPlan={currentSub?.planId === plan.id}
                        onSelect={() => !isCurrentPlan && setSelectedPlanId(plan.id)} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Plan Comparison Panel */}
            {selectedPlanId && currentSub?.planName && selectedPlan && !isCurrentPlan && (
              <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-5">
                <h2 className="font-semibold text-[var(--color-text)] mb-3">Plan Comparison: {currentSub.planName} vs {selectedPlan.planName}</h2>
                <div className="grid grid-cols-[1fr_80px_80px_30px] gap-2 text-xs font-medium text-[var(--color-text-muted)] py-1 border-b border-[var(--color-border)] mb-1">
                  <span>Feature</span><span className="text-right">Current</span><span className="text-right">New</span><span className="text-center"></span>
                </div>
                <CompareRow label="Monthly Price" currentVal={currentSub.priceMonthly} newVal={selectedPlan.priceMonthly} formatter={v => v != null ? `${Number(v).toFixed(0)} EGP` : '—'} />
                <CompareRow label="Annual Price" currentVal={currentSub.priceYearly} newVal={selectedPlan.priceYearly} formatter={v => v != null ? `${Number(v).toFixed(0)} EGP` : '—'} />
                <CompareRow label="Billing Cycle" currentVal={currentSub.billingCycle} newVal={billingPeriod} />
                {FEATURE_COMPARE_KEYS.map(k => {
                  const cur = getFeatureValue(currentSub, k);
                  const nw = getFeatureValue(selectedPlan, k);
                  if (cur == null && nw == null) return null;
                  return <CompareRow key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} currentVal={cur} newVal={nw} formatter={v => v === Infinity ? 'Unlimited' : String(v ?? '—')} />;
                })}
                {['analytics', 'marketplace', 'academy'].map(k => (
                  <CompareRow key={k} label={`${k.charAt(0).toUpperCase() + k.slice(1)} Access`} currentVal={getBoolFeature(currentSub, k)} newVal={getBoolFeature(selectedPlan, k)} formatter={v => v === true ? '✓' : v === false ? '✗' : '—'} />
                ))}
              </div>
            )}

            {/* Downgrade Warning */}
            {isDowngrade && (
              <div className="bg-red-50 border border-red-200 rounded-[var(--radius-md)] p-4 flex items-start gap-3">
                <span className="text-lg shrink-0 mt-0.5" aria-hidden="true">⚠️</span>
                <div className="text-sm text-red-800">
                  <p className="font-medium mb-1">Downgrade Detected — This assignment may reduce organisation limits.</p>
                  {limitConflicts.length > 0 && (
                    <ul className="list-disc list-inside text-red-600 mt-1 space-y-0.5">
                      {limitConflicts.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  )}
                  <p className="text-red-600 mt-1">Some features may become unavailable after this change.</p>
                </div>
              </div>
            )}

            {/* Review button */}
            {selectedPlanId && selectedOrgId && (
              <div className="flex items-center justify-between bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-4">
                <div className="text-sm"><span className="text-[var(--color-text-muted)]">Selected: </span><span className="font-semibold text-[var(--color-text)]">{selectedPlan?.planName}</span><span className="text-[var(--color-text-muted)]"> for </span><span className="font-semibold text-[var(--color-text)]">{selectedOrg?.name}</span></div>
                <button onClick={() => setStep('review')} className="px-6 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium" aria-label="Review assignment">Continue to Review</button>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="max-w-2xl mx-auto space-y-4">
          {pendingReq && (
            <div className="bg-amber-50 border border-amber-200 rounded-[var(--radius-md)] p-4 flex items-start gap-3">
              <span className="text-lg shrink-0 mt-0.5" aria-hidden="true">⚠️</span>
              <div className="text-sm text-amber-800"><p className="font-medium mb-1">Pending Request Detected</p><p className="text-amber-600">This organisation has a pending subscription request. Manual assignment will override and reject it.</p></div>
            </div>
          )}

          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] p-6 space-y-4">
            <h2 className="font-semibold text-[var(--color-text)] text-lg">Review Assignment</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-4">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-1">Organisation</p>
                <p className="text-sm font-bold text-[var(--color-text)]">{selectedOrg?.name}</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-4">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-1">Current Plan</p>
                <p className="text-sm font-bold text-[var(--color-text)]">{currentSub?.planName || 'None'}</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-4">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-1">New Plan</p>
                <p className="text-sm font-bold text-[var(--color-text)]">{selectedPlan?.planName}</p>
              </div>
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-4">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-1">Billing Cycle</p>
                <p className="text-sm font-bold text-[var(--color-text)] capitalize">{billingPeriod}</p>
              </div>

              {/* Effective Date */}
              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-4">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-1">Effective Date</p>
                <div className="flex items-center gap-2 mt-1">
                  <label className="flex items-center gap-1 text-xs cursor-pointer"><input type="radio" name="effDate" checked={effectiveDateType === 'immediate'} onChange={() => setEffectiveDateType('immediate')} /> Immediate</label>
                  <label className="flex items-center gap-1 text-xs cursor-pointer"><input type="radio" name="effDate" checked={effectiveDateType === 'scheduled'} onChange={() => setEffectiveDateType('scheduled')} /> Scheduled</label>
                </div>
                {effectiveDateType === 'scheduled' && (
                  <input type="datetime-local" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="mt-1 w-full px-2 py-1 border rounded-[var(--radius-md)] bg-white text-xs" />
                )}
              </div>

              <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-4">
                <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium mb-1">Assignment Type</p>
                <p className="text-sm font-bold text-[var(--color-text)]">{currentSub?.planName ? 'Replacement' : 'New Subscription'}</p>
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700" title="This subscription was assigned directly by Super Admin.">MANUAL OVERRIDE</span>
              </div>
            </div>

            {/* Assignment Reason */}
            <div>
              <label className="block text-xs text-[var(--color-text-muted)] mb-1 font-medium">Assignment Reason</label>
              <select value={assignmentReason} onChange={e => setAssignmentReason(e.target.value)} className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm">
                {ASSIGN_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {assignmentReason === 'other' && (
                <textarea value={otherReasonText} onChange={e => setOtherReasonText(e.target.value)} placeholder="Describe the reason for this manual assignment..."
                  className="w-full px-3 py-2 border rounded-[var(--radius-md)] bg-[var(--color-bg)] text-sm resize-none mt-2" rows={2} />
              )}
            </div>

            {validationErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-[var(--radius-md)] p-3 space-y-1">
                {validationErrors.map((e, i) => <p key={i} className="text-xs text-red-700">• {e}</p>)}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button onClick={() => setShowConfirm(true)} disabled={!canProceed}
                className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50" aria-label="Proceed to assign plan">Assign Plan</button>
              <button onClick={() => setStep('select')} className="px-6 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm font-medium">Back</button>
            </div>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="max-w-md mx-auto text-center py-8 space-y-4">
          <div className="text-4xl">✅</div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">Assignment Completed</h2>
          <p className="text-sm text-[var(--color-text-muted)]">The plan has been assigned to <strong>{selectedOrg?.name}</strong>.</p>
          <div className="bg-[var(--color-bg)] rounded-[var(--radius-md)] p-4 text-sm space-y-1 text-left">
            <p><span className="text-[var(--color-text-muted)]">Plan:</span> <strong>{selectedPlan?.planName}</strong></p>
            <p><span className="text-[var(--color-text-muted)]">Billing:</span> {billingPeriod}</p>
            <p><span className="text-[var(--color-text-muted)]">Reason:</span> {assignmentReason === 'other' ? otherReasonText : ASSIGN_REASONS.find(r => r.value === assignmentReason)?.label}</p>
            <p><span className="text-[var(--color-text-muted)]">Effective:</span> {effectiveDateType === 'immediate' ? 'Immediate' : scheduledDate}</p>
            {pendingReq && <p><span className="text-[var(--color-text-muted)]">Pending request:</span> Overridden and rejected</p>}
          </div>
          <button onClick={handleClear} className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">Assign Another Plan</button>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowConfirm(false)}>
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-xl border border-[var(--color-border)] max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-3xl mb-2">⚠️</div>
              <h3 className="text-lg font-bold text-[var(--color-text)]">Confirm Manual Assignment</h3>
              <p className="text-sm text-[var(--color-text-muted)] mt-2">You are about to manually assign the <strong>{selectedPlan?.planName}</strong> plan to <strong>{selectedOrg?.name}</strong>.</p>
              <p className="text-sm text-amber-600 mt-2">This action bypasses the normal subscription request workflow.</p>
              {isDowngrade && <p className="text-sm text-red-600 mt-2">⚠️ This is a downgrade — organisation limits will be reduced.</p>}
            </div>
            {pendingReq && <div className="bg-amber-50 border border-amber-200 rounded-[var(--radius-md)] p-3 text-xs text-amber-700">The organisation's pending request will be rejected automatically.</div>}
            <div className="flex items-center gap-3">
              <button onClick={handleConfirmAssign} disabled={!canProceed || updateMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50" aria-label="Confirm manual assignment">
                {updateMutation.isPending ? 'Assigning...' : 'Assign Plan'}
              </button>
              <button onClick={() => setShowConfirm(false)} className="flex-1 px-4 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] text-sm font-medium">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssignPlanCard({
  plan, billingPeriod, isSelected, isCurrentPlan, onSelect,
}: { plan: Plan; billingPeriod: BillingPeriod; isSelected: boolean; isCurrentPlan?: boolean; onSelect: () => void }) {
  const price = resolveDisplayPrice(plan, billingPeriod);
  const isFree = plan.isUnlimited || price === 0;

  const featureSummary = (plan.features || []).reduce((acc: Record<string, string>, f: any) => {
    if (f.valueType === 'boolean') return acc;
    if (!f.value || f.value === '') return acc;
    acc[f.featureKey] = f.value;
    return acc;
  }, {} as Record<string, string>);

  return (
    <div onClick={isCurrentPlan ? undefined : onSelect} role="button" tabIndex={isCurrentPlan ? -1 : 0}
      onKeyDown={e => { if (!isCurrentPlan && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(); } }}
      aria-label={`${plan.planName}${isCurrentPlan ? ' — current plan' : ''}`} aria-disabled={isCurrentPlan}
      className={`bg-[var(--color-surface)] border-2 rounded-[var(--radius-lg)] p-4 transition-all ${
        isCurrentPlan ? 'border-green-300 opacity-60 cursor-not-allowed' :
        isSelected ? 'border-[var(--color-primary)] shadow-md cursor-pointer' :
        'border-transparent shadow-[var(--shadow-sm)] hover:border-[var(--color-border)] cursor-pointer'
      }`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-[var(--color-text)] text-sm">{plan.planName}</h3>
        <div className="flex items-center gap-1 shrink-0">
          {isCurrentPlan && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">Current Plan</span>}
          {plan.isInternal && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200 cursor-help flex items-center gap-1" title="Visible only to Super Admin. For marketing, testing, demos, promotions and administrative purposes only.">
              🔒 INTERNAL
            </span>
          )}
        </div>
      </div>
      <p className="text-xl font-bold text-[var(--color-primary)] mb-2">
        {isFree ? 'FREE' : `${Number(price).toFixed(0)}`}
        {!isFree && !plan.isUnlimited && <span className="text-xs font-normal text-[var(--color-text-muted)]"> EGP/{billingPeriod === 'yearly' ? 'yr' : 'mo'}</span>}
      </p>
      {Object.keys(featureSummary).length > 0 && (
        <div className="text-[11px] text-[var(--color-text-muted)] space-y-0.5 mb-2">
          {featureSummary.branches && <p>· {featureSummary.branches === '-1' ? 'Unlimited' : featureSummary.branches} branches</p>}
          {featureSummary.staff && <p>· {featureSummary.staff === '-1' ? 'Unlimited' : featureSummary.staff} staff</p>}
          {featureSummary.products && <p>· {featureSummary.products === '-1' ? 'Unlimited' : featureSummary.products} products</p>}
        </div>
      )}
      {plan.commissionRates?.length > 0 && (
        <div className="text-[11px] text-[var(--color-text-muted)] space-y-0.5 mb-2">
          {plan.commissionRates.slice(0, 2).map((cr: any) => <p key={cr.entity}>· {ENTITY_LABELS[cr.entity] || cr.entity}: {cr.rate}{cr.type === 'percentage' ? '%' : ' EGP'}</p>)}
          {plan.commissionRates.length > 2 && <p className="text-[10px]">· +{plan.commissionRates.length - 2} more</p>}
        </div>
      )}
      {plan.features && plan.features.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
          {['analytics', 'marketplace', 'academy'].map(k => {
            const feat = plan.features!.find((x: any) => x.featureKey === k);
            if (!feat || feat.valueType !== 'boolean' || feat.value !== 'true') return null;
            return <span key={k} className="text-[var(--color-success-text)]">✓ {k.charAt(0).toUpperCase() + k.slice(1)}</span>;
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

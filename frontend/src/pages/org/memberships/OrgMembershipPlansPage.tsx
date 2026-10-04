import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { membershipP1Api } from '../../../services/membership.p1';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

const DURATIONS = ['monthly', 'quarterly', 'semi_annual', 'annual'];
const PAYMENT_METHODS = ['cash', 'card'];

const inputCls = 'w-full px-3 py-2 rounded-[var(--radius-md)] border text-sm text-[var(--color-text)]';
const labelCls = 'block text-xs font-medium text-[var(--color-text-muted)] mb-1';

function emptyComponent() {
  return { code: '', name: '', category: '', amount: 0, quantity: 1, isRequired: true, sortOrder: 0 };
}

function blankVersion() {
  return {
    status: 'draft' as const,
    durationType: 'annual',
    durationPeriods: 1,
    renewalModel: 'anniversary' as const,
    fixedRenewalMonth: 1,
    fixedRenewalDay: 1,
    initialChargeType: 'full' as const,
    initialChargePercent: 60,
    graceDays: 0,
    branchScope: 'ALL' as const,
    branchIds: [] as number[],
    allowedPaymentMethods: ['cash', 'card'],
    currency: 'EGP',
    installmentsEnabled: false,
    components: [emptyComponent()],
  };
}

export default function OrgMembershipPlansPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const oid = Number(orgId);
  const { showToast } = useToast();
  const qc = useQueryClient();

  const { data: plans, isLoading } = useQuery({
    queryKey: ['org-membership-plans', oid],
    queryFn: () => membershipP1Api.listOrgPlans(oid),
    enabled: !!oid,
  });
  const { data: branches } = useQuery({
    queryKey: ['org-branches', oid],
    queryFn: () => api.get(`/org/${oid}/branches`).then((r: any) => r.data),
    enabled: !!oid,
  });

  const [editing, setEditing] = useState<null | { mode: 'create' | 'edit'; planId?: number; versionId?: number }>(null);
  const [form, setForm] = useState<any>({ name: '', description: '', category: 'general', isPublic: true, version: blankVersion() });

  const openEdit = (plan: any, version: any) => {
    setForm({
      name: plan.name, description: plan.description || '', category: plan.category || 'general', isPublic: plan.is_public === 1,
      version: {
        status: version.status, durationType: version.durationType, durationPeriods: version.durationPeriods, renewalModel: version.renewalModel,
        fixedRenewalMonth: version.fixedRenewalMonth ?? 1, fixedRenewalDay: version.fixedRenewalDay ?? 1, initialChargeType: version.initialChargeType,
        initialChargePercent: version.initialChargePercent ?? 60, graceDays: version.graceDays, branchScope: version.branchScope,
        branchIds: version.branchIds || [], allowedPaymentMethods: version.allowedPaymentMethods || ['cash', 'card'], currency: version.currency || 'EGP',
        installmentsEnabled: version.installmentsEnabled || false, components: version.components?.length ? version.components.map((c: any) => ({
          code: c.code, name: c.name, category: c.category || '', amount: Number(c.amount), quantity: Number(c.quantity),
          isRequired: Number(c.is_required) === 1, sortOrder: Number(c.sort_order),
        })) : [emptyComponent()],
      },
    });
    setEditing({ mode: 'edit', planId: Number(plan.id), versionId: Number(version.id) });
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['org-membership-plans', oid] });

  const createPlan = useMutation({
    mutationFn: () => membershipP1Api.createPlan(oid, { name: form.name, description: form.description || undefined, category: form.category, isPublic: form.isPublic, version: form.version }),
    onSuccess: () => { invalidate(); setEditing(null); showToast('Plan created'); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to create plan', 'error'),
  });
  const saveDraft = useMutation({
    mutationFn: () => {
      const payload: any = { ...form.version };
      // Update basic plan identity + draft version content.
      return Promise.all([
        membershipP1Api.updatePlanBasic(oid, editing!.planId!, { name: form.name, description: form.description || undefined, category: form.category, isPublic: form.isPublic }),
        membershipP1Api.updateVersion(oid, editing!.versionId!, payload),
      ]);
    },
    onSuccess: () => { invalidate(); setEditing(null); showToast('Draft updated'); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to update draft', 'error'),
  });
  const activate = useMutation({
    mutationFn: (versionId: number) => membershipP1Api.activateVersion(oid, versionId),
    onSuccess: () => { invalidate(); showToast('Version activated'); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to activate', 'error'),
  });
  const archive = useMutation({
    mutationFn: (versionId: number) => membershipP1Api.archiveVersion(oid, versionId),
    onSuccess: () => { invalidate(); showToast('Version archived'); },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to archive', 'error'),
  });

  const setV = (k: string, v: any) => setForm((f: any) => ({ ...f, version: { ...f.version, [k]: v } }));
  const setComp = (i: number, k: string, v: any) => {
    const components = form.version.components.map((c: any, idx: number) => (idx === i ? { ...c, [k]: v } : c));
    setV('components', components);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Membership Plans</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Plan versions (historical pricing) · components · branch scope (G11.22 P1).</p>
        </div>
        <Can permission="membership.create">
          <button onClick={() => { setForm({ name: '', description: '', category: 'general', isPublic: true, version: blankVersion() }); setEditing({ mode: 'create' }); }}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium">New Plan</button>
        </Can>
      </div>

      {editing && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{editing.mode === 'create' ? 'Create plan + first version' : 'Edit draft version'}</p>
            <button onClick={() => setEditing(null)} className="text-sm text-[var(--color-text-muted)]">× Close</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className={labelCls}>Plan name *</label><input className={inputCls} value={form.name} onChange={(e) => setForm((f: any) => ({ ...f, name: e.target.value }))} /></div>
            <div><label className={labelCls}>Category</label><input className={inputCls} value={form.category} onChange={(e) => setForm((f: any) => ({ ...f, category: e.target.value }))} /></div>
            <div><label className={labelCls}>Duration *</label>
              <select className={inputCls} value={form.version.durationType} onChange={(e) => setV('durationType', e.target.value)}>
                {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select></div>
            <div><label className={labelCls}>Duration periods</label><input type="number" min={1} className={inputCls} value={form.version.durationPeriods} onChange={(e) => setV('durationPeriods', Number(e.target.value))} /></div>
            <div><label className={labelCls}>Renewal model</label>
              <select className={inputCls} value={form.version.renewalModel} onChange={(e) => setV('renewalModel', e.target.value)}>
                <option value="anniversary">Anniversary (period from start)</option>
                <option value="fixed_date">Fixed annual date</option>
              </select></div>
            {form.version.renewalModel === 'fixed_date' && (
              <>
                <div><label className={labelCls}>Fixed renewal month</label><input type="number" min={1} max={12} className={inputCls} value={form.version.fixedRenewalMonth} onChange={(e) => setV('fixedRenewalMonth', Number(e.target.value))} /></div>
                <div><label className={labelCls}>Fixed renewal day</label><input type="number" min={1} max={31} className={inputCls} value={form.version.fixedRenewalDay} onChange={(e) => setV('fixedRenewalDay', Number(e.target.value))} /></div>
              </>
            )}
            <div><label className={labelCls}>Initial charge</label>
              <select className={inputCls} value={form.version.initialChargeType} onChange={(e) => setV('initialChargeType', e.target.value)}>
                <option value="full">Full</option>
                <option value="percentage">Percentage</option>
              </select></div>
            {form.version.initialChargeType === 'percentage' && (
              <div><label className={labelCls}>Initial % (of total)</label><input type="number" min={1} max={100} className={inputCls} value={form.version.initialChargePercent} onChange={(e) => setV('initialChargePercent', Number(e.target.value))} /></div>
            )}
            <div><label className={labelCls}>Grace days</label><input type="number" min={0} className={inputCls} value={form.version.graceDays} onChange={(e) => setV('graceDays', Number(e.target.value))} /></div>
            <div><label className={labelCls}>Branch scope</label>
              <select className={inputCls} value={form.version.branchScope} onChange={(e) => setV('branchScope', e.target.value)}>
                <option value="ALL">All branches</option>
                <option value="SELECTED">Selected branches</option>
              </select></div>
            {form.version.branchScope === 'SELECTED' && (
              <div><label className={labelCls}>Branches</label>
                <select multiple className={inputCls} value={form.version.branchIds}
                  onChange={(e) => setV('branchIds', Array.from(e.target.selectedOptions).map((o) => Number(o.value)))}>
                  {(branches || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select></div>
            )}
            <div><label className={labelCls}>Payment methods</label>
              <div className="flex gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button key={m} type="button" onClick={() => setV('allowedPaymentMethods', form.version.allowedPaymentMethods.includes(m) ? form.version.allowedPaymentMethods.filter((x: string) => x !== m) : [...form.version.allowedPaymentMethods, m])}
                    className={`px-2 py-1 rounded-full text-xs border ${form.version.allowedPaymentMethods.includes(m) ? 'bg-[var(--color-primary)] text-white border-transparent' : 'border-[var(--color-border)]'}`}>{m}</button>
                ))}
              </div></div>
          </div>

          <div>
            <p className="text-sm font-semibold mb-2">Components (sum = subscription total)</p>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-[var(--color-text-muted)]"><th>Name</th><th>Code</th><th>Amount</th><th>Qty</th><th>Required</th><th></th></tr></thead>
              <tbody>
                {form.version.components.map((c: any, i: number) => (
                  <tr key={i}>
                    <td><input className={`${inputCls} w-40`} value={c.name} onChange={(e) => setComp(i, 'name', e.target.value)} /></td>
                    <td><input className={`${inputCls} w-28`} value={c.code} onChange={(e) => setComp(i, 'code', e.target.value)} /></td>
                    <td><input type="number" min={0} className={`${inputCls} w-28`} value={c.amount} onChange={(e) => setComp(i, 'amount', Number(e.target.value))} /></td>
                    <td><input type="number" min={1} className={`${inputCls} w-20`} value={c.quantity} onChange={(e) => setComp(i, 'quantity', Number(e.target.value))} /></td>
                    <td><input type="checkbox" checked={c.isRequired} onChange={(e) => setComp(i, 'isRequired', e.target.checked)} /></td>
                    <td><button type="button" onClick={() => setV('components', form.version.components.filter((_: any, idx: number) => idx !== i))} className="text-xs text-[var(--color-error)]">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={() => setV('components', [...form.version.components, emptyComponent()])} className="mt-2 text-xs text-[var(--color-primary)]">+ Add component</button>
          </div>

          <div className="flex gap-2">
            <button onClick={() => (editing.mode === 'create' ? createPlan.mutate() : saveDraft.mutate())} disabled={createPlan.isPending || saveDraft.isPending}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium disabled:opacity-50">
              {editing.mode === 'create' ? 'Create' : 'Save draft'}
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 border rounded-[var(--radius-md)] text-sm">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : !plans?.length ? (
        <p className="text-sm text-[var(--color-text-muted)]">No membership plans yet.</p>
      ) : (
        <div className="space-y-4">
          {(plans as any[]).map((plan) => (
            <div key={plan.id} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{plan.name}</p>
                <span className="text-xs text-[var(--color-text-muted)]">code: {plan.code}</span>
              </div>
              <div className="mt-2 space-y-2">
                {(plan.versions || []).map((v: any) => {
                  const total = (v.components || []).reduce((s: number, c: any) => s + Number(c.amount) * Number(c.quantity), 0);
                  return (
                    <div key={v.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${v.status === 'active' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : v.status === 'draft' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>{v.status}</span>
                        <span className="text-xs">v{v.versionNo}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">{v.durationType} ×{v.durationPeriods} · {v.branchScope === 'ALL' ? 'all branches' : `${(v.branchIds || []).length} branch(es)`}</span>
                        <span className="text-xs font-medium">Total {total.toFixed(2)} {v.currency}</span>
                        <div className="ml-auto flex gap-2">
                          {v.status === 'draft' && (
                            <>
                              <EditDraftButton onEdit={() => openEdit(plan, v)} />
                              <button onClick={() => activate.mutate(Number(v.id))} disabled={activate.isPending} className="text-xs text-[var(--color-success-text)]">Activate</button>
                            </>
                          )}
                          {(v.status === 'active' || v.status === 'draft') && (
                            <button onClick={() => { if (confirm('Archive this version?')) archive.mutate(Number(v.id)); }} className="text-xs text-[var(--color-error)]">Archive</button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                        {v.initialChargeType === 'percentage' ? `Initial ${v.initialChargePercent}% · ` : ''}Renewal {v.renewalModel}{v.renewalModel === 'fixed_date' ? ` (${String(v.fixedRenewalMonth).padStart(2, '0')}/${String(v.fixedRenewalDay).padStart(2, '0')})` : ''} · Grace {v.graceDays}d
                        <div className="mt-1">{(v.components || []).map((c: any) => <span key={c.code} className="mr-3">{c.name} {Number(c.amount).toFixed(2)} ×{c.quantity}{c.is_required === 0 ? ' (opt)' : ''}</span>)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditDraftButton({ onEdit }: { onEdit: () => void }) {
  return <button onClick={onEdit} className="text-xs text-[var(--color-primary)]">Edit draft</button>;
}
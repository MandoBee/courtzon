import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Can } from '../../permissions/Can';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { getErrorMessage } from '../../utils/errors';

export default function OrgPaymentSettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [editBranchId, setEditBranchId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});

  const { data, isLoading } = useQuery({
    queryKey: ['org-payment-settings', orgId],
    queryFn: () => api.get(`/org/${orgId}/payment-settings`).then((r) => r.data),
    enabled: !!orgId,
  });

  const mutation = useMutation({
    mutationFn: (body: any) => api.put(`/org/${orgId}/payment-settings`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-payment-settings', orgId] });
      setEditBranchId(null);
      showToast('Payment settings updated');
    },
    onError: (err) => showToast(getErrorMessage(err, 'Failed to update payment settings'), 'error'),
  });

  if (!orgId) return <div className="p-6 text-center text-[var(--color-text-muted)]">Invalid organisation</div>;
  if (isLoading) return <div className="animate-pulse h-40 bg-[var(--color-surface)] rounded-xl" />;

  const branches: any[] = data?.branches || [];
  const paymentMethods: any[] = data?.paymentMethods || [];

  const openEdit = (b: any) => {
    setEditBranchId(b.id);
    setForm({
      account_holder_name: b.account_holder_name || '',
      account_number: b.account_number || '',
      bank_name: b.bank_name || '',
      iban: b.iban || '',
      swift_code: b.swift_code || '',
      tax_id: b.tax_id || '',
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Payment Settings</h1>

      <div className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
        <h2 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-3">Available Payment Methods</h2>
        {paymentMethods.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No payment methods configured.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {paymentMethods.map((pm: any) => (
              <span key={pm.id} className="text-xs bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-3 py-1 rounded-full">
                {pm.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <h2 className="text-lg font-semibold text-[var(--color-text)]">Branch Financial Details</h2>
      {branches.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No branches found.</p>
      ) : (
        <div className="grid gap-3">
          {branches.map((b: any) => (
            <div key={b.id} className="bg-[var(--color-surface)] rounded-xl p-4 border border-[var(--color-border)]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-[var(--color-text)]">{b.name}</h3>
                <Can permission="org.settings.edit">
                  <button onClick={() => openEdit(b)} className="text-xs px-3 py-1.5 border border-[var(--color-border)] rounded-md hover:bg-[var(--color-primary)]/10 font-medium">Edit</button>
                </Can>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-[var(--color-text-muted)]">Bank</dt>
                <dd className="text-[var(--color-text)]">{b.bank_name || '—'}</dd>
                <dt className="text-[var(--color-text-muted)]">Account Holder</dt>
                <dd className="text-[var(--color-text)]">{b.account_holder_name || '—'}</dd>
                <dt className="text-[var(--color-text-muted)]">Account Number</dt>
                <dd className="text-[var(--color-text)]">{b.account_number ? '••••' + b.account_number.slice(-4) : '—'}</dd>
                <dt className="text-[var(--color-text-muted)]">IBAN</dt>
                <dd className="text-[var(--color-text)]">{b.iban ? '••••' + b.iban.slice(-4) : '—'}</dd>
                <dt className="text-[var(--color-text-muted)]">SWIFT</dt>
                <dd className="text-[var(--color-text)]">{b.swift_code || '—'}</dd>
              </dl>
            </div>
          ))}
        </div>
      )}

      <Modal open={editBranchId !== null} onClose={() => setEditBranchId(null)} title="Edit Financial Details">
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate({ branchId: editBranchId, financialDetails: form }); }} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Account Holder Name</span>
            <input value={form.account_holder_name} onChange={(e) => setForm({ ...form, account_holder_name: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Account Number</span>
            <input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Bank Name</span>
            <input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">IBAN</span>
            <input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">SWIFT Code</span>
            <input value={form.swift_code} onChange={(e) => setForm({ ...form, swift_code: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Tax ID</span>
            <input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]" />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditBranchId(null)} className="px-4 py-2 text-sm text-[var(--color-text-muted)]">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50">
              {mutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

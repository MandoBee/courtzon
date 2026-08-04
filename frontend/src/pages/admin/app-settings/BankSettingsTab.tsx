import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { Can } from '../../../permissions/Can';
import { useToast } from '../../../components/ui/Toast';

export type BankAccount = {
  id: string;
  bank_name: string;
  branch_name: string;
  account_holder_name: string;
  account_number: string;
  iban: string;
  swift_bic: string;
  routing_number: string;
  currency: string;
  country: string;
  bank_address: string;
  beneficiary_name: string;
  beneficiary_address: string;
  merchant_id: string;
  merchant_code: string;
  payment_gateway_reference: string;
  notes: string;
  is_active: boolean;
};

const EMPTY_ACCOUNT = (): BankAccount => ({
  id: `acct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  bank_name: '',
  branch_name: '',
  account_holder_name: '',
  account_number: '',
  iban: '',
  swift_bic: '',
  routing_number: '',
  currency: '',
  country: '',
  bank_address: '',
  beneficiary_name: '',
  beneficiary_address: '',
  merchant_id: '',
  merchant_code: '',
  payment_gateway_reference: '',
  notes: '',
  is_active: true,
});

const inputClass =
  'w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)]';

const sectionHeaderClass =
  'text-sm font-semibold text-[var(--color-text)] uppercase tracking-wide';

function normalizeAccounts(value: unknown): BankAccount[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const src = (item ?? {}) as Record<string, unknown>;
      return {
        id: typeof src.id === 'string' ? src.id : `acct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        bank_name: typeof src.bank_name === 'string' ? src.bank_name : '',
        branch_name: typeof src.branch_name === 'string' ? src.branch_name : '',
        account_holder_name: typeof src.account_holder_name === 'string' ? src.account_holder_name : '',
        account_number: typeof src.account_number === 'string' ? src.account_number : '',
        iban: typeof src.iban === 'string' ? src.iban : '',
        swift_bic: typeof src.swift_bic === 'string' ? src.swift_bic : '',
        routing_number: typeof src.routing_number === 'string' ? src.routing_number : '',
        currency: typeof src.currency === 'string' ? src.currency : '',
        country: typeof src.country === 'string' ? src.country : '',
        bank_address: typeof src.bank_address === 'string' ? src.bank_address : '',
        beneficiary_name: typeof src.beneficiary_name === 'string' ? src.beneficiary_name : '',
        beneficiary_address: typeof src.beneficiary_address === 'string' ? src.beneficiary_address : '',
        merchant_id: typeof src.merchant_id === 'string' ? src.merchant_id : '',
        merchant_code: typeof src.merchant_code === 'string' ? src.merchant_code : '',
        payment_gateway_reference: typeof src.payment_gateway_reference === 'string' ? src.payment_gateway_reference : '',
        notes: typeof src.notes === 'string' ? src.notes : '',
        is_active: src.is_active !== false,
      };
    })
    .filter((acc) => acc.bank_name || acc.account_number || acc.iban);
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-[var(--color-text)] mb-1">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </div>
  );
}

export default function BankSettingsTab({ initialValue }: { initialValue: unknown }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[]>(() => normalizeAccounts(initialValue));

  useEffect(() => {
    setAccounts(normalizeAccounts(initialValue));
  }, [initialValue]);

  const saveMutation = useMutation({
    mutationFn: (payload: BankAccount[]) =>
      api.put('/admin/app-settings', { settings: { platform_bank_accounts: payload } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      showToast('Bank information saved!');
    },
    onError: (err: any) =>
      showToast(err?.response?.data?.message || err.message || 'Save failed', 'error'),
  });

  const update = (id: string, patch: Partial<BankAccount>) =>
    setAccounts((accs) => accs.map((acc) => (acc.id === id ? { ...acc, ...patch } : acc)));

  const addAccount = () => setAccounts((accs) => [...accs, EMPTY_ACCOUNT()]);

  const removeAccount = (id: string) => {
    setAccounts((accs) => accs.filter((acc) => acc.id !== id));
    showToast('Account removed. Save to apply.', 'warning');
  };

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className={sectionHeaderClass}>Platform bank accounts</h2>
          <Can permission="app-settings.edit.bank">
            <button
              type="button"
              onClick={addAccount}
              className="px-3 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)]"
            >
              + Add bank account
            </button>
          </Can>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] -mt-2">
          Settlement, payout, and refund accounts used across the platform. Stored securely in app settings; multiple accounts are supported.
        </p>
      </section>

      {accounts.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No bank accounts configured yet.</p>
      ) : (
        accounts.map((acc, idx) => (
          <div
            key={acc.id}
            className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4 md:p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">
                {acc.bank_name ? acc.bank_name : `Bank account ${idx + 1}`}
              </h3>
              <div className="flex items-center gap-3">
                <Can permission="app-settings.edit.bank">
                  <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    <input
                      type="checkbox"
                      checked={acc.is_active}
                      onChange={(e) => update(acc.id, { is_active: e.target.checked })}
                      className="rounded border-[var(--color-border)]"
                    />
                    Active
                  </label>
                  <button
                    type="button"
                    onClick={() => removeAccount(acc.id)}
                    className="text-xs text-[var(--color-error)] font-medium"
                  >
                    Remove
                  </button>
                </Can>
              </div>
            </div>

            <Can permission="app-settings.edit.bank">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Bank name" value={acc.bank_name} onChange={(v) => update(acc.id, { bank_name: v })} placeholder="e.g. Commercial International Bank" />
                <Field label="Branch name" value={acc.branch_name} onChange={(v) => update(acc.id, { branch_name: v })} placeholder="e.g. Downtown Branch" />
                <Field label="Account holder name" value={acc.account_holder_name} onChange={(v) => update(acc.id, { account_holder_name: v })} />
                <Field label="Account number" value={acc.account_number} onChange={(v) => update(acc.id, { account_number: v })} />
                <Field label="IBAN" value={acc.iban} onChange={(v) => update(acc.id, { iban: v })} />
                <Field label="SWIFT / BIC" value={acc.swift_bic} onChange={(v) => update(acc.id, { swift_bic: v })} />
                <Field label="Routing number" value={acc.routing_number} onChange={(v) => update(acc.id, { routing_number: v })} />
                <Field label="Currency" value={acc.currency} onChange={(v) => update(acc.id, { currency: v })} placeholder="EGP" />
                <Field label="Country" value={acc.country} onChange={(v) => update(acc.id, { country: v })} />
                <Field label="Bank address" value={acc.bank_address} onChange={(v) => update(acc.id, { bank_address: v })} className="md:col-span-2" />
              </div>
            </Can>

            <Can permission="app-settings.edit.bank">
              <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
                <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Beneficiary</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Beneficiary name" value={acc.beneficiary_name} onChange={(v) => update(acc.id, { beneficiary_name: v })} />
                  <Field label="Beneficiary address" value={acc.beneficiary_address} onChange={(v) => update(acc.id, { beneficiary_address: v })} />
                </div>
              </div>
            </Can>

            <Can permission="app-settings.edit.bank">
              <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
                <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Gateway / merchant reference</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Merchant ID" value={acc.merchant_id} onChange={(v) => update(acc.id, { merchant_id: v })} />
                  <Field label="Merchant code" value={acc.merchant_code} onChange={(v) => update(acc.id, { merchant_code: v })} />
                  <Field label="Payment gateway reference" value={acc.payment_gateway_reference} onChange={(v) => update(acc.id, { payment_gateway_reference: v })} />
                </div>
                <Field label="Notes" value={acc.notes} onChange={(v) => update(acc.id, { notes: v })} />
              </div>
            </Can>
          </div>
        ))
      )}

      <Can permission="app-settings.edit.bank">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => saveMutation.mutate(accounts)}
            disabled={saveMutation.isPending}
            className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save bank information'}
          </button>
        </div>
      </Can>
    </div>
  );
}

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Button, Input, Card } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';
import { formatPrice, getCurrencySymbol } from '../../utils/currency';

interface PaymentMethodOption {
  id: number;
  slug: string;
  name: string;
  icon?: string | null;
  description?: string | null;
}

const DepositSchema = z.object({
  amount: z
    .string()
    .min(1, 'Enter an amount')
    .refine((v) => !Number.isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Enter a valid amount'),
  paymentMethod: z.string().min(1, 'Choose a payment method'),
});

type DepositForm = z.infer<typeof DepositSchema>;

function paymentMethodEmoji(icon?: string | null): string {
  switch (icon) {
    case 'wallet': return '👛';
    case 'cash': return '💵';
    case 'card': return '💳';
    case 'bank_transfer': return '🏦';
    case 'e-wallet': return '📱';
    default: return '💳';
  }
}

export default function WalletPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [paymobUrl, setPaymobUrl] = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<DepositForm>({
    resolver: zodResolver(DepositSchema),
    defaultValues: { amount: '', paymentMethod: '' },
  });

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['my-wallet'],
    queryFn: () => api.get('/wallets/me').then((r) => r.data),
  });

  const { data: paymentMethods = [], isLoading: methodsLoading } = useQuery({
    queryKey: ['public-payment-methods', 'wallet'],
    queryFn: () =>
      api.get('/public/payment-methods', { params: { context: 'wallet' } }).then(
        (r) => r.data.data as PaymentMethodOption[],
      ),
  });

  const { data: txns, isLoading: txnsLoading } = useQuery({
    queryKey: ['wallet-transactions', page],
    queryFn: () => api.get('/wallets/transactions', { params: { page, limit: 20 } }).then((r) => r.data),
  });

  const depositMutation = useMutation({
    mutationFn: (data: { amount: number; paymentMethod: string }) =>
      api.post('/wallets/deposit', { ...data, returnUrl: window.location.origin + '/wallet' }).then((r) => r.data),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['my-wallet'] });
        queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
        reset({ amount: '', paymentMethod: '' });
        showToast('Deposit completed!');
      } else if (result.paymentUrl) {
        setPaymobUrl(result.paymentUrl);
        setIframeLoading(true);
      } else {
        showToast(result.message || 'Payment requires action', 'info');
      }
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
        || (err as { message?: string })?.message
        || 'Deposit failed';
      showToast(message, 'error');
    },
  });

  const onSubmit = (data: DepositForm) => {
    depositMutation.mutate({
      amount: parseFloat(data.amount),
      paymentMethod: data.paymentMethod,
    });
  };

  const selectedMethod = watch('paymentMethod');
  const walletCurrency = wallet?.currencyCode;
  const currencySymbol = getCurrencySymbol(walletCurrency);

  if (walletLoading) return <div className="text-center py-8">Loading wallet...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-[var(--color-text)]">Wallet</h1>

      <Card>
        <p className="text-sm text-[var(--color-text-muted)]">Available Balance</p>
        <p className="text-3xl font-bold text-[var(--color-primary)]">
          {formatPrice(Number(wallet?.balance || 0), walletCurrency)}
        </p>
      </Card>

      <Can permission="financial.wallet.deposit">
        <Card>
          <h2 className="font-semibold text-[var(--color-text)] mb-4">Deposit Funds</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label={`Amount (${currencySymbol})`}
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              placeholder="Enter amount to deposit"
              {...register('amount')}
              error={errors.amount?.message}
            />

            <Can permission="financial.wallet.deposit.payment-method">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                  Payment method
                </label>
                {methodsLoading ? (
                  <p className="text-sm text-[var(--color-text-muted)]">Loading payment methods...</p>
                ) : paymentMethods.length === 0 ? (
                  <p className="text-sm text-[var(--color-error)]">No payment methods available.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {paymentMethods.map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setValue('paymentMethod', method.slug, { shouldValidate: true })}
                        className={`flex items-start gap-3 p-3 rounded-[var(--radius-md)] border text-left transition-colors ${
                          selectedMethod === method.slug
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                            : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                        }`}
                      >
                        <span className="text-xl leading-none mt-0.5" aria-hidden>
                          {paymentMethodEmoji(method.icon || method.slug)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-[var(--color-text)]">{method.name}</span>
                          {method.description && (
                            <span className="block text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">
                              {method.description}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <input type="hidden" {...register('paymentMethod')} />
                {errors.paymentMethod?.message && (
                  <p className="text-sm text-[var(--color-error)] mt-1.5">{errors.paymentMethod.message}</p>
                )}
              </div>
            </Can>

            <Button
              type="submit"
              loading={depositMutation.isPending}
              disabled={!selectedMethod || methodsLoading}
            >
              Deposit
            </Button>

            {depositMutation.isError && (
              <p className="text-sm text-[var(--color-error)]">Deposit failed. Please try again.</p>
            )}
          </form>
        </Card>
      </Can>

      <Card>
        <h2 className="font-semibold text-[var(--color-text)] mb-4">Transaction History</h2>
        {txnsLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading transactions...</p>
        ) : !txns?.data?.length ? (
          <p className="text-sm text-[var(--color-text-muted)]">No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {txns.data.map((t: { id: number; transaction_type?: string; description?: string; created_at: string; direction: string; amount: number }) => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)] capitalize">
                    {t.transaction_type?.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {t.description || ''} &middot; {new Date(t.created_at).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <span className={`text-sm font-semibold ${t.direction === 'credit' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                  {t.direction === 'credit' ? '+' : '-'}{formatPrice(Number(t.amount), walletCurrency)}
                </span>
              </div>
            ))}
          </div>
        )}
        {txns && txns.total > txns.limit && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--color-border)]">
            <Button type="button" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <span className="text-sm text-[var(--color-text-muted)]">Page {page} of {Math.ceil(txns.total / txns.limit)}</span>
            <Button type="button" variant="ghost" disabled={page >= Math.ceil(txns.total / txns.limit)} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </Card>

      {paymobUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b">
              <h3 className="font-semibold text-sm">Card Payment</h3>
              <button
                onClick={() => { setPaymobUrl(null); setIframeLoading(true); }}
                className="text-gray-500 hover:text-gray-700 text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 relative min-h-[400px]">
              {iframeLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                  <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Loading secure payment form...</p>
                  </div>
                </div>
              )}
              <iframe
                src={paymobUrl}
                className="w-full h-full border-0"
                onLoad={() => setIframeLoading(false)}
                title="Payment"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

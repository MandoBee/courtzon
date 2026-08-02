import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import api from '../../services/api';
import { Button, Input, Card, Modal } from '../../components/ui';
import { Can } from '../../permissions/Can';
import { useToast } from '../../components/ui/Toast';
import { formatPrice, getCurrencySymbol } from '../../utils/currency';
import PaymobPixelCard from '../../components/payment/PaymobPixelCard';
import PaymentStatusPoller from '../../components/payment/PaymentStatusPoller';
import { usePaymentConfirm } from '../../hooks/usePaymentConfirm';

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
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [paymobUrl, setPaymobUrl] = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [pixelClientSecret, setPixelClientSecret] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [pollingPaid, setPollingPaid] = useState(false);
  const { state: confirmState, confirm: confirmPayment } = usePaymentConfirm();
  const PAGE_SIZE = 20;

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<DepositForm>({
    resolver: zodResolver(DepositSchema),
    defaultValues: { amount: '', paymentMethod: '' },
  });

  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ['wallet', 'me'],
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
    queryKey: ['transactions', page],
    queryFn: () => api.get('/wallets/transactions', { params: { page, limit: PAGE_SIZE } }).then((r) => r.data),
  });

  const depositMutation = useMutation({
    mutationFn: (data: { amount: number; paymentMethod: string }) =>
      api.post('/wallets/deposit', { ...data, returnUrl: window.location.origin + '/wallet' }).then((r) => r.data),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['wallet', 'me'] });
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        reset({ amount: '', paymentMethod: '' });
        showToast(t('player.wallet.deposit_completed') || 'Deposit completed!');
      } else if (result.clientSecret) {
        setPaymentId(result.paymentId || null);
        setPixelClientSecret(result.clientSecret);
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

  const cancelCardPayment = () => {
    setPixelClientSecret(null);
    showToast(t('player.wallet.payment_cancelled') || 'Payment cancelled', 'warning');
  };

  const selectedMethod = watch('paymentMethod');
  const walletCurrency = wallet?.currencyCode;
  const currencySymbol = getCurrencySymbol(walletCurrency);

  if (walletLoading) return <div className="text-center py-8">{t('common.loading')}</div>;

  return (
    <Can permission="player.wallet.view">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">{t('player.wallet.title') || 'Wallet'}</h1>

        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">{t('player.wallet.balance') || 'Available Balance'}</p>
          <p className="text-3xl font-bold text-[var(--color-primary)]">
            {formatPrice(Number(wallet?.balance || 0), walletCurrency)}
          </p>
        </Card>

        <Can permission="financial.wallet.deposit">
          <Card>
            <h2 className="font-semibold text-[var(--color-text)] mb-4">{t('player.wallet.deposit_title') || 'Deposit Funds'}</h2>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <Input
                label={`${t('common.amount')} (${currencySymbol})`}
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                placeholder={t('player.wallet.deposit_placeholder') || 'Enter amount to deposit'}
                {...register('amount')}
                error={errors.amount?.message}
              />

              <Can permission="financial.wallet.deposit.payment-method">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                    {t('player.wallet.payment_method') || 'Payment method'}
                  </label>
                  {methodsLoading ? (
                    <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
                  ) : paymentMethods.length === 0 ? (
                    <p className="text-sm text-[var(--color-error)]">{t('player.wallet.no_payment_methods') || 'No payment methods available.'}</p>
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
                {t('player.wallet.deposit_button') || 'Deposit'}
              </Button>

              {depositMutation.isError && (
                <p className="text-sm text-[var(--color-error)]">{t('player.wallet.deposit_failed') || 'Deposit failed. Please try again.'}</p>
              )}
            </form>
          </Card>
        </Can>

        <Can permission="player.wallet.transactions">
          <Card>
            <h2 className="font-semibold text-[var(--color-text)] mb-4">{t('player.wallet.transaction_history') || 'Transaction History'}</h2>
            {txnsLoading ? (
              <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
            ) : !txns?.data?.length ? (
              <p className="text-sm text-[var(--color-text-muted)]">{t('player.wallet.no_transactions') || 'No transactions yet.'}</p>
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
            {txns && txns.total > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--color-border)]">
                <Button type="button" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  {t('common.previous')}
                </Button>
                <span className="text-sm text-[var(--color-text-muted)]">{t('common.page') || 'Page'} {page} {t('common.of') || 'of'} {Math.ceil(txns.total / PAGE_SIZE)}</span>
                <Button type="button" variant="ghost" disabled={page >= Math.ceil(txns.total / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)}>
                  {t('common.next')}
                </Button>
              </div>
            )}
          </Card>
        </Can>

        {paymobUrl && (
          <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b">
                <h3 className="font-semibold text-sm">{t('player.wallet.card_payment') || 'Card Payment'}</h3>
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
                      <p className="text-sm text-gray-500">{t('player.wallet.loading_payment') || 'Loading secure payment form...'}</p>
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

        {/* Poll payment status after Pixel card payment */}
        {pollingPaid && paymentId && (
          <PaymentStatusPoller
            endpoint={`/payments/status/${paymentId}`}
            isComplete={(d: any) => d?.paymentStatus === 'paid'}
            interval={1500}
            timeout={90000}
            onPaid={() => {
              queryClient.invalidateQueries({ queryKey: ['wallet', 'me'] });
              queryClient.invalidateQueries({ queryKey: ['transactions'] });
              reset({ amount: '', paymentMethod: '' });
              setPollingPaid(false);
              showToast(t('player.wallet.deposit_completed') || 'Deposit completed!', 'success');
            }}
            onTimeout={() => {
              setPollingPaid(false);
              showToast(
                t('player.wallet.deposit_pending')
                || 'Payment confirmation is taking longer than expected. Your wallet will be credited once the payment settles.',
                'warning',
              );
            }}
          />
        )}

        {/* Payment confirming overlay (usePaymentConfirm hook state) */}
        {(confirmState === 'confirming' || confirmState === 'polling') && (
          <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center">
            <div className="bg-[var(--color-surface)] rounded-xl shadow-xl p-6 text-center space-y-3">
              <div className="animate-spin w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-[var(--color-text-muted)]">
                {confirmState === 'confirming' ? 'Verifying payment...' : 'Waiting for confirmation...'}
              </p>
            </div>
          </div>
        )}

        {/* Paymob Pixel card modal */}
        <Modal open={!!pixelClientSecret} onClose={cancelCardPayment} title={t('player.wallet.card_payment') || 'Card Payment'} size="lg">
          {pixelClientSecret && (
            <PaymobPixelCard
              clientSecret={pixelClientSecret}
              containerId="pixel-container-wallet"
              onComplete={async () => {
                setPixelClientSecret(null);
                showToast(t('player.wallet.payment_submitted') || 'Payment submitted — confirming...', 'info');
                if (paymentId) {
                  const confirmResult = await confirmPayment(paymentId);
                  if (confirmResult.confirmed) {
                    queryClient.invalidateQueries({ queryKey: ['wallet', 'me'] });
                    queryClient.invalidateQueries({ queryKey: ['transactions'] });
                    reset({ amount: '', paymentMethod: '' });
                    showToast(t('player.wallet.deposit_completed') || 'Deposit completed!', 'success');
                    return;
                  }
                }
                setPollingPaid(true);
              }}
              onCancel={cancelCardPayment}
            />
          )}
        </Modal>
      </div>
    </Can>
  );
}

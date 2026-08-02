import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { formatPrice } from '../../utils/currency';

interface WalletPaymentOptionProps {
  amount: number;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export default function WalletPaymentOption({ amount, selected, onClick, disabled }: WalletPaymentOptionProps) {
  const { data: wallet } = useQuery({
    queryKey: ['wallet', 'me'],
    queryFn: () => api.get('/wallets/me').then((r) => r.data),
    staleTime: 10_000,
  });

  const balance = wallet ? Number(wallet.balance ?? 0) : 0;
  const currency = wallet?.currencyCode || 'EGP';
  const sufficient = balance >= amount;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !sufficient}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 p-2 rounded-[var(--radius-md)] border transition-colors ${
        selected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
          : !sufficient
            ? 'border-[var(--color-border)] opacity-50 cursor-not-allowed'
            : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'
      }`}
    >
      <div className="flex items-center gap-1">
        <span className="text-sm">💰</span>
        <span className="text-xs font-medium text-[var(--color-text)]">Wallet</span>
      </div>
      <span className="text-[10px] text-[var(--color-text-muted)]">
        {balance > 0 ? formatPrice(balance, currency) : '—'}
      </span>
      {!sufficient && (
        <span className="text-[10px] text-[var(--color-error)]">Insufficient Balance</span>
      )}
    </button>
  );
}

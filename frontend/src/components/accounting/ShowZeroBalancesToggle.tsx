import { useTranslation } from '../../i18n';

interface ShowZeroBalancesToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export default function ShowZeroBalancesToggle({ checked, onChange, className = '' }: ShowZeroBalancesToggleProps) {
  const { t } = useTranslation();
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] cursor-pointer select-none ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-[var(--color-primary)] cursor-pointer"
      />
      <span>{t('accounting.reports.show_zero_balances', 'Show Zero Balances')}</span>
    </label>
  );
}

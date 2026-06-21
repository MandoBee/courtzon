import { useAuthStore } from '../store/auth.store';
import { useCurrencyStore } from '../store/currency.store';

export function getDefaultCurrency(): string {
  const userCurrency = useAuthStore.getState().user?.defaultCurrency;
  if (userCurrency) return userCurrency;
  const detected = useCurrencyStore.getState().currencyCode;
  if (detected) return detected;
  return 'EGP';
}

/** Well-known overrides (DB / countries may also supply symbols). */
const DISPLAY_SYMBOL: Record<string, string> = {
  EGP: 'LE',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'د.إ',
  SAR: '﷼',
};

function intlCurrencySymbol(currencyCode: string): string {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === 'currency')?.value?.trim();
    if (sym && sym.toUpperCase() !== currencyCode) return sym;
  } catch {
    /* unsupported code */
  }
  return '';
}

export function getCurrencySymbol(code?: string): string {
  const currencyCode = (code || getDefaultCurrency()).toUpperCase();
  const fromRegistry = useCurrencyStore.getState().symbolForCode(currencyCode);
  if (fromRegistry) return fromRegistry;
  if (DISPLAY_SYMBOL[currencyCode]) return DISPLAY_SYMBOL[currencyCode];
  const userSymbol = useAuthStore.getState().user?.defaultCurrencySymbol;
  const defaultCode = getDefaultCurrency().toUpperCase();
  if (userSymbol && currencyCode === defaultCode) return userSymbol;
  const { currencySymbol } = useCurrencyStore.getState();
  if (currencySymbol && currencyCode === useCurrencyStore.getState().currencyCode?.toUpperCase()) {
    return currencySymbol;
  }
  const intl = intlCurrencySymbol(currencyCode);
  if (intl) return intl;
  return DISPLAY_SYMBOL[currencyCode] || currencyCode;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatBillingCycle(billingCycle?: string): string {
  if (!billingCycle) return '';
  return `/${billingCycle === 'yearly' ? 'yr' : 'mo'}`;
}

export function formatPriceParts(
  amount: number,
  currencyCode?: string,
): { symbol: string; amount: string } {
  const code = (currencyCode || getDefaultCurrency()).toUpperCase();
  const symbol = getCurrencySymbol(code);
  return { symbol, amount: formatAmount(amount) };
}

export function formatPrice(amount: number, currencyCode?: string): string {
  const code = (currencyCode || getDefaultCurrency()).toUpperCase();
  const symbol = getCurrencySymbol(code);
  const useSymbolPrefix = symbol.length > 0 && symbol.toUpperCase() !== code;
  if (useSymbolPrefix) {
    return `${symbol} ${formatAmount(amount)}`;
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${symbol} ${formatAmount(amount)}`;
  }
}

/** Per-hour rate label, e.g. "$ 50.00/hr". */
export function formatPricePerHour(amount: number, currencyCode?: string): string {
  return `${formatPrice(amount, currencyCode)}/hr`;
}

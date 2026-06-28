import { create } from 'zustand';
import api from '../services/api';

/** Bumped when geo payload shape changes (clears stale session without countryCode). */
const STORAGE_KEY = 'cz_detected_geo_v2';

export interface DetectedCurrencyPayload {
  countryCode: string | null;
  currencyCode: string;
  currencySymbol: string | null;
  source?: string;
}

interface CurrencyState {
  currencyCode: string | null;
  currencySymbol: string | null;
  countryCode: string | null;
  symbolByCode: Record<string, string>;
  detected: boolean;
  detecting: boolean;
  symbolsLoaded: boolean;
  hydrate: () => void;
  detect: () => Promise<void>;
  loadSymbolRegistry: () => Promise<void>;
  registerSymbol: (code: string, symbol: string) => void;
  symbolForCode: (code: string) => string | null;
  applyDetected: (payload: DetectedCurrencyPayload) => void;
}

async function fetchDetectedCurrency(countryCode?: string): Promise<DetectedCurrencyPayload> {
  const res = await api.get<{ data: DetectedCurrencyPayload & { currencySymbol?: string } }>(
    '/public/geo/currency',
    { params: countryCode ? { countryCode } : undefined },
  );
  const data = res.data.data;
  return {
    countryCode: data.countryCode ?? null,
    currencyCode: data.currencyCode,
    currencySymbol: data.currencySymbol ?? null,
    source: data.source,
  };
}

let detectInFlight: Promise<void> | null = null;
let symbolsInFlight: Promise<void> | null = null;

function persist(payload: DetectedCurrencyPayload) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    sessionStorage.removeItem('cz_detected_currency_v1');
  } catch {
    /* ignore quota / private mode */
  }
}

function mergeSymbols(
  base: Record<string, string>,
  entries: { code?: string; symbol?: string | null }[],
): Record<string, string> {
  const next = { ...base };
  for (const e of entries) {
    const code = e.code?.trim().toUpperCase();
    const sym = e.symbol?.trim();
    if (code && sym) next[code] = sym;
  }
  return next;
}

export const useCurrencyStore = create<CurrencyState>((set, get) => ({
  currencyCode: null,
  currencySymbol: null,
  countryCode: null,
  symbolByCode: {},
  detected: false,
  detecting: false,
  symbolsLoaded: false,

  symbolForCode: (code) => {
    const key = code.trim().toUpperCase();
    return get().symbolByCode[key] ?? null;
  },

  registerSymbol: (code, symbol) => {
    const key = code.trim().toUpperCase();
    const sym = symbol.trim();
    if (!key || !sym) return;
    set((s) => ({
      symbolByCode: { ...s.symbolByCode, [key]: sym },
    }));
  },

  loadSymbolRegistry: async () => {
    if (get().symbolsLoaded) return;
    if (symbolsInFlight) return symbolsInFlight;

    symbolsInFlight = (async () => {
      let symbolByCode = { ...get().symbolByCode };
      try {
        const countriesRes = await api.get<{
          data: { default_currency?: string; currency_symbol?: string | null }[];
        }>('/public/countries');
        const countries = countriesRes.data?.data || [];
        symbolByCode = mergeSymbols(
          symbolByCode,
          countries.map((c) => ({ code: c.default_currency, symbol: c.currency_symbol })),
        );
      } catch {
        /* countries list optional */
      }
      try {
        const currenciesRes = await api.get<{
          data: { code?: string; symbol?: string | null }[];
        }>('/public/currency-symbols');
        const currencies = currenciesRes.data?.data || [];
        symbolByCode = mergeSymbols(
          symbolByCode,
          currencies.map((c) => ({ code: c.code, symbol: c.symbol })),
        );
      } catch {
        /* public symbols endpoint optional */
      }
      set({ symbolByCode, symbolsLoaded: true });
    })();

    try {
      await symbolsInFlight;
    } finally {
      symbolsInFlight = null;
    }
  },

  hydrate: () => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DetectedCurrencyPayload;
      if (!parsed.currencyCode) return;
      const symbolByCode = { ...get().symbolByCode };
      if (parsed.currencyCode && parsed.currencySymbol) {
        symbolByCode[parsed.currencyCode.toUpperCase()] = parsed.currencySymbol;
      }
      set({
        currencyCode: parsed.currencyCode,
        currencySymbol: parsed.currencySymbol,
        countryCode: parsed.countryCode ?? null,
        symbolByCode,
        detected: true,
      });
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  },

  applyDetected: (payload) => {
    if (!payload.currencyCode) return;
    persist(payload);
    const symbolByCode = { ...get().symbolByCode };
    if (payload.currencySymbol) {
      symbolByCode[payload.currencyCode.toUpperCase()] = payload.currencySymbol;
    }
    set({
      currencyCode: payload.currencyCode,
      currencySymbol: payload.currencySymbol,
      countryCode: payload.countryCode ?? null,
      symbolByCode,
      detected: true,
    });
  },

  detect: async () => {
    if (get().detected) { console.warn('[currency] detect skipped — already detected'); return; }
    if (detectInFlight) { console.warn('[currency] detect skipped — in flight'); return detectInFlight; }

    detectInFlight = (async () => {
      if (get().detecting) return;
      set({ detecting: true });
      console.warn('[currency] detect: fetching geo currency');
      try {
        await get().loadSymbolRegistry();
        const data = await fetchDetectedCurrency();
        console.warn('[currency] detect: received', data);
        if (data.currencyCode) {
          get().applyDetected(data);
        }
      } catch (err) {
        console.warn('[currency] detect: failed, falling back to EG', err);
        if (!get().countryCode) {
          get().applyDetected({
            countryCode: 'EG',
            currencyCode: 'EGP',
            currencySymbol: 'LE',
            source: 'default',
          });
        }
      } finally {
        set({ detecting: false });
      }
    })();

    try {
      await detectInFlight;
    } finally {
      detectInFlight = null;
    }
  },
}));

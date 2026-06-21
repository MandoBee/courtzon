import { countriesRepository } from '../../countries/infrastructure/repositories/countries.repository.js';
import { currenciesRepository } from '../../currencies/infrastructure/repositories/currencies.repository.js';
import { isValidPublicIpv4 } from '../../../shared/utils/client-ip.js';

export type CurrencyDetectionSource = 'country' | 'geo-ip' | 'default';

export interface DetectedCurrency {
  countryCode: string | null;
  currencyCode: string;
  currencySymbol: string;
  decimalPlaces: number;
  source: CurrencyDetectionSource;
}

let platformDefaultCache: DetectedCurrency | null = null;

async function loadPlatformDefaultCurrency(): Promise<DetectedCurrency> {
  if (platformDefaultCache) return platformDefaultCache;
  try {
    const { getPool } = await import('../../../database/mysql.js');
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT value FROM system_settings WHERE setting_key = 'platform.default_currency' LIMIT 1`,
    ) as [{ value?: string }[], unknown];
    const raw = rows[0]?.value;
    let code = 'EGP';
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        code = typeof parsed === 'string' ? parsed.trim().toUpperCase() : 'EGP';
      } catch {
        code = raw.replace(/^"|"$/g, '').trim().toUpperCase() || 'EGP';
      }
    }
    const { symbol, decimalPlaces } = await symbolForCurrencyCode(code || 'EGP');
    const countryCode = await isoForDefaultCurrency(code || 'EGP');
    platformDefaultCache = {
      countryCode,
      currencyCode: code || 'EGP',
      currencySymbol: symbol,
      decimalPlaces,
      source: 'default',
    };
    return platformDefaultCache;
  } catch {
    platformDefaultCache = {
      countryCode: 'EG',
      currencyCode: 'EGP',
      currencySymbol: 'LE',
      decimalPlaces: 2,
      source: 'default',
    };
    return platformDefaultCache;
  }
}

const ipGeoCache = new Map<string, { countryCode?: string; currencyCode?: string; expiresAt: number }>();
const IP_GEO_TTL_MS = 60 * 60 * 1000;

async function isoForDefaultCurrency(currencyCode: string): Promise<string | null> {
  try {
    const { getPool } = await import('../../../database/mysql.js');
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT iso_code FROM countries WHERE default_currency = ? AND is_active = TRUE ORDER BY sort_order, id LIMIT 1`,
      [currencyCode.toUpperCase()],
    ) as [{ iso_code?: string }[], unknown];
    const iso = rows[0]?.iso_code;
    return iso ? String(iso).toUpperCase() : null;
  } catch {
    return currencyCode === 'EGP' ? 'EG' : null;
  }
}

async function symbolForCurrencyCode(code: string): Promise<{ symbol: string; decimalPlaces: number }> {
  const row = await currenciesRepository.findByCode(code);
  if (row?.symbol) {
    return { symbol: String(row.symbol), decimalPlaces: Number(row.decimal_places ?? 2) };
  }
  return { symbol: code, decimalPlaces: 2 };
}

export async function getPlatformDefaultCurrency(): Promise<DetectedCurrency> {
  const base = await loadPlatformDefaultCurrency();
  return { ...base };
}

export async function resolveCurrencyByCountryIso(isoCode: string): Promise<DetectedCurrency> {
  const iso = isoCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) {
    return getPlatformDefaultCurrency();
  }

  const country = await countriesRepository.findByIsoCode(iso);
  if (!country?.default_currency) {
    return getPlatformDefaultCurrency();
  }

  const code = String(country.default_currency).toUpperCase();
  let symbol = country.currency_symbol ? String(country.currency_symbol) : null;
  let decimalPlaces = Number(country.currency_decimal_places ?? 2);

  if (!symbol) {
    const fromCurrencies = await symbolForCurrencyCode(code);
    symbol = fromCurrencies.symbol;
    decimalPlaces = fromCurrencies.decimalPlaces;
  }

  return {
    countryCode: iso,
    currencyCode: code,
    currencySymbol: symbol,
    decimalPlaces,
    source: 'country',
  };
}

async function lookupIpGeo(ip: string): Promise<{ countryCode?: string; currencyCode?: string } | null> {
  const cached = ipGeoCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    return { countryCode: cached.countryCode, currencyCode: cached.currencyCode };
  }

  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,currency`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string; countryCode?: string; currency?: string };
    if (data.status !== 'success') return null;

    const payload = {
      countryCode: data.countryCode?.toUpperCase(),
      currencyCode: data.currency?.toUpperCase(),
    };
    ipGeoCache.set(ip, { ...payload, expiresAt: Date.now() + IP_GEO_TTL_MS });
    return payload;
  } catch {
    return null;
  }
}

export async function detectCurrencyFromIp(ip: string): Promise<DetectedCurrency | null> {
  if (!isValidPublicIpv4(ip)) return null;

  const geo = await lookupIpGeo(ip);
  if (!geo) return null;

  if (geo.countryCode) {
    const country = await countriesRepository.findByIsoCode(geo.countryCode);
    if (country?.default_currency) {
      return resolveCurrencyByCountryIso(geo.countryCode);
    }
  }

  if (geo.currencyCode) {
    const { symbol, decimalPlaces } = await symbolForCurrencyCode(geo.currencyCode);
    return {
      countryCode: geo.countryCode ?? null,
      currencyCode: geo.currencyCode,
      currencySymbol: symbol,
      decimalPlaces,
      source: 'geo-ip',
    };
  }

  return null;
}

export async function detectCurrency(options: {
  countryCode?: string;
  clientIp?: string | null;
}): Promise<DetectedCurrency> {
  const countryParam = options.countryCode?.trim();
  if (countryParam) {
    return resolveCurrencyByCountryIso(countryParam);
  }

  if (options.clientIp) {
    const fromIp = await detectCurrencyFromIp(options.clientIp);
    if (fromIp) return fromIp;
  }

  return getPlatformDefaultCurrency();
}

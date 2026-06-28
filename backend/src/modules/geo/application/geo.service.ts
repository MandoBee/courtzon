import { countriesRepository } from '../../countries/infrastructure/repositories/countries.repository.js';
import { currenciesRepository } from '../../currencies/infrastructure/repositories/currencies.repository.js';
import { isValidPublicIp } from '../../../shared/utils/client-ip.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

export type CurrencyDetectionSource = 'cf-header' | 'country' | 'geo-ip' | 'default';

export interface DetectedCurrency {
  countryCode: string | null;
  currencyCode: string;
  currencySymbol: string;
  decimalPlaces: number;
  source: CurrencyDetectionSource;
}

const log = createModuleLogger('geo');

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
    log.info({ countryCode, currencyCode: code, source: 'default' }, 'Platform default currency loaded');
    return platformDefaultCache;
  } catch {
    platformDefaultCache = {
      countryCode: 'EG',
      currencyCode: 'EGP',
      currencySymbol: 'LE',
      decimalPlaces: 2,
      source: 'default',
    };
    log.warn('Platform default currency fallback to EGP/EG');
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
    log.warn({ isoCode: iso }, 'Invalid country ISO code, falling back to default');
    return getPlatformDefaultCurrency();
  }

  const country = await countriesRepository.findByIsoCode(iso);
  if (!country?.default_currency) {
    log.warn({ isoCode: iso }, 'Country has no default currency, falling back to default');
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

async function lookupIpGeoHttps(ip: string): Promise<{ countryCode?: string; currencyCode?: string } | null> {
  const cached = ipGeoCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    log.debug({ ip, cached: true }, 'IP geo cache hit');
    return { countryCode: cached.countryCode, currencyCode: cached.currencyCode };
  }

  const start = Date.now();
  try {
    const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
    log.debug({ ip, url }, 'Looking up IP geolocation via ipapi.co');
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const elapsed = Date.now() - start;

    if (!res.ok) {
      log.warn({ ip, status: res.status, elapsed }, 'IP geolocation lookup failed');
      return null;
    }

    const data = (await res.json()) as {
      error?: boolean;
      reason?: string;
      country_code?: string;
      currency?: string;
    };

    if (data.error) {
      log.warn({ ip, reason: data.reason, elapsed }, 'ipapi.co returned error');
      return null;
    }

    const payload = {
      countryCode: data.country_code?.toUpperCase(),
      currencyCode: data.currency?.toUpperCase(),
    };

    ipGeoCache.set(ip, { ...payload, expiresAt: Date.now() + IP_GEO_TTL_MS });
    log.info({ ip, countryCode: payload.countryCode, currencyCode: payload.currencyCode, elapsed, cached: false }, 'IP geolocation successful');
    return payload;
  } catch (err) {
    const elapsed = Date.now() - start;
    log.warn({ ip, elapsed, error: (err as Error)?.message }, 'IP geolocation lookup threw');
    return null;
  }
}

export async function detectCurrencyFromIp(ip: string): Promise<DetectedCurrency | null> {
  if (!isValidPublicIp(ip)) {
    log.debug({ ip }, 'Skipping IP detection — not a valid public IP');
    return null;
  }

  const start = Date.now();
  const geo = await lookupIpGeoHttps(ip);
  if (!geo) {
    log.warn({ ip, elapsed: Date.now() - start }, 'IP geolocation returned no data');
    return null;
  }

  if (geo.countryCode) {
    const country = await countriesRepository.findByIsoCode(geo.countryCode);
    if (country?.default_currency) {
      const result = await resolveCurrencyByCountryIso(geo.countryCode);
      log.info({ ip, countryCode: geo.countryCode, source: 'geo-ip', elapsed: Date.now() - start }, 'Country detected via IP geolocation');
      return result;
    }
  }

  if (geo.currencyCode) {
    const { symbol, decimalPlaces } = await symbolForCurrencyCode(geo.currencyCode);
    log.info({ ip, currencyCode: geo.currencyCode, source: 'geo-ip', elapsed: Date.now() - start }, 'Currency detected via IP geolocation (no country match)');
    return {
      countryCode: geo.countryCode ?? null,
      currencyCode: geo.currencyCode,
      currencySymbol: symbol,
      decimalPlaces,
      source: 'geo-ip',
    };
  }

  log.warn({ ip, elapsed: Date.now() - start }, 'IP geolocation returned no usable data');
  return null;
}

export async function detectCurrency(options: {
  countryCode?: string;
  clientIp?: string | null;
  cfCountry?: string | null;
}): Promise<DetectedCurrency> {
  const countryParam = options.countryCode?.trim();
  if (countryParam) {
    log.info({ countryCode: countryParam, source: 'country' }, 'Country from explicit query param');
    return resolveCurrencyByCountryIso(countryParam);
  }

  const cfCountry = options.cfCountry?.trim();
  if (cfCountry && /^[A-Z]{2}$/i.test(cfCountry)) {
    const iso = cfCountry.toUpperCase();
    log.info({ countryCode: iso, source: 'cf-header' }, 'Country from Cloudflare CF-IPCountry header');
    const result = await resolveCurrencyByCountryIso(iso);
    return {
      ...result,
      source: 'cf-header',
    };
  }

  if (options.clientIp) {
    const fromIp = await detectCurrencyFromIp(options.clientIp);
    if (fromIp) return fromIp;
    log.warn({ clientIp: options.clientIp }, 'IP detection returned nothing, falling back to default');
  }

  log.info('No geo signals available, falling back to platform default');
  return getPlatformDefaultCurrency();
}

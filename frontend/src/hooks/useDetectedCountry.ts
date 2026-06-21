import { useEffect, useRef } from 'react';
import { useCurrencyStore } from '../store/currency.store';
import { findCountryIdForGeo, type GeoCountryRow } from '../utils/geo-country';

export type { GeoCountryRow };

type UseDetectedCountryOptions = {
  enabled?: boolean;
  /** Skip auto-select when the user already picked a country (id > 0). */
  currentCountryId?: number;
};

/**
 * Pre-selects country on forms using server geo detection (via currency store).
 * Re-runs when countries load or geo detection completes.
 */
export function useDetectedCountry<T extends GeoCountryRow>(
  countries: T[],
  onSelect: (countryId: number) => void,
  options: UseDetectedCountryOptions = {},
): void {
  const { enabled = true, currentCountryId = 0 } = options;
  const countryCode = useCurrencyStore((s) => s.countryCode);
  const currencyCode = useCurrencyStore((s) => s.currencyCode);
  const detecting = useCurrencyStore((s) => s.detecting);
  const detect = useCurrencyStore((s) => s.detect);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!enabled) return;
    void detect();
  }, [detect, enabled]);

  useEffect(() => {
    if (!enabled || detecting || !countries.length || currentCountryId > 0) return;

    const id = findCountryIdForGeo(countries, countryCode, currencyCode);
    if (id) onSelectRef.current(id);
  }, [countries, countryCode, currencyCode, detecting, enabled, currentCountryId]);
}

export type GeoCountryRow = {
  id: number;
  iso_code: string;
  default_currency?: string | null;
};

/** Map geo store values to a countries list row id. */
export function findCountryIdForGeo(
  countries: GeoCountryRow[],
  countryCode: string | null,
  currencyCode: string | null,
): number | null {
  if (!countries.length) return null;

  if (countryCode) {
    const iso = countryCode.toUpperCase();
    const byIso = countries.find((c) => String(c.iso_code || '').toUpperCase() === iso);
    if (byIso) return byIso.id;
  }

  if (currencyCode) {
    const cur = currencyCode.toUpperCase();
    const byCurrency = countries.find(
      (c) => String(c.default_currency || '').toUpperCase() === cur,
    );
    if (byCurrency) return byCurrency.id;
  }

  return null;
}

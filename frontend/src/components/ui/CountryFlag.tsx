const FLAG_BASE = '/flags';

const GLOBE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

const GLOBE_DATA_URI = `data:image/svg+xml,${encodeURIComponent(GLOBE_SVG)}`;

export interface CountryFlagProps {
  countryCode?: string | null;
  countryName?: string | null;
  size?: number;
  className?: string;
}

/**
 * Displays a locally hosted country flag SVG.
 * Falls back to a globe icon when the country code is missing or invalid.
 * All flags served from /public/flags/ — zero external CDN dependencies.
 */
export function CountryFlag({
  countryCode,
  countryName,
  size = 24,
  className = '',
}: CountryFlagProps) {
  const code = (countryCode || '').trim().toUpperCase();
  const label = countryName || code || 'Unknown country';

  if (!code) {
    return (
      <img
        src={GLOBE_DATA_URI}
        alt={label}
        width={size}
        height={size * 0.75}
        className={`inline-block shrink-0 object-cover rounded-sm ${className}`}
        loading="lazy"
      />
    );
  }

  return (
    <img
      src={`${FLAG_BASE}/${code.toLowerCase()}.svg`}
      alt={label}
      width={size}
      height={size * 0.75}
      className={`inline-block shrink-0 object-cover rounded-sm ${className}`}
      loading="lazy"
      onError={(e) => {
        (e.target as HTMLImageElement).src = GLOBE_DATA_URI;
      }}
    />
  );
}

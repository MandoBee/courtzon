import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import {
  resolveUploadUrl,
  rememberMissingImageUrl,
  isKnownMissingImageUrl,
  fallbackLetter,
} from '../../utils/media';

export interface EntityImageProps {
  src?: string | null;
  /** Used for letter fallback (defaults to `alt` or "?"). */
  name?: string;
  alt?: string;
  /** ISO country code → two-letter fallback (e.g. EG) when flag images fail. */
  isoCode?: string | null;
  className?: string;
  loading?: ImgHTMLAttributes<HTMLImageElement>['loading'];
  decoding?: ImgHTMLAttributes<HTMLImageElement>['decoding'];
}

/**
 * Image with letter fallback when src is empty or failed to load.
 * Remembers broken URLs in sessionStorage to avoid repeat requests / console noise.
 */
export function EntityImage({
  src,
  name,
  alt,
  isoCode,
  className = 'w-8 h-8 rounded-full text-sm',
  loading,
  decoding,
}: EntityImageProps) {
  const resolved = src ? resolveUploadUrl(src) : '';
  const label = name || alt || '?';
  const [showLetter, setShowLetter] = useState(
    () => !resolved || isKnownMissingImageUrl(resolved),
  );

  useEffect(() => {
    if (!resolved || isKnownMissingImageUrl(resolved)) {
      setShowLetter(true);
      return;
    }
    setShowLetter(false);
  }, [resolved]);

  if (showLetter) {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-bold ${className}`}
        title={alt ?? label}
        aria-label={alt ?? label}
      >
        {fallbackLetter(label, isoCode)}
      </span>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt ?? label}
      loading={loading}
      decoding={decoding}
      className={`object-cover bg-[var(--color-primary)]/10 shrink-0 ${className}`}
      onError={() => {
        rememberMissingImageUrl(resolved);
        setShowLetter(true);
      }}
    />
  );
}


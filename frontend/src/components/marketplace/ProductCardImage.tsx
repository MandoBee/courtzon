import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { resolveUploadUrl, parseProductImages } from '../../utils/media';

interface Props {
  images: string[];
  name: string;
  className?: string;
}

export function getProductImages(images?: string | string[]): string[] {
  return parseProductImages(images);
}

export default function ProductCardImage({ images, name, className = '' }: Props) {
  const [index, setIndex] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [finalError, setFinalError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (images.length <= 1) return;
    stop();
    intervalRef.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 1200);
  }, [images.length, stop]);

  useEffect(() => () => stop(), [stop]);

  const resolved = images.length ? resolveUploadUrl(images[index]) : '';

  const activeSrc = useMemo(() => {
    if (!resolved) return '';
    if (retryCount > 0 && retryCount <= 1) {
      const sep = resolved.includes('?') ? '&' : '?';
      return `${resolved}${sep}cz_retry=${Date.now()}_${retryCount}`;
    }
    return resolved;
  }, [resolved, retryCount]);

  useEffect(() => {
    setRetryCount(0);
    setFinalError(false);
  }, [resolved]);

  if (!resolved || finalError) {
    return (
      <span className={`inline-flex items-center justify-center bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-bold ${className}`}>
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      key={activeSrc}
      src={activeSrc}
      alt={name}
      className={`object-cover bg-[var(--color-primary)]/10 ${className}`}
      onMouseEnter={start}
      onMouseLeave={() => { stop(); setIndex(0); }}
      onError={() => {
        if (retryCount < 1) {
          setRetryCount((c) => c + 1);
        } else {
          setFinalError(true);
        }
      }}
    />
  );
}

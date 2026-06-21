import { useState, useRef, useEffect, useCallback } from 'react';
import { resolveUploadUrl } from '../../utils/media';

interface Props {
  images: string[];
  name: string;
  className?: string;
}

function parseImages(raw?: string | string[]): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

export function getProductImages(images?: string | string[]): string[] {
  return parseImages(images);
}

export default function ProductCardImage({ images, name, className = '' }: Props) {
  const [index, setIndex] = useState(0);
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

  if (!resolved) {
    return (
      <span className={`inline-flex items-center justify-center bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-bold ${className}`}>
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={resolved}
      alt={name}
      className={`object-cover bg-[var(--color-primary)]/10 ${className}`}
      onMouseEnter={start}
      onMouseLeave={() => { stop(); setIndex(0); }}
    />
  );
}

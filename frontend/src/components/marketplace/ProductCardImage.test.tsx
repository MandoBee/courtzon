import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProductCardImage from './ProductCardImage';

/**
 * P3-09 regression (defect fixed in P3-06): the retry cache-buster used
 * `Date.now()` inside a `useMemo`, which made the rendered URL impure
 * (`react-hooks/purity`) and non-deterministic. The fix uses the retry counter
 * only, so the same state always renders the same URL.
 */

vi.mock('../../utils/media', () => ({
  resolveUploadUrl: (url: string) => url,
  parseProductImages: (images?: string | string[]) =>
    Array.isArray(images) ? images : images ? [images] : [],
}));

describe('ProductCardImage — deterministic retry cache-buster', () => {
  it('retries with a stable cz_retry marker and re-renders the same URL', () => {
    render(<ProductCardImage images={['/media/a.jpg']} name="Product A" />);

    const initial = screen.getByRole('img', { name: 'Product A' });
    expect(initial.getAttribute('src')).toBe('/media/a.jpg');

    fireEvent.error(initial);

    const retried = screen.getByRole('img', { name: 'Product A' });
    expect(retried.getAttribute('src')).toBe('/media/a.jpg?cz_retry=1');
    // The pre-fix implementation appended `${Date.now()}_${retryCount}`.
    expect(retried.getAttribute('src')).not.toMatch(/cz_retry=\d+_/);

    fireEvent.error(retried);

    // Second failure is terminal: the placeholder is rendered instead of another
    // retry (no infinite retry loop, no extra timer/URL churn).
    expect(screen.queryByRole('img', { name: 'Product A' })).not.toBeInTheDocument();
  });
});

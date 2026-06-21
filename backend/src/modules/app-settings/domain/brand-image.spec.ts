import { describe, it, expect } from 'vitest';
import { validateBrandImage, BRAND_IMAGE_SPECS } from './brand-image.js';

describe('validateBrandImage', () => {
  it('accepts a valid favicon', () => {
    const result = validateBrandImage(
      BRAND_IMAGE_SPECS.favicon,
      { mimeType: 'image/png', sizeBytes: 40_000 },
      { width: 64, height: 64 },
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects favicon that is not square', () => {
    const result = validateBrandImage(
      BRAND_IMAGE_SPECS.favicon,
      { mimeType: 'image/png', sizeBytes: 40_000 },
      { width: 64, height: 48 },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('square'))).toBe(true);
  });

  it('rejects favicon below minimum size', () => {
    const result = validateBrandImage(
      BRAND_IMAGE_SPECS.favicon,
      { mimeType: 'image/png', sizeBytes: 10_000 },
      { width: 16, height: 16 },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('too small'))).toBe(true);
  });

  it('rejects unsupported mime type for PWA icon', () => {
    const result = validateBrandImage(
      BRAND_IMAGE_SPECS['pwa-192'],
      { mimeType: 'image/gif', sizeBytes: 100_000 },
      { width: 192, height: 192 },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('Unsupported type'))).toBe(true);
  });

  it('accepts valid PWA 512 icon', () => {
    const result = validateBrandImage(
      BRAND_IMAGE_SPECS['pwa-512'],
      { mimeType: 'image/png', sizeBytes: 500_000 },
      { width: 512, height: 512 },
    );
    expect(result.ok).toBe(true);
  });

  it('rejects PWA 512 icon smaller than 512 px', () => {
    const result = validateBrandImage(
      BRAND_IMAGE_SPECS['pwa-512'],
      { mimeType: 'image/png', sizeBytes: 100_000 },
      { width: 256, height: 256 },
    );
    expect(result.ok).toBe(false);
  });

  it('accepts wide site logo within aspect ratio', () => {
    const result = validateBrandImage(
      BRAND_IMAGE_SPECS['site-logo'],
      { mimeType: 'image/png', sizeBytes: 200_000 },
      { width: 400, height: 100 },
    );
    expect(result.ok).toBe(true);
  });

  it('rejects site logo that is too tall/narrow', () => {
    const result = validateBrandImage(
      BRAND_IMAGE_SPECS['site-logo'],
      { mimeType: 'image/png', sizeBytes: 200_000 },
      { width: 100, height: 200 },
    );
    expect(result.ok).toBe(false);
  });
});

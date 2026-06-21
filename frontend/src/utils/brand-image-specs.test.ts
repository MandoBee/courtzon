import { describe, it, expect } from 'vitest';
import { validateBrandImageFile, BRAND_IMAGE_SPECS } from './brand-image-specs';

function mockFile(type: string, size: number): File {
  return { type, size } as File;
}

describe('validateBrandImageFile', () => {
  it('accepts valid favicon dimensions', () => {
    const result = validateBrandImageFile(
      BRAND_IMAGE_SPECS.favicon,
      mockFile('image/png', 50_000),
      { width: 64, height: 64 },
    );
    expect(result.ok).toBe(true);
  });

  it('rejects non-square favicon before upload', () => {
    const result = validateBrandImageFile(
      BRAND_IMAGE_SPECS.favicon,
      mockFile('image/png', 50_000),
      { width: 64, height: 50 },
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/square/i);
  });

  it('rejects oversized file before upload', () => {
    const result = validateBrandImageFile(
      BRAND_IMAGE_SPECS.favicon,
      mockFile('image/png', 600 * 1024),
      { width: 64, height: 64 },
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/too large/i);
  });

  it('rejects PWA 192 when below 192 px', () => {
    const result = validateBrandImageFile(
      BRAND_IMAGE_SPECS['pwa-192'],
      mockFile('image/png', 80_000),
      { width: 180, height: 180 },
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/too small/i);
  });
});

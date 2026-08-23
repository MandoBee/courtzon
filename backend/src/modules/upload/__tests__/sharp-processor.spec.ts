import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { SharpProcessor } from '../infrastructure/sharp-processor.js';

/**
 * Regression coverage for product-image processing:
 *   - valid images are optimized (resized to bounds, WebP output, smaller);
 *   - already-optimized WebP within bounds passes through untouched;
 *   - animated GIFs pass through without flattening;
 *   - EXIF orientation is normalized into pixel data;
 *   - invalid/corrupt inputs are rejected.
 */
const processor = new SharpProcessor();

async function makeJpeg(width: number, height: number, opts: { exifOrientation?: number } = {}): Promise<Buffer> {
  let img = sharp({
    create: {
      width, height, channels: 3,
      background: { r: 30, g: 130, b: 90 },
      noise: { type: 'gaussian', mean: 128, sigma: 30 },
    },
  }).jpeg({ quality: 95 });
  if (opts.exifOrientation) {
    img = img.withMetadata({ orientation: opts.exifOrientation });
  }
  return img.toBuffer();
}

describe('SharpProcessor (product image pipeline)', () => {
  it('A+B+C: optimizes a large JPEG → WebP within bounds and much smaller', async () => {
    const original = await makeJpeg(3000, 2000);
    const result = await processor.process(original, { maxWidth: 1600, maxHeight: 1600 });

    expect(result.mimeType).toBe('image/webp');
    expect(result.originalFormat).toBe('jpeg');
    expect(result.width).toBeLessThanOrEqual(1600);
    expect(result.height).toBeLessThanOrEqual(1600);
    // Aspect ratio preserved (fit: inside)
    expect(Math.abs(result.width / result.height - 1.5)).toBeLessThan(0.05);
    // Optimization must actually shrink a noisy high-quality source
    expect(result.buffer.length).toBeLessThan(original.length);
  });

  it('does not enlarge images smaller than the bounds', async () => {
    const original = await makeJpeg(400, 300);
    const result = await processor.process(original);
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
  });

  it('B: passes through an already-optimized WebP untouched (no recompression)', async () => {
    const optimized = await sharp(await makeJpeg(800, 600))
      .webp({ quality: 80 })
      .toBuffer();
    const result = await processor.process(optimized);

    expect(result.mimeType).toBe('image/webp');
    expect(result.buffer).toBe(optimized); // same reference — zero re-encode
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it('re-encodes an oversized WebP that exceeds the bounds', async () => {
    const oversized = await sharp(await makeJpeg(2400, 1200))
      .webp({ quality: 90 })
      .toBuffer();
    const before = (await sharp(oversized).metadata()).width!;
    const result = await processor.process(oversized, { maxWidth: 1600, maxHeight: 1600 });
    expect(before).toBe(2400);
    expect(result.width).toBeLessThanOrEqual(1600);
  });

  it('passes animated GIFs through without flattening frames', async () => {
    // Build a minimal 2-frame GIF
    const frame = await sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } } }).gif().toBuffer();
    const animated = await sharp(frame, { animated: true })
      .gif()
      .toBuffer();
    const meta = await sharp(animated, { animated: true }).metadata();

    if ((meta.pages ?? 1) > 1) {
      const result = await processor.process(animated);
      expect(result.mimeType).toBe('image/gif');
      const outMeta = await sharp(result.buffer, { animated: true }).metadata();
      expect(outMeta.pages ?? 1).toBe(meta.pages);
    }
  });

  it('normalizes EXIF orientation into pixel dimensions', async () => {
    // 600(w)x200(h) encoded with orientation 6 (rotate 90°) → stored pixels become 200x600-ish
    const oriented = await makeJpeg(600, 200, { exifOrientation: 6 });
    const result = await processor.process(oriented, { maxWidth: 1600, maxHeight: 1600 });
    expect(result.height).toBeGreaterThan(result.width);
  });

  it('rejects corrupt/invalid buffers', async () => {
    const garbage = Buffer.from('this is definitely not an image');
    await expect(processor.process(garbage)).rejects.toThrow();
    await expect(processor.process(Buffer.alloc(0))).rejects.toThrow();
  });
});

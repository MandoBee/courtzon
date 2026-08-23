import sharp from 'sharp';

export interface ProcessOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  stripMetadata?: boolean;
  fit?: 'cover' | 'inside' | 'contain';
  keepTransparency?: boolean;
  outputFormat?: 'webp' | 'png';
}

export interface ProcessResult {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  originalFormat: string;
}

const DEFAULT_OPTIONS: Required<ProcessOptions> = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 80,
  stripMetadata: true,
  fit: 'inside',
  keepTransparency: true,
  outputFormat: 'webp',
};

export class SharpProcessor {
  async process(input: Buffer, options: ProcessOptions = {}): Promise<ProcessResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const image = sharp(input);
    const metadata = await image.metadata();
    const hasAlpha = metadata.hasAlpha ?? false;

    // Already-optimized inputs pass through untouched: re-encoding a WebP at
    // lossy quality only degrades it. Animated GIFs also pass through —
    // single-frame WebP conversion would silently flatten the animation.
    const withinBounds = (metadata.width ?? 0) <= opts.maxWidth && (metadata.height ?? 0) <= opts.maxHeight;
    if ((metadata.format === 'webp' || metadata.format === 'gif') && withinBounds) {
      const passthroughMeta = await sharp(input).metadata();
      return {
        buffer: input,
        mimeType: metadata.format === 'gif' ? 'image/gif'
          : opts.outputFormat === 'png' ? 'image/png'
          : 'image/webp',
        width: passthroughMeta.width ?? 0,
        height: passthroughMeta.height ?? 0,
        hasAlpha: passthroughMeta.hasAlpha ?? false,
        originalFormat: metadata.format ?? 'unknown',
      };
    }

    let pipeline = image
      // Normalise EXIF orientation into pixel data (mobile photos are stored
      // rotated); without this, resized output keeps the raw orientation tag
      // and renders sideways in <img> contexts that ignore EXIF.
      .rotate()
      .resize(opts.maxWidth, opts.maxHeight, {
        fit: opts.fit,
        withoutEnlargement: true,
      });

    if (!opts.stripMetadata) {
      pipeline = pipeline.withMetadata();
    }

    if (opts.keepTransparency && (hasAlpha || metadata.format === 'png')) {
      pipeline = pipeline.webp({ lossless: true, quality: 100 });
    } else if (opts.outputFormat === 'png') {
      pipeline = pipeline.png({ quality: opts.quality, compressionLevel: 9 });
    } else {
      pipeline = pipeline.webp({ quality: opts.quality });
    }

    const output = await pipeline.toBuffer();
    const outMeta = await sharp(output).metadata();

    return {
      buffer: output,
      mimeType: opts.outputFormat === 'png' ? 'image/png' : 'image/webp',
      width: outMeta.width ?? 0,
      height: outMeta.height ?? 0,
      hasAlpha: outMeta.hasAlpha ?? false,
      originalFormat: metadata.format ?? 'unknown',
    };
  }
}

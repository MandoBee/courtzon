import { writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

const UPLOADS_ROOT = join(import.meta.dirname, '..', '..', '..', 'uploads');
const BASE_URL = '/uploads';

const SIZE_PRESETS: Record<string, { thumb?: { w: number; h: number }; medium?: { w: number; h: number }; originalMax?: { w: number; h: number } }> = {
  image: { thumb: { w: 300, h: 300 }, medium: { w: 1200, h: 1200 }, originalMax: { w: 2400, h: 2400 } },
  icon_system: { thumb: { w: 64, h: 64 }, medium: { w: 256, h: 256 } },
  icon_mobile: { thumb: { w: 96, h: 96 }, medium: { w: 512, h: 512 } },
  favicon: { thumb: { w: 32, h: 32 }, medium: { w: 192, h: 192 } },
  logo: { thumb: { w: 150, h: 150 }, medium: { w: 800, h: 800 } },
  banner: { thumb: { w: 400, h: 200 }, medium: { w: 1600, h: 800 } },
};

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif'];

interface UploadResult {
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  url: string;
  thumbnailUrl: string | null;
  mediumUrl: string | null;
}

export async function processAndSaveImage(
  buffer: Buffer,
  originalName: string,
  mediaType: string = 'image',
  category: string = 'cms'
): Promise<UploadResult> {
  const ext = extname(originalName).toLowerCase() || '.jpg';
  const filename = `${randomUUID()}${ext}`;
  const preset = SIZE_PRESETS[mediaType] || SIZE_PRESETS.image;

  const subDir = mediaType.replace(/^(icon_|system_)/, '');
  const dir = join(UPLOADS_ROOT, category, subDir);
  await mkdir(dir, { recursive: true });

  let sharpInstance = sharp(buffer).rotate();

  if (mediaType !== 'favicon' && mediaType !== 'icon_system' && mediaType !== 'icon_mobile') {
    sharpInstance = sharpInstance.withMetadata();
  }

  let thumbnailUrl: string | null = null;
  let mediumUrl: string | null = null;
  let finalWidth = 0;
  let finalHeight = 0;

  const originalMax = preset.originalMax;
  if (originalMax) {
    const resized = await sharpInstance
      .resize(originalMax.w, originalMax.h, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
    const outPath = join(dir, filename);
    await writeFile(outPath, resized);
    finalWidth = (await sharp(resized).metadata()).width || 0;
    finalHeight = (await sharp(resized).metadata()).height || 0;
  } else {
    const outPath = join(dir, filename);
    await writeFile(outPath, buffer);
    const meta = await sharp(buffer).metadata();
    finalWidth = meta.width || 0;
    finalHeight = meta.height || 0;
  }

  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

  if (preset.thumb) {
    const thumbName = `thumb_${filename}`;
    const thumbBuf = await sharp(buffer)
      .resize(preset.thumb.w, preset.thumb.h, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();
    await writeFile(join(dir, thumbName), thumbBuf);
    thumbnailUrl = `${BASE_URL}/${category}/${subDir}/${thumbName}`;
  }

  if (preset.medium) {
    const medName = `med_${filename}`;
    const medBuf = await sharp(buffer)
      .resize(preset.medium.w, preset.medium.h, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
    await writeFile(join(dir, medName), medBuf);
    mediumUrl = `${BASE_URL}/${category}/${subDir}/${medName}`;
  }

  return {
    filename,
    originalName,
    mimeType,
    sizeBytes: buffer.length,
    width: finalWidth,
    height: finalHeight,
    url: `${BASE_URL}/${category}/${subDir}/${filename}`,
    thumbnailUrl,
    mediumUrl,
  };
}

export { ALLOWED_MIMES, SIZE_PRESETS };

/**
 * Client-side brand image rules — keep in sync with
 * backend/src/modules/app-settings/domain/brand-image.ts
 */

export type AppBrandAssetType = 'favicon' | 'favicon-dark' | 'site-logo' | 'site-logo-dark' | 'pwa-192' | 'pwa-512';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface BrandImageSpec {
  settingKey: string;
  label: string;
  allowedMimeTypes: readonly string[];
  maxFileSizeBytes: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  requireSquare?: boolean;
  squareTolerance?: number;
  minAspectRatio?: number;
  maxAspectRatio?: number;
  accept: string;
  hints: string[];
}

export const BRAND_IMAGE_SPECS: Record<AppBrandAssetType, BrandImageSpec> = {
  favicon: {
    settingKey: 'favicon_url',
    label: 'Favicon (Light Mode)',
    allowedMimeTypes: ['image/png', 'image/webp', 'image/jpeg', 'image/gif', 'image/svg+xml'],
    maxFileSizeBytes: 512 * 1024,
    minWidth: 32,
    minHeight: 32,
    maxWidth: 512,
    maxHeight: 512,
    requireSquare: true,
    squareTolerance: 0.03,
    accept: 'image/png,image/webp,image/jpeg,image/gif,image/svg+xml',
    hints: ['For light browser chrome', 'Square image', '32–512 px', 'Max 512 KB'],
  },
  'favicon-dark': {
    settingKey: 'favicon_dark_url',
    label: 'Favicon (Dark Mode)',
    allowedMimeTypes: ['image/png', 'image/webp', 'image/jpeg', 'image/gif', 'image/svg+xml'],
    maxFileSizeBytes: 512 * 1024,
    minWidth: 32,
    minHeight: 32,
    maxWidth: 512,
    maxHeight: 512,
    requireSquare: true,
    squareTolerance: 0.03,
    accept: 'image/png,image/webp,image/jpeg,image/gif,image/svg+xml',
    hints: ['For dark browser chrome', 'Square image', '32–512 px', 'Max 512 KB'],
  },
  'site-logo': {
    settingKey: 'site_logo_url',
    label: 'Site Logo (Light Mode)',
    allowedMimeTypes: ['image/png', 'image/webp', 'image/jpeg', 'image/gif'],
    maxFileSizeBytes: 2 * 1024 * 1024,
    minWidth: 120,
    minHeight: 40,
    maxWidth: 2400,
    maxHeight: 1200,
    minAspectRatio: 0.8,
    maxAspectRatio: 6,
    accept: 'image/png,image/webp,image/jpeg,image/gif',
    hints: ['For light backgrounds', 'At least 120×40 px', 'Aspect ratio between 4:5 and 6:1', 'Max 2 MB'],
  },
  'site-logo-dark': {
    settingKey: 'site_logo_dark_url',
    label: 'Site Logo (Dark Mode)',
    allowedMimeTypes: ['image/png', 'image/webp', 'image/jpeg', 'image/gif'],
    maxFileSizeBytes: 2 * 1024 * 1024,
    minWidth: 120,
    minHeight: 40,
    maxWidth: 2400,
    maxHeight: 1200,
    minAspectRatio: 0.8,
    maxAspectRatio: 6,
    accept: 'image/png,image/webp,image/jpeg,image/gif',
    hints: ['For dark backgrounds', 'At least 120×40 px', 'Aspect ratio between 4:5 and 6:1', 'Max 2 MB'],
  },
  'pwa-192': {
    settingKey: 'pwa_icon_192',
    label: 'PWA Icon (192×192)',
    allowedMimeTypes: ['image/png', 'image/webp', 'image/jpeg'],
    maxFileSizeBytes: 1024 * 1024,
    minWidth: 192,
    minHeight: 192,
    maxWidth: 4096,
    maxHeight: 4096,
    requireSquare: true,
    squareTolerance: 0.02,
    accept: 'image/png,image/webp,image/jpeg',
    hints: ['Square image', 'Minimum 192×192 px', 'PNG recommended', 'Max 1 MB'],
  },
  'pwa-512': {
    settingKey: 'pwa_icon_512',
    label: 'PWA Icon (512×512)',
    allowedMimeTypes: ['image/png', 'image/webp', 'image/jpeg'],
    maxFileSizeBytes: 2 * 1024 * 1024,
    minWidth: 512,
    minHeight: 512,
    maxWidth: 4096,
    maxHeight: 4096,
    requireSquare: true,
    squareTolerance: 0.02,
    accept: 'image/png,image/webp,image/jpeg',
    hints: ['Square image', 'Minimum 512×512 px', 'PNG recommended', 'Max 2 MB'],
  },
};

export interface BrandImageValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateBrandImageFile(
  spec: BrandImageSpec,
  file: File,
  dimensions: ImageDimensions,
): BrandImageValidationResult {
  const errors: string[] = [];

  if (!spec.allowedMimeTypes.includes(file.type)) {
    errors.push(`Unsupported type. Allowed: ${spec.allowedMimeTypes.map((m) => m.replace('image/', '')).join(', ')}.`);
  }

  if (file.size > spec.maxFileSizeBytes) {
    errors.push(
      file.size > 1024 * 1024
        ? `File too large (max ${Math.round(spec.maxFileSizeBytes / (1024 * 1024))} MB).`
        : `File too large (max ${Math.round(spec.maxFileSizeBytes / 1024)} KB).`,
    );
  }

  if (dimensions.width < spec.minWidth || dimensions.height < spec.minHeight) {
    errors.push(`Image too small (minimum ${spec.minWidth}×${spec.minHeight} px, got ${dimensions.width}×${dimensions.height}).`);
  }

  if (dimensions.width > spec.maxWidth || dimensions.height > spec.maxHeight) {
    errors.push(`Image too large (maximum ${spec.maxWidth}×${spec.maxHeight} px, got ${dimensions.width}×${dimensions.height}).`);
  }

  if (spec.requireSquare) {
    const tolerance = spec.squareTolerance ?? 0.02;
    const ratio = dimensions.width / dimensions.height;
    if (Math.abs(ratio - 1) > tolerance) {
      errors.push(`Image must be square (got ${dimensions.width}×${dimensions.height}).`);
    }
  }

  if (spec.minAspectRatio != null && spec.maxAspectRatio != null) {
    const aspect = dimensions.width / dimensions.height;
    if (aspect < spec.minAspectRatio || aspect > spec.maxAspectRatio) {
      errors.push(`Aspect ratio must be between ${spec.minAspectRatio.toFixed(2)}:1 and ${spec.maxAspectRatio.toFixed(1)}:1.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function readImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image dimensions'));
    };
    img.src = url;
  });
}

export async function validateBrandImageBeforeUpload(
  assetType: AppBrandAssetType,
  file: File,
): Promise<BrandImageValidationResult> {
  const spec = BRAND_IMAGE_SPECS[assetType];
  try {
    const dimensions = await readImageDimensions(file);
    return validateBrandImageFile(spec, file, dimensions);
  } catch {
    return { ok: false, errors: ['Could not read image file. Use a valid PNG, WebP, JPEG, or GIF.'] };
  }
}

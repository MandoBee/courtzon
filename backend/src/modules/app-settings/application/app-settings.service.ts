import { z } from 'zod';
import sharp from 'sharp';
import { appSettingsRepository } from '../infrastructure/repositories/app-settings.repository.js';
import { uploadService } from '../../upload/application/upload.service.js';
import {
  validateBrandImage,
  BRAND_IMAGE_SPECS,
  isAppBrandAssetType,
  type AppBrandAssetType,
} from '../domain/brand-image.js';

const ALLOWED_KEYS = new Set([
  'site_name',
  'support_email',
  'favicon_url',
  'favicon_dark_url',
  'site_logo_url',
  'site_logo_dark_url',
  'pwa_icon_192',
  'pwa_icon_512',
  'domain_name',
  'site_tagline',
  'meta_description',
  'maintenance_mode',
]);

export const UpdateAppSettingsSchema = z.object({
  settings: z.record(z.string(), z.unknown()).refine(
    (settings) => Object.keys(settings).every((key) => ALLOWED_KEYS.has(key)),
    { message: 'One or more setting keys are not allowed' },
  ),
});

export class AppSettingsService {
  listAll() {
    return appSettingsRepository.listAll();
  }

  listPublic() {
    return appSettingsRepository.listPublic();
  }

  async updateMany(settings: Record<string, unknown>, updatedBy: number | null) {
    await appSettingsRepository.upsertMany(settings, updatedBy);
    return appSettingsRepository.listAll();
  }

  async uploadBrandImage(
    assetType: AppBrandAssetType,
    buffer: Buffer,
    mimeType: string,
    originalName: string,
    updatedBy: number | null,
  ) {
    const spec = BRAND_IMAGE_SPECS[assetType];
    const metadata = await sharp(buffer).metadata();
    const validation = validateBrandImage(
      spec,
      { mimeType, sizeBytes: buffer.length },
      { width: metadata.width ?? 0, height: metadata.height ?? 0 },
    );

    if (!validation.ok) {
      throw Object.assign(new Error(validation.errors.join(' ')), {
        statusCode: 400,
        details: validation.errors,
      });
    }

    const uploaded = await uploadService.replaceEntityFile(
      buffer,
      mimeType,
      originalName,
      'app_settings',
      0,
      assetType,
      spec.process,
    );

    await appSettingsRepository.upsertMany({ [spec.settingKey]: uploaded.url }, updatedBy);

    return {
      ...uploaded,
      settingKey: spec.settingKey,
      assetType,
    };
  }

  getBrandImageSpec(assetType: string) {
    if (!isAppBrandAssetType(assetType)) {
      throw Object.assign(new Error('Invalid asset type'), { statusCode: 400 });
    }
    return BRAND_IMAGE_SPECS[assetType];
  }
}

export const appSettingsService = new AppSettingsService();

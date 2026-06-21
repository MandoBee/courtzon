import type { FastifyRequest, FastifyReply } from 'fastify';
import { appSettingsService, UpdateAppSettingsSchema } from '../application/app-settings.service.js';
import { recordAudit } from '../../audit-log/index.js';
import { isAppBrandAssetType } from '../domain/brand-image.js';

const UPLOAD_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

async function readImageUpload(request: FastifyRequest) {
  const file = await request.file();
  if (!file) {
    throw Object.assign(new Error('No file uploaded'), { statusCode: 400 });
  }
  if (!UPLOAD_MIME.includes(file.mimetype)) {
    throw Object.assign(new Error('Unsupported file type'), { statusCode: 400 });
  }
  const buffer = await file.toBuffer();
  return { buffer, mimeType: file.mimetype, originalName: file.filename };
}

export async function listAppSettingsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const settings = await appSettingsService.listAll();
  return reply.send({ data: settings });
}

export async function getPublicAppSettingsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const settings = await appSettingsService.listPublic();
  return reply.send({ data: settings });
}

export async function updateAppSettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = UpdateAppSettingsSchema.parse(request.body);
  const userId = (request as any).userId ?? null;
  const settings = await appSettingsService.updateMany(body.settings, userId);
  await recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'APP_SETTINGS.UPDATE',
    entityType: 'app_settings',
    entityId: 0,
    afterState: body.settings,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ data: settings });
}

export async function getBrandImageSpecHandler(request: FastifyRequest, reply: FastifyReply) {
  const { assetType } = request.params as { assetType: string };
  const spec = appSettingsService.getBrandImageSpec(assetType);
  return reply.send({
    data: {
      assetType,
      settingKey: spec.settingKey,
      label: spec.label,
      allowedMimeTypes: spec.allowedMimeTypes,
      maxFileSizeBytes: spec.maxFileSizeBytes,
      minWidth: spec.minWidth,
      minHeight: spec.minHeight,
      maxWidth: spec.maxWidth,
      maxHeight: spec.maxHeight,
      requireSquare: !!spec.requireSquare,
      minAspectRatio: spec.minAspectRatio ?? null,
      maxAspectRatio: spec.maxAspectRatio ?? null,
      hints: spec.hints,
    },
  });
}

export async function uploadBrandImageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { assetType } = request.params as { assetType: string };
  if (!isAppBrandAssetType(assetType)) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid asset type' });
  }

  const userId = (request as any).userId ?? null;

  try {
    const { buffer, mimeType, originalName } = await readImageUpload(request);
    const result = await appSettingsService.uploadBrandImage(
      assetType,
      buffer,
      mimeType,
      originalName,
      userId,
    );

    await recordAudit({
      actorId: userId,
      action: 'APP_SETTINGS.UPLOAD',
      entityType: 'app_settings',
      entityId: 0,
      afterState: { assetType, url: result.url, settingKey: result.settingKey },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({ data: result });
  } catch (err: any) {
    const status = err.statusCode ?? 500;
    return reply.status(status).send({
      error: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message: err.message ?? 'Upload failed',
      details: err.details,
    });
  }
}

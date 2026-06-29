import type { FastifyRequest, FastifyReply } from 'fastify';
import { uploadService } from '../application/upload.service.js';
import { UploadQuerySchema } from './upload.dto.js';
import { organisationRepository } from '../../organisations/infrastructure/repositories/organisation.repository.js';

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif', 'image/avif', 'application/pdf',
];

async function readFileBody(request: FastifyRequest): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
  const file = await request.file();
  if (!file) throw Object.assign(new Error('No file uploaded — expected multipart field with a file'), { statusCode: 400 });
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    throw Object.assign(new Error(`Unsupported file type: ${file.mimetype}`), { statusCode: 400 });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of file.file) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  console.warn('[upload:readFileBody]', {
    originalname: file.filename,
    mimetype: file.mimetype,
    fieldname: file.fieldname,
    size: buffer.length,
    firstBytesHex: buffer.slice(0, 16).toString('hex'),
  });

  return { buffer, mimeType: file.mimetype, originalName: file.filename };
}

export async function uploadFileHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const params = request.params as { entityType: string; entityId: string; fileCategory: string };
    const userId = (request as any).userId;

    const SAFE_ENTITY_TYPES = ['user', 'sport', 'coach', 'product', 'blog'];
    const RESTRICTED_ENTITY_TYPES = ['organisation', 'organization', 'branch', 'resource'];

    if (RESTRICTED_ENTITY_TYPES.includes(params.entityType.toLowerCase())) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Use the dedicated upload endpoint for this entity type' });
    }

    if (params.entityType.toLowerCase() === 'user' && parseInt(params.entityId) !== userId) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Cannot upload for another user' });
    }

    if (!SAFE_ENTITY_TYPES.includes(params.entityType.toLowerCase())) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: `Unsupported entity type: ${params.entityType}` });
    }

    const { buffer, mimeType, originalName } = await readFileBody(request);
    const result = await uploadService.upload(
      buffer, mimeType, originalName,
      params.entityType, parseInt(params.entityId), params.fileCategory,
    );
    return reply.status(201).send(result);
  } catch (err: any) {
    const status = err.statusCode ?? 500;
    return reply.status(status).send({
      error: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message: err.message ?? 'Upload failed',
      details: err.details,
    });
  }
}

export async function uploadOrgLogo(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = parseInt((request.params as any).orgId);
    const { buffer, mimeType, originalName } = await readFileBody(request);
    const result = await uploadService.replaceEntityFile(
      buffer, mimeType, originalName, 'organisation', orgId, 'logo',
      { maxWidth: 512, maxHeight: 512, fit: 'cover' },
    );
    if (orgId > 0) {
      await organisationRepository.update(orgId, { logo_url: result.url });
    }
    return reply.status(201).send(result);
  } catch (err: any) {
    const status = err.statusCode ?? 500;
    return reply.status(status).send({
      error: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message: err.message ?? 'Upload failed',
      details: err.details,
    });
  }
}

export async function uploadOrgCover(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = parseInt((request.params as any).orgId);
    const { buffer, mimeType, originalName } = await readFileBody(request);
    const result = await uploadService.replaceEntityFile(
      buffer, mimeType, originalName, 'organisation', orgId, 'cover',
      { maxWidth: 1920, maxHeight: 600, fit: 'cover' },
    );
    if (orgId > 0) {
      await organisationRepository.update(orgId, { cover_url: result.url });
    }
    return reply.status(201).send(result);
  } catch (err: any) {
    const status = err.statusCode ?? 500;
    return reply.status(status).send({
      error: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message: err.message ?? 'Upload failed',
      details: err.details,
    });
  }
}

export async function uploadOrgDocument(request: FastifyRequest, reply: FastifyReply) {
  try {
    const orgId = parseInt((request.params as any).orgId);
    const { buffer, mimeType, originalName } = await readFileBody(request);
    const result = await uploadService.upload(
      buffer, mimeType, originalName, 'organisation', orgId, 'document',
    );
    return reply.status(201).send(result);
  } catch (err: any) {
    const status = err.statusCode ?? 500;
    return reply.status(status).send({
      error: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message: err.message ?? 'Upload failed',
      details: err.details,
    });
  }
}

export async function uploadBranchImage(request: FastifyRequest, reply: FastifyReply) {
  try {
    const branchId = parseInt((request.params as any).branchId);
    const { buffer, mimeType, originalName } = await readFileBody(request);
    const result = await uploadService.upload(
      buffer, mimeType, originalName, 'branch', branchId, 'gallery',
    );
    return reply.status(201).send(result);
  } catch (err: any) {
    const status = err.statusCode ?? 500;
    return reply.status(status).send({
      error: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message: err.message ?? 'Upload failed',
      details: err.details,
    });
  }
}

export async function uploadResourceImage(request: FastifyRequest, reply: FastifyReply) {
  try {
    const resourceId = parseInt((request.params as any).resourceId);
    const { buffer, mimeType, originalName } = await readFileBody(request);
    const result = await uploadService.upload(
      buffer, mimeType, originalName, 'resource', resourceId, 'gallery',
    );
    return reply.status(201).send(result);
  } catch (err: any) {
    const status = err.statusCode ?? 500;
    return reply.status(status).send({
      error: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message: err.message ?? 'Upload failed',
      details: err.details,
    });
  }
}

export async function uploadAvatarHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId;
    const { buffer, mimeType, originalName } = await readFileBody(request);

    const result = await uploadService.replaceEntityFile(
      buffer, mimeType, originalName, 'user', userId, 'avatar',
      { maxWidth: 400, maxHeight: 400, fit: 'cover' },
    );
    return reply.status(201).send(result);
  } catch (err: any) {
    const status = err.statusCode ?? 500;
    return reply.status(status).send({
      error: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message: err.message ?? 'Upload failed',
      details: err.details,
    });
  }
}

export async function uploadSportIconHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const sportId = parseInt((request.params as any).sportId);
    const { buffer, mimeType, originalName } = await readFileBody(request);
    const result = await uploadService.replaceEntityFile(
      buffer, mimeType, originalName, 'sport', sportId, 'icon',
      { maxWidth: 128, maxHeight: 128, fit: 'cover' },
    );
    return reply.status(201).send(result);
  } catch (err: any) {
    const status = err.statusCode ?? 500;
    return reply.status(status).send({
      error: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      message: err.message ?? 'Upload failed',
      details: err.details,
    });
  }
}

export async function getUploadsByEntity(request: FastifyRequest, reply: FastifyReply) {
  const query = UploadQuerySchema.parse(request.query);
  const uploads = await uploadService.getByEntity(query.entityType, query.entityId, query.fileCategory);
  return reply.send(uploads);
}

export async function deleteUpload(request: FastifyRequest, reply: FastifyReply) {
  const id = parseInt((request.params as any).id);
  await uploadService.delete(id);
  return reply.status(204).send();
}

import type { FastifyInstance } from 'fastify';
import {
  uploadFileHandler, uploadOrgLogo, uploadOrgCover, uploadOrgDocument,
  uploadBranchImage, uploadResourceImage, uploadAvatarHandler,
  uploadSportIconHandler, getUploadsByEntity, deleteUpload,
} from './upload.controller.js';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  // Generic entity upload
  app.post('/upload/:entityType/:entityId/:fileCategory',
    { preHandler: [authMiddleware] }, uploadFileHandler);

  // Organisation-specific
  app.post('/organisations/:orgId/logo',
    { preHandler: [authMiddleware] }, uploadOrgLogo);
  app.post('/organisations/:orgId/cover',
    { preHandler: [authMiddleware] }, uploadOrgCover);
  app.post('/organisations/:orgId/documents',
    { preHandler: [authMiddleware] }, uploadOrgDocument);

  // Branch & Resource images
  app.post('/branches/:branchId/images',
    { preHandler: [authMiddleware] }, uploadBranchImage);
  app.post('/resources/:resourceId/images',
    { preHandler: [authMiddleware] }, uploadResourceImage);

  // Avatar & Sport icon (backward compatible + enhanced)
  app.post('/upload/avatar',
    { preHandler: [authMiddleware] }, uploadAvatarHandler);
  app.post('/upload/sport-icon',
    { preHandler: [authMiddleware] }, async (request, reply) => {
      const userId = (request as any).userId;
      if (!userId) return reply.status(401).send({ error: 'Not authenticated' });
      const file = await request.file();
      if (!file) return reply.status(400).send({ error: 'No file' });
      const allowed = ['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'];
      if (!allowed.includes(file.mimetype)) return reply.status(400).send({ error: 'Unsupported type' });
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) chunks.push(chunk);
      const { uploadService: svc } = await import('../application/upload.service.js');
      // Legacy mode: no entity association, just save to disk and return URL
      const result = await svc.upload(Buffer.concat(chunks), file.mimetype, file.filename, 'sport', 0, 'icon', { maxWidth: 128, maxHeight: 128, fit: 'cover' });
      return reply.send({ iconUrl: result.url });
    });
  app.post('/sports/:sportId/icon',
    { preHandler: [authMiddleware] }, async (request, reply) => {
      const sportId = parseInt((request.params as any).sportId);
      const file = await request.file();
      if (!file) return reply.status(400).send({ error: 'No file' });
      const allowed = ['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'];
      if (!allowed.includes(file.mimetype)) return reply.status(400).send({ error: 'Unsupported type' });
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) chunks.push(chunk);
      const { uploadService: svc } = await import('../application/upload.service.js');
      const result = await svc.replaceEntityFile(Buffer.concat(chunks), file.mimetype, file.filename, 'sport', sportId, 'icon', { maxWidth: 128, maxHeight: 128, fit: 'cover' });
      return reply.status(201).send(result);
    });

  // Coach certification upload (image or PDF)
  app.post('/upload/coach-cert',
    { preHandler: [authMiddleware] }, async (request, reply) => {
      const userId = (request as any).userId;
      if (!userId) return reply.status(401).send({ error: 'Not authenticated' });
      const file = await request.file();
      if (!file) return reply.status(400).send({ error: 'No file' });
      const allowed = ['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf'];
      if (!allowed.includes(file.mimetype)) return reply.status(400).send({ error: 'Unsupported type, only images and PDF allowed' });
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) chunks.push(chunk);
      const { uploadService: svc } = await import('../application/upload.service.js');
      const result = await svc.upload(Buffer.concat(chunks), file.mimetype, file.filename, 'user', userId, 'certification');
      return reply.send(result);
    });

  // Query & delete
  app.get('/uploads', { preHandler: [authMiddleware] }, getUploadsByEntity);
  app.delete('/uploads/:id', { preHandler: [authMiddleware] }, deleteUpload);
}

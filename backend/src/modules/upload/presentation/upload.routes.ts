import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  uploadFileHandler, uploadOrgLogo, uploadOrgCover, uploadOrgDocument,
  uploadBranchImage, uploadResourceImage, uploadAvatarHandler,
  uploadSportIconHandler, getUploadsByEntity, deleteUpload,
} from './upload.controller.js';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';
import { requireOrganisationAccess } from '../../../shared/middleware/route-guard.js';
import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

async function requireBranchAccess(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
  const branchId = parseInt((request.params as any).branchId, 10);
  if (!branchId) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid branch ID' });
  try {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT o.id, o.owner_id FROM branches b
       JOIN organisations o ON o.id = b.organisation_id
       WHERE b.id = ? LIMIT 1`,
      [branchId],
    );
    if (!rows.length) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Branch not found' });
    const org = rows[0] as any;
    const [adminRows] = await pool.execute<RowData>(
      `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.slug IN ('super_admin','super-admin','admin') AND ur.is_active = TRUE LIMIT 1`,
      [userId],
    );
    if (adminRows.length) return;
    if (org.owner_id === userId) return;
    const [scopeRows] = await pool.execute<RowData>(
      `SELECT 1 FROM user_role_scopes urs
       JOIN user_roles ur ON ur.id = urs.user_role_id
       WHERE ur.user_id = ? AND urs.scope_type = 'organisation' AND urs.scope_id = ?
         AND ur.is_active = TRUE LIMIT 1`,
      [userId, org.id],
    );
    if (!scopeRows.length) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access to this branch denied' });
    }
  } catch {
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Access check failed' });
  }
}

async function requireResourceAccess(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Not authenticated' });
  const resourceId = parseInt((request.params as any).resourceId, 10);
  if (!resourceId) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid resource ID' });
  try {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT o.id, o.owner_id FROM resources r
       JOIN branches b ON b.id = r.branch_id
       JOIN organisations o ON o.id = b.organisation_id
       WHERE r.id = ? LIMIT 1`,
      [resourceId],
    );
    if (!rows.length) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Resource not found' });
    const org = rows[0] as any;
    const [adminRows] = await pool.execute<RowData>(
      `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.slug IN ('super_admin','super-admin','admin') AND ur.is_active = TRUE LIMIT 1`,
      [userId],
    );
    if (adminRows.length) return;
    if (org.owner_id === userId) return;
    const [scopeRows] = await pool.execute<RowData>(
      `SELECT 1 FROM user_role_scopes urs
       JOIN user_roles ur ON ur.id = urs.user_role_id
       WHERE ur.user_id = ? AND urs.scope_type = 'organisation' AND urs.scope_id = ?
         AND ur.is_active = TRUE LIMIT 1`,
      [userId, org.id],
    );
    if (!scopeRows.length) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Access to this resource denied' });
    }
  } catch {
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Access check failed' });
  }
}

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  // Generic entity upload
  app.post('/upload/:entityType/:entityId/:fileCategory',
    { preHandler: [authMiddleware] }, uploadFileHandler);

  // Organisation-specific (guarded by requireOrganisationAccess)
  app.post('/organisations/:orgId/logo',
    { preHandler: [authMiddleware, requireOrganisationAccess('orgId')] }, uploadOrgLogo);
  app.post('/organisations/:orgId/cover',
    { preHandler: [authMiddleware, requireOrganisationAccess('orgId')] }, uploadOrgCover);
  app.post('/organisations/:orgId/documents',
    { preHandler: [authMiddleware, requireOrganisationAccess('orgId')] }, uploadOrgDocument);

  // Branch & Resource images (guarded by ownership lookup)
  app.post('/branches/:branchId/images',
    { preHandler: [authMiddleware, requireBranchAccess] }, uploadBranchImage);
  app.post('/resources/:resourceId/images',
    { preHandler: [authMiddleware, requireResourceAccess] }, uploadResourceImage);

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

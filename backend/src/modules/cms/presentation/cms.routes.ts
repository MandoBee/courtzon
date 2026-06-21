import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './cms.controller.js';

export async function cmsRoutes(app: FastifyInstance): Promise<void> {

  // ── PUBLIC endpoints ──
  app.get('/public/published-pages', ctrl.getPublishedSlugsHandler);
  app.get('/public/pages/:slug', ctrl.getPublicPageHandler);
  app.get('/public/blogs', ctrl.listPublicBlogsHandler);
  app.get('/public/blogs/:slug', ctrl.getPublicBlogHandler);
  app.get('/public/contact/options', ctrl.getPublicContactOptionsHandler);
  app.post('/public/contact', ctrl.submitContactHandler);
  app.get('/public/payment-methods', ctrl.getPaymentMethodsHandler);
  app.get('/public/subscription-plans', ctrl.getPublicPlansHandler);
  app.get('/public/organisation-types', ctrl.getPublicOrgTypesHandler);
  app.get('/public/countries', ctrl.getPublicCountriesHandler);
  app.get('/public/currency-symbols', ctrl.getPublicCurrencySymbolsHandler);

  // ── PROTECTED Admin endpoints ──
  app.addHook('preHandler', authMiddleware);

  // Pages
  app.get('/cms/pages', { preHandler: [adminGuard] }, ctrl.listPagesHandler);
  app.put('/cms/pages/reorder', { preHandler: [adminGuard] }, ctrl.reorderPagesHandler);
  app.get('/cms/pages/:id', { preHandler: [adminGuard] }, ctrl.getPageHandler);
  app.post('/cms/pages', { preHandler: [adminGuard] }, ctrl.createPageHandler);
  app.put('/cms/pages/:id', { preHandler: [adminGuard] }, ctrl.updatePageHandler);
  app.delete('/cms/pages/:id', { preHandler: [adminGuard] }, ctrl.deletePageHandler);
  app.patch('/cms/pages/:id/publish', { preHandler: [adminGuard] }, ctrl.publishPageHandler);

  // Section Blocks (nested under pages)
  app.get('/cms/pages/:pageId/blocks', { preHandler: [adminGuard] }, ctrl.listBlocksHandler);
  app.put('/cms/pages/:pageId/blocks/reorder', { preHandler: [adminGuard] }, ctrl.reorderBlocksHandler);
  app.post('/cms/blocks', { preHandler: [adminGuard] }, ctrl.createBlockHandler);
  app.put('/cms/blocks/:id', { preHandler: [adminGuard] }, ctrl.updateBlockHandler);
  app.delete('/cms/blocks/:id', { preHandler: [adminGuard] }, ctrl.deleteBlockHandler);

  // Blogs
  app.get('/cms/blogs', { preHandler: [adminGuard] }, ctrl.listBlogsHandler);
  app.get('/cms/blogs/:id', { preHandler: [adminGuard] }, ctrl.getBlogHandler);
  app.post('/cms/blogs', { preHandler: [adminGuard] }, ctrl.createBlogHandler);
  app.put('/cms/blogs/:id', { preHandler: [adminGuard] }, ctrl.updateBlogHandler);
  app.delete('/cms/blogs/:id', { preHandler: [adminGuard] }, ctrl.deleteBlogHandler);
  app.patch('/cms/blogs/:id/publish', { preHandler: [adminGuard] }, ctrl.publishBlogHandler);

  // Sections (nested under pages)
  app.post('/cms/sections', { preHandler: [adminGuard] }, ctrl.createSectionHandler);
  app.put('/cms/sections/:id', { preHandler: [adminGuard] }, ctrl.updateSectionHandler);
  app.delete('/cms/sections/:id', { preHandler: [adminGuard] }, ctrl.deleteSectionHandler);

  // Media Library
  app.get('/cms/media', { preHandler: [adminGuard] }, ctrl.listMediaHandler);
  app.post('/cms/media/upload', { preHandler: [adminGuard] }, ctrl.uploadMediaHandler);
  app.delete('/cms/media/:id', { preHandler: [adminGuard] }, ctrl.deleteMediaHandler);

  // Contact Submissions (admin)
  app.get('/cms/contacts', { preHandler: [adminGuard] }, ctrl.listContactSubmissionsHandler);
  app.patch('/cms/contacts/:id/read', { preHandler: [adminGuard] }, ctrl.markContactReadHandler);
}

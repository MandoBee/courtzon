import type { FastifyRequest, FastifyReply } from 'fastify';
import { cmsService } from '../application/cms.service.js';
import { organisationService } from '../../organisations/application/organisation.service.js';
import { processAndSaveImage, ALLOWED_MIMES } from '../../../shared/services/media.service.js';

// ── Pages ──

export async function listPagesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pages = await cmsService.listPages();
  return reply.send({ data: pages });
}

export async function getPageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const page = await cmsService.getPage(Number(id));
  if (!page) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Page not found' });
  return reply.send(page);
}

export async function createPageHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = request.body as any;
  const page = await cmsService.createPage(body, userId);
  return reply.status(201).send(page);
}

export async function updatePageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  const page = await cmsService.updatePage(Number(id), body);
  return reply.send(page);
}

export async function deletePageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await cmsService.deletePage(Number(id));
  return reply.status(204).send();
}

export async function publishPageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { publish } = request.body as any;
  const page = await cmsService.publishPage(Number(id), publish);
  return reply.send(page);
}

// ── Section Blocks ──

export async function listBlocksHandler(request: FastifyRequest, reply: FastifyReply) {
  const { pageId } = request.params as any;
  const blocks = await cmsService.listBlocks(Number(pageId));
  return reply.send({ data: blocks });
}

export async function createBlockHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const block = await cmsService.createBlock(body);
  return reply.status(201).send(block);
}

export async function updateBlockHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  await cmsService.updateBlock(Number(id), body);
  return reply.send({ success: true });
}

export async function deleteBlockHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await cmsService.deleteBlock(Number(id));
  return reply.status(204).send();
}

export async function reorderBlocksHandler(request: FastifyRequest, reply: FastifyReply) {
  const { pageId } = request.params as any;
  const { blockIds } = request.body as any;
  await cmsService.reorderBlocks(Number(pageId), blockIds);
  return reply.send({ success: true });
}

export async function reorderPagesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { pageIds } = request.body as any;
  await cmsService.reorderPages(pageIds);
  return reply.send({ success: true });
}

// ── Blogs ──

export async function listBlogsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const blogs = await cmsService.listBlogs();
  return reply.send({ data: blogs });
}

export async function getBlogHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const blog = await cmsService.getBlog(Number(id));
  return reply.send(blog);
}

export async function createBlogHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = request.body as any;
  const blog = await cmsService.createBlog(body, userId);
  return reply.status(201).send(blog);
}

export async function updateBlogHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  const blog = await cmsService.updateBlog(Number(id), body);
  return reply.send(blog);
}

export async function deleteBlogHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await cmsService.deleteBlog(Number(id));
  return reply.status(204).send();
}

export async function publishBlogHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { publish } = request.body as any;
  const blog = await cmsService.publishBlog(Number(id), publish);
  return reply.send(blog);
}

// ── Sections ──

export async function createSectionHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const section = await cmsService.createSection(body);
  return reply.status(201).send(section);
}

export async function updateSectionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  await cmsService.updateSection(Number(id), body);
  return reply.send({ success: true });
}

export async function deleteSectionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await cmsService.deleteSection(Number(id));
  return reply.status(204).send();
}

// ── Media ──

export async function listMediaHandler(request: FastifyRequest, reply: FastifyReply) {
  const { mediaType, category } = request.query as any;
  const media = await cmsService.listMedia(mediaType, category);
  return reply.send({ data: media });
}

export async function uploadMediaHandler(request: FastifyRequest, reply: FastifyReply) {
  const data = await request.file();
  if (!data) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'No file uploaded' });

  if (!ALLOWED_MIMES.includes(data.mimetype)) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Unsupported file type. Allowed: jpg, png, webp, gif, svg, avif' });
  }

  const maxSize = 10 * 1024 * 1024;
  const buffer = await data.toBuffer();
  if (buffer.length > maxSize) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'File too large. Maximum 10MB.' });
  }

  const fields = data.fields as any;
  const mediaType = fields?.mediaType?.value || 'image';
  const category = fields?.category?.value || 'cms';
  const altText = fields?.altText?.value || null;

  const result = await processAndSaveImage(buffer, data.filename, mediaType, category);
  const media = await cmsService.createMedia({
    ...result,
    mediaType,
    category,
    altText,
    uploadedBy: (request as any).userId,
  });

  return reply.status(201).send(media);
}

export async function deleteMediaHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await cmsService.deleteMedia(Number(id));
  return reply.status(204).send();
}

// ── Public endpoints ──

export async function getPublicPageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { slug } = request.params as any;
  if (slug === 'home') {
    const page = await cmsService.getHomePage();
    if (!page) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Page not found' });
    return reply.send(page);
  }
  const page = await cmsService.getPageBySlug(slug);
  if (!page) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Page not found' });
  return reply.send(page);
}

export async function getPublishedSlugsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const slugs = await cmsService.getPublishedSlugs();
  return reply.send({ data: slugs });
}

export async function listPublicBlogsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const blogs = await cmsService.listBlogs(true);
  return reply.send({ data: blogs });
}

export async function getPublicBlogHandler(request: FastifyRequest, reply: FastifyReply) {
  const { slug } = request.params as any;
  const cmsRepo = await import('../infrastructure/repositories/cms.repository.js');
  const blog = await cmsRepo.cmsRepository.getBlogBySlug(slug);
  if (!blog) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Blog not found' });
  return reply.send(blog);
}

export async function getPublicContactOptionsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const { contactSubmissionService } = await import('../application/contact-submission.service.js');
  const options = await contactSubmissionService.getFormOptions();
  return reply.send({ data: options });
}

export async function submitContactHandler(request: FastifyRequest, reply: FastifyReply) {
  const { contactSubmissionService } = await import('../application/contact-submission.service.js');
  const { ContactSubmitSchema } = await import('./contact.dto.js');

  const fields: Record<string, string> = {};
  const files: Array<{ buffer: Buffer; mimeType: string; filename: string }> = [];

  if (!request.isMultipart()) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Contact form must be submitted as multipart/form-data',
    });
  }

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname === 'attachments') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        files.push({
          buffer: Buffer.concat(chunks),
          mimeType: part.mimetype,
          filename: part.filename,
        });
      }
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }

  const parsed = ContactSubmitSchema.safeParse({
    fullName: fields.fullName,
    email: fields.email,
    countryId: fields.countryId,
    phone: fields.phone,
    subject: fields.subject,
    subjectOther: fields.subjectOther || null,
    message: fields.message,
    referralSource: fields.referralSource,
    referralOther: fields.referralOther || null,
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join('; ');
    return reply.status(400).send({ error: 'VALIDATION_ERROR', message });
  }

  try {
    const result = await contactSubmissionService.submit(parsed.data, files, { ip: request.ip });
    return reply.status(201).send({ success: true, message: 'Your message has been sent successfully.', id: result.id });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return reply.status(status).send({
      error: err.errorCode || 'CONTACT_SUBMIT_FAILED',
      message: err.message || 'Failed to send message',
    });
  }
}

// ── Admin contact submissions ──

export async function listContactSubmissionsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const submissions = await cmsService.listContactSubmissions();
  return reply.send({ data: submissions });
}

export async function markContactReadHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await cmsService.markContactRead(Number(id));
  return reply.send({ success: true });
}

export async function getPaymentMethodsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { isPaymentMethodAllowedAtRegistration, isPaymentMethodAllowedForWalletTopup } =
    await import('../../../shared/constants/payment-methods.js');
  const context = String((request.query as { context?: string }).context || '').toLowerCase();
  const methods = await organisationService.getPaymentMethods();
  const data = methods.filter((m: { slug: string; isActive: boolean }) => {
    if (!m.isActive) return false;
    if (context === 'wallet') return isPaymentMethodAllowedForWalletTopup(m.slug);
    return isPaymentMethodAllowedAtRegistration(m.slug);
  });
  return reply.send({ data });
}

export async function getPublicPlansHandler(_request: FastifyRequest, reply: FastifyReply) {
  const plans = await organisationService.listSubscriptionPlans();
  return reply.send({ data: plans });
}

export async function getPublicOrgTypesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const { isExcludedOrgRegistrationType } = await import('../../../shared/constants/org-registration.js');
  const types = await organisationService.getOrganisationTypes();
  const filtered = types.filter((t: { slug: string }) => !isExcludedOrgRegistrationType(t.slug));
  return reply.send({ data: filtered });
}

export async function getPublicCountriesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  const [rows] = await pool.execute(
    'SELECT id, name, iso_code, iso_code_3, phone_code, flag_emoji, default_currency, currency_symbol FROM countries WHERE is_active = TRUE ORDER BY sort_order, name',
  ) as any;
  return reply.send({ data: rows });
}

export async function getPublicCurrencySymbolsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const { currenciesService } = await import('../../currencies/application/currencies.service.js');
  const currencies = await currenciesService.listAll() as { code?: string; symbol?: string | null }[];
  const data = currencies
    .filter((c) => c.code && c.symbol)
    .map((c) => ({ code: String(c.code), symbol: String(c.symbol) }));
  return reply.send({ data });
}

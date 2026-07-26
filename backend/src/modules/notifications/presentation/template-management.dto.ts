import { z } from 'zod';

const contentFormatEnum = z.enum(['handlebars', 'text', 'html']);
const statusEnum = z.enum(['draft', 'published', 'archived']);

export const CreateTemplateSchema = z.object({
  code: z.string().min(1).max(100),
  notification_type_id: z.number().int().positive(),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  locale: z.string().min(2).max(10).default('en'),
  title_template: z.string().min(1),
  body_template: z.string().nullable().optional(),
  content_format: contentFormatEnum.optional().default('handlebars'),
  action_key: z.string().max(100).nullable().optional(),
  route_pattern: z.string().max(255).nullable().optional(),
  image_url: z.string().max(500).nullable().optional(),
  actions: z.any().nullable().optional(),
  variables: z.any().nullable().optional(),
  is_default: z.boolean().optional().default(false),
});

export const UpdateTemplateSchema = z.object({
  code: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  locale: z.string().min(2).max(10).optional(),
  title_template: z.string().min(1).optional(),
  body_template: z.string().nullable().optional(),
  content_format: contentFormatEnum.optional(),
  action_key: z.string().max(100).nullable().optional(),
  route_pattern: z.string().max(255).nullable().optional(),
  image_url: z.string().max(500).nullable().optional(),
  actions: z.any().nullable().optional(),
  variables: z.any().nullable().optional(),
  is_default: z.boolean().optional(),
});

export const TemplateFiltersSchema = z.object({
  q: z.string().optional(),
  status: statusEnum.optional(),
  notification_type_id: z.coerce.number().int().positive().optional(),
  locale: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  sort_by: z.enum(['version', 'created_at']).optional().default('created_at'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const PreviewTemplateSchema = z.object({
  sampleData: z.record(z.string(), z.unknown()).optional().default({}),
});

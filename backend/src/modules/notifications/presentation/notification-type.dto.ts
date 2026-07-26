import { z } from 'zod';

export const CreateNotificationTypeSchema = z.object({
  code: z.string().min(1).max(100).regex(/^[a-zA-Z0-9.]+$/, 'Code must be alphanumeric with dots'),
  event_key: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  category: z.string().max(50).optional().default('system'),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional().default('normal'),
  default_channels: z.array(z.string()).optional().default(['in_app']),
  icon: z.string().max(50).nullable().optional(),
  enabled: z.boolean().optional().default(true),
  requires_action: z.boolean().optional().default(false),
  system_managed: z.boolean().optional().default(false),
  sort_order: z.number().int().min(0).optional().default(0),
});

export const UpdateNotificationTypeSchema = z.object({
  code: z.string().min(1).max(100).regex(/^[a-zA-Z0-9.]+$/, 'Code must be alphanumeric with dots').optional(),
  event_key: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  category: z.string().max(50).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  default_channels: z.array(z.string()).optional(),
  icon: z.string().max(50).nullable().optional(),
  enabled: z.boolean().optional(),
  requires_action: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const NotificationTypeFiltersSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  enabled: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  sort_by: z.enum(['sort_order', 'created_at']).optional().default('sort_order'),
  sort_order: z.enum(['asc', 'desc']).optional().default('asc'),
});

import { z } from 'zod';

export const CreateNotificationSchema = z.object({
  userId: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string().optional(),
  icon: z.string().optional(),
  categorySlug: z.string().optional(),
  actionKey: z.string().optional(),
  actionPayload: z.record(z.string(), z.any()).optional(),
  type: z.enum(['info', 'success', 'warning', 'error', 'reminder']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
});

export const UpdateNotificationPreferencesSchema = z.object({
  preferences: z.array(z.object({
    categoryId: z.number().int().positive(),
    isAllowed: z.boolean(),
    pushEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    smsEnabled: z.boolean(),
  })),
});

export const NotificationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  action_key: z.string().optional(),
  type: z.enum(['info', 'success', 'warning', 'error', 'reminder']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  is_read: z.coerce.boolean().optional(),
});

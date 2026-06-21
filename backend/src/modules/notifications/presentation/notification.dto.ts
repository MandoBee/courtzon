import { z } from 'zod';

export const CreateNotificationSchema = z.object({
  userId: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string().optional(),
  icon: z.string().optional(),
  categorySlug: z.string().optional(),
  actionKey: z.string().optional(),
  actionPayload: z.record(z.string(), z.any()).optional(),
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

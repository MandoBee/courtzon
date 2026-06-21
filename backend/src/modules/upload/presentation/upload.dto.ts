import { z } from 'zod';

export const UploadEntityTypeSchema = z.enum([
  'organisation', 'branch', 'resource', 'sport', 'user', 'coach',
]);

export const UploadFileCategorySchema = z.enum([
  'logo', 'cover', 'gallery', 'document', 'icon', 'avatar', 'certification',
]);

export const UploadQuerySchema = z.object({
  entityType: UploadEntityTypeSchema,
  entityId: z.coerce.number().int().positive(),
  fileCategory: UploadFileCategorySchema.optional(),
});

export type UploadEntityType = z.infer<typeof UploadEntityTypeSchema>;
export type UploadFileCategory = z.infer<typeof UploadFileCategorySchema>;
export type UploadQuery = z.infer<typeof UploadQuerySchema>;

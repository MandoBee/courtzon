import { z } from 'zod';

export const UpdateSettingSchema = z.object({
  value: z.unknown(),
});

export const CreateFeatureFlagSchema = z.object({
  flagKey: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  module: z.string().max(50).optional(),
  isEnabled: z.boolean().optional(),
});

export const UpdateFeatureFlagSchema = z.object({
  flagKey: z.string().min(1).max(100).optional(),
  label: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  module: z.string().max(50).optional(),
  isEnabled: z.boolean().optional(),
});

export const ToggleFeatureFlagSchema = z.object({
  enabled: z.boolean(),
});

export const ListSettingsQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const ListFeatureFlagsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const ListAuditLogsQuerySchema = z.object({
  entityType: z.string().optional(),
  action: z.string().optional(),
  userId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

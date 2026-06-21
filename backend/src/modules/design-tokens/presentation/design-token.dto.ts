import { z } from 'zod';

export const DesignTokenSchema = z.object({
  token_key: z.string().min(1).max(100),
  token_type: z.enum(['color', 'size', 'radius', 'font', 'shadow', 'spacing', 'other']),
  default_value: z.string().min(1).max(100),
  current_value: z.string().max(100).optional(),
  category: z.string().max(50).optional().default('general'),
  description: z.string().max(255).optional(),
});

export const DesignTokenUpdateSchema = z.object({
  token_key: z.string().min(1).max(100).optional(),
  token_type: z.enum(['color', 'size', 'radius', 'font', 'shadow', 'spacing', 'other']).optional(),
  default_value: z.string().min(1).max(100).optional(),
  current_value: z.string().max(100).optional(),
  category: z.string().max(50).optional(),
  description: z.string().max(255).optional(),
});

export const DesignTokenQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

export const SaveDraftSchema = z.object({
  tokens: z.record(z.string(), z.string().max(255).nullable()),
  /** Dark-mode drafts for dual-mode color tokens (token_key → value, null clears). */
  tokensDark: z.record(z.string(), z.string().max(255).nullable()).optional(),
});

export const PublishSchema = z.object({
  label: z.string().max(120).optional(),
});

export const RoleEditableSchema = z.object({
  tokens: z.record(z.string(), z.boolean()),
});

export const ResetBaselineSchema = z.object({
  label: z.string().max(120).optional(),
});

export const RoleThemeSchema = z.object({
  tokens: z.record(z.string(), z.string().max(255).nullable()),
});

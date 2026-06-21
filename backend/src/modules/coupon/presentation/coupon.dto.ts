import { z } from 'zod';

export const CouponSchema = z.object({
  code: z.string().min(1).max(100),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.number().positive(),
  activity_type: z.string().optional(),
  sport_id: z.number().int().positive().optional(),
  min_order_amount: z.number().positive().optional(),
  max_uses: z.number().int().positive().optional(),
  max_uses_per_user: z.number().int().positive().optional().default(1),
  starts_at: z.string().optional(),
  expires_at: z.string().optional(),
  is_active: z.boolean().optional().default(true),
  assignments: z.array(z.object({
    entity_type: z.enum(['organisation', 'branch', 'resource']),
    entity_id: z.number().int().positive(),
  })).optional(),
});

export const CouponUpdateSchema = z.object({
  code: z.string().min(1).max(100).optional(),
  discount_type: z.enum(['percentage', 'fixed']).optional(),
  discount_value: z.number().positive().optional(),
  activity_type: z.string().optional(),
  sport_id: z.number().int().positive().optional(),
  min_order_amount: z.number().positive().optional(),
  max_uses: z.number().int().positive().optional(),
  max_uses_per_user: z.number().int().positive().optional(),
  starts_at: z.string().optional(),
  expires_at: z.string().optional(),
  is_active: z.boolean().optional(),
  assignments: z.array(z.object({
    entity_type: z.enum(['organisation', 'branch', 'resource']),
    entity_id: z.number().int().positive(),
  })).optional(),
});

export const CouponQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  is_active: z.coerce.boolean().optional(),
});

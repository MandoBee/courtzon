import { z } from 'zod';

export const CreateMembershipPlanSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().min(1),
  duration_type: z.enum(['day', 'week', 'month', 'year']),
  duration_value: z.number().int().positive(),
  price: z.number().min(0),
  currency: z.string().length(3).optional().default('USD'),
  status: z.enum(['active', 'inactive', 'archived']).optional().default('active'),
  is_default: z.boolean().optional().default(false),
  is_public: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
  benefits: z.array(z.object({
    benefit_key: z.string().min(1).max(100),
    benefit_value: z.string().min(1),
    display_order: z.number().int().optional(),
  })).optional(),
});

export const UpdateMembershipPlanSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  category: z.string().min(1).optional(),
  duration_type: z.enum(['day', 'week', 'month', 'year']).optional(),
  duration_value: z.number().int().positive().optional(),
  price: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  is_default: z.boolean().optional(),
  is_public: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  benefits: z.array(z.object({
    benefit_key: z.string().min(1).max(100),
    benefit_value: z.string().min(1),
    display_order: z.number().int().optional(),
  })).optional(),
});

export const ListMembershipPlansQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
});

export const AssignMembershipSchema = z.object({
  user_id: z.number().int().positive(),
  plan_id: z.number().int().positive(),
  start_date: z.string().optional(),
  renewal_type: z.enum(['auto', 'manual', 'none']).optional().default('auto'),
});

export const RenewMembershipSchema = z.object({
  plan_id: z.number().int().positive().optional(),
});

export const ListUserMembershipsQuerySchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

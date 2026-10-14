import { z } from 'zod';

/**
 * Canonical `membership_plans` column domains.
 *
 * These MUST mirror the column enums in the deployed schema
 * (`database/baseline/001_courtzon_v3.sql` -> membership_plans):
 *   duration_type ENUM('days','months','years','perpetual')
 *   plan_type     ENUM('monthly','quarterly','semiannual','annual','unlimited',
 *                      'credits','session_bundle','corporate','family','student')
 *   status        ENUM('draft','active','archived')
 * Keeping the DTO in lock-step with the column avoids runtime
 * "Data truncated for column ..." / invalid-enum rejections.
 */
export const MEMBERSHIP_PLAN_DURATION_TYPES = ['days', 'months', 'years', 'perpetual'] as const;
export const MEMBERSHIP_PLAN_TYPES = [
  'monthly', 'quarterly', 'semiannual', 'annual', 'unlimited',
  'credits', 'session_bundle', 'corporate', 'family', 'student',
] as const;
export const MEMBERSHIP_PLAN_STATUSES = ['draft', 'active', 'archived'] as const;

/**
 * `plan_type` and `duration_days` are `NOT NULL` columns without a DB default.
 * They are CALLER-SUPPLIED business values (there is no derivation from
 * duration_type/duration_value anywhere in the codebase), so they are required
 * inputs here rather than silently defaulted.
 */
export const CreateMembershipPlanSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  category: z.string().min(1),
  duration_type: z.enum(MEMBERSHIP_PLAN_DURATION_TYPES),
  duration_value: z.number().int().positive(),
  plan_type: z.enum(MEMBERSHIP_PLAN_TYPES),
  duration_days: z.number().int().positive(),
  price: z.number().min(0),
  currency: z.string().length(3).optional().default('EGP'),
  status: z.enum(MEMBERSHIP_PLAN_STATUSES).optional().default('active'),
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
  duration_type: z.enum(MEMBERSHIP_PLAN_DURATION_TYPES).optional(),
  duration_value: z.number().int().positive().optional(),
  plan_type: z.enum(MEMBERSHIP_PLAN_TYPES).optional(),
  duration_days: z.number().int().positive().optional(),
  price: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  status: z.enum(MEMBERSHIP_PLAN_STATUSES).optional(),
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

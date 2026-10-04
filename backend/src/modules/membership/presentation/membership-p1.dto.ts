import { z } from 'zod';
import {
  MEMBERSHIP_DURATIONS,
  MEMBERSHIP_PAYMENT_METHODS,
} from '../domain/membership-p1.types.js';

const durationEnum = z.enum(MEMBERSHIP_DURATIONS);
const paymentMethodEnum = z.enum(MEMBERSHIP_PAYMENT_METHODS);

const componentSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(150),
  category: z.string().trim().max(50).nullish(),
  amount: z.number().min(0),
  quantity: z.number().int().min(1).default(1),
  isRequired: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).optional().default(0),
});

/** Create a membership plan (identity) together with its first version. */
export const CreateMembershipPlanP1Schema = z.object({
  name: z.string().trim().min(2).max(200),
  code: z.string().trim().min(1).max(50).optional(),
  description: z.string().trim().max(2000).nullish(),
  category: z.string().trim().max(50).optional().default('general'),
  isPublic: z.boolean().optional().default(true),
});

export type CreateMembershipPlanP1Input = z.infer<typeof CreateMembershipPlanP1Schema>;

/** Full commercial version definition (used at create/draft-edit/activate). */
export const PlanVersionP1Schema = z.object({
  status: z.enum(['draft', 'active']).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  durationType: durationEnum,
  durationPeriods: z.number().int().min(1).max(60).optional().default(1),
  renewalModel: z.enum(['anniversary', 'fixed_date']).optional().default('anniversary'),
  fixedRenewalMonth: z.number().int().min(1).max(12).nullish(),
  fixedRenewalDay: z.number().int().min(1).max(31).nullish(),
  initialChargeType: z.enum(['full', 'percentage']).optional().default('full'),
  initialChargePercent: z.number().min(1).max(100).nullish(),
  graceDays: z.number().int().min(0).max(3660).optional().default(0),
  branchScope: z.enum(['ALL', 'SELECTED']).optional().default('ALL'),
  branchIds: z.array(z.number().int().positive()).optional().default([]),
  allowedPaymentMethods: z.array(paymentMethodEnum).min(1),
  currency: z.string().length(3).optional().default('EGP'),
  installmentsEnabled: z.boolean().optional().default(false),
  components: z.array(componentSchema).min(1, 'A membership version must have at least one component'),
});

export type PlanVersionP1Input = z.infer<typeof PlanVersionP1Schema>;

/** Relaxed schema for editing a DRAFT version (partial). */
export const UpdatePlanVersionP1Schema = PlanVersionP1Schema.partial();

/** Organisation-level membership settings. */
export const OrganisationMembershipSettingsP1Schema = z.object({
  enabledDurations: z.array(durationEnum).min(1),
  allowedPaymentMethods: z.array(paymentMethodEnum).min(1),
});

export type OrganisationMembershipSettingsP1Input = z.infer<
  typeof OrganisationMembershipSettingsP1Schema
>;

/** Player purchase — FULL PAYMENT in P1 (cash or card). */
export const PurchaseSubscriptionP1Schema = z.object({
  planVersionId: z.number().int().positive(),
  paymentMethod: paymentMethodEnum,
});
import { z } from 'zod';

export const CreateSportSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  icon: z.string().optional(),
  sortOrder: z.number().int().optional().default(0),
});

export const UpdateSportSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  icon: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  showInMarketplace: z.boolean().optional(),
});

export const OrgTypeSchema = z.object({
  slug: z.string().min(2).max(50),
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().optional().default(0),
});

export const UpdateOrgTypeSchema = z.object({
  slug: z.string().min(2).max(50).optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const OrgTypeAttrSchema = z.object({
  orgTypeId: z.number().int().positive(),
  attributeKey: z.string().min(1).max(100),
  attributeType: z.enum(['text','number','boolean','select','multiselect','date','image']),
  options: z.any().optional(),
  isRequired: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
});

export const CreateOrganisationSchema = z.object({
  orgTypeId: z.number().int().positive(),
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(200),
  description: z.string().nullish(),
  logoUrl: z.string().nullish(),
  coverUrl: z.string().nullish(),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  website: z.string().nullish(),
  countryId: z.number().int().positive().nullish(),
  newCountry: z.object({
    name: z.string().min(1).max(100),
    isoCode: z.string().length(2),
    isoCode3: z.string().length(3),
    phoneCode: z.string().min(1).max(10),
    defaultCurrency: z.string().length(3),
    nativeName: z.string().optional(),
    flagEmoji: z.string().optional(),
  }).optional(),
  crNumber: z.string().nullish(),
  taxId: z.string().nullish(),
  taxIdType: z.string().nullish(),
  documents: z.array(z.string()).nullish(),
  attributes: z.record(z.string(), z.any()).nullish(),
});

export const BranchFinancialDetailsSchema = z.object({
  bankId: z.number().int().positive().nullish(),
  bankBranchId: z.number().int().positive().nullish(),
  bankName: z.string().nullish(),
  bankAccountName: z.string().nullish(),
  bankAccountNumber: z.string().nullish(),
  iban: z.string().nullish(),
  swift: z.string().nullish(),
  billingAddress: z.string().nullish(),
  billingEmail: z.string().email().nullish(),
  payoutSchedule: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).nullish(),
  currencyId: z.number().int().positive().nullish(),
});

export const UpdateOrganisationSchema = CreateOrganisationSchema.partial().extend({
  isVerified: z.boolean().nullish(),
  isActive: z.boolean().nullish(),
});

export const CreateBranchSchema = z.object({
  organisationId: z.number().int().positive(),
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(200),
  description: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  countryId: z.number().int().positive().optional(),
  postalCode: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accessType: z.enum(['open','restricted','invite_only']).optional().default('open'),
  currencyId: z.number().int().positive().optional(),
  timezone: z.string().optional(),
  openingTime: z.string().optional(),
  closingTime: z.string().optional(),
  images: z.array(z.string()).optional(),
});

export const PeakHourSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  hasPeak: z.boolean(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export const CreateResourceSchema = z.object({
  branchId: z.number().int().positive(),
  resourceTypeId: z.number().int().positive(),
  sportId: z.number().int().positive(),
  name: z.string().min(2).max(200),
  description: z.string().optional(),
  capacity: z.preprocess((v) => (v === '' ? undefined : Number(v)), z.number().int().positive().optional()).default(1),
  hourlyPrice: z.preprocess((v) => (v === '' ? undefined : Number(v)), z.number().optional()),
  slotDuration: z.preprocess((v) => (v === '' ? undefined : Number(v)), z.number().int().positive().optional()),
  maxBookingsPerSlot: z.preprocess((v) => (v === '' ? undefined : Number(v)), z.number().int().positive().optional()).default(1),
  openingTime: z.string().optional(),
  closingTime: z.string().optional(),
  pricingType: z.enum(['per_hour','fixed']).optional(),
  peakHourValue: z.preprocess((v) => (v === '' ? undefined : Number(v)), z.number().optional()),
  attributes: z.record(z.string(), z.any()).optional(),
  images: z.array(z.string()).optional(),
  peakHours: z.array(PeakHourSchema).optional(),
});

export const ResourceTypeSchema = z.object({
  slug: z.string().min(2).max(50),
  name: z.string().min(2).max(100),
  hasSlots: z.boolean().optional().default(true),
  defaultSlotDuration: z.number().int().positive().optional().default(30),
});

export const ResourceTypeAttrSchema = z.object({
  resourceTypeId: z.number().int().positive(),
  attributeKey: z.string().min(1).max(100),
  attributeType: z.enum(['text','number','boolean','select','multiselect','date','image']),
  options: z.any().optional(),
  isRequired: z.boolean().optional().default(false),
});

export const OperatingHoursSchema = z.object({
  ownerType: z.enum(['organisation','branch','resource']),
  ownerId: z.number().int().positive(),
  dayOfWeek: z.number().int().min(0).max(6),
  isOpen: z.boolean().optional().default(true),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
});

export const HolidaySchema = z.object({
  ownerType: z.enum(['organisation','branch','resource']),
  ownerId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  dateFrom: z.string(),
  dateTo: z.string(),
  isRecurring: z.boolean().optional().default(false),
  isOpenModified: z.boolean().optional().default(false),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
});

export const PricingRuleSchema = z.object({
  ownerType: z.enum(['organisation','branch','resource']),
  ownerId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  ruleType: z.enum(['flat_rate','peak_surcharge_fixed','peak_surcharge_percent']),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  timeFrom: z.string().optional(),
  timeTo: z.string().optional(),
  amount: z.number().positive(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
});

const PlanFeatureSchema = z.object({
  featureKey: z.string().min(1),
  value: z.string().min(0),
});

const PlanPricingFieldsSchema = z.object({
  planName: z.string().min(2).max(255),
  priceMonthly: z.number().nonnegative().nullable().optional(),
  priceYearly: z.number().nonnegative().nullable().optional(),
  isUnlimited: z.boolean().optional().default(false),
  isInternal: z.boolean().optional().default(false),
  sortOrder: z.number().int().nonnegative().optional().default(0),
  applicableOrgTypes: z.array(z.number().nullable()).optional().default([]).transform(arr => arr.filter(t => t != null)),
  commissionRates: z.array(z.object({
    entity: z.string().min(1),
    rate: z.number().min(0).max(100),
    type: z.enum(['percentage', 'fixed']).default('percentage'),
  })).optional().default([]),
  features: z.array(PlanFeatureSchema).optional().default([]),
});

export const CreatePlanSchema = PlanPricingFieldsSchema.refine(
  (d) => d.isUnlimited || (d.priceMonthly != null && d.priceMonthly >= 0) || (d.priceYearly != null && d.priceYearly >= 0),
  { message: 'At least one price (monthly or yearly) is required unless the plan is unlimited' },
);

export const UpdatePlanSchema = PlanPricingFieldsSchema.partial();

export const UpdateOrgSubscriptionSchema = z.object({
  planId: z.number().int().positive(),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
});

export const SettingSchema = z.object({
  settingKey: z.string().min(1).max(100),
  value: z.any(),
});

export const ListBranchesQuerySchema = z.object({
  sportId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type CreateOrganisationInput = z.infer<typeof CreateOrganisationSchema>;
export type UpdateOrganisationInput = z.infer<typeof UpdateOrganisationSchema>;
export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;
export type CreateResourceInput = z.infer<typeof CreateResourceSchema>;

import { z } from 'zod';

export const PricePreviewSchema = z.object({
  resourceId: z.number().int().positive(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  expectedOccupancy: z.number().min(0).max(1).optional(),
});

export const CreatePricingRuleSchema = z.object({
  name: z.string().min(1),
  ruleType: z.enum(['fixed', 'percentage_increase', 'percentage_decrease', 'multiplier', 'min_price', 'max_price', 'override']),
  scope: z.enum(['global', 'organisation', 'branch', 'resource']),
  scopeId: z.number().int().positive().optional(),
  resourceId: z.number().int().positive().optional(),
  value: z.number(),
  priority: z.number().int().default(0),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  timeRange: z.object({ start: z.string(), end: z.string() }).optional(),
  dateRange: z.object({ start: z.string(), end: z.string() }).optional(),
  isActive: z.boolean().default(true),
});

export const CreateSeasonSchema = z.object({
  name: z.string().min(1),
  organisationId: z.number().int().positive().optional(),
  dateRange: z.object({ start: z.string(), end: z.string() }),
  multiplier: z.number().positive(),
  isActive: z.boolean().default(true),
});

export type PricePreviewInput = z.infer<typeof PricePreviewSchema>;
export type CreatePricingRuleInput = z.infer<typeof CreatePricingRuleSchema>;
export type CreateSeasonInput = z.infer<typeof CreateSeasonSchema>;

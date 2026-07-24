import { z } from 'zod';

export const SubscribeSchema = z.object({
  planId: z.number().int().positive(),
});

export const CreatePlanSchema = z.object({
  name: z.string().min(1),
  planType: z.enum(['monthly', 'quarterly', 'semiannual', 'annual', 'unlimited', 'credits', 'session_bundle', 'corporate', 'family', 'student']),
  durationDays: z.number().int().positive(),
  price: z.number().positive(),
  credits: z.number().int().optional(),
  sessions: z.number().int().optional(),
  benefits: z.array(z.object({
    type: z.enum(['priority_booking', 'exclusive_pricing', 'guest_passes', 'free_cancellation', 'wallet_credit', 'academy_discount', 'marketplace_discount', 'coach_discount', 'tournament_discount']),
    value: z.number(),
    description: z.string().optional(),
  })).default([]),
  organisationId: z.number().int().positive().optional(),
});

export const EarnPointsSchema = z.object({
  amount: z.number().positive(),
  activityType: z.string().optional(),
});

export const ClaimRewardSchema = z.object({
  rewardId: z.number().int().positive(),
});

export const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  pointsMultiplier: z.number().positive().default(1),
  startDate: z.string(),
  endDate: z.string(),
  applicableActivities: z.array(z.string()).optional(),
});

export const CreateRewardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  pointsCost: z.number().int().positive(),
  rewardType: z.enum(['wallet_credit', 'coupon', 'free_booking', 'free_session', 'voucher', 'merchandise', 'tournament_ticket']),
  rewardValue: z.number().positive(),
  quantity: z.number().int().default(1),
});

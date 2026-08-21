import { z } from 'zod';

export const BookingSettleSchema = z.object({
  coachAmount: z.number().min(0).optional().default(0),
  orgAmount: z.number().min(0).optional().default(0),
});

export const BookingRecoveryCollectSchema = z.object({
  party: z.enum(['coach', 'org']),
  amount: z.number().positive(),
});
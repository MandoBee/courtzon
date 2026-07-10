import { z } from 'zod';

export const MatchesQuerySchema = z.object({
  lat: z.string().transform(Number).optional(),
  lng: z.string().transform(Number).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sportId: z.string().transform(Number).optional(),
});

export const MatchParamsSchema = z.object({
  id: z.string().transform(Number),
});

export const ApplicantParamsSchema = z.object({
  id: z.string().transform(Number),
  requestId: z.string().transform(Number),
});

export const ApproveRejectBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

export const CancelBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

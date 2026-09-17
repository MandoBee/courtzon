import { z } from 'zod';

export const MatchesQuerySchema = z.object({
  lat: z.string().transform(Number).optional(),
  lng: z.string().transform(Number).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sportId: z.string().transform(Number).optional(),
});

/**
 * Monitoring lists (admin workbench + org portal) — every match status is
 * included by default; the caller may narrow by a single status.
 */
export const MonitorMatchesQuerySchema = z.object({
  status: z.enum(['open', 'full', 'closed', 'in_progress', 'completed', 'cancelled', 'void']).optional(),
  limit: z.string().transform((v) => Math.max(1, Math.min(100, Number(v) || 50))).optional(),
  offset: z.string().transform((v) => Math.max(0, Number(v) || 0)).optional(),
});

export const OrgMatchesParamsSchema = z.object({
  orgId: z.string().transform(Number),
});

export const OrgMatchParamsSchema = z.object({
  orgId: z.string().transform(Number),
  matchId: z.string().transform(Number),
});

export const MatchParamsSchema = z.object({
  id: z.string().transform(Number),
});

export const ApplicantParamsSchema = z.object({
  id: z.string().transform(Number),
  requestId: z.string().transform(Number),
});

/**
 * Group 3 — a joining player may optionally request a preferred side. The
 * server revalidates it at approval time against the Match's frozen format
 * snapshot and current capacity; the frontend is never trusted.
 */
export const JoinBodySchema = z.object({
  requestedSide: z.enum(['home', 'away']).optional(),
}).strict().optional();

/** Group 3 — a participant may change their own side while the Match is editable. */
export const ChangeSideBodySchema = z.object({
  side: z.enum(['home', 'away']),
}).strict();

export const ApproveRejectBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

export const CancelBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

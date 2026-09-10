import { z } from 'zod';

export const MatchParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const ResultParamsSchema = z.object({
  resultId: z.coerce.number().int().positive(),
});

export const RequestSportParamsSchema = z.object({
  sportId: z.coerce.number().int().positive(),
});

export const MatchFormatParamsSchema = z.object({
  formatId: z.coerce.number().int().positive(),
});

const SetScoreSchema = z.object({
  home: z.number().int().min(0),
  away: z.number().int().min(0),
});

const SetsScoreSchema = z.object({
  sets: z.array(SetScoreSchema).min(1),
});

const GoalsScoreSchema = z.object({
  homeGoals: z.number().int().min(0),
  awayGoals: z.number().int().min(0),
  extraTime: z.boolean().optional(),
  penalties: z.object({ home: z.number().int().min(0), away: z.number().int().min(0) }).optional().nullable(),
});

const RawScoreSchema = z.union([SetsScoreSchema, GoalsScoreSchema]);

/** Part G.407-411 — the server derives the winner; client winner is only accepted for walkover/forfeit. */
export const RawMatchResultBodySchema = z.object({
  outcome: z.enum(['completed', 'retired', 'walkover', 'forfeit', 'abandoned']),
  winner: z.enum(['home', 'away']).optional().nullable(),
  score: RawScoreSchema.optional().nullable(),
  termination: z.object({
    retired_side: z.enum(['home', 'away']).optional().nullable(),
    reason: z.string().max(500).optional(),
  }).optional().nullable(),
});

export const DisputeBodySchema = z.object({
  reason: z.string().min(10).max(2000),
});

export const ResolveDisputeBodySchema = z.object({
  approve: z.boolean(),
  displayResult: RawMatchResultBodySchema.optional().nullable(),
  note: z.string().max(2000).optional(),
});

export const ResultListQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Admin: create a new versioned rule set against an existing sport format. */
export const CreateRuleSetBodySchema = z.object({
  name: z.string().max(120).optional().nullable(),
  rules: z.record(z.string(), z.unknown()).refine((r) => typeof r.score_structure === 'string', {
    message: 'rules.score_structure is required',
  }),
  standingsRules: z.record(z.string(), z.unknown()).optional().nullable(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});
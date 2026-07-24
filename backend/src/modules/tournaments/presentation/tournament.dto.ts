import { z } from 'zod';

export const CreateTournamentSchema = z.object({
  name: z.string().min(1),
  format: z.enum(['knockout', 'double_elimination', 'round_robin', 'swiss', 'group_stage_knockout', 'league', 'custom']),
  sportId: z.number().int().positive(),
  organisationId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
  startDate: z.string(),
  endDate: z.string(),
  registrationDeadline: z.string(),
  maxParticipants: z.number().int().positive(),
  registrationType: z.enum(['individual', 'team', 'academy', 'invitation', 'public']).default('public'),
  matchDurationMinutes: z.number().int().default(60),
  description: z.string().optional(),
  rules: z.string().optional(),
  prizeDescription: z.string().optional(),
});

export const RegisterSchema = z.object({
  tournamentId: z.number().int().positive(),
});

export const UpdateScoreSchema = z.object({
  matchId: z.number().int().positive(),
  winnerId: z.number().int().positive(),
  score: z.string(),
});

export type CreateTournamentInput = z.infer<typeof CreateTournamentSchema>;

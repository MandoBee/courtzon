import { z } from 'zod';

export const CreateTournamentSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  sport_id: z.number().int().positive(),
  category: z.string().optional(),
  season: z.string().optional(),
  format: z.enum(['knockout', 'double_elimination', 'round_robin', 'swiss', 'group_stage_knockout', 'league', 'custom']).default('knockout'),
  registration_type: z.enum(['individual', 'team', 'academy', 'invitation', 'public']).optional().default('public'),
  max_players: z.number().int().min(0).optional(),
  max_teams: z.number().int().min(0).optional(),
  registration_fee: z.number().min(0).optional(),
  price_type: z.string().optional(),
  currency: z.string().length(3).optional().default('USD'),
  is_public: z.boolean().optional().default(true),
  registration_open_at: z.string().optional(),
  registration_close_at: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  match_duration_minutes: z.number().int().optional(),
  rules: z.string().optional(),
  prize_description: z.string().optional(),
  organisation_id: z.number().int().positive().optional(),
  branch_id: z.number().int().positive().optional(),
});

export const UpdateTournamentSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  sport_id: z.number().int().positive().optional(),
  category: z.string().optional(),
  season: z.string().optional(),
  format: z.enum(['knockout', 'double_elimination', 'round_robin', 'swiss', 'group_stage_knockout', 'league', 'custom']).optional(),
  registration_type: z.enum(['individual', 'team', 'academy', 'invitation', 'public']).optional(),
  max_players: z.number().int().min(0).optional(),
  max_teams: z.number().int().min(0).optional(),
  registration_fee: z.number().min(0).optional(),
  price_type: z.string().optional(),
  currency: z.string().length(3).optional(),
  is_public: z.boolean().optional(),
  registration_open_at: z.string().optional(),
  registration_close_at: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  match_duration_minutes: z.number().int().optional(),
  rules: z.string().optional(),
  prize_description: z.string().optional(),
  organisation_id: z.number().int().positive().optional(),
  branch_id: z.number().int().positive().optional(),
});

export const ListTournamentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  format: z.string().optional(),
  category: z.string().optional(),
  sport_id: z.coerce.number().int().positive().optional(),
});

export const RegisterSchema = z.object({
  tournament_id: z.number().int().positive(),
  team_id: z.number().int().positive().optional(),
});

export const GenerateGroupsSchema = z.object({
  group_size: z.number().int().min(2).default(4),
  advance_count: z.number().int().min(1).default(2),
});

export const RecordResultSchema = z.object({
  winner_id: z.number().int().positive(),
  home_score: z.number().optional(),
  away_score: z.number().optional(),
  score_details: z.string().optional(),
});

export const AssignCourtSchema = z.object({
  resource_id: z.number().int().positive(),
});

export const AssignRefereeSchema = z.object({
  referee_id: z.number().int().positive(),
});

export const DashboardQuerySchema = z.object({});

export type CreateTournamentInput = z.infer<typeof CreateTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof UpdateTournamentSchema>;
export type ListTournamentsQuery = z.infer<typeof ListTournamentsQuerySchema>;

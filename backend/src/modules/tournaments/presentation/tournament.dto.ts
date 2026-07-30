import { z } from 'zod';

export const CreateTournamentSchema = z.object({
  bracket_type_id: z.number().int().positive(),
  format: z.enum(['knockout', 'double_elimination', 'round_robin', 'swiss', 'group_stage_knockout', 'league', 'custom']).default('knockout'),
  category: z.string().optional(),
  season: z.string().optional(),
  sport_id: z.number().int().positive().optional(),
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
  tournament_type: z.enum(['platform', 'community']).optional().default('platform'),
  max_participants: z.number().int().min(1),
  max_teams: z.number().int().min(0).optional(),
  min_participants: z.number().int().min(1).optional().default(2),
  entry_fee: z.number().min(0).optional().default(0),
  registration_fee: z.number().min(0).optional(),
  currency_code: z.string().length(3).default('USD'),
  price_type: z.enum(['FREE', 'FIXED', 'MEMBERS_ONLY']).optional().default('FIXED'),
  commission_rate: z.number().min(0).max(100).optional().default(0),
  prize_description: z.string().optional(),
  is_public: z.boolean().optional().default(true),
  registration_opens: z.string().optional(),
  registration_closes: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  rules: z.string().optional(),
  is_featured: z.boolean().optional().default(false),
  image_url: z.string().optional(),
  organisation_id: z.number().int().positive().optional(),
  branch_id: z.number().int().positive().optional(),
});

export const UpdateTournamentSchema = z.object({
  bracket_type_id: z.number().int().positive().optional(),
  format: z.enum(['knockout', 'double_elimination', 'round_robin', 'swiss', 'group_stage_knockout', 'league', 'custom']).optional(),
  category: z.string().optional(),
  season: z.string().optional(),
  sport_id: z.number().int().positive().optional(),
  name: z.string().min(1).max(200).optional(),
  code: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
  tournament_type: z.enum(['platform', 'community']).optional(),
  max_participants: z.number().int().min(1).optional(),
  max_teams: z.number().int().min(0).optional(),
  min_participants: z.number().int().min(1).optional(),
  entry_fee: z.number().min(0).optional(),
  registration_fee: z.number().min(0).optional(),
  currency_code: z.string().length(3).optional(),
  price_type: z.enum(['FREE', 'FIXED', 'MEMBERS_ONLY']).optional(),
  commission_rate: z.number().min(0).max(100).optional(),
  prize_description: z.string().optional(),
  is_public: z.boolean().optional(),
  registration_opens: z.string().optional(),
  registration_closes: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  rules: z.string().optional(),
  is_featured: z.boolean().optional(),
  image_url: z.string().optional(),
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

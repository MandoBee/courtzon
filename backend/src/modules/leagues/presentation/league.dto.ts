import { z } from 'zod';

export const CreateSeasonSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  sport_id: z.number().int().positive().optional(),
  start_date: z.string(),
  end_date: z.string().optional(),
});

export const UpdateSeasonSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  sport_id: z.number().int().positive().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export const ListSeasonsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  sport_id: z.coerce.number().int().positive().optional(),
});

export const CreateLeagueSchema = z.object({
  season_id: z.number().int().positive(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  sport_id: z.number().int().positive().optional(),
  format: z.enum(['round_robin', 'double_round_robin']).default('round_robin'),
  max_teams: z.number().int().min(0).default(0),
  registration_fee: z.number().min(0).default(0),
  price_type: z.enum(['FREE', 'FIXED', 'MEMBERS_ONLY']).default('FIXED'),
  currency: z.string().length(3).default('USD'),
  is_public: z.boolean().default(true),
  points_per_win: z.number().int().min(1).default(3),
  points_per_draw: z.number().int().min(0).default(1),
});

export const UpdateLeagueSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  sport_id: z.number().int().positive().optional(),
  season_id: z.number().int().positive().optional(),
  format: z.enum(['round_robin', 'double_round_robin']).optional(),
  max_teams: z.number().int().min(0).optional(),
  registration_fee: z.number().min(0).optional(),
  price_type: z.enum(['FREE', 'FIXED', 'MEMBERS_ONLY']).optional(),
  currency: z.string().length(3).optional(),
  is_public: z.boolean().optional(),
  points_per_win: z.number().int().min(1).optional(),
  points_per_draw: z.number().int().min(0).optional(),
});

export const ListLeaguesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  sport_id: z.coerce.number().int().positive().optional(),
  season_id: z.coerce.number().int().positive().optional(),
  is_public: z.coerce.boolean().optional(),
});

export const CreateDivisionSchema = z.object({
  league_id: z.number().int().positive(),
  name: z.string().min(1).max(200),
  tier: z.number().int().min(1).default(1),
  capacity: z.number().int().min(0).default(0),
  advance_count: z.number().int().min(0).default(0),
  relegation_count: z.number().int().min(0).default(0),
  status: z.enum(['active', 'inactive', 'archived']).optional().default('active'),
});

export const UpdateDivisionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  tier: z.number().int().min(1).optional(),
  capacity: z.number().int().min(0).optional(),
  advance_count: z.number().int().min(0).optional(),
  relegation_count: z.number().int().min(0).optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
});

export const RegisterTeamSchema = z.object({
  division_id: z.number().int().positive().optional(),
  team_name: z.string().min(1).max(200),
  captain_id: z.number().int().positive().optional(),
  player_ids: z.array(z.number().int().positive()).optional(),
});

export const RecordResultSchema = z.object({
  home_score: z.number().min(0),
  away_score: z.number().min(0),
});

export const AssignCourtSchema = z.object({
  court_id: z.number().int().positive(),
});

export const AssignRefereeSchema = z.object({
  referee_id: z.number().int().positive(),
});

import { z } from 'zod';

/**
 * Group 2 — structured Tournament prize input. Multiple prizes per placement are
 * allowed; `placement` is nullable (NULL = special/non-ranked prize).
 * Cash prizes carry `amount` + the Tournament's authoritative `currency_code`;
 * non-cash prizes leave both unset (validated server-side).
 */
export const TournamentPrizeSchema = z.object({
  placement: z.number().int().positive().nullable().optional(),
  prize_type: z.enum(['cash', 'gold', 'silver', 'bronze', 'trophy', 'gift', 'other']),
  description: z.string().max(255).optional(),
  amount: z.number().min(0).optional(),
  currency_code: z.string().length(3).optional(),
  display_order: z.number().int().min(0).optional(),
});

export const CreateTournamentSchema = z.object({
  bracket_type_id: z.number().int().positive(),
  format: z.enum(['knockout', 'double_elimination', 'round_robin', 'swiss', 'group_stage_knockout', 'league', 'custom']).default('knockout'),
  category: z.string().optional(),
  season: z.string().optional(),
  sport_id: z.number().int().positive().optional(),
  /** Group 5B-SR — the authoritative Match Format the generated Matches must use (FK sport_formats). */
  match_format_id: z.number().int().positive().optional(),
  /** Group 5B-SR — the authoritative Match Rule Set the generated Matches must freeze (FK sport_rule_sets). */
  rule_set_id: z.number().int().positive().optional(),
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
  // Commission is ALWAYS derived server-side from the organisation's active
  // subscription/plan (Group 5B-SR). The field is intentionally NOT part of the
  // schema — zod strips any client-supplied commission_rate so it can never
  // override the authoritative subscription-derived value.
  prize_description: z.string().optional(),
  prizes: z.array(TournamentPrizeSchema).optional(),
  is_public: z.boolean().optional().default(true),
  registration_opens: z.string().optional(),
  registration_closes: z.string().optional(),
  // start_date is NOT NULL in the DB and the create form always requires it.
  // The invariant: create cannot reach repository.create() without a valid
  // start_date (UpdateTournamentSchema keeps it optional for partial edits).
  start_date: z.string().min(1),
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
  match_format_id: z.number().int().positive().optional(),
  rule_set_id: z.number().int().positive().optional(),
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
  // commission_rate is immutable once a tournament is created — it is the
  // historical economic snapshot of the rate in force at creation (Group 5B-SR).
  // Not part of the schema: updates can never change it.
  prize_description: z.string().optional(),
  prizes: z.array(TournamentPrizeSchema).optional(),
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

export const BracketTypeUpdateSchema = z.object({
  is_active: z.boolean(),
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
  home_score: z.string().optional(),
  away_score: z.string().optional(),
  score_details: z.string().optional(),
});

export const AssignCourtSchema = z.object({
  resource_id: z.number().int().positive(),
});

export const AssignRefereeSchema = z.object({
  referee_id: z.number().int().positive(),
});

export const CreateStageSchema = z.object({
  stage_order: z.number().int().min(1).optional().default(1),
  name: z.string().min(1).max(120).optional(),
  progression_format: z.enum(['knockout', 'double_elimination', 'round_robin', 'swiss', 'group_stage_knockout', 'league', 'custom', 'mixed']).default('round_robin'),
  match_format_id: z.number().int().positive().optional(),
  rule_set_id: z.number().int().positive().optional(),
  advance_count: z.number().int().min(1).optional().default(1),
});

export const DashboardQuerySchema = z.object({});

export type CreateTournamentInput = z.infer<typeof CreateTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof UpdateTournamentSchema>;
export type ListTournamentsQuery = z.infer<typeof ListTournamentsQuerySchema>;

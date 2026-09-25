import { z } from 'zod';

/**
 * Group 3 — allowed registration payment methods. Valid configurations are
 * ['cash'], ['card'] or ['cash','card']. Wallet / any other value is rejected
 * by the enum (the global payment policy has Wallet disabled as a payment
 * method). Order is normalised server-side (cash before card); duplicates are
 * collapsed. An empty array is rejected (`.min(1)`) — a Tournament can never
 * be unpayable.
 */
export const RegistrationPaymentMethodsSchema = z.array(z.enum(['cash', 'card'])).min(1);

/**
 * Group 7-A — Tournament Eligibility input contract (AGE / GENDER / LEVEL).
 *
 * - age_mode: 'open' (no filtering) | 'categories'. Absent = legacy open.
 * - age_category_ids: positive references to `tournament_age_categories`
 *   (single family youth XOR masters — enforced at the service/domain level).
 * - gender_categories: multi-select ⊆ {male, female, mixed}; 'mixed' is a
 *   tournament category, NOT a user gender (users.gender stays male|female).
 * - level_ids: positive references to `player_levels` (empty = Open level;
 *   level NEVER applies to notification targeting).
 */
export const AgeModeSchema = z.enum(['open', 'categories']);
export const GenderCategoriesSchema = z.array(z.enum(['male', 'female', 'mixed']));
export const TournamentEligibilityInputSchema = z.object({
  age_mode: AgeModeSchema.optional(),
  age_category_ids: z.array(z.number().int().positive()).optional(),
  gender_categories: GenderCategoriesSchema.optional(),
  level_ids: z.array(z.number().int().positive()).optional(),
});

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
  // G8-C — the ONLY competition formats the draw/match engine can execute are
  // knockout and round_robin. All other `TournamentFormat` strings
  // (double_elimination, swiss, group_stage_knockout, league, custom, mixed) are
  // reserved for future engines and are intentionally NOT part of the create
  // API contract. The authoritative value is derived server-side from the
  // bracket type; a client-supplied format is validated for engine capability.
  format: z.enum(['knockout', 'round_robin']).default('knockout'),
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
  registration_payment_methods: RegistrationPaymentMethodsSchema.optional(),
  /** Group 6 — when full and enabled, new registrations enter a FIFO waitlist. */
  waitlist_enabled: z.boolean().optional().default(false),
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
  /** Group 4 — daily playing window start (venue-local time, HH:MM(:SS)). */
  daily_start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM time format').optional(),
  /** Group 4 — daily playing window end (venue-local time, HH:MM(:SS)). */
  daily_end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM time format').optional(),
  rules: z.string().optional(),
  is_featured: z.boolean().optional().default(false),
  image_url: z.string().optional(),
  ...TournamentEligibilityInputSchema.shape,
  organisation_id: z.number().int().positive().optional(),
  branch_id: z.number().int().positive().optional(),
});

export const UpdateTournamentSchema = z.object({
  bracket_type_id: z.number().int().positive().optional(),
  // G8-C — same engine-executable contract as create. Unsupported competition
  // formats are rejected at the application boundary (TOURNAMENT_FORMAT_NOT_SUPPORTED).
  format: z.enum(['knockout', 'round_robin']).optional(),
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
  registration_payment_methods: RegistrationPaymentMethodsSchema.optional(),
  waitlist_enabled: z.boolean().optional(),
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
  daily_start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM time format').optional(),
  daily_end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM time format').optional(),
  rules: z.string().optional(),
  is_featured: z.boolean().optional(),
  image_url: z.string().optional(),
  ...TournamentEligibilityInputSchema.shape,
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
  /**
   * Optional — the tournament id is authoritative in the route (`:id`). Retained
   * as an optional field for backward compatibility with legacy callers that
   * included it in the body.
   */
  tournament_id: z.number().int().positive().optional(),
  team_id: z.number().int().positive().optional(),
  /**
   * Group 3 — the payment method the player will use for the entry fee. Must
   * be one of the tournament's EFFECTIVE allowed methods (config ∩ global
   * policy ∩ org policy). `cash` → offline paid on registration; `card` →
   * the shared Payment capability creates a gateway charge (pending). Wallet
   * is never valid.
   */
  payment_method: z.enum(['cash', 'card']).optional(),
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

/**
 * Group 5 — assign / change a participant's authoritative tournament seed.
 * `source=rating` freezes a rating snapshot; `source=manual` requires NO rating
 * and is tournament-scoped (never touches the player's global rating).
 */
export const AssignSeedSchema = z.object({
  seed_number: z.number().int().positive(),
  source: z.enum(['rating', 'manual']),
  reason: z.string().max(255).optional(),
});

/** Group 5 — generate / re-generate the draw (placement only; seeds preserved). */
export const GenerateDrawSchema = z.object({
  draw_seed: z.number().int().positive().optional(),
});

/** Group 5 — manual placement (swap). `override` confirms a seeding-rule violation explicitly. */
export const MoveParticipantSchema = z.object({
  participant_id: z.number().int().positive(),
  position: z.number().int().min(0),
  override: z.boolean().optional().default(false),
});

/** Group 6 — pre-start withdrawal (reason optional, audit-only). */
export const WithdrawParticipantSchema = z.object({
  reason: z.string().max(255).optional(),
});

/** Group 6 — promote the next waitlisted participant (payment follows Group 3). */
export const PromoteWaitlistSchema = z.object({
  payment_method: z.enum(['cash', 'card']).optional(),
});

/** Group 6 — pre-start replacement of a withdrawn participant by a waitlisted one. */
export const ReplaceParticipantSchema = z.object({
  replacement_participant_id: z.number().int().positive(),
  payment_method: z.enum(['cash', 'card']).optional(),
});

// ── Group 7 — pair/team participants, members & player replacement requests ──

/** Create a PAIR participant (exactly the sport/format pair size). */
export const CreatePairParticipantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  member_user_ids: z.array(z.number().int().positive()).min(2).max(20),
  /** Group 3 — single entry-fee payment method (cash|card); one per participant entry. */
  payment_method: z.enum(['cash', 'card']).optional(),
});

/** Create a TEAM participant (roster size comes from the sport/format config). */
export const CreateTeamParticipantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  member_user_ids: z.array(z.number().int().positive()).min(2).max(50),
  payment_method: z.enum(['cash', 'card']).optional(),
});

/** Add / remove a member of an existing pair/team participant. */
export const AddParticipantMemberSchema = z.object({
  user_id: z.number().int().positive(),
});
export const RemoveParticipantMemberSchema = z.object({
  user_id: z.number().int().positive(),
});

/** Create a durable player-replacement request (admin/org). */
export const CreateReplacementRequestSchema = z.object({
  outgoing_user_id: z.number().int().positive(),
  replacement_user_id: z.number().int().positive(),
  reason: z.string().max(255).optional(),
});

/** Review a replacement request (approve / reject / cancel). */
export const ReviewReplacementSchema = z.object({
  reason: z.string().max(255).optional(),
});

// ── Group 8 — match generation, scheduling & court reservation ──

/** Schedule a generated tournament match on a court within the tournament window. */
export const ScheduleMatchSchema = z.object({
  /** Branch-local booking date (YYYY-MM-DD). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format'),
  /** Branch-local start time (HH:MM). */
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM time format'),
  /** Branch-local end time (HH:MM; may cross midnight). */
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM time format'),
  /** Court/resource id (must belong to the tournament branch + sport). */
  resource_id: z.number().int().positive(),
});

/** Generate tournament matches from the locked draw (empty body). */
export const GenerateMatchesSchema = z.object({}).optional();

export type CreateTournamentInput = z.infer<typeof CreateTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof UpdateTournamentSchema>;
export type ListTournamentsQuery = z.infer<typeof ListTournamentsQuerySchema>;

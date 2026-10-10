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
  /** G11.20 — optional competition/category scope; omitted = the tournament's default competition (legacy trigger behavior). */
  competition_id: z.number().int().positive().optional(),
  prize_type: z.enum(['cash', 'gold', 'silver', 'bronze', 'trophy', 'gift', 'other']),
  description: z.string().max(255).optional(),
  amount: z.number().min(0).optional(),
  currency_code: z.string().length(3).optional(),
  display_order: z.number().int().min(0).optional(),
});

/**
 * Simple tournament-level sponsor input. CASH sponsors carry an `amount`
 * (validated > 0 server-side); IN-KIND sponsors carry only a `description` and
 * must NOT carry an amount. `display_order` is deterministic (array index when
 * omitted). Server-side validation is authoritative (never only the frontend).
 */
export const TournamentSponsorSchema = z.object({
  name: z.string().min(1).max(200),
  support_type: z.enum(['cash', 'inkind']),
  amount: z.number().min(0).optional(),
  description: z.string().max(1000).optional(),
  display_order: z.number().int().min(0).optional(),
});

export const CreateTournamentSchema = z.object({
  bracket_type_id: z.number().int().positive(),
  // G8-C — the ONLY ready-to-execute competition formats are knockout and
  // round_robin. Step 3B-5A adds the explicit CREATION contract for
  // `group_stage_knockout` (a valid configuration may be created; groups/knockout
  // are generated later through the explicit prepare lifecycle). The stored
  // `format` is derived server-side from the bracket type for knockout/round_robin;
  // for group_stage_knockout it is requested explicitly and validated against a
  // `gsk_config`. double_elimination / swiss / league / custom / mixed remain
  // intentionally rejected — never advertised as executable.
  format: z.enum(['knockout', 'round_robin', 'group_stage_knockout']).default('knockout'),
  /**
   * Step 3B-5A — validated GSK configuration. Required iff `format ===
   * 'group_stage_knockout'` (structure validated exactly like a stage config);
   * otherwise it must be absent. Uses the SAME contract as
   * `CreateStageSchema.config` — no duplicate schema.
   */
  gsk_config: z.lazy(() => GskConfigurationSchema).optional(),
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
  sponsors: z.array(TournamentSponsorSchema).optional(),
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
  branch_id: z.number().int().positive().optional(),
  // G11.18 Phase 3 — venue handling (map picker captures location data; the user
  // never types coordinates). maps_url is always derived server-side.
  venue_type: z.enum(['ORGANISATION_COURTS', 'EXTERNAL_VENUE']).optional(),
  venue_name: z.string().max(200).optional(),
  venue_address: z.string().max(500).optional(),
  venue_city: z.string().max(120).optional(),
  venue_country: z.string().max(80).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  place_id: z.string().max(200).optional(),
  venue_contact: z.string().max(120).optional(),
  // G11 Phase 3 — `organisation_id` and `tournament_type` are NOT client-settable.
  //   * organisation_id is injected server-side by the organisation-scoped
  //     controller (`POST /org/:orgId/tournaments` forces it from `:orgId`), so no
  //     payload can create an org-less tournament.
  //   * tournament_type is derived server-side and is always `community` — the
  //     CourtZon platform never owns a tournament, so `platform` no longer exists.
})
  // Step 3B-5A — GSK coupling: `gsk_config` is REQUIRED for `group_stage_knockout`
  // and FORBIDDEN otherwise. The inner structure is validated by
  // `GskConfigurationSchema` (groupCount ≥ 1, participantsPerGroup ≥ 2,
  // topPerGroup ∈ [1, participantsPerGroup], bestThirdPlaces ∈ [0, groupCount],
  // valid ordering/startingRound/seeding/booleans, playInRounds ≥ 0).
  .superRefine((v, ctx) => {
    if (v.format === 'group_stage_knockout' && (!v.gsk_config || v.gsk_config.format !== 'group_stage_knockout')) {
      ctx.addIssue({ code: 'custom', message: 'group_stage_knockout requires a valid gsk_config', path: ['gsk_config'] });
    }
    if (v.format !== 'group_stage_knockout' && v.gsk_config != null) {
      ctx.addIssue({ code: 'custom', message: 'gsk_config is only valid for group_stage_knockout', path: ['gsk_config'] });
    }
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
  // G11 Phase 3 — neither `tournament_type` nor `organisation_id` is updatable.
  //   A tournament's competition type and its owning organisation are fixed at
  //   creation; a client can never re-label an org tournament as a platform
  //   tournament, nor move a tournament between organisations.
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
  sponsors: z.array(TournamentSponsorSchema).optional(),
  // Phase 2 (H2) — explicit opt-in to deterministically regenerate the
  // description from current structured data. Never silent.
  regenerate_description: z.boolean().optional(),
  is_public: z.boolean().optional(),
  registration_opens: z.string().optional(),
  registration_closes: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  daily_start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM time format').optional(),
  daily_end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use HH:MM time format').optional(),
  // G11.18 Phase 3 — venue handling (server-validated; maps_url always derived server-side).
  venue_type: z.enum(['ORGANISATION_COURTS', 'EXTERNAL_VENUE']).optional(),
  venue_name: z.string().max(200).optional(),
  venue_address: z.string().max(500).optional(),
  venue_city: z.string().max(120).optional(),
  venue_country: z.string().max(80).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  place_id: z.string().max(200).optional(),
  venue_contact: z.string().max(120).optional(),
  rules: z.string().optional(),
  is_featured: z.boolean().optional(),
  image_url: z.string().optional(),
  ...TournamentEligibilityInputSchema.shape,
  branch_id: z.number().int().positive().optional(),
});

/**
 * Group 5B-SR — CREATE bracket type. Engine safety is enforced in the SERVICE
 * (bracketSlugCapability) — the DTO only normalizes the fields. `slug` is the
 * engine identity: lowercase, hyphenated, ≤50 (matches DB column). config_schema
 * is a stored definition blob (engine does NOT read it); JSON syntax is checked
 * in the service so there is exactly one authority.
 */
export const CreateBracketTypeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(50),
  config_schema: z.string().optional(),
});

/**
 * Group 5B-SR — UPDATE bracket type. NO slug field (immutable engine identity).
 * `.strict()` rejects any attempt to smuggle `slug` (or any other key) through —
 * it can never be silently ignored. Field-level safety (config edits on
 * referenced READY rows, activation/deactivation rules) is enforced in the
 * service.
 */
export const BracketTypeUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    config_schema: z.string().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

// G11.3 — tournament registration full-refund request/approval contracts.
export const RefundRequestSchema = z.object({
  reason: z.string().max(255).optional(),
});
export const RefundRejectSchema = z.object({
  reason: z.string().max(255).optional(),
});

// G11.8 — player self-service cancellation (own registration, pre-draw-lock).
// Automatic FULL refund with no fee; reuse of the G11.3 execution core.
export const CancelRegistrationSchema = z.object({
  reason: z.string().max(500).optional(),
});
export const ListRefundRequestsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'executed']).optional(),
});

export const ListTournamentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  format: z.string().optional(),
  category: z.string().optional(),
  sport_id: z.coerce.number().int().positive().optional(),
  /** G11.14 — optional tenant scope filter on the platform list. */
  organisation_id: z.coerce.number().int().positive().optional(),
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
   * G11.18 Phase 2 — the competition category. Optional ONLY when the tournament
   * has exactly one (default) competition; REQUIRED when multiple competitions
   * exist (the service fails clearly otherwise).
   */
  competition_id: z.coerce.number().int().positive().optional(),
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
  /** G11.18 Phase 3 — competition category (default/single when omitted). */
  competition_id: z.coerce.number().int().positive().optional(),
  /**
   * Step 3B-2 — stage-scoped Group Stage generation (GSK). When provided, the
   * target stage MUST be a round-robin Group Stage carrying GSK configuration;
   * the engine reads groupCount/participantsPerGroup from the stage, so the
   * legacy group_size/advance_count params are ignored in this mode.
   */
  stage_id: z.number().int().positive().optional(),
});

/**
 * Step 3B-5B — GSK lifecycle operation (qualify / knockout transition).
 * `stage_id` identifies the tournament's Group Stage; the operation is
 * competition-scoped (default/single competition when omitted).
 */
export const GskLifecycleSchema = z.object({
  stage_id: z.number().int().positive(),
  competition_id: z.coerce.number().int().positive().optional(),
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

// ── Step 3B-1 — GSK (Group Stage + Knockout) configuration CONTRACT ──────────
// Structural validation ONLY. Nothing here creates groups, matches or
// qualifiers. `group_stage_knockout` is a fully executable engine format
// (`ENGINE_EXECUTABLE_FORMATS` includes it); group generation, qualification
// and the knockout transition run through the standard prepare/generate
// lifecycle. This schema defines the persistent `gsk_config` data contract
// stored on `tournament_stages.config`.

export const GskKnockoutStartSchema = z.enum([
  'round_of_16',
  'quarterfinals',
  'semifinals',
  'final',
  'first_valid_round',
]);

export const GskQualificationSchema = z.object({
  topPerGroup: z.number().int().min(1),
  bestThirdPlaces: z.number().int().min(0).optional(),
  ordering: z.enum(['seed', 'points', 'rank']),
});

export const GskGroupStageSchema = z
  .object({
    groupCount: z.number().int().min(1),
    participantsPerGroup: z.number().int().min(2),
    format: z.literal('round_robin'),
    qualification: GskQualificationSchema,
  })
  .refine((v) => v.qualification.topPerGroup <= v.participantsPerGroup, {
    message: 'topPerGroup cannot exceed participantsPerGroup',
    path: ['qualification', 'topPerGroup'],
  });

export const GskKnockoutSchema = z.object({
  startingRound: GskKnockoutStartSchema,
  seeding: z.enum(['manual', 'automatic']),
  separateGroupWinners: z.boolean(),
  preventSameGroupRematch: z.boolean(),
  allowByes: z.boolean(),
  playInRounds: z.number().int().min(0).optional(),
});

export const GskConfigurationSchema = z
  .object({
    format: z.literal('group_stage_knockout'),
    groupStage: GskGroupStageSchema,
    knockout: GskKnockoutSchema,
  })
  .refine((v) => (v.groupStage.qualification.bestThirdPlaces ?? 0) <= v.groupStage.groupCount, {
    message: 'bestThirdPlaces cannot exceed the number of groups',
    path: ['groupStage', 'qualification', 'bestThirdPlaces'],
  });

export type GskConfigurationInput = z.infer<typeof GskConfigurationSchema>;

export const CreateStageSchema = z.object({
  stage_order: z.number().int().min(1).optional().default(1),
  name: z.string().min(1).max(120).optional(),
  progression_format: z.enum(['knockout', 'double_elimination', 'round_robin', 'swiss', 'group_stage_knockout', 'league', 'custom', 'mixed']).default('round_robin'),
  match_format_id: z.number().int().positive().optional(),
  rule_set_id: z.number().int().positive().optional(),
  advance_count: z.number().int().min(1).optional().default(1),
  // Step 3B-1 — per-stage configuration (future GSK). NULL/omitted keeps every
  // existing knockout / round_robin stage valid; GSK configuration is validated
  // structurally but never executed yet.
  config: GskConfigurationSchema.nullable().optional(),
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
  /** G11.18 Phase 3 — competition category (default/single when omitted). */
  competition_id: z.coerce.number().int().positive().optional(),
});

/** G11.18 Phase 3 — competition venue override (validated server-side; null clears to inherit). */
export const CompetitionVenueSchema = z.object({
  venue_override: z.record(z.string(), z.unknown()).nullable().optional(),
});

// ── G11.20 — Competition Category Management ────────────────────────────────
// A competition category owns its own fee, currency, capacity, eligibility and
// bracket configuration. `match_format_id` / `rule_set_id` are validated against
// the real configuration tables in CompetitionService (never trusted raw), and
// the sport + bracket type are inherited from the tournament when omitted so a
// new category is always internally consistent with its parent tournament.

const competitionCategoryEnum = z.enum(['singles', 'doubles', 'team']);
const competitionPriceTypeEnum = z.enum(['FREE', 'FIXED', 'MEMBERS_ONLY']);
const competitionAgeModeEnum = z.enum(['open', 'categories']);

export const CreateCompetitionSchema = z.object({
  competition_type: competitionCategoryEnum,
  name: z.string().min(1).max(200),
  match_format_id: z.coerce.number().int().positive().nullable().optional(),
  rule_set_id: z.coerce.number().int().positive().nullable().optional(),
  bracket_type_id: z.coerce.number().int().positive().nullable().optional(),
  sport_id: z.coerce.number().int().positive().nullable().optional(),
  entry_fee: z.coerce.number().min(0).max(9999999).optional(),
  registration_fee: z.coerce.number().min(0).max(9999999).optional(),
  // G11.21.3 — normalize at the DTO boundary (trim → uppercase → exactly 3 ASCII
  // letters). Never an ISO allowlist lookup: the `currencies` table is not
  // seeded, and the platform tolerates unknown codes by design.
  currency_code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Currency code must be exactly 3 ASCII letters').optional(),
  price_type: competitionPriceTypeEnum.optional(),
  max_participants: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  min_participants: z.coerce.number().int().min(2).max(100000).optional(),
  // G11.21.3 — same contract as the tournament level (cash/card, min 1) plus a
  // uniqueness refine. The tournament write path dedupes in the service
  // (`normaliseRegistrationPaymentMethods`); the competition write path stores
  // the value raw, so duplicates must be rejected HERE or they can never be
  // repaired from the record.
  registration_payment_methods: RegistrationPaymentMethodsSchema.refine(
    (methods) => new Set(methods).size === methods.length,
    'Duplicate payment methods are not allowed',
  ).nullable().optional(),
  waitlist_enabled: z.boolean().optional(),
  age_mode: competitionAgeModeEnum.nullable().optional(),
  age_category_ids: z.array(z.coerce.number().int().positive()).max(100).nullable().optional(),
  gender_categories: z.array(z.string().min(1).max(40)).max(20).nullable().optional(),
  level_ids: z.array(z.coerce.number().int().positive()).max(100).nullable().optional(),
});

/** PATCH semantics: every field optional, but `name` / `competition_type` cannot be blanked. */
export const UpdateCompetitionSchema = CreateCompetitionSchema.partial();

export const DeactivateCompetitionSchema = z.object({
  /** Explicit acknowledgement is required — the operation cascades, so it is guarded server-side too. */
  confirm: z.boolean().optional().default(false),
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
  /**
   * G11.20 — the competition to promote INTO. Required as soon as the tournament
   * owns more than one competition; the server always re-validates that it
   * belongs to this tournament and that the participant's own competition
   * matches (a client id is never trusted on its own).
   */
  competition_id: z.coerce.number().int().positive().optional(),
});

/** Group 6 — pre-start replacement of a withdrawn participant by a waitlisted one. */
export const ReplaceParticipantSchema = z.object({
  replacement_participant_id: z.number().int().positive(),
  payment_method: z.enum(['cash', 'card']).optional(),
  /**
   * G11.20 — the withdrawn participant's competition. The replacement must come
   * from the SAME competition, so the two ids can never be mixed across
   * categories (validated server-side against both participants).
   */
  competition_id: z.coerce.number().int().positive().optional(),
});

// ── Group 7 — pair/team participants, members & player replacement requests ──

/** Create a PAIR participant (exactly the sport/format pair size). */
export const CreatePairParticipantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  member_user_ids: z.array(z.number().int().positive()).min(2).max(20),
  /** Group 3 — single entry-fee payment method (cash|card); one per participant entry. */
  payment_method: z.enum(['cash', 'card']).optional(),
  /** G11.18 Phase 2 — competition category (default when omitted and single). */
  competition_id: z.coerce.number().int().positive().optional(),
});

/** Create a TEAM participant (roster size comes from the sport/format config). */
export const CreateTeamParticipantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  member_user_ids: z.array(z.number().int().positive()).min(2).max(50),
  payment_method: z.enum(['cash', 'card']).optional(),
  /** G11.18 Phase 2 — competition category (default when omitted and single). */
  competition_id: z.coerce.number().int().positive().optional(),
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

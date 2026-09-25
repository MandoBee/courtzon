export type TournamentFormat =
  | 'knockout' | 'double_elimination' | 'round_robin'
  | 'swiss' | 'group_stage_knockout' | 'league' | 'custom' | 'mixed';

export type TournamentStatus =
  | 'draft' | 'published' | 'registration_open' | 'registration_closed'
  | 'running' | 'completed' | 'cancelled' | 'archived';

export type RegistrationStatus = 'registered' | 'confirmed' | 'withdrawn' | 'disqualified' | 'waiting';

/**
 * Group 5 — authoritative Tournament Participant abstraction. The participant is
 * the entity placed into the draw (individual today; pair/team allowed by
 * `participant_type` + the `member_user_ids` roster). It is NOT a user: a
 * future pair/team has one participant with multiple members. Existing
 * individual registrations map 1:1 to participants without rewriting history.
 */
export type TournamentParticipantType = 'individual' | 'pair' | 'team';
export type TournamentParticipantStatus = 'active' | 'withdrawn' | 'waiting' | 'withdrawn_after_start';
export type TournamentMemberStatus = 'active' | 'left' | 'replaced';
export type TournamentReplacementStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/**
 * M10 (G9-D3) — the SINGLE authoritative predicate for whether a tournament
 * participant may be a FUTURE progressing participant or have a future shared
 * Match materialised for its progression.
 *
 * Rule: ACTIVE ONLY. `waiting`, `withdrawn` and `withdrawn_after_start` are all
 * ineligible for future tournament progression / result participation.
 *
 * This predicate is strictly tournament-scoped. It is NEVER applied to:
 *   * historical approved Results (a result approved before withdrawal stays
 *     authoritative),
 *   * completed Matches / already-completed progression (never rolled back),
 *   * audit history or participant membership history.
 * Do not create other eligibility helpers that can drift from this one.
 */
export function isTournamentParticipantProgressionEligible(status: TournamentParticipantStatus): boolean {
  return status === 'active';
}

/**
 * Group 7 — an authoritative member of a Tournament Participant. The Draw
 * operates on the PARTICIPANT (never the user); a pair/team holds MANY member
 * rows. `active_tournament_id` is a DB generated column so a player can never
 * be an ACTIVE member of two participants in the SAME tournament.
 */
export interface TournamentParticipantMember {
  id?: number;
  tournament_id: number;
  participant_id: number;
  user_id: number;
  member_order: number;
  status: TournamentMemberStatus;
  joined_at?: string;
  left_at?: string | null;
  replaced_by_member_id?: number | null;
  /** Joined: user display name for the UI. */
  full_name?: string | null;
}

/**
 * Group 7 — durable player-replacement request. The member row is NEVER
 * silently updated; the request records the full before/after history.
 */
export interface TournamentReplacementRequest {
  id?: number;
  tournament_id: number;
  participant_id: number;
  outgoing_member_user_id: number;
  replacement_user_id: number;
  requested_by?: number | null;
  requested_at?: string;
  reviewed_by?: number | null;
  reviewed_at?: string | null;
  status: TournamentReplacementStatus;
  reason?: string | null;
  rejection_reason?: string | null;
  draw_impact?: Record<string, unknown> | string | null;
  created_at?: string;
  updated_at?: string;
  /** Joined: participant display + member names for the UI. */
  participant_name?: string | null;
  outgoing_member_name?: string | null;
  replacement_user_name?: string | null;
  requested_by_name?: string | null;
}

/**
 * Group 7 — structured impact of a member replacement on the Draw. The
 * Participant identity, its Tournament Seed and its Draw position are all
 * preserved; the draw only needs re-VALIDATION (never silent regeneration).
 */
export interface ReplacementDrawImpact {
  participantId: number;
  drawAffected: boolean;
  requiresValidation: boolean;
  requiresRedraw: boolean;
  seedPreserved: boolean;
}

export interface TournamentParticipant {
  id?: number;
  tournament_id: number;
  /** Individual participants map 1:1 to a registration; NULL for future pair/team. */
  registration_id?: number | null;
  participant_type: TournamentParticipantType;
  status: TournamentParticipantStatus;
  /** Member roster cache (individual = [user_id]); the authoritative relation is
   * tournament_participant_members. Kept in sync for SQL/draw compatibility. */
  member_user_ids?: number[] | null;
  /** FIFO waitlist position (unique per tournament, monotonic, stable); NULL when not waiting. */
  waiting_order?: number | null;
  /** Pair/team display name; NULL for individuals (derived from the member). */
  name?: string | null;
  /** Convenience: primary member user id (individual). */
  player_id?: number | null;
  /** Joined display name (primary member). */
  display_name?: string | null;
  /** Joined: authoritative normalized members (Group 7). */
  members?: TournamentParticipantMember[];
  created_at?: string;
  updated_at?: string;
  /** Joined: the participant's authoritative tournament seed (if any). */
  seed?: TournamentSeed | null;
  /** Joined: current draw position (from the current draw attempt). */
  draw_position?: number | null;
  draw_placement_source?: 'auto' | 'manual' | null;
}

/**
 * Group 5 — authoritative Tournament Seed. Exists only inside a tournament,
 * separate from GLOBAL RATING (never mutated) and DRAW POSITION (may change).
 * source: rating (snapshot frozen for history) | manual (assigned_by required).
 */
export type TournamentSeedSource = 'rating' | 'manual';

export interface TournamentSeed {
  id?: number;
  tournament_id: number;
  participant_id: number;
  seed_number: number;
  source: TournamentSeedSource;
  assigned_by?: number | null;
  assigned_at?: string;
  /** Frozen overall percent when source=rating; NULL for manual. */
  rating_snapshot?: number | null;
  rating_matches_played?: number | null;
  reason?: string | null;
  updated_at?: string;
}

/**
 * Group 5 — Draw generation state. One row per attempt (auditable history).
 * Multiple Auto Re-Draws append attempts; seeds are never rewritten.
 */
export type TournamentDrawStatus = 'draft' | 'approved' | 'locked';
export type TournamentDrawValidationStatus = 'valid' | 'seeding_violation' | 'manually_modified';

export interface TournamentDraw {
  id?: number;
  tournament_id: number;
  attempt_number: number;
  draw_seed: number;
  generated_by?: number | null;
  generated_at?: string;
  status: TournamentDrawStatus;
  validation_status: TournamentDrawValidationStatus;
  is_current: boolean | number;
  created_at?: string;
  entries?: TournamentDrawEntry[];
}

export interface TournamentDrawEntry {
  id?: number;
  draw_id: number;
  participant_id: number;
  /** 0-based draw position within this attempt. */
  position: number;
  placement_source: 'auto' | 'manual';
  /** Explicit admin override of a seeding-rule violation (seed unchanged). */
  overridden: boolean | number;
  moved_by?: number | null;
  moved_at?: string;
  created_at?: string;
  participant?: TournamentParticipant | null;
}

/**
 * Group 7-A — Tournament Eligibility (AGE / GENDER / LEVEL).
 *
 * AUTHORITATIVE AGE RULE (protected business rule):
 *   Tournament Age = YEAR(tournaments.start_date) − YEAR(users.birth_date)
 * YEAR only — never month/day, never "as of today", never as-of-deadline.
 *
 * The reference category defines the age band (min_age/max_age in tournament
 * years); a player is eligible when Tournament Age is within [min_age, max_age]
 * with NULL meaning unbounded on that side (youth: max_age=14/16/18, unbounded
 * below; masters: min_age=40/45/50/55, unbounded above).
 */
export type TournamentAgeMode = 'open' | 'categories';

export type TournamentAgeCategoryType = 'youth' | 'masters';

export interface TournamentAgeCategory {
  id: number;
  slug: string;
  type: TournamentAgeCategoryType;
  min_age: number | null;
  max_age: number | null;
  label_en: string;
  label_ar: string;
  is_active: boolean | number;
}

export const TOURNAMENT_GENDER_CATEGORIES = ['male', 'female', 'mixed'] as const;
export type TournamentGenderCategory = (typeof TOURNAMENT_GENDER_CATEGORIES)[number];

/**
 * Structured tournament eligibility configuration.
 *
 * - ageMode 'open' ⇒ no age filtering; 'categories' ⇒ multi-select reference
 *   categories within ONE family (youth XOR masters — never both).
 * - genderCategories ⊆ {male, female, mixed} (empty = open).
 * - levelIds ⊆ player_levels.id (empty = open). Level is registration-only —
 *   it NEVER applies to notification targeting.
 */
export interface TournamentEligibility {
  ageMode: TournamentAgeMode | null;
  ageCategoryIds: number[];
  genderCategories: TournamentGenderCategory[];
  levelIds: number[];
}

/**
 * Group 6 — structured impact of a participant lifecycle change on the draw.
 * Returned to the caller so the UI can warn before re-draw; a locked draw is
 * never silently mutated.
 */
export interface DrawImpact {
  drawAffected: boolean;
  drawId: number | null;
  status: TournamentDrawStatus | null;
  /** The current draw must be regenerated/revalidated after this change. */
  requiresRedraw: boolean;
  /** The participant held an authoritative seed (historical seed is preserved). */
  seedAffected: boolean;
}

export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'walkover' | 'forfeit' | 'no_show';

/**
 * Group 2 — structured Tournament prize type. Stable machine-readable
 * discriminator (never arbitrary free-text).
 */
export type TournamentPrizeType =
  | 'cash'
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'trophy'
  | 'gift'
  | 'other';

/**
 * Group 2 — a structured Tournament prize row. A Tournament can hold MANY rows
 * (multiple prizes per placement). `placement` is nullable: NULL = special /
 * non-ranked prize; 1 = 1st, 2 = 2nd, ... N = arbitrary ranked placement.
 * Cash prizes carry `amount` + the Tournament's authoritative `currency_code`;
 * non-cash prizes leave both NULL.
 */
export interface TournamentPrize {
  id?: number;
  tournament_id: number;
  placement?: number | null;
  prize_type: TournamentPrizeType;
  description?: string | null;
  amount?: number | null;
  currency_code?: string | null;
  display_order: number;
  created_at?: string;
  updated_at?: string;
}

/** Group 2 — client/API prize input (no internal id/timestamps). */
export interface TournamentPrizeInput {
  placement?: number | null;
  prize_type: TournamentPrizeType;
  description?: string | null;
  amount?: number | null;
  currency_code?: string | null;
  display_order?: number;
}

export interface Tournament {
  id?: number;
  public_id?: string;
  creator_id: number;
  organisation_id?: number;
  branch_id?: number;
  bracket_type_id: number;
  format?: TournamentFormat;
  /** Group 5A — the Match Format generated Matches must use (FK sport_formats). */
  match_format_id?: number;
  /** Group 5A — the Rule Set generated Matches must freeze (FK sport_rule_sets). */
  rule_set_id?: number;
  /** Group 5A — deterministic draw seed (reproducible + auditable draws). */
  draw_seed?: number;
  category?: string;
  season?: string;
  /**
   * Group 7-A — structured eligibility. NULL (legacy rows) resolves at runtime
   * to Open Age / No gender restriction / Open level. When either array is
   * absent the field is interpreted as open; `age_mode='categories'` requires
   * `age_category_ids` within ONE family (youth XOR masters).
   */
  age_mode?: TournamentAgeMode | null;
  age_category_ids?: number[] | null;
  gender_categories?: TournamentGenderCategory[] | null;
  level_ids?: number[] | null;
  sport_id?: number;
  name: string;
  code?: string;
  description?: string;
  tournament_type?: string;
  max_participants: number;
  max_teams?: number;
  min_participants?: number;
  entry_fee?: number;
  registration_fee?: number;
  currency_code: string;
  price_type?: string;
  /**
   * Group 3 — allowed registration payment methods (ALLOWLIST, not a payment
   * implementation). Valid values: ['cash'], ['card'], ['cash','card'].
   * Canonical order is deterministic: cash before card. NULL (legacy rows) is
   * interpreted by the application as the backward-compatible default
   * ['cash','card'] (both). Wallet is never a valid value — CourtZon's global
   * payment policy has Wallet disabled as a payment method (refund only).
   */
registration_payment_methods?: string[];
  /** Group 6 — when full and enabled, new registrations enter a FIFO waitlist. */
  waitlist_enabled?: boolean | number;
  /** Group 3 — response-only: the effective methods after intersecting the
   * configured allowlist with the global payment policy and (when the
   * tournament is org-owned) the organisation's active payment_gateway_config. */
  effective_registration_payment_methods?: string[];
  commission_rate?: number;
  prize_description?: string;
  /** Group 2 — structured prizes: incoming payload (no tournament_id) and, on the
   * authoritative detail shape, resolved `TournamentPrize[]` rows. */
  prizes?: TournamentPrize[] | TournamentPrizeInput[];
  status: TournamentStatus;
  is_public?: boolean;
  registration_opens?: string;
  registration_closes?: string;
  start_date?: string;
  end_date?: string;
  /**
   * Group 4 — daily playing window (venue-local time, e.g. '09:00:00').
   * This is the match playing window, NOT the registration deadline. Values
   * are interpreted in the venue branch's timezone (`branches.timezone`) when a
   * branch is set. NULL = not configured (no window restriction).
   */
  daily_start_time?: string;
  daily_end_time?: string;
  /** Group 4 — response-only: resolved venue from the organisation branch. */
  venue?: TournamentVenue | null;
  rules?: string;
  is_featured?: boolean;
  image_url?: string;
  deleted_at?: string;
  archived_at?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Group 4 — a Tournament venue, resolved from the existing organisation branch
 * (`tournaments.branch_id` → `branches`). All fields are derived from the
 * branch row; nothing is invented. `mapsUrl` is built ONLY from real branch
 * address / lat-lng data and is null when no reliable destination exists.
 */
export interface TournamentVenue {
  branchId: number;
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Branch timezone — authoritative for the daily playing window. */
  timezone?: string | null;
  /** Branch operating hours (used to validate the daily playing window). */
  openingTime?: string | null;
  closingTime?: string | null;
  /** Google Maps destination, built from real address/lat-lng; null if unavailable. */
  mapsUrl?: string | null;
}

/**
 * Group 5A — Mixed-tournament stage. Each stage declares its own progression
 * format and (optionally) its own Match Format / Rule Set, so MIXED tournaments
 * can move from round-robin to knockout without collapsing the two concepts.
 */
export interface TournamentStage {
  id?: number;
  tournament_id: number;
  stage_order: number;
  name?: string;
  progression_format: TournamentFormat;
  match_format_id?: number;
  rule_set_id?: number;
  advance_count: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface TournamentRegistration {
  id?: number;
  tournament_id: number;
  user_id?: number;
  team_id?: number;
  /** DB column player_id — mapped to user_id in the domain. */
  player_id?: number;
  seed?: number;
  /** DB column seed_rank — mapped to seed. */
  seed_rank?: number;
  payment_status?: 'unpaid' | 'paid' | 'refunded';
  status: RegistrationStatus;
  waiting_order?: number;
  registered_at: string;
  confirmed_at?: string;
  checked_in_at?: string;
  /** Group 7-A — frozen eligibility context captured at registration (NULL = legacy/pre-G7 registration). */
  eligibility_snapshot?: Record<string, unknown> | null;
}

export interface TournamentMatch {
  id?: number;
  tournament_id: number;
  /** Group 5A — link to the shared `matches` row (authoritative Match). */
  match_id?: number | null;
  round: number;
  match_number: number;
  round_name?: string | null;
  stage_id?: number | null;
  group_id?: number | null;
  bracket_position?: number | null;
  player1_id?: number | null;
  player2_id?: number | null;
  /** Group 8 — authoritative competitive-unit references (tournament_participants). */
  participant1_id?: number | null;
  participant2_id?: number | null;
  winner_id?: number | null;
  status: MatchStatus;
  /** Group 5B — progression lifecycle: pending | ready | bye | completed | cancelled. */
  progression_state?: string;
  /** Group 5B — draw-time JSON provenance (is_bracket/target wiring). */
  progression_meta?: Record<string, unknown> | string | null;
  resource_id?: number | null;
  referee_id?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  score_summary?: string | null;
  /** Joined (G8) — court reservation state via the shared Match → booking. */
  booking_id?: number | null;
  participant1_name?: string | null;
  participant2_name?: string | null;
  resource_name?: string | null;
  booking_status?: string | null;
}

/** Group 8 — court/venue schedule candidate for a tournament match. */
export interface TournamentMatchScheduleInput {
  /** Branch-local booking date (YYYY-MM-DD). */
  date: string;
  /** Branch-local start time (HH:MM). */
  start_time: string;
  /** Branch-local end time (HH:MM). */
  end_time: string;
  /** Court/resource id (must belong to the tournament branch + sport). */
  resource_id: number;
}

/** Group 5A — a bye is explicit bracket metadata, never a fake participant. */
export interface BracketSlot {
  round: number;
  bracketPosition?: number;
  /** Participants in this slot (home = first, away = second). */
  player1Id?: number;
  player2Id?: number;
  /** Set when a round-1 slot has a bye (no real opponent). */
  bye?: boolean;
  /** Group 5A — the tournament stage this slot belongs to (MIXED tournaments). */
  stageId?: number;
  /** Progression metadata: which earlier Match result feeds this slot. */
  sourceMatchId?: number;
  sourceRound?: number;
  sourceBracketPosition?: number;
  targetRound?: number;
  targetBracketPosition?: number;
  /** Which participant this slot's winner fills on the target slot. */
  targetSide?: 'player1' | 'player2';
}

export interface TournamentMatchResult {
  id?: number;
  match_id: number;
  winner_id?: number;
  home_score?: string;
  away_score?: string;
  score_details?: string;
  result_status?: 'submitted' | 'confirmed' | 'disputed';
  entered_by: number;
  confirmed_at?: string;
  created_at?: string;
}

export interface TournamentGroup {
  id?: number;
  tournament_id: number;
  name: string;
  advance_count: number;
  created_at?: string;
}

export interface TournamentGroupMember {
  id?: number;
  group_id: number;
  registration_id: number;
  seed: number;
}

export interface TournamentStandingRow {
  id?: number;
  tournament_id: number;
  group_id?: number;
  registration_id: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  games_won: number;
  games_lost: number;
  sets_won: number;
  sets_lost: number;
  rank_position?: number;
}

export interface TournamentStanding {
  registration_id: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  games_won: number;
  games_lost: number;
  sets_won: number;
  sets_lost: number;
  rank_position?: number;
}

/**
 * Deterministic PRNG (mulberry32). Seeded draws are reproducible + auditable —
 * the same seed always yields the same bracket. No `Math.random()`.
 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher-Yates shuffle from a seed. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const rng = createSeededRng(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deterministic knockout bracket with explicit byes.
 *
 * Rules:
 *  - The bracket is built to the next power of two.
 *  - Seed values (explicit `seed` on registrations) sort participants when
 *    provided; otherwise registration order is preserved (never implicit seed).
 *  - A first-round slot whose opponent is missing is an explicit BYE (no fake
 *    participant is created).
 *  - Every later-round slot declares its progression source (which earlier
 *    bracket positions feed it) so the full bracket is reconstructable.
 */
export function generateKnockoutBracket(
  participantIds: number[],
  opts: { seed?: number; seededBy?: Map<number, number> } = {},
): BracketSlot[] {
  const ids = [...participantIds];
  // Sort by explicit seed when provided (seeds are authoritative, registration
  // order is NOT an implicit seed). Unseeded participants follow registration
  // order — deterministic given the same input list.
  if (opts.seededBy) {
    ids.sort((a, b) => (opts.seededBy!.get(a) ?? Number.MAX_SAFE_INTEGER) - (opts.seededBy!.get(b) ?? Number.MAX_SAFE_INTEGER));
  } else if (opts.seed != null) {
    ids.sort((a, b) => a - b); // deterministic fallback ordering
  }

  const count = ids.length;
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(Math.max(count, 2))));
  const slots: BracketSlot[] = [];

  // Round 1 — pair consecutive participants; odd one out is a bye.
  for (let i = 0; i < nextPowerOf2 / 2; i++) {
    const p1 = ids[i * 2];
    const p2 = ids[i * 2 + 1];
    slots.push({
      round: 1,
      bracketPosition: i,
      player1Id: p1,
      player2Id: p2,
      bye: p2 === undefined,
      sourceRound: undefined,
      sourceBracketPosition: undefined,
    });
  }

  // Later rounds — winners of the two preceding positions meet.
  const totalRounds = Math.log2(nextPowerOf2);
  for (let r = 2; r <= totalRounds; r++) {
    const matchesInRound = nextPowerOf2 / Math.pow(2, r);
    for (let i = 0; i < matchesInRound; i++) {
      slots.push({
        round: r,
        bracketPosition: i,
        sourceRound: r - 1,
        sourceBracketPosition: i * 2,
        targetRound: r < totalRounds ? r + 1 : undefined,
        targetBracketPosition: r < totalRounds ? Math.floor(i / 2) : undefined,
      });
    }
  }

  return slots;
}

/**
 * Normalise a generated knockout bracket — fill the target wiring (round,
 * position and side) every slot needs so the progression engine can seat a
 * winner. `generateKnockoutBracket` only declares `targetRound` /
 * `targetBracketPosition` for rounds ≥ 2; Round-1 slots must be told where
 * their winner goes. The target side is the parity of the slot's bracket
 * position (upper feed → player1, lower feed → player2).
 *
 * This is the SINGLE source of truth for bracket target topology — shared by
 * the legacy `generateBracket` path and the G8 locked-draw generation path.
 * Never maintain a second implementation of this calculation.
 */
export function normaliseBracketTargets(slots: BracketSlot[], participantCount: number): BracketSlot[] {
  const totalRounds = Math.max(1, Math.ceil(Math.log2(Math.max(participantCount, 2))));
  return slots.map((s) => {
    const targetSide: 'player1' | 'player2' = ((s.bracketPosition ?? 0) % 2 === 0) ? 'player1' : 'player2';
    if (s.sourceRound != null) {
      // Rounds ≥ 2 already declare their round/position target — add the side.
      return { ...s, targetSide };
    }
    const singleRound = totalRounds === 1;
    return {
      ...s,
      targetRound: singleRound ? undefined : 2,
      targetBracketPosition: singleRound ? undefined : Math.floor((s.bracketPosition ?? 0) / 2),
      targetSide,
    };
  });
}

/**
 * Deterministic round-robin pairings using the circle method (fixed first
 * participant rotates). Produces `rounds` where each participant plays once per
 * round. Handles odd participant counts with an implicit bye (no fake player).
 */
export function generateRoundRobinMatches(participantIds: number[]): Array<{ round: number; player1Id: number; player2Id: number; bye?: boolean }> {
  const ids = [...participantIds];
  const n = ids.length;
  const matches: Array<{ round: number; player1Id: number; player2Id: number; bye?: boolean }> = [];
  if (n < 2) return matches;

  // Add a sentinel for odd counts so every round is a full pairing set.
  const arr = n % 2 === 1 ? [...ids, -1] : [...ids];
  const m = arr.length;
  const rounds = m - 1;

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i];
      const b = arr[m - 1 - i];
      if (a === -1 || b === -1) continue; // bye
      matches.push({ round: r + 1, player1Id: a, player2Id: b });
    }
    // Rotate: keep arr[0] fixed, shift the rest.
    const last = arr[m - 1];
    for (let i = m - 1; i > 1; i--) arr[i] = arr[i - 1];
    arr[1] = last;
  }

  return matches;
}

/**
 * Group 5A — stage-aware match generation. A MIXED tournament declares stages
 * (e.g. round-robin then knockout); each stage's progression format drives the
 * generated slots. Non-mixed tournaments simply use the tournament format.
 */
export function generateStageMatches(
  tournamentFormat: TournamentFormat,
  participantIds: number[],
  opts: { seed?: number; seededBy?: Map<number, number> } = {},
): BracketSlot[] {
  if (tournamentFormat === 'knockout' || tournamentFormat === 'double_elimination' || tournamentFormat === 'group_stage_knockout' || tournamentFormat === 'swiss') {
    // Knockout-family: a bracket with byes (group_stage_knockout delegates to
    // round-robin per group in the service, then knockout for the final).
    if (tournamentFormat === 'group_stage_knockout') {
      return generateRoundRobinMatches(participantIds).map((m) => ({ round: 1, bracketPosition: m.round, player1Id: m.player1Id, player2Id: m.player2Id }));
    }
    return generateKnockoutBracket(participantIds, opts);
  }
  // Round-robin / league / mixed default: pairing-based.
  return generateRoundRobinMatches(participantIds).map((m) => ({ round: m.round, bracketPosition: 0, player1Id: m.player1Id, player2Id: m.player2Id }));
}

export function computeStandings(matches: TournamentMatch[], participantIds: number[]): TournamentStanding[] {
  const stats = new Map<number, { points: number; wins: number; losses: number; draws: number; games_won: number; games_lost: number }>();

  for (const pid of participantIds) {
    stats.set(pid, { points: 0, wins: 0, losses: 0, draws: 0, games_won: 0, games_lost: 0 });
  }

  for (const match of matches) {
    if (match.status !== 'completed' || !match.winner_id) continue;
    const loserId = match.player1_id === match.winner_id ? match.player2_id : match.player1_id;
    if (!loserId) continue;

    const winner = stats.get(match.winner_id);
    const loser = stats.get(loserId);
    if (!winner || !loser) continue;

    winner.wins++;
    winner.games_won++;
    winner.points += 3;
    loser.losses++;
    loser.games_lost++;
  }

  return Array.from(stats.entries())
    .map(([registrationId, s]) => ({
      registration_id: registrationId,
      points: s.points,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      games_won: s.games_won,
      games_lost: s.games_lost,
      sets_won: 0,
      sets_lost: 0,
      rank_position: 0,
    }))
    .sort((a, b) => b.points - a.points || (b.games_won - b.games_lost) - (a.games_won - a.games_lost))
    .map((s, i) => ({ ...s, rank_position: i + 1 }));
}

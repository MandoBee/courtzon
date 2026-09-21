export type TournamentFormat =
  | 'knockout' | 'double_elimination' | 'round_robin'
  | 'swiss' | 'group_stage_knockout' | 'league' | 'custom' | 'mixed';

export type TournamentStatus =
  | 'draft' | 'published' | 'registration_open' | 'registration_closed'
  | 'running' | 'completed' | 'cancelled' | 'archived';

export type RegistrationStatus = 'registered' | 'confirmed' | 'withdrawn' | 'disqualified';

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
  rules?: string;
  is_featured?: boolean;
  image_url?: string;
  deleted_at?: string;
  archived_at?: string;
  created_at?: string;
  updated_at?: string;
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

export type TournamentFormat =
  | 'knockout' | 'double_elimination' | 'round_robin'
  | 'swiss' | 'group_stage_knockout' | 'league' | 'custom';

export type TournamentStatus =
  | 'draft' | 'published' | 'registration_open' | 'registration_closed'
  | 'running' | 'completed' | 'cancelled' | 'archived';

export type RegistrationStatus = 'pending' | 'confirmed' | 'waiting' | 'cancelled' | 'completed';

export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'walkover' | 'forfeit' | 'no_show';

export interface Tournament {
  id?: number;
  public_id?: string;
  creator_id: number;
  organisation_id?: number;
  branch_id?: number;
  bracket_type_id: number;
  format?: TournamentFormat;
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

export interface TournamentRegistration {
  id?: number;
  tournament_id: number;
  user_id?: number;
  team_id?: number;
  team_name?: string;
  seed: number;
  status: RegistrationStatus;
  waiting_order?: number;
  registered_at: string;
  confirmed_at?: string;
  checked_in_at?: string;
}

export interface TournamentMatch {
  id?: number;
  tournament_id: number;
  round: number;
  match_number: number;
  round_name?: string;
  group_id?: number;
  bracket_position?: number;
  player1_id?: number;
  player2_id?: number;
  winner_id?: number;
  status: MatchStatus;
  resource_id?: number;
  referee_id?: number;
  start_time?: string;
  end_time?: string;
  score_summary?: string;
}

export interface TournamentMatchResult {
  id?: number;
  match_id: number;
  winner_id?: number;
  home_score?: number;
  away_score?: number;
  score_details?: string;
  entered_by: number;
  entered_at: string;
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

export function generateKnockoutBracket(participantIds: number[]): { round: number; bracketPosition: number; player1Id?: number; player2Id?: number }[] {
  const count = participantIds.length;
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(count)));
  const matches: { round: number; bracketPosition: number; player1Id?: number; player2Id?: number }[] = [];

  for (let i = 0; i < nextPowerOf2 / 2; i++) {
    const p1 = participantIds[i * 2];
    const p2 = participantIds[i * 2 + 1];
    matches.push({ round: 1, bracketPosition: i, player1Id: p1, player2Id: p2 || undefined });
  }

  const totalRounds = Math.log2(nextPowerOf2);
  for (let r = 2; r <= totalRounds; r++) {
    const matchesInRound = nextPowerOf2 / Math.pow(2, r);
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({ round: r, bracketPosition: i });
    }
  }

  return matches;
}

export function generateRoundRobinMatches(participantIds: number[]): { round: number; player1Id: number; player2Id: number }[] {
  const matches: { round: number; player1Id: number; player2Id: number }[] = [];
  const n = participantIds.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matches.push({ round: 1, player1Id: participantIds[i], player2Id: participantIds[j] });
    }
  }

  return matches;
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

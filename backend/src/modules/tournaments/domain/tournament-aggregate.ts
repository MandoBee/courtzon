export type TournamentFormat =
  | 'knockout' | 'double_elimination' | 'round_robin'
  | 'swiss' | 'group_stage_knockout' | 'league' | 'custom';

export type RegistrationType = 'individual' | 'team' | 'academy' | 'invitation' | 'public';

export type TournamentStatus =
  | 'draft' | 'published' | 'registration_open' | 'registration_closed'
  | 'running' | 'completed' | 'cancelled' | 'archived';

export type RegistrationStatus = 'pending' | 'confirmed' | 'waiting' | 'cancelled' | 'completed';

export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'walkover' | 'forfeit' | 'no_show';

export interface Tournament {
  id?: number;
  code: string;
  name: string;
  description?: string;
  format: TournamentFormat;
  sport_id: number;
  organisation_id?: number;
  branch_id?: number;
  category?: string;
  season?: string;
  status: TournamentStatus;
  registration_type: RegistrationType;
  max_players?: number;
  max_teams?: number;
  current_players?: number;
  current_teams?: number;
  registration_fee?: number;
  price_type?: string;
  currency?: string;
  is_public?: boolean;
  registration_open_at?: string;
  registration_close_at?: string;
  start_date?: string;
  end_date?: string;
  match_duration_minutes?: number;
  rules?: string;
  prize_description?: string;
  metadata?: Record<string, unknown>;
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
  group_id?: number;
  bracket_position?: number;
  player1_id?: number;
  player2_id?: number;
  winner_id?: number;
  status: MatchStatus;
  court_id?: number;
  referee_id?: number;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  notes?: string;
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
  registration_id?: number;
  player_id?: number;
  team_id?: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  games_for: number;
  games_against: number;
  position: number;
  played: number;
}

export interface TournamentStanding {
  registration_id?: number;
  player_id?: number;
  team_id?: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  games_for: number;
  games_against: number;
  position: number;
  played: number;
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
  const stats = new Map<number, { points: number; wins: number; losses: number; draws: number; gf: number; ga: number; played: number }>();

  for (const pid of participantIds) {
    stats.set(pid, { points: 0, wins: 0, losses: 0, draws: 0, gf: 0, ga: 0, played: 0 });
  }

  for (const match of matches) {
    if (match.status !== 'completed' || !match.winner_id) continue;
    const loserId = match.player1_id === match.winner_id ? match.player2_id : match.player1_id;
    if (!loserId) continue;

    const winner = stats.get(match.winner_id);
    const loser = stats.get(loserId);
    if (!winner || !loser) continue;

    winner.wins++;
    winner.points += 3;
    winner.played++;
    loser.losses++;
    loser.played++;
  }

  return Array.from(stats.entries())
    .map(([playerId, s]) => ({
      player_id: playerId,
      points: s.points,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      games_for: s.gf,
      games_against: s.ga,
      position: 0,
      played: s.played,
    }))
    .sort((a, b) => b.points - a.points || (b.games_for - b.games_against) - (a.games_for - a.games_against))
    .map((s, i) => ({ ...s, position: i + 1 }));
}

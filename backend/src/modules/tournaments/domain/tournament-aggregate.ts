export type TournamentFormat =
  | 'knockout' | 'double_elimination' | 'round_robin'
  | 'swiss' | 'group_stage_knockout' | 'league' | 'custom';

export type RegistrationType = 'individual' | 'team' | 'academy' | 'invitation' | 'public';

export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'walkover' | 'forfeit' | 'no_show';

export interface Tournament {
  id?: number;
  name: string;
  format: TournamentFormat;
  sportId: number;
  organisationId?: number;
  branchId?: number;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  maxParticipants: number;
  currentParticipants: number;
  registrationType: RegistrationType;
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
  matchDurationMinutes: number;
  description?: string;
  rules?: string;
  prizeDescription?: string;
  aggregateVersion: number;
}

export interface TournamentParticipant {
  id?: number;
  tournamentId: number;
  userId?: number;
  teamName?: string;
  seed: number;
  status: 'registered' | 'approved' | 'rejected' | 'checked_in';
  registeredAt: string;
}

export interface TournamentMatch {
  id?: number;
  tournamentId: number;
  round: number;
  groupId?: number;
  bracketPosition?: number;
  player1Id?: number;
  player2Id?: number;
  winnerId?: number;
  score?: string;
  status: MatchStatus;
  courtId?: number;
  refereeId?: number;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  aggregateVersion: number;
}

export interface TournamentStanding {
  participantId: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  gamesFor: number;
  gamesAgainst: number;
  position: number;
}

export interface EloRating {
  userId: number;
  sportId: number;
  rating: number;
  matchesPlayed: number;
  kFactor: number;
  lastMatchAt?: string;
}

export function generateKnockoutBracket(participantIds: number[]): { round: number; bracketPosition: number; player1Id?: number; player2Id?: number }[] {
  const count = participantIds.length;
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(count)));
  const byes = nextPowerOf2 - count;
  const matches: { round: number; bracketPosition: number; player1Id?: number; player2Id?: number }[] = [];

  // First round
  for (let i = 0; i < nextPowerOf2 / 2; i++) {
    const p1 = participantIds[i * 2];
    const p2 = participantIds[i * 2 + 1];
    matches.push({ round: 1, bracketPosition: i, player1Id: p1, player2Id: p2 || undefined });
  }

  // Subsequent rounds (placeholders)
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

export function calculateElo(ratingA: number, ratingB: number, result: 'win' | 'loss' | 'draw', kFactor: number = 32): { newRatingA: number; newRatingB: number } {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;

  let scoreA: number, scoreB: number;
  if (result === 'win') { scoreA = 1; scoreB = 0; }
  else if (result === 'loss') { scoreA = 0; scoreB = 1; }
  else { scoreA = 0.5; scoreB = 0.5; }

  return {
    newRatingA: Math.round(ratingA + kFactor * (scoreA - expectedA)),
    newRatingB: Math.round(ratingB + kFactor * (scoreB - expectedB)),
  };
}

export function computeStandings(matches: TournamentMatch[], participantIds: number[]): TournamentStanding[] {
  const stats = new Map<number, { points: number; wins: number; losses: number; draws: number; gf: number; ga: number }>();

  for (const pid of participantIds) {
    stats.set(pid, { points: 0, wins: 0, losses: 0, draws: 0, gf: 0, ga: 0 });
  }

  for (const match of matches) {
    if (match.status !== 'completed' || !match.winnerId) continue;
    const loserId = match.player1Id === match.winnerId ? match.player2Id : match.player1Id;
    if (!loserId) continue;

    const winner = stats.get(match.winnerId);
    const loser = stats.get(loserId);
    if (!winner || !loser) continue;

    winner.wins++;
    winner.points += 3;
    loser.losses++;

    if (match.score) {
      const [wScore, lScore] = match.score.split('-').map(Number);
      if (!isNaN(wScore) && !isNaN(lScore)) {
        winner.gf += wScore;
        winner.ga += lScore;
        loser.gf += lScore;
        loser.ga += wScore;
      }
    }
  }

  return Array.from(stats.entries())
    .map(([participantId, s]) => ({
      participantId,
      points: s.points,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      gamesFor: s.gf,
      gamesAgainst: s.ga,
      position: 0,
    }))
    .sort((a, b) => b.points - a.points || (b.gamesFor - b.gamesAgainst) - (a.gamesFor - a.gamesAgainst))
    .map((s, i) => ({ ...s, position: i + 1 }));
}

export interface RoundRobinFixture {
  round: number;
  home_team_id: number;
  away_team_id: number;
}

export function generateRoundRobinFixtures(teamIds: number[], doubleRoundRobin?: boolean): RoundRobinFixture[] {
  const fixtures: RoundRobinFixture[] = [];
  const n = teamIds.length;

  if (n < 2) return fixtures;

  const teams = [...teamIds];
  if (n % 2 !== 0) {
    teams.push(-1);
  }

  const totalTeams = teams.length;
  const rounds = totalTeams - 1;

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < totalTeams / 2; i++) {
      const home = teams[i];
      const away = teams[totalTeams - 1 - i];

      if (home === -1 || away === -1) continue;

      if (r % 2 === 0) {
        fixtures.push({ round: r + 1, home_team_id: home, away_team_id: away });
      } else {
        fixtures.push({ round: r + 1, home_team_id: away, away_team_id: home });
      }
    }

    const last = teams.pop()!;
    teams.splice(1, 0, last);
  }

  if (doubleRoundRobin) {
    const secondHalf: RoundRobinFixture[] = fixtures.map(
      (f) => ({ round: f.round + rounds, home_team_id: f.away_team_id, away_team_id: f.home_team_id }),
    );
    fixtures.push(...secondHalf);
  }

  return fixtures;
}

export function computeLeagueStandings(
  matches: { home_team_id: number; away_team_id: number; home_score: number; away_score: number; winner_team_id: number | null }[],
  teams: { id: number }[],
  pointsPerWin: number,
  pointsPerDraw: number,
): {
  team_id: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  position: number;
  form: string[];
}[] {
  const stats = new Map<number, {
    played: number; wins: number; draws: number; losses: number;
    goals_for: number; goals_against: number; points: number; form: string[];
  }>();

  for (const t of teams) {
    stats.set(t.id, { played: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0, form: [] });
  }

  for (const m of matches) {
    const home = stats.get(m.home_team_id);
    const away = stats.get(m.away_team_id);
    if (!home || !away) continue;

    const homeScore = Number(m.home_score) || 0;
    const awayScore = Number(m.away_score) || 0;

    home.goals_for += homeScore;
    home.goals_against += awayScore;
    away.goals_for += awayScore;
    away.goals_against += homeScore;

    home.played++;
    away.played++;

    if (m.winner_team_id === m.home_team_id) {
      home.wins++;
      home.points += pointsPerWin;
      away.losses++;
      home.form.push('W');
      away.form.push('L');
    } else if (m.winner_team_id === m.away_team_id) {
      away.wins++;
      away.points += pointsPerWin;
      home.losses++;
      home.form.push('L');
      away.form.push('W');
    } else {
      home.draws++;
      away.draws++;
      home.points += pointsPerDraw;
      away.points += pointsPerDraw;
      home.form.push('D');
      away.form.push('D');
    }
  }

  return Array.from(stats.entries())
    .map(([teamId, s]) => ({
      team_id: teamId,
      played: s.played,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      goals_for: s.goals_for,
      goals_against: s.goals_against,
      goal_difference: s.goals_for - s.goals_against,
      points: s.points,
      position: 0,
      form: s.form.slice(-5),
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
      return b.goals_for - a.goals_for;
    })
    .map((s, i) => ({ ...s, position: i + 1 }));
}

export function formatForm(history: string[]): string[] {
  return history.slice(-5);
}

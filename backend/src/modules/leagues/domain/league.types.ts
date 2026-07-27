export type SeasonStatus = 'draft' | 'published' | 'running' | 'completed' | 'archived';

export type LeagueFormat = 'round_robin' | 'double_round_robin';

export type LeagueStatus = 'draft' | 'registration_open' | 'registration_closed' | 'running' | 'completed' | 'cancelled' | 'archived';

export type TeamRegistrationStatus = 'pending' | 'confirmed' | 'waiting' | 'cancelled' | 'withdrawn';

export type LeagueMatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'walkover';

export type ResultStatus = 'submitted' | 'confirmed' | 'disputed';

export interface SeasonAttributes {
  id?: number;
  code: string;
  name: string;
  description?: string | null;
  sport_id?: number | null;
  start_date: string;
  end_date?: string | null;
  status: SeasonStatus;
  created_at?: string;
  updated_at?: string;
}

export interface LeagueAttributes {
  id?: number;
  season_id: number;
  code: string;
  name: string;
  description?: string | null;
  sport_id?: number | null;
  format: LeagueFormat;
  max_teams: number;
  registration_fee: number;
  price_type: 'FREE' | 'FIXED' | 'MEMBERS_ONLY';
  currency: string;
  status: LeagueStatus;
  is_public: boolean;
  points_per_win: number;
  points_per_draw: number;
  archived_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LeagueDivisionAttributes {
  id?: number;
  league_id: number;
  name: string;
  tier: number;
  capacity: number;
  advance_count: number;
  relegation_count: number;
  status: 'active' | 'inactive' | 'archived';
  created_at?: string;
}

export interface LeagueTeamAttributes {
  id?: number;
  division_id: number;
  team_name: string;
  captain_id?: number | null;
  player_ids?: number[] | null;
  status: TeamRegistrationStatus;
  waiting_order?: number | null;
  seed?: number | null;
  registered_at?: string;
  created_at?: string;
}

export interface LeagueMatchAttributes {
  id?: number;
  division_id: number;
  home_team_id: number;
  away_team_id: number;
  round: number;
  match_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  court_id?: number | null;
  referee_id?: number | null;
  status: LeagueMatchStatus;
  created_at?: string;
  updated_at?: string;
}

export interface LeagueResultAttributes {
  id?: number;
  match_id: number;
  home_score?: string | null;
  away_score?: string | null;
  winner_team_id?: number | null;
  result_status: ResultStatus;
  entered_by: number;
  confirmed_at?: string | null;
  created_at?: string;
}

export interface LeagueStandingAttributes {
  id?: number;
  division_id: number;
  team_id: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  position?: number | null;
  form?: string[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface PlayerStatAttributes {
  id?: number;
  season_id: number;
  player_id: number;
  team_id?: number | null;
  division_id?: number | null;
  appearances: number;
  goals: number;
  assists: number;
  clean_sheets: number;
  yellow_cards: number;
  red_cards: number;
  minutes_played: number;
  rating?: number | null;
  stats_json?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface TeamStatAttributes {
  id?: number;
  season_id: number;
  team_id: number;
  division_id?: number | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  clean_sheets: number;
  home_record?: Record<string, unknown> | null;
  away_record?: Record<string, unknown> | null;
  stats_json?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface LeagueDashboard {
  total_leagues: number;
  open_registrations: number;
  running_leagues: number;
  completed_leagues: number;
  total_teams: number;
  total_matches: number;
  completed_matches: number;
}

export type SeasonStatusType = SeasonStatus;
export type LeagueStatusType = LeagueStatus;
export type TeamRegistrationStatusType = TeamRegistrationStatus;

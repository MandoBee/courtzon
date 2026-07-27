export interface PlayerRanking {
  user_id: number;
  full_name: string;
  avatar_url?: string;
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  win_rate: number;
  rank_position: number;
  sport_name?: string;
  last_match_at?: string;
}

export interface MatchQualityScore {
  match_id: number;
  quality_score: number;
  skill_balance: number;
  competitiveness: number;
  player_count: number;
  duration_minutes: number;
}

export interface PlayerPerformance {
  user_id: number;
  total_matches: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_rating?: number;
  current_streak: number;
  best_streak: number;
  recent_form: string[];
  sport_breakdown: { sport_name: string; matches: number; wins: number }[];
}

export interface ScheduleCandidate {
  date: string;
  start_time: string;
  end_time: string;
  resource_id: number;
  resource_name: string;
  branch_name: string;
  score: number;
  reasons: string[];
}

export interface PartnerRecommendation {
  user_id: number;
  full_name: string;
  avatar_url?: string;
  compatibility_score: number;
  skill_gap: number;
  common_sports: string[];
  mutual_friends: number;
  total_matches_together?: number;
}

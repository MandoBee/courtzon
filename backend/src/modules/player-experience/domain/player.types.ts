export interface PlayerDashboardData {
  wallet_balance: number;
  unread_notifications: number;
  upcoming_bookings: number;
  upcoming_matches: number;
  active_academy_enrollments: number;
  active_tournament_registrations: number;
  active_league_teams: number;
  recent_activity: PlayerActivityItem[];
}

export interface PlayerActivityItem {
  type: 'booking' | 'match' | 'academy' | 'tournament' | 'league' | 'payment' | 'achievement';
  title: string;
  description?: string;
  timestamp: string;
  status?: string;
  reference_id?: number;
  reference_type?: string;
}

export interface PlayerStatisticsSummary {
  total_bookings: number;
  total_matches_played: number;
  total_academy_sessions: number;
  total_tournaments_joined: number;
  total_achievements: number;
  total_followers: number;
  total_following: number;
  membership_tier?: string;
  wallet_balance: number;
}

export interface PlayerSearchResult {
  id: number;
  full_name: string;
  email?: string;
  avatar_url?: string;
  main_sport?: string;
  main_level?: string;
  is_public: boolean;
  is_following?: boolean;
}

export interface QRProfileData {
  id: number;
  full_name: string;
  avatar_url?: string;
  main_sport?: string;
  main_level?: string;
  player_since: string;
  stats: { label: string; value: string | number }[];
}

export interface PlayerFavorite {
  id: number;
  type: 'club' | 'coach';
  name: string;
  image_url?: string;
  description?: string;
  created_at: string;
}

export interface PlayerDevice {
  id: number;
  device_name?: string;
  device_type?: string;
  os?: string;
  browser?: string;
  last_active_at?: string;
  created_at: string;
}

export interface PlayerAchievement {
  id: number;
  key: string;
  title: string;
  description?: string;
  icon_url?: string;
  unlocked_at?: string;
  progress?: number;
  max_progress?: number;
}

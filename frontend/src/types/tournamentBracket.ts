/**
 * Read-model types for the Tournament Bracket & Match Details UI
 * (documented contract from GET /tournaments/:id/matches — see
 * docs/HANDOVER_CURRENT/69_TOURNAMENT_BRACKET_API_AUDIT.md).
 * Optional fields are tolerated so the same components can render
 * admin/org match rows that may not carry full enrichment.
 */
export interface TournamentMatchNode {
  id: number;
  tournament_id?: number;
  competition_id?: number;
  match_id?: number | null;
  round?: number | null;
  round_name?: string | null;
  match_number?: number | null;
  bracket_position?: number | null;
  player1_id?: number | null;
  player2_id?: number | null;
  player1_name?: string | null;
  player2_name?: string | null;
  participant1_id?: number | null;
  participant2_id?: number | null;
  participant1_name?: string | null;
  participant2_name?: string | null;
  resource_id?: number | null;
  resource_name?: string | null;
  referee_id?: number | null;
  referee_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  score_summary?: string | null;
  winner_id?: number | null;
  winner_participant_id?: number | null;
  loser_participant_id?: number | null;
  final_position?: number | null;
  bracket_depth?: number;
  is_final?: number | boolean;
  shared_status?: string | null;
  progression_state?: string | null;
  progression_meta?: Record<string, unknown> | null;
  format_snapshot?: { name?: string | null; formatId?: number; formatType?: string | null; playersPerSide?: number | null } | null;
  rule_snapshot?: {
    score_structure?: 'goals' | 'sets' | string | null;
    halves?: number[] | number | null;
    extra_time?: boolean;
    draw_allowed?: boolean;
    penalty_shootout?: boolean;
    match_duration_minutes?: number | null;
  } | null;
  booking_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TournamentBracketInfo {
  id?: number | string;
  name?: string | null;
  status?: string | null;
  format?: string | null;
  bracket_type_name?: string | null;
  bracket_type_id?: number | null;
  sport_name?: string | null;
  max_participants?: number | null;
  start_date?: string | null;
}

export interface TournamentParticipantNode {
  id?: number;
  tournament_id?: number;
  competition_id?: number | null;
  player_id?: number | null;
  team_id?: number | null;
  seed_rank?: number | null;
  seed?: number | null;
  status?: string | null;
  player_name?: string | null;
  registration_id?: number | null;
}

export const isKnockoutFormat = (t?: TournamentBracketInfo | null): boolean => {
  const format = String(t?.format || '').toLowerCase();
  const bracket = String(t?.bracket_type_name || '').toLowerCase();
  return (
    format.includes('knockout') ||
    bracket.includes('single elimination') ||
    bracket.includes('double elimination')
  );
};
import type { SportScoringRules, StandingsRules } from '../../domain/match-result.types.js';

/**
 * CourtZon default sport rule sets (Part A — DEFAULT SPORT RULES).
 * These are seed values written into sport_formats + sport_rule_sets when a
 * sport slug is present. Admin may add/modify formats; rule changes are
 * versioned and only apply to new matches.
 */

export interface DefaultSportRule {
  sportSlug: string;
  formatSlug: string;
  formatName: string;
  formatType: 'singles' | 'doubles' | 'team';
  description: string;
  rules: SportScoringRules;
  standingsRules: StandingsRules;
}

export const DEFAULT_SPORT_RULES: DefaultSportRule[] = [
  {
    sportSlug: 'padel',
    formatSlug: 'standard',
    formatName: 'Padel Standard',
    formatType: 'doubles',
    description: 'Best of 3 sets, set first to 6 games by one-game margin, tiebreak at 6-6, golden point at deuce.',
    rules: {
      score_structure: 'sets',
      best_of: 3,
      sets_to_win: 2,
      first_to: 6,
      margin: 1,
      tiebreak_at: 6,
      tiebreak_first_to: 7,
      tiebreak_win_by: 2,
      deuce_rule: 'golden_point',
      draw_allowed: false,
      terminations: ['retired', 'walkover', 'forfeit', 'abandoned'],
    },
    standingsRules: {
      points: { win: 3, draw: 1, loss: 0 },
      tiebreakers: [
        { field: 'points', direction: 'desc' },
        { field: 'games_difference', direction: 'desc' },
        { field: 'games_won', direction: 'desc' },
      ],
    },
  },
  {
    sportSlug: 'tennis',
    formatSlug: 'standard',
    formatName: 'Tennis Standard',
    formatType: 'singles',
    description: 'Best of 3 sets, set first to 6 games by 2, tiebreak at 6-6 first to 7 by 2.',
    rules: {
      score_structure: 'sets',
      best_of: 3,
      sets_to_win: 2,
      first_to: 6,
      margin: 2,
      tiebreak_at: 6,
      tiebreak_first_to: 7,
      tiebreak_win_by: 2,
      deuce_rule: 'standard',
      draw_allowed: false,
      terminations: ['retired', 'walkover', 'forfeit', 'abandoned'],
    },
    standingsRules: {
      points: { win: 3, draw: 1, loss: 0 },
      tiebreakers: [
        { field: 'points', direction: 'desc' },
        { field: 'sets_difference', direction: 'desc' },
        { field: 'games_difference', direction: 'desc' },
        { field: 'head_to_head', direction: 'desc' },
      ],
    },
  },
  {
    sportSlug: 'football',
    formatSlug: 'standard',
    formatName: 'Football 11v11',
    formatType: 'team',
    description: '90 minutes (45+45), goals, draw allowed in normal matches; tournaments may enable extra time and penalty shootout.',
    rules: {
      score_structure: 'goals',
      match_duration_minutes: 90,
      halves: [45, 45],
      extra_time: false,
      penalty_shootout: false,
      draw_allowed: true,
      terminations: ['retired', 'walkover', 'forfeit', 'abandoned'],
    },
    standingsRules: {
      points: { win: 3, draw: 1, loss: 0 },
      tiebreakers: [
        { field: 'points', direction: 'desc' },
        { field: 'goal_difference', direction: 'desc' },
        { field: 'goals_for', direction: 'desc' },
        { field: 'head_to_head', direction: 'desc' },
      ],
    },
  },
];

export function findDefaultRule(sportSlug: string): DefaultSportRule | undefined {
  return DEFAULT_SPORT_RULES.find((r) => r.sportSlug === sportSlug);
}
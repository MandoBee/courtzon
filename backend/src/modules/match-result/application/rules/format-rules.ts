import type { SportScoringRules } from '../../domain/match-result.types.js';

/**
 * Group 1 — Shared human-readable Sport Rules formatter.
 *
 * THE single canonical interpretation of a Sport Format + Sport Rule Set for
 * display purposes. The authoritative machine-readable source remains
 * `sport_rule_sets.rules`; this formatter only renders a deterministic,
 * human-readable summary derived from that configuration. It must NEVER
 * hardcode any sport (Padel/Tennis/Football) and must NEVER invent values.
 *
 * One shared capability → one source of truth. The Tournament simply
 * snapshots the output of this formatter into `tournaments.rules`.
 */

export interface SportRulesFormatContext {
  /** Optional Tournament Bracket Type (single-elimination, round-robin, …) —
   *  rendered first so the full Tournament structure reads e.g.
   *  "Single Elimination — Padel Standard — Doubles." */
  bracket?: {
    name?: string | null;
    slug?: string | null;
  } | null;
  /** Sport Format display identity (name, format type, players per side). */
  format?: {
    name?: string | null;
    formatType?: 'singles' | 'doubles' | 'team' | null;
    playersPerSide?: number | null;
    /** Optional format-level human summary — used ONLY as a last resort when
     *  the structured rule set carries no scorable detail. Never treated as
     *  the complete rules source (it is not rule-set-version-specific). */
    description?: string | null;
  } | null;
  /** Optional rule-set identity (shown only when the structured config is
   *  otherwise empty, so output stays deterministic). */
  ruleSet?: { name?: string | null; version?: number | null } | null;
}

const FORMAT_TYPE_LABEL: Record<string, string> = {
  singles: 'Singles',
  doubles: 'Doubles',
  team: 'Team',
};

function teamLabel(playersPerSide: number | null | undefined): string {
  return playersPerSide != null ? `${playersPerSide}v${playersPerSide}` : 'Team';
}

/**
 * Format a `SportScoringRules` object into deterministic human-readable rules.
 *
 * @param rules  Parsed `sport_rule_sets.rules` JSON (may be partial/empty).
 * @param ctx    Format identity used for the header and last-resort fallback.
 * @returns A single readable sentence block. Never throws on missing fields —
 *          it renders every configured property it can and stops.
 */
export function formatSportRules(
  rules: Partial<SportScoringRules> | null | undefined,
  ctx: SportRulesFormatContext = {},
): string {
  const parts: string[] = [];
  const formatName = ctx.format?.name?.trim();
  const formatType = ctx.format?.formatType;
  const playersPerSide = ctx.format?.playersPerSide ?? null;
  const bracketName = ctx.bracket?.name?.trim();

  // Header — deterministic identity, e.g. "Single Elimination — Padel Standard — Doubles."
  const identity: string[] = [];
  if (bracketName) identity.push(bracketName);
  if (formatName) identity.push(formatName);
  if (formatType) {
    identity.push(formatType === 'team' ? teamLabel(playersPerSide) : FORMAT_TYPE_LABEL[formatType] ?? formatType);
  }
  if (identity.length > 0) {
    parts.push(`${identity.join(' — ')}.`);
  }

  if (!rules || typeof rules !== 'object') {
    return finalize(parts, ctx);
  }

  const structure = rules.score_structure;

  if (structure === 'goals') {
    if (rules.match_duration_minutes != null) {
      parts.push(`${rules.match_duration_minutes}-minute match.`);
    }
    if (Array.isArray(rules.halves) && rules.halves.length >= 2 && rules.halves[0] != null && rules.halves[1] != null) {
      parts.push(`Two ${rules.halves[0]}-minute halves.`);
    }
    if (rules.extra_time === true) {
      parts.push('Extra time may be played.');
    }
    if (rules.penalty_shootout === true) {
      parts.push('A penalty shootout may be used.');
    }
    if (typeof rules.draw_allowed === 'boolean') {
      parts.push(rules.draw_allowed ? 'Draws are allowed.' : 'Draws are not allowed.');
    }
  } else if (structure === 'sets' || structure == null) {
    if (rules.best_of != null) {
      parts.push(`Best of ${rules.best_of} sets.`);
    }
    if (rules.sets_to_win != null) {
      parts.push(`First to ${rules.sets_to_win} sets wins the match.`);
    }
    if (rules.first_to != null) {
      if (rules.margin != null) {
        parts.push(`First to ${rules.first_to} games by a ${rules.margin}-game margin.`);
      } else {
        parts.push(`First to ${rules.first_to} games.`);
      }
    }
    if (rules.tiebreak_at != null) {
      const tb = [`Tiebreak at ${rules.tiebreak_at}-${rules.tiebreak_at}`];
      if (rules.tiebreak_first_to != null) {
        const winBy = rules.tiebreak_win_by != null ? ` by ${rules.tiebreak_win_by}` : '';
        tb.push(`first to ${rules.tiebreak_first_to}${winBy}`);
      } else if (rules.tiebreak_win_by != null) {
        tb.push(`win by ${rules.tiebreak_win_by}`);
      }
      parts.push(`${tb.join(', ')}.`);
    }
    if (rules.deuce_rule === 'golden_point') {
      parts.push('Golden point at deuce.');
    } else if (rules.deuce_rule === 'standard') {
      parts.push('Standard deuce.');
    }
    if (typeof rules.draw_allowed === 'boolean') {
      parts.push(rules.draw_allowed ? 'Draws are allowed.' : 'Draws are not allowed.');
    }
  }

  return finalize(parts, ctx);
}

/**
 * Join the collected sentences. When no structured detail could be rendered
 * (missing/unknown configuration), fall back to the format-level description
 * if provided, then to the rule-set identity — never invent numeric values.
 */
function finalize(parts: string[], ctx: SportRulesFormatContext): string {
  const hasDetail = parts.length > (ctx.format?.name ? 1 : 0);
  if (!hasDetail) {
    const fallback = ctx.format?.description?.trim() || ctx.ruleSet?.name?.trim();
    if (fallback) parts.push(fallback);
  }
  return parts.join(' ');
}
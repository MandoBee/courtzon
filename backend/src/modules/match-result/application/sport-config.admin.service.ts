import { withTransaction } from '../../../database/database.transaction.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { recordAudit } from '../../audit-log/index.js';
import type {
  SportFormatAdmin,
  SportRuleSetAdmin,
  SportScoringRules,
  StandingsRules,
} from '../domain/match-result.types.js';
import { matchResultRepository } from '../infrastructure/match-result.repository.js';
import { assertScoringConfiguration, RulesValidationError } from './rules/rules-engine.js';

/**
 * Phase A — Super Admin management of `sport_formats` and `sport_rule_sets`.
 *
 * Rules of engagement (history is immutable):
 *  - A rule-set VERSION referenced by any match/tournament/competition/stage/
 *    result is NEVER mutated or deleted. Changing scoring means creating a new
 *    version and activating it.
 *  - Formats are deactivated, never hard-deleted while referenced.
 *  - Activation enforces a single active version per format. Live resolution
 *    (`findActiveRuleSetForFormat`, ORDER BY version DESC) follows the active
 *    flag; frozen `rules_snapshot`/`rule_snapshot` on existing matches/results
 *    are never touched.
 *
 * Reuse: scoring validation delegates to the shared rules engine
 * (`assertScoringConfiguration`) — the same fail-closed validator the result
 * submission path uses — so management can never persist a config the engine
 * would refuse to score.
 */

export interface FormatWritePayload {
  name?: string;
  formatType?: 'singles' | 'doubles' | 'team';
  playersPerSide?: number | null;
  rosterSize?: number | null;
  description?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface RuleSetWritePayload {
  name?: string | null;
  rules?: Record<string, unknown>;
  standingsRules?: Record<string, unknown> | null;
  isDefault?: boolean;
  isActive?: boolean;
}

const FORMAT_TYPES: ReadonlyArray<'singles' | 'doubles' | 'team'> = ['singles', 'doubles', 'team'];
const TERMINATIONS = new Set(['retired', 'walkover', 'forfeit', 'abandoned']);

function assertPositiveInt(value: unknown, field: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new RulesValidationError(`${field} must be a positive whole number`);
  }
}

/**
 * Structural + canonical validation of a scoring configuration. Throws
 * `RulesValidationError` (mapped to HTTP 422 RULES_VALIDATION by the controller).
 */
export function validateScoringRules(input: unknown): SportScoringRules {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RulesValidationError('rules must be a JSON object');
  }
  const rules = input as Record<string, unknown>;

  if (rules.score_structure !== 'sets' && rules.score_structure !== 'goals') {
    throw new RulesValidationError("rules.score_structure must be either 'sets' or 'goals'");
  }
  if (rules.draw_allowed !== undefined && typeof rules.draw_allowed !== 'boolean') {
    throw new RulesValidationError('rules.draw_allowed must be a boolean');
  }
  if (rules.terminations !== undefined) {
    if (!Array.isArray(rules.terminations)) {
      throw new RulesValidationError('rules.terminations must be an array');
    }
    for (const t of rules.terminations) {
      if (typeof t !== 'string' || !TERMINATIONS.has(t)) {
        throw new RulesValidationError(`Unsupported termination "${String(t)}"`);
      }
    }
  }

  if (rules.score_structure === 'sets') {
    if (rules.best_of !== undefined) assertPositiveInt(rules.best_of, 'rules.best_of');
    if (rules.sets_to_win !== undefined) assertPositiveInt(rules.sets_to_win, 'rules.sets_to_win');
    if (rules.first_to !== undefined) assertPositiveInt(rules.first_to, 'rules.first_to');
    if (rules.margin !== undefined) assertPositiveInt(rules.margin, 'rules.margin');
    if (rules.tiebreak_at != null) assertPositiveInt(rules.tiebreak_at, 'rules.tiebreak_at');
    if (rules.tiebreak_first_to != null) assertPositiveInt(rules.tiebreak_first_to, 'rules.tiebreak_first_to');
    if (rules.tiebreak_win_by != null) assertPositiveInt(rules.tiebreak_win_by, 'rules.tiebreak_win_by');
    if (rules.sets_to_win != null && rules.best_of != null && Number(rules.sets_to_win) > Number(rules.best_of)) {
      throw new RulesValidationError('rules.sets_to_win cannot exceed rules.best_of');
    }
  } else {
    if (rules.match_duration_minutes !== undefined) assertPositiveInt(rules.match_duration_minutes, 'rules.match_duration_minutes');
    if (rules.halves !== undefined) {
      if (
        !Array.isArray(rules.halves) ||
        rules.halves.some((h) => typeof h !== 'number' || !Number.isInteger(h) || h <= 0)
      ) {
        throw new RulesValidationError('rules.halves must be an array of positive whole numbers');
      }
    }
  }

  // Shared fail-closed validator (deuce_rule, tiebreak resolution, set targets).
  const normalized = rules as unknown as SportScoringRules;
  assertScoringConfiguration(normalized);
  return normalized;
}

export function validateStandingsRules(input: unknown): StandingsRules {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RulesValidationError('standingsRules must be a JSON object');
  }
  const sr = input as Record<string, unknown>;
  const points = sr.points as Record<string, unknown> | undefined;
  if (!points || typeof points !== 'object' || Array.isArray(points)) {
    throw new RulesValidationError('standingsRules.points is required');
  }
  for (const key of ['win', 'draw', 'loss'] as const) {
    if (typeof points[key] !== 'number' || !Number.isFinite(points[key] as number)) {
      throw new RulesValidationError(`standingsRules.points.${key} must be a number`);
    }
  }
  if (sr.tiebreakers !== undefined) {
    if (!Array.isArray(sr.tiebreakers)) {
      throw new RulesValidationError('standingsRules.tiebreakers must be an array');
    }
    for (const entry of sr.tiebreakers) {
      const e = entry as Record<string, unknown>;
      if (!e || typeof e !== 'object' || typeof e.field !== 'string' || (e.direction !== 'asc' && e.direction !== 'desc')) {
        throw new RulesValidationError('Each standingsRules.tiebreakers entry requires { field, direction: "asc" | "desc" }');
      }
    }
  }
  return sr as unknown as StandingsRules;
}

function validateFormatPayload(payload: FormatWritePayload, opts: { requireCore: boolean }): void {
  if (opts.requireCore) {
    if (!payload.name || payload.name.trim().length === 0) throw new ValidationError('name is required');
    if (!payload.formatType || !FORMAT_TYPES.includes(payload.formatType)) {
      throw new ValidationError(`format_type must be one of: ${FORMAT_TYPES.join(', ')}`);
    }
  }
  if (payload.formatType !== undefined && !FORMAT_TYPES.includes(payload.formatType)) {
    throw new ValidationError(`format_type must be one of: ${FORMAT_TYPES.join(', ')}`);
  }
  if (payload.playersPerSide != null && (!Number.isInteger(payload.playersPerSide) || payload.playersPerSide < 1)) {
    throw new ValidationError('players_per_side must be a positive whole number');
  }
  if (payload.rosterSize != null && (!Number.isInteger(payload.rosterSize) || payload.rosterSize < 1)) {
    throw new ValidationError('roster_size must be a positive whole number');
  }
  if (payload.rosterSize != null && payload.playersPerSide != null && payload.rosterSize < payload.playersPerSide) {
    throw new ValidationError('roster_size cannot be smaller than players_per_side');
  }
  if (payload.formatType === 'singles' && payload.playersPerSide != null && payload.playersPerSide !== 1) {
    throw new ValidationError('A singles format must have players_per_side = 1');
  }
  if (payload.formatType === 'doubles' && payload.playersPerSide != null && payload.playersPerSide !== 2) {
    throw new ValidationError('A doubles format must have players_per_side = 2');
  }
}

export class SportConfigAdminService {
  async listFormats(sportId?: number): Promise<SportFormatAdmin[]> {
    return matchResultRepository.listAdminFormats(sportId);
  }

  async getFormatDetail(formatId: number): Promise<SportFormatAdmin & { ruleSets: SportRuleSetAdmin[] }> {
    const format = await matchResultRepository.findAdminFormatById(formatId);
    if (!format) throw new NotFoundError('Sport format');
    const ruleSets = await matchResultRepository.listRuleSetsAdmin(formatId);
    return { ...format, ruleSets };
  }

  async createFormat(
    sportId: number,
    payload: FormatWritePayload & { slug: string; name: string; formatType: 'singles' | 'doubles' | 'team' },
    actorId: number,
  ): Promise<SportFormatAdmin> {
    if (!(await matchResultRepository.sportExists(sportId))) throw new NotFoundError('Sport');
    validateFormatPayload(payload, { requireCore: true });
    const existing = await matchResultRepository.findFormatBySportAndSlug(sportId, payload.slug);
    if (existing) throw new ConflictError(`A format with the slug "${payload.slug}" already exists for this sport`, ErrorCodes.SPORT_FORMAT_DUPLICATE);

    const createdId = await withTransaction(async (conn) => {
      if (payload.isDefault) await matchResultRepository.unsetFormatDefaults(sportId, -1, conn);
      return matchResultRepository.createFormat(
        {
          sportId,
          slug: payload.slug,
          name: payload.name,
          formatType: payload.formatType,
          playersPerSide: payload.playersPerSide ?? null,
          rosterSize: payload.rosterSize ?? null,
          description: payload.description ?? null,
          isDefault: payload.isDefault === true,
          isActive: payload.isActive !== false,
          createdBy: actorId,
        },
        conn,
      );
    });

    const created = await matchResultRepository.findAdminFormatById(createdId);
    await recordAudit({
      actorId,
      action: 'sport_format.created',
      entityType: 'sport_formats',
      entityId: createdId,
      afterState: created as unknown as Record<string, unknown>,
    });
    return created!;
  }

  async updateFormat(formatId: number, payload: FormatWritePayload, actorId: number): Promise<SportFormatAdmin> {
    const before = await matchResultRepository.findAdminFormatById(formatId);
    if (!before) throw new NotFoundError('Sport format');
    validateFormatPayload(payload, { requireCore: false });

    await withTransaction(async (conn) => {
      if (payload.isDefault === true) {
        await matchResultRepository.unsetFormatDefaults(before.sportId, formatId, conn);
      }
      await matchResultRepository.updateFormat(formatId, payload, conn);
    });

    const after = await matchResultRepository.findAdminFormatById(formatId);
    await recordAudit({
      actorId,
      action: 'sport_format.updated',
      entityType: 'sport_formats',
      entityId: formatId,
      beforeState: before as unknown as Record<string, unknown>,
      afterState: after as unknown as Record<string, unknown>,
    });
    return after!;
  }

  async deleteFormat(formatId: number, actorId: number): Promise<void> {
    const format = await matchResultRepository.findAdminFormatById(formatId);
    if (!format) throw new NotFoundError('Sport format');
    if (format.referenceCount > 0) {
      throw new ConflictError(
        'This format (or one of its rule-set versions) is referenced by existing matches, tournaments or results and cannot be deleted. Deactivate it instead.',
        ErrorCodes.SPORT_FORMAT_IN_USE,
      );
    }
    await matchResultRepository.deleteFormat(formatId);
    await recordAudit({
      actorId,
      action: 'sport_format.deleted',
      entityType: 'sport_formats',
      entityId: formatId,
      beforeState: format as unknown as Record<string, unknown>,
    });
  }

  async listRuleSets(formatId: number): Promise<SportRuleSetAdmin[]> {
    const format = await matchResultRepository.findAdminFormatById(formatId);
    if (!format) throw new NotFoundError('Sport format');
    return matchResultRepository.listRuleSetsAdmin(formatId);
  }

  async getRuleSet(ruleSetId: number): Promise<SportRuleSetAdmin> {
    const ruleSet = await matchResultRepository.findRuleSetAdminById(ruleSetId);
    if (!ruleSet) throw new NotFoundError('Sport rule set');
    return ruleSet;
  }

  /**
   * Create a new immutable rule-set version. Safe default: the FIRST version of
   * a format auto-activates (so live resolution never breaks); every later
   * version is a draft that requires explicit activation. Callers may override
   * with `isActive`.
   */
  async createRuleSet(formatId: number, payload: RuleSetWritePayload & { rules: Record<string, unknown> }, actorId: number): Promise<SportRuleSetAdmin> {
    const format = await matchResultRepository.findAdminFormatById(formatId);
    if (!format) throw new NotFoundError('Sport format');

    const rules = validateScoringRules(payload.rules);
    const standingsRules = payload.standingsRules != null ? validateStandingsRules(payload.standingsRules) : null;

    const createdId = await withTransaction(async (conn) => {
      const hasActive = await matchResultRepository.hasActiveRuleSet(formatId, conn);
      const shouldActivate = payload.isActive !== undefined ? payload.isActive : !hasActive;

      if (payload.isDefault) await matchResultRepository.unsetRuleSetDefaults(formatId, -1, conn);

      const id = await matchResultRepository.createRuleSetVersion(
        {
          formatId,
          name: payload.name ?? null,
          rules,
          standingsRules,
          isDefault: payload.isDefault === true,
          createdBy: actorId,
        },
        conn,
      );
      if (shouldActivate) await matchResultRepository.setRuleSetActive(formatId, id, true, conn);
      return id;
    });

    const created = await matchResultRepository.findRuleSetAdminById(createdId);
    await recordAudit({
      actorId,
      action: 'sport_rule_set.created',
      entityType: 'sport_rule_sets',
      entityId: createdId,
      afterState: created as unknown as Record<string, unknown>,
    });
    return created!;
  }

  /**
   * Update a rule-set version. Metadata (name/is_default/is_active) is always
   * editable; the scoring payload (`rules`/`standingsRules`) is ONLY editable
   * while the version is unreferenced by history — otherwise 409 and the caller
   * must create a new version.
   */
  async updateRuleSet(ruleSetId: number, payload: RuleSetWritePayload, actorId: number): Promise<SportRuleSetAdmin> {
    const before = await matchResultRepository.findRuleSetAdminById(ruleSetId);
    if (!before) throw new NotFoundError('Sport rule set');

    const touchesScoring = payload.rules !== undefined || payload.standingsRules !== undefined;
    if (touchesScoring && before.referenceCount > 0) {
      throw new ConflictError(
        'This rule-set version is referenced by historical data and cannot be modified. Create a new version instead.',
        ErrorCodes.SPORT_RULE_SET_IN_USE,
      );
    }

    const rules = payload.rules !== undefined ? validateScoringRules(payload.rules) : undefined;
    const standingsRules =
      payload.standingsRules !== undefined
        ? payload.standingsRules === null
          ? null
          : validateStandingsRules(payload.standingsRules)
        : undefined;

    await withTransaction(async (conn) => {
      if (payload.isDefault === true) {
        await matchResultRepository.unsetRuleSetDefaults(before.formatId, ruleSetId, conn);
      }
      await matchResultRepository.updateRuleSet(
        ruleSetId,
        {
          name: payload.name,
          rules,
          standingsRules,
          isDefault: payload.isDefault,
        },
        conn,
      );
      if (payload.isActive === true) await matchResultRepository.setRuleSetActive(before.formatId, ruleSetId, true, conn);
      else if (payload.isActive === false) await matchResultRepository.setRuleSetActive(before.formatId, ruleSetId, false, conn);
    });

    const after = await matchResultRepository.findRuleSetAdminById(ruleSetId);
    await recordAudit({
      actorId,
      action: 'sport_rule_set.updated',
      entityType: 'sport_rule_sets',
      entityId: ruleSetId,
      beforeState: before as unknown as Record<string, unknown>,
      afterState: after as unknown as Record<string, unknown>,
    });
    return after!;
  }

  async activateRuleSet(ruleSetId: number, actorId: number): Promise<SportRuleSetAdmin> {
    const ruleSet = await matchResultRepository.findRuleSetAdminById(ruleSetId);
    if (!ruleSet) throw new NotFoundError('Sport rule set');
    await withTransaction((conn) => matchResultRepository.setRuleSetActive(ruleSet.formatId, ruleSetId, true, conn));
    const after = await matchResultRepository.findRuleSetAdminById(ruleSetId);
    await recordAudit({
      actorId,
      action: 'sport_rule_set.activated',
      entityType: 'sport_rule_sets',
      entityId: ruleSetId,
      beforeState: ruleSet as unknown as Record<string, unknown>,
      afterState: after as unknown as Record<string, unknown>,
    });
    return after!;
  }

  async deactivateRuleSet(ruleSetId: number, actorId: number): Promise<SportRuleSetAdmin> {
    const ruleSet = await matchResultRepository.findRuleSetAdminById(ruleSetId);
    if (!ruleSet) throw new NotFoundError('Sport rule set');
    await withTransaction((conn) => matchResultRepository.setRuleSetActive(ruleSet.formatId, ruleSetId, false, conn));
    const after = await matchResultRepository.findRuleSetAdminById(ruleSetId);
    await recordAudit({
      actorId,
      action: 'sport_rule_set.deactivated',
      entityType: 'sport_rule_sets',
      entityId: ruleSetId,
      beforeState: ruleSet as unknown as Record<string, unknown>,
      afterState: after as unknown as Record<string, unknown>,
    });
    return after!;
  }
}

export const sportConfigAdminService = new SportConfigAdminService();

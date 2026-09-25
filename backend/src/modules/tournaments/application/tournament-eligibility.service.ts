import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { normalizeEligibility } from '../domain/tournament-eligibility.js';
import type {
  Tournament,
  TournamentAgeCategory,
  TournamentGenderCategory,
} from '../domain/tournament-aggregate.js';

type Executor = mysql.Pool | mysql.PoolConnection;
type RowData = mysql.RowDataPacket[];

/**
 * Group 7-B — server-authoritative Tournament Eligibility Service.
 *
 * SINGLE SOURCE OF TRUTH for tournament registration eligibility
 * (age / gender / level). No controller/service duplicates this logic.
 *
 * PROTECTED AGE RULE (year only):
 *   Tournament Age = YEAR(tournaments.start_date) − YEAR(users.birth_date)
 * Never month/day, never "as of today", never registration/deadline based.
 */
export type EligibilityViolationCode =
  | 'AGE_NOT_ELIGIBLE'
  | 'GENDER_NOT_ELIGIBLE'
  | 'LEVEL_NOT_ELIGIBLE'
  | 'MISSING_BIRTH_DATE'
  | 'MISSING_PLAYER_LEVEL'
  | 'INVALID_AGE_CATEGORIES'
  | 'ELIGIBILITY_LOCKED';

export interface EligibilityViolationReason {
  code: EligibilityViolationCode;
  params?: Record<string, unknown>;
}

/**
 * Frozen, historical eligibility record — enough to reconstruct the decision
 * made at registration time without storing full user profiles.
 */
export interface PlayerEligibilitySnapshot {
  userId: number;
  tournamentYear: number;
  calculatedAge: number | null;
  birthYear: number | null;
  matchedAgeCategoryIds: number[];
  tournamentAgeMode: 'open' | 'categories' | null;
  tournamentGenderCategories: TournamentGenderCategory[];
  playerGender: string | null;
  tournamentLevelIds: number[];
  playerLevelId: number | null;
  eligible: boolean;
  bypassed: boolean;
  bypassReason?: string;
  evaluatedAt: string;
  reasons: EligibilityViolationReason[];
}

export interface MemberEligibilityResult {
  userId: number;
  eligible: boolean;
  reasons: EligibilityViolationReason[];
  snapshot: PlayerEligibilitySnapshot;
}

export interface EligibilityEvaluation {
  eligible: boolean;
  members: MemberEligibilityResult[];
}

export interface RegistrationEligibilitySnapshot {
  eligible: boolean;
  bypassed: boolean;
  bypassReason?: string;
  members: PlayerEligibilitySnapshot[];
}

interface PlayerRow {
  id: number;
  gender: string | null;
  birth_date: string | null;
}

/** Pure evaluation context (testable without a database). */
export interface EligibilityContext {
  tournamentYear: number;
  ageMode: 'open' | 'categories' | null;
  ageCategoryIds: number[];
  categories: TournamentAgeCategory[];
  genderCategories: TournamentGenderCategory[];
  levelIds: number[];
}

export interface PlayerEligibilityInput {
  gender: string | null;
  birthYear: number | null;
}

/** Youth XOR masters — never both in one tournament (server-authoritative). */
export function assertSingleAgeCategoryFamily(categories: TournamentAgeCategory[]): void {
  const families = new Set(categories.map((c) => c.type));
  if (families.size > 1) {
    throw new AppError(
      'A tournament may select youth OR masters age categories, never both',
      422,
      'INVALID_AGE_CATEGORIES',
    );
  }
}

/**
 * Pure, side-effect-free evaluation for ONE player. YEAR-only age formula:
 * Tournament Age = tournamentYear − birthYear.
 */
export function evaluateEligibilitySync(
  userId: number,
  player: PlayerEligibilityInput | undefined,
  playerLevelId: number | null,
  ctx: EligibilityContext,
): MemberEligibilityResult {
  const reasons: EligibilityViolationReason[] = [];
  const evaluatedAt = new Date().toISOString();

  const birthYear = player?.birthYear ?? null;
  const calculatedAge = birthYear != null ? ctx.tournamentYear - birthYear : null;

  // ── AGE ────────────────────────────────────────────────────────────────
  let matchedAgeCategoryIds: number[] = [];
  if (ctx.ageMode === 'categories') {
    if (birthYear == null) {
      reasons.push({ code: 'MISSING_BIRTH_DATE', params: { userId } });
    } else if (calculatedAge == null) {
      reasons.push({ code: 'AGE_NOT_ELIGIBLE', params: { userId } });
    } else {
      matchedAgeCategoryIds = ctx.categories
        .filter((c) => (c.type === 'youth' ? calculatedAge! <= (c.max_age ?? Infinity) : calculatedAge! >= (c.min_age ?? -Infinity)))
        .map((c) => c.id);
      if (matchedAgeCategoryIds.length === 0) {
        reasons.push({ code: 'AGE_NOT_ELIGIBLE', params: { userId, tournamentYear: ctx.tournamentYear, birthYear } });
      }
    }
  }
  // ageMode 'open' (or legacy null) ⇒ no age restriction.

  // ── GENDER ─────────────────────────────────────────────────────────────
  const genderCategories = ctx.genderCategories ?? [];
  if (genderCategories.length > 0) {
    const playerGender = player?.gender ?? null;
    const genderOk =
      playerGender != null && (genderCategories.includes('mixed') || genderCategories.includes(playerGender as TournamentGenderCategory));
    if (!genderOk) {
      reasons.push({ code: 'GENDER_NOT_ELIGIBLE', params: { userId, playerGender } });
    }
  }

  // ── LEVEL ──────────────────────────────────────────────────────────────
  const levelIds = ctx.levelIds ?? [];
  if (levelIds.length > 0) {
    if (playerLevelId == null) {
      reasons.push({ code: 'MISSING_PLAYER_LEVEL', params: { userId } });
    } else if (!levelIds.includes(playerLevelId)) {
      reasons.push({ code: 'LEVEL_NOT_ELIGIBLE', params: { userId, playerLevelId } });
    }
  }

  const eligible = reasons.length === 0;
  const snapshot: PlayerEligibilitySnapshot = {
    userId,
    tournamentYear: ctx.tournamentYear,
    calculatedAge,
    birthYear,
    matchedAgeCategoryIds,
    tournamentAgeMode: ctx.ageMode ?? 'open',
    tournamentGenderCategories: genderCategories,
    playerGender: player?.gender ?? null,
    tournamentLevelIds: levelIds,
    playerLevelId,
    eligible,
    bypassed: false,
    evaluatedAt,
    reasons,
  };

  return { userId, eligible, reasons, snapshot };
}

/** Frozen registration snapshot from a successful evaluation. */
export function buildRegistrationSnapshot(
  evaluation: EligibilityEvaluation,
  opts: { bypassed?: boolean; bypassReason?: string } = {},
): RegistrationEligibilitySnapshot {
  return {
    eligible: evaluation.eligible,
    bypassed: Boolean(opts.bypassed) && !evaluation.eligible,
    ...(opts.bypassed && !evaluation.eligible ? { bypassReason: opts.bypassReason ?? 'operator registration' } : {}),
    members: evaluation.members.map((m) => m.snapshot),
  };
}

export class TournamentEligibilityService {
  /** YEAR-only reference year from the authoritative tournament start date. */
  private tournamentYear(t: Tournament): number {
    const start = String(t.start_date ?? '');
    const year = Number(start.slice(0, 4));
    return Number.isFinite(year) && year > 0 ? year : Number(new Date().getUTCFullYear());
  }

  /**
   * Evaluate every player in ONE pass (batched reads — no N+1).
   * Returns per-member structured results plus the unified eligibility flag.
   */
  async evaluatePlayers(
    t: Tournament,
    userIds: readonly number[],
    opts: { conn?: Executor } = {},
  ): Promise<EligibilityEvaluation> {
    const db = opts.conn ?? getPool();
    const eligibility = normalizeEligibility(t);
    const tournamentYear = this.tournamentYear(t);
    const members: MemberEligibilityResult[] = [];
    const uniqueIds = [...new Set(userIds.map((id) => Number(id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (uniqueIds.length === 0) {
      return { eligible: true, members };
    }

    // Age category reference data (one family only — youth XOR masters, enforced).
    let categories: TournamentAgeCategory[] = [];
    if (eligibility.ageMode === 'categories') {
      if (!Array.isArray(eligibility.ageCategoryIds) || eligibility.ageCategoryIds.length === 0) {
        throw new AppError(
          'Tournament age_mode is categories but no age categories are selected',
          422,
          'INVALID_AGE_CATEGORIES',
        );
      }
      const [catRows] = await db.query<RowData>(
        'SELECT * FROM tournament_age_categories WHERE id IN (?)',
        [eligibility.ageCategoryIds],
      );
      categories = (catRows as Record<string, unknown>[]).map((c) => ({
        id: Number(c.id),
        slug: String(c.slug),
        type: c.type as TournamentAgeCategory['type'],
        min_age: c.min_age != null ? Number(c.min_age) : null,
        max_age: c.max_age != null ? Number(c.max_age) : null,
        label_en: String(c.label_en),
        label_ar: String(c.label_ar),
        is_active: Number(c.is_active),
      }));
      assertSingleAgeCategoryFamily(categories);
    }

    // Batch-load authoritative player data (users.gender + birth_date, profile level).
    const [userRows] = await db.query<RowData>(
      'SELECT id, gender, birth_date FROM users WHERE id IN (?) AND deleted_at IS NULL',
      [uniqueIds],
    );
    const usersById = new Map<number, PlayerRow>();
    for (const row of userRows as Record<string, unknown>[]) {
      usersById.set(Number(row.id), {
        id: Number(row.id),
        gender: row.gender != null ? String(row.gender) : null,
        birth_date: row.birth_date != null ? String(row.birth_date) : null,
      });
    }

    const [profileRows] = await db.query<RowData>(
      'SELECT user_id, main_level_id FROM player_profiles WHERE user_id IN (?)',
      [uniqueIds],
    );
    const profileLevelById = new Map<number, number | null>();
    for (const row of profileRows as Record<string, unknown>[]) {
      profileLevelById.set(Number(row.user_id), row.main_level_id != null ? Number(row.main_level_id) : null);
    }

    for (const userId of uniqueIds) {
      members.push(this.evaluateMember(userId, usersById.get(userId), profileLevelById.get(userId) ?? null, {
        tournamentYear,
        ageMode: eligibility.ageMode,
        ageCategoryIds: eligibility.ageCategoryIds,
        categories,
        genderCategories: eligibility.genderCategories,
        levelIds: eligibility.levelIds,
      }));
    }

    return { eligible: members.every((m) => m.eligible), members };
  }

  private evaluateMember(
    userId: number,
    player: PlayerRow | undefined,
    playerLevelId: number | null,
    ctx: {
      tournamentYear: number;
      ageMode: 'open' | 'categories' | null;
      ageCategoryIds: number[];
      categories: TournamentAgeCategory[];
      genderCategories: TournamentGenderCategory[];
      levelIds: number[];
    },
  ): MemberEligibilityResult {
    return evaluateEligibilitySync(
      userId,
      player
        ? {
            gender: player.gender,
            birthYear: player.birth_date ? Number(String(player.birth_date).slice(0, 4)) : null,
          }
        : undefined,
      playerLevelId,
      ctx,
    );
  }

  /**
   * Structured 422 when any member is ineligible (operator/admin bypass
   * allowed ONLY when explicitly authorized at the caller).
   */
  async assertCanRegister(
    t: Tournament,
    userIds: readonly number[],
    opts: { conn?: Executor; allowBypass?: boolean; bypassReason?: string } = {},
  ): Promise<{ evaluation: EligibilityEvaluation; snapshot: RegistrationEligibilitySnapshot }> {
    const evaluation = await this.evaluatePlayers(t, userIds, { conn: opts.conn });
    const bypassed = Boolean(opts.allowBypass) && !evaluation.eligible;
    const snapshot = buildRegistrationSnapshot(evaluation, { bypassed, bypassReason: opts.bypassReason });

    if (!evaluation.eligible && !opts.allowBypass) {
      const failing = evaluation.members
        .filter((m) => !m.eligible)
        .map((m) => ({ userId: m.userId, reasons: m.reasons }));
      const firstReason = failing[0]?.reasons[0]?.code ?? 'LEVEL_NOT_ELIGIBLE';
      throw new AppError('Player is not eligible for this tournament', 422, firstReason, { details: { members: failing } });
    }

    return { evaluation, snapshot };
  }
}

export const tournamentEligibilityService = new TournamentEligibilityService();
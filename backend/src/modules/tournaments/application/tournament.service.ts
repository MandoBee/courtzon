import { tournamentRepository, type BracketTypeRow } from '../infrastructure/repositories/tournament.repository.js';
import { participantDrawRepository } from '../infrastructure/repositories/participant-draw.repository.js';
import { generateKnockoutBracket, generateRoundRobinMatches, generateStageMatches, normaliseBracketTargets, seededShuffle, type BracketSlot } from '../domain/tournament-aggregate.js';
import type { Tournament, TournamentRegistration, TournamentMatch, TournamentStage, TournamentPrizeInput, TournamentPrizeType, TournamentVenue } from '../domain/tournament-aggregate.js';
import { validateTournamentTransition, validateRegistrationTransition } from '../domain/lifecycle.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import { matchResultRepository } from '../../match-result/infrastructure/match-result.repository.js';
import { formatSportRules } from '../../match-result/application/rules/format-rules.js';
import type { MatchFormatSnapshot } from '../../match/domain/match.types.js';
import type { RawMatchResultPayload } from '../../match-result/domain/match-result.types.js';
import { getCommissionRate } from '../../organisations/application/current-subscription.service.js';
import { resolveOrganisationCurrency } from '../../organisations/application/organisation-currency.service.js';
import { branchRepository } from '../../organisations/infrastructure/repositories/branch.repository.js';
import { isPaymentMethodAllowedInContext } from '../../../shared/constants/payment-methods.js';

/**
 * Group 3 — canonical, deterministic order for the Tournament registration
 * payment-method allowlist. Valid configurations are ['cash'], ['card'],
 * ['cash','card'] (cash before card). Wallet is NEVER valid — CourtZon's
 * global payment policy has Wallet disabled as a payment method (refund-only).
 */
export const REGISTRATION_PAYMENT_METHODS_ORDER = ['cash', 'card'] as const;
export type RegistrationPaymentMethod = (typeof REGISTRATION_PAYMENT_METHODS_ORDER)[number];

/** Group 3 — the backward-compatible default when no per-tournament config exists. */
export const DEFAULT_REGISTRATION_PAYMENT_METHODS: string[] = ['cash', 'card'];

/** Group 5B — draw-time provenance persisted in `tournament_matches.progression_meta`. */
export interface BracketProgressionMeta {
  /** Bracket-family slot (knockout wiring applies) vs round-robin/group row. */
  is_bracket: boolean;
  /** True for draw-time padding slots that receive no opponent (round 1). */
  bye?: boolean;
  /** Where this slot's winner advances (KO only; null = final round). */
  target_round?: number | null;
  target_bracket_position?: number | null;
  /** Which participant this slot's winner fills on the target slot. */
  target_side?: 'player1' | 'player2';
}

/** Group 5B — tournament lifecycle steps a deterministic draw walks forward to 'running'. */
const DRAW_LIFECYCLE_ORDER = ['draft', 'published', 'registration_open', 'registration_closed', 'running'];

/**
 * Group 5B-SR — engine-capable bracket types. The Group 5B progression engine
 * fully supports Single Elimination (knockout) and Round Robin; Double
 * Elimination and Swiss System are configuration-visible but DEFERRED (their
 * config_schema is preserved, but the engine cannot safely generate them yet).
 */
export const ENGINE_SUPPORTED_BRACKET_SLUGS = ['single-elimination', 'round-robin'] as const;

export class TournamentService {
  async create(data: Partial<Tournament>, creatorId: number): Promise<Tournament> {
    if (data.code) {
      const existing = await tournamentRepository.findByCode(data.code);
      if (existing) throw new ConflictError('Tournament code already exists', ErrorCodes.ACADEMY_PROGRAM_CODE_EXISTS);
    }
    // Group 5A — a tournament that declares a Match Format but no Rule Set, or
    // vice versa, is rejected at creation: generated Matches must freeze both.
    if ((data.match_format_id == null) !== (data.rule_set_id == null)) {
      throw new ConflictError('Tournament must configure both a Match Format and a Rule Set, or neither', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
    if (data.match_format_id != null && data.rule_set_id != null) {
      await this.assertMatchFormatRuleSetPair(data.match_format_id, data.rule_set_id);
      await this.assertFormatBelongsToSport(data.sport_id, data.match_format_id);
    }
    // Group 5B-SR — the selected bracket type must exist, be active, and be
    // actually supported by the current engine. Deferred types (double
    // elimination, swiss) are config-visible but unavailable for creation.
    await this.assertBracketTypeAvailable(data.bracket_type_id);
    // Group 5B-SR — commission is derived from the organisation's authoritative
    // active subscription/plan. The client can never supply it.
    const commissionRate = await this.resolveCommissionRate(data.organisation_id, data.entry_fee);
    // Group 1A — an organisation-owned tournament must NEVER be stored as
    // `platform`. The client can never turn an org tournament into a platform
    // tournament: when organisation_id is present we derive the correct
    // non-platform type (`community`) unless the caller explicitly supplied it.
    const effectiveType = this.deriveOrgTournamentType(data.organisation_id, data.tournament_type);
    // Group 1A — authoritative currency is resolved server-side for
    // organisation tournaments (branch currency → organisation country
    // default). A client-supplied currency_code is never trusted as
    // authoritative for an org-owned tournament.
    const effectiveData = { ...data };
    if (data.organisation_id != null) {
      const resolvedCurrency = await resolveOrganisationCurrency(data.organisation_id, data.branch_id);
      if (resolvedCurrency) effectiveData.currency_code = resolvedCurrency;
    }
    // Group 2 — validate + normalise structured prizes against the authoritative
    // tournament currency BEFORE persisting anything.
    const prizes = data.prizes ? this.normalisePrizes(data.prizes, effectiveData.currency_code) : [];
    // Group 3 — the allowed registration payment methods are normalised
    // (validated + deduped + deterministic order) server-side. Missing config
    // falls back to both methods (backward-compatible default) — an existing
    // flow must never become unpayable.
    effectiveData.registration_payment_methods = this.normaliseRegistrationPaymentMethods(data.registration_payment_methods);
    // Group 4 — validate + normalise the schedule configuration (registration
    // deadline before start date, daily playing window + branch operating
    // hours) BEFORE persisting anything.
    await this.normaliseSchedule(effectiveData);
    // Deterministic draw seed: default to creation timestamp (stable, not random).
    const drawSeed = data.draw_seed ?? Date.now();
    // Group 1 — the human-readable Tournament Rules snapshot is ALWAYS derived
    // server-side from the authoritative Bracket Type + Match Format + Rule Set
    // (explicit, or the sport's default resolution). A client-supplied `rules`
    // string is never trusted as authoritative. When no valid format/rule-set
    // can be resolved, the rules stay empty rather than inventing a value.
    const rulesSnapshot = await this.resolveRulesSnapshot(effectiveData.sport_id, effectiveData.match_format_id, effectiveData.rule_set_id, effectiveData.bracket_type_id);
    const id = await tournamentRepository.create({
      ...effectiveData, creator_id: creatorId, draw_seed: drawSeed, commission_rate: commissionRate,
      tournament_type: effectiveType,
      rules: rulesSnapshot ?? undefined,
    });
    if (prizes.length > 0) {
      await tournamentRepository.replacePrizes(id, prizes);
    }
    const tournament = await tournamentRepository.findById(id);
    eventBusV2.emit('tournament.created', { tournamentId: id, name: data.name, format: data.format } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(id), aggregateVersion: 1,
    });
    return tournament!;
  }

  /**
   * Group 2 — validate + normalise a structured prize list against the
   * authoritative tournament currency. Rules:
   *  * prize_type must be a supported type (DTO already enforces the enum).
   *  * cash prizes REQUIRE an amount (> 0) and MUST use the authoritative
   *    tournament currency — a mismatched currency is rejected, and an omitted
   *    currency is filled with the authoritative one. Never hardcoded.
   *  * non-cash prizes must NOT carry amount or currency (both are normalised
   *    to null) — no accidental monetary/currency contamination.
   *  * placement: nullable positive int (NULL = special/non-ranked prize).
   *  * display_order is deterministic (array index) unless explicitly supplied.
   */
  private normalisePrizes(prizes: TournamentPrizeInput[], authoritativeCurrency?: string): TournamentPrizeInput[] {
    return prizes.map((p, i) => {
      const prizeType = p.prize_type as TournamentPrizeType;
      if (prizeType === 'cash') {
        const amount = p.amount;
        if (amount == null || amount <= 0) {
          throw new ConflictError('Cash prize requires a positive amount', ErrorCodes.TOURNAMENT_INVALID_PRIZE);
        }
        if (p.currency_code != null && authoritativeCurrency != null && p.currency_code !== authoritativeCurrency) {
          throw new ConflictError(
            `Cash prize currency ${p.currency_code} does not match the tournament currency ${authoritativeCurrency}`,
            ErrorCodes.TOURNAMENT_INVALID_PRIZE,
          );
        }
        return {
          placement: p.placement ?? null,
          prize_type: prizeType,
          description: p.description ?? null,
          amount,
          currency_code: authoritativeCurrency ?? p.currency_code ?? null,
          display_order: p.display_order ?? i,
        };
      }
      return {
        placement: p.placement ?? null,
        prize_type: prizeType,
        description: p.description ?? null,
        amount: null,
        currency_code: null,
        display_order: p.display_order ?? i,
      };
    });
  }

  /**
   * Group 1A — derive the correct tournament_type for an organisation-owned
   * tournament. `platform` is reserved for platform-owned tournaments
   * (organisation_id NULL). An org-owned tournament is stored as `community`
   * (the existing non-platform enum value) — the client can never turn an org
   * tournament into a `platform` tournament.
   */
  private deriveOrgTournamentType(organisationId: number | undefined, suppliedType: string | undefined): string {
    if (organisationId == null) return suppliedType ?? 'platform';
    return 'community';
  }

  /**
   * Group 3 — validate + normalise the Tournament registration payment-method
   * allowlist. Rules:
   *   * each method must be one of {cash, card} — anything else (wallet,
   *     bank_transfer, e-wallet, unknown strings) is rejected server-side.
   *   * the list must not be empty (a Tournament cannot be unpayable).
   *   * duplicates are collapsed and order is normalised deterministically
   *     (cash before card), regardless of the storage format.
   *   * undefined/null → backward-compatible default ['cash','card'].
   */
  private normaliseRegistrationPaymentMethods(methods?: string[] | string | null): string[] {
    if (methods == null) return [...DEFAULT_REGISTRATION_PAYMENT_METHODS];
    let arr: unknown[] = Array.isArray(methods) ? methods : [];
    if (typeof methods === 'string' && methods.trim()) {
      try {
        const parsed = JSON.parse(methods);
        if (Array.isArray(parsed)) arr = parsed;
      } catch {
        arr = [methods.trim()];
      }
    }
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new ConflictError(
        'At least one registration payment method is required (cash and/or card)',
        ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD,
      );
    }
    const selected = new Set<string>();
    for (const m of arr) {
      const s = String(m).trim().toLowerCase();
      if (s !== 'cash' && s !== 'card') {
        throw new ConflictError(
          `Unsupported registration payment method "${m}" — only cash and card are accepted`,
          ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD,
        );
      }
      selected.add(s);
    }
    return REGISTRATION_PAYMENT_METHODS_ORDER.filter((m) => selected.has(m));
  }

  /**
   * Group 3 — read the persisted allowlist (JSON string, array or legacy NULL)
   * into a normalised array. Invalid persisted payloads fail safe to the
   * backward-compatible default rather than making the Tournament unpayable.
   */
  private readRegistrationPaymentMethods(raw?: string | string[] | null): string[] {
    if (Array.isArray(raw)) return this.normaliseRegistrationPaymentMethods(raw);
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return this.normaliseRegistrationPaymentMethods(parsed);
      } catch {
        // fall through to default
      }
    }
    return [...DEFAULT_REGISTRATION_PAYMENT_METHODS];
  }

  /**
   * Group 3 — the EFFECTIVE registration payment methods a player may use:
   *
   *   configured allowlist
   *     ∩ global/system-supported methods (isPaymentMethodAllowedInContext —
   *       the shared CourtZon payment policy; card+cash active, wallet banned)
   *     ∩ organisation-supported methods (the org's active
   *       payment_gateway_config rows) when the Tournament is org-owned
   *
   * A Tournament configuration can NEVER activate a method the global policy
   * (or the org) does not support. Empty org config = no org-level restriction.
   */
  async resolveEffectiveRegistrationPaymentMethods(tournament: Pick<Tournament, 'organisation_id' | 'registration_payment_methods'>): Promise<string[]> {
    const configured = this.readRegistrationPaymentMethods(tournament.registration_payment_methods);
    // Global policy — the shared single source of truth for active methods.
    const globallyAllowed = configured.filter((m) => isPaymentMethodAllowedInContext(m, 'checkout'));
    if (globallyAllowed.length === 0) return [];
    if (tournament.organisation_id == null) return globallyAllowed;
    // Org policy — reuse the organisation's OWN payment configuration (the
    // existing payment_gateway_config allowlist). Defensive: a lookup failure
    // (or a test double without the method) falls back to the global policy.
    try {
      const orgSlugs = await tournamentRepository.getOrgActivePaymentMethodSlugs(tournament.organisation_id);
      if (orgSlugs.length === 0) return globallyAllowed;
      return globallyAllowed.filter((m) => orgSlugs.includes(m));
    } catch {
      return globallyAllowed;
    }
  }

  /**
   * Group 4 — validate + normalise the Tournament schedule configuration.
   * Rules (server-side, the ONLY source of truth — frontend validation alone is
   * insufficient):
   *   * registration_deadline (`registration_closes`) must be BEFORE the
   *     tournament start date (a deadline on/after the start is rejected).
   *   * the daily playing window is either fully configured or absent (both or
   *     neither); when configured, start < end.
   *   * when the Tournament has a venue branch, the daily window must fall
   *     INSIDE the branch's operating hours (opening_time .. closing_time) —
   *     reusing the existing branch schedule model, never a second mechanism.
   * Uses the effective (merged) configuration so partial updates validate
   * against the resulting row, not just the delta.
   */
  private async normaliseSchedule(data: Partial<Tournament>, current?: Tournament): Promise<Partial<Tournament>> {
    const effective = {
      start_date: data.start_date ?? current?.start_date,
      registration_closes: data.registration_closes ?? current?.registration_closes,
      branch_id: data.branch_id ?? current?.branch_id,
      daily_start_time: data.daily_start_time ?? current?.daily_start_time,
      daily_end_time: data.daily_end_time ?? current?.daily_end_time,
    };

    // ── Registration deadline must precede the tournament start date ──
    if (effective.registration_closes != null && effective.start_date != null) {
      const closes = new Date(String(effective.registration_closes));
      const start = new Date(`${String(effective.start_date).slice(0, 10)}T00:00:00`);
      if (Number.isNaN(closes.getTime()) || Number.isNaN(start.getTime())) {
        throw new ConflictError('Invalid registration deadline or start date', ErrorCodes.TOURNAMENT_INVALID_SCHEDULE);
      }
      if (closes.getTime() >= start.getTime()) {
        throw new ConflictError(
          'Registration deadline must be before the tournament start date',
          ErrorCodes.TOURNAMENT_INVALID_SCHEDULE,
        );
      }
    }

    // ── Daily playing window: both or neither, start < end ──
    const start = effective.daily_start_time ?? null;
    const end = effective.daily_end_time ?? null;
    if ((start == null) !== (end == null)) {
      throw new ConflictError(
        'Daily playing window must configure both a start time and an end time',
        ErrorCodes.TOURNAMENT_INVALID_SCHEDULE,
      );
    }
    if (start != null && end != null) {
      if (start >= end) {
        throw new ConflictError(
          'Daily playing window start time must be before the end time',
          ErrorCodes.TOURNAMENT_INVALID_SCHEDULE,
        );
      }
      // ── Window must fit inside the branch operating hours when a venue exists ──
      if (effective.branch_id != null) {
        await this.assertDailyWindowWithinBranchHours(effective.branch_id, start, end);
      }
    }

    return data;
  }

  /** Group 4 — validate the daily window against the venue branch's operating hours. */
  private async assertDailyWindowWithinBranchHours(branchId: number, start: string, end: string): Promise<void> {
    let branch: { opening_time?: string | null; closing_time?: string | null } | null = null;
    try {
      branch = await branchRepository.findById(branchId);
    } catch {
      branch = null;
    }
    if (!branch) return; // branch gone/missing → no schedule to validate against
    const open = branch.opening_time ?? null;
    const close = branch.closing_time ?? null;
    if (open == null || close == null) return; // no operating hours configured
    // Minute-of-day comparison; a window/close at 00:00 is the NEXT day's end.
    const toMin = (t: string): number => {
      const [h, m] = t.split(':').map(Number);
      return (h ?? 0) * 60 + (m ?? 0);
    };
    const startMin = toMin(start);
    const endMin = toMin(end) === 0 ? 1440 : toMin(end);
    const openMin = toMin(open);
    const closeMin = toMin(close) === 0 ? 1440 : toMin(close);
    let within: boolean;
    if (openMin < closeMin) {
      // Normal hours (e.g. 08:00–22:00): window must sit inside.
      within = startMin >= openMin && endMin <= closeMin;
    } else {
      // Overnight hours (e.g. 13:00–01:00): open..24:00 OR 00:00..close.
      within = startMin >= openMin || endMin <= closeMin;
    }
    if (!within) {
      throw new ConflictError(
        `Daily playing window ${start}–${end} is outside the venue operating hours ${open}–${close}`,
        ErrorCodes.TOURNAMENT_INVALID_SCHEDULE,
      );
    }
  }

  /**
   * Group 4 — build the venue object for the authoritative detail shape from
   * the branch columns resolved by `findByIdDetailed`. `mapsUrl` is built ONLY
   * from real branch data (lat/lng preferred, else the text address) and is
   * null when neither exists — coordinates/addresses are never invented.
   */
  private buildVenue(row: any): TournamentVenue | null {
    const branchId = Number(row?.branch_id);
    if (!branchId || row?.branch_name == null) return null;
    const lat = row.branch_latitude != null ? Number(row.branch_latitude) : null;
    const lng = row.branch_longitude != null ? Number(row.branch_longitude) : null;
    const addressLine1 = row.branch_address_line1 ?? null;
    const city = row.branch_city ?? null;
    let mapsUrl: string | null = null;
    if (lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
    } else {
      const query = [addressLine1, city].filter(Boolean).join(', ').trim();
      if (query) mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    }
    return {
      branchId,
      name: row.branch_name,
      addressLine1,
      addressLine2: row.branch_address_line2 ?? null,
      city,
      state: row.branch_state ?? null,
      postalCode: row.branch_postal_code ?? null,
      countryId: row.branch_country_id != null ? Number(row.branch_country_id) : null,
      latitude: lat,
      longitude: lng,
      timezone: row.branch_timezone ?? null,
      openingTime: row.branch_opening_time ?? null,
      closingTime: row.branch_closing_time ?? null,
      mapsUrl,
    };
  }

  /**
   * Group 4 — notify players whose PRIMARY sport equals the tournament sport OR
   * who listed that sport in their interests. Reuses the SHARED Notifications
   * capability by emitting the `tournament:registration-open` domain event per
   * audience member (the notification engine maps it to the template + dispatch
   * + channel preferences). Deduplication is enforced by the notification
   * engine (per user/event/entity) so repeated publish/update events never
   * produce duplicate notifications. Sport-dynamic — never hardcoded.
   */
  private async emitRegistrationOpenNotifications(t: Tournament): Promise<void> {
    if (t.sport_id == null || t.id == null) return;
    let userIds: number[] = [];
    try {
      userIds = await tournamentRepository.findPlayerIdsForSport(t.sport_id);
    } catch (err) {
      // Notification emission is non-fatal; tournament lifecycle already persisted.
      console.error('emitRegistrationOpenNotifications audience resolution failed', err);
      return;
    }
    for (const userId of userIds) {
      eventBusV2.emit('tournament:registration-open', {
        tournamentId: t.id,
        userId,
        name: t.name,
      } as Record<string, unknown>, {
        aggregateType: 'tournament', aggregateId: String(t.id), aggregateVersion: 1,
      });
    }
  }

  /**
   * Group 5B-SR — the selected bracket type must exist, be active, and be
   * engine-supported. Prevents a config-visible-but-deferred type from
   * generating an invalid tournament.
   */
  private async assertBracketTypeAvailable(bracketTypeId: number | undefined): Promise<void> {
    if (bracketTypeId == null) {
      throw new ConflictError('A bracket type is required', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
    const bt = await tournamentRepository.findBracketTypeById(bracketTypeId);
    if (!bt) throw new ConflictError('Bracket type not found', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    if (!Number(bt.is_active)) {
      throw new ConflictError(`Bracket type "${bt.name}" is inactive and cannot be used for new tournaments`, ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
    if (!(ENGINE_SUPPORTED_BRACKET_SLUGS as readonly string[]).includes(bt.slug)) {
      throw new ConflictError(
        `Bracket type "${bt.name}" is configuration-visible but its engine is not yet supported (deferred capability)`,
        ErrorCodes.TOURNAMENT_INVALID_FORMAT,
      );
    }
  }

  /**
   * Group 5B-SR — resolve the tournament commission rate from the
   * organisation's active subscription/plan. Platform tournaments (no org) get
   * 0. When no subscription rate is configured the tournament is created with
   * 0 (historical snapshot stays 0).
   */
  private async resolveCommissionRate(organisationId: number | undefined, entryFee?: number): Promise<number> {
    if (organisationId == null) return 0;
    const rate = await getCommissionRate(organisationId, 'tournament');
    return rate?.rate ?? 0;
  }

  async list(filters: {
    page?: number; limit?: number; search?: string; status?: string; format?: string; category?: string; sport_id?: number;
  }) {
    return tournamentRepository.list(filters);
  }

  async getById(id: number): Promise<Tournament> {
    const t = await tournamentRepository.findById(id);
    if (!t) throw new NotFoundError('Tournament', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    // Group 3 — the persisted JSON allowlist is exposed as a normalised array
    // (legacy NULL rows → backward-compatible default both methods).
    (t as any).registration_payment_methods = this.readRegistrationPaymentMethods((t as any).registration_payment_methods);
    return t;
  }

  /** Management detail — the shared Admin/Org display shape (sport_name, organisation_name, max_players, type, …). */
  async getByIdDetailed(id: number) {
    const t = await tournamentRepository.findByIdDetailed(id);
    if (!t) throw new NotFoundError('Tournament', ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    // Group 2 — attach structured prizes (authoritative when present; the
    // frontend falls back to legacy prize_description when the array is empty).
    t.prizes = await tournamentRepository.findPrizesByTournament(id);
    // Group 3 — expose the normalised configured allowlist AND the effective
    // methods (config ∩ global policy ∩ org policy) to the player/management
    // surfaces. Wallet can never appear (global policy excludes it).
    const configured = this.readRegistrationPaymentMethods((t as any).registration_payment_methods);
    t.registration_payment_methods = configured;
    t.effective_registration_payment_methods = await this.resolveEffectiveRegistrationPaymentMethods({
      ...t,
      registration_payment_methods: configured,
    });
    // Group 4 — attach the resolved venue (branch) + sport icon so the player
    // surface can render venue name/address/map and the sport icon.
    t.venue = this.buildVenue(t);
    t.sport_icon = t.sport_icon ?? null;
    return t;
  }

  async getByCode(code: string): Promise<Tournament | null> {
    return tournamentRepository.findByCode(code);
  }

  // ── Group 5B-SR — Bracket type configuration ──

  /** All bracket types (management view) or only active ones (create form). */
  async listBracketTypes(includeInactive = false): Promise<BracketTypeRow[]> {
    return tournamentRepository.listBracketTypes(!includeInactive);
  }

  /**
   * Group 5B-SR — toggle a bracket type active/inactive. Deactivation is the
   * preferred lifecycle: referenced types are never destructively deleted.
   */
  async updateBracketTypeActive(id: number, isActive: boolean, actorId: number): Promise<BracketTypeRow> {
    const bt = await tournamentRepository.findBracketTypeById(id);
    if (!bt) throw new NotFoundError('Bracket type', ErrorCodes.TOURNAMENT_NOT_FOUND);
    await tournamentRepository.setBracketTypeActive(id, isActive);
    recordAudit({
      actorId, action: 'TOURNAMENT.BRACKET_TYPE_UPDATE', entityType: 'tournament_bracket_type', entityId: id,
      beforeState: { is_active: bt.is_active }, afterState: { is_active: isActive, slug: bt.slug },
    });
    const updated = await tournamentRepository.findBracketTypeById(id);
    return updated!;
  }

  /**
   * Group 5B-SR — guarded destructive delete. Never exposed via routes: bracket
   * types referenced by historical tournaments cannot be deleted (deactivation
   * is preferred). Provided as a defensive guard for future use + tests.
   */
  async deleteBracketType(id: number, actorId: number): Promise<void> {
    const bt = await tournamentRepository.findBracketTypeById(id);
    if (!bt) throw new NotFoundError('Bracket type', ErrorCodes.TOURNAMENT_NOT_FOUND);
    const refs = await tournamentRepository.countBracketTypeReferences(id);
    if (refs > 0) {
      throw new ConflictError(
        `Bracket type "${bt.name}" is referenced by ${refs} tournament(s) and cannot be deleted — deactivate it instead`,
        ErrorCodes.TOURNAMENT_INVALID_FORMAT,
      );
    }
    await tournamentRepository.setBracketTypeActive(id, false);
    recordAudit({
      actorId, action: 'TOURNAMENT.BRACKET_TYPE_DELETE', entityType: 'tournament_bracket_type', entityId: id,
      afterState: { slug: bt.slug, is_active: false },
    });
  }

  /**
   * Group 5B-SR — the organisation's authoritative tournament commission
   * configuration, derived from its active subscription/plan. Used by the
   * create screen to display the locked read-only rate.
   *
   * Group 1A — also exposes the organisation's authoritative currency so the
   * create screen can display it (single server-side source of truth).
   */
  async getOrgCommissionConfig(orgId: number): Promise<{ commissionRate: number; planName: string | null; currencyCode: string | null }> {
    const { getCurrentSubscription } = await import('../../organisations/application/current-subscription.service.js');
    const sub = await getCurrentSubscription(orgId);
    const rate = sub.exists ? await getCommissionRate(orgId, 'tournament') : null;
    const currencyCode = await resolveOrganisationCurrency(orgId, undefined);
    return { commissionRate: rate?.rate ?? 0, planName: sub.exists ? sub.planName : null, currencyCode };
  }

  /**
   * Group 5B-SR — sport → match format → rule set cascade for the create form.
   * Reuses the authoritative match-result resolution so the UI never invents
   * arbitrary formats/rule sets.
   *
   * Group 1 — each rule-set option additionally exposes a `humanReadable`
   * field derived server-side from the SAME shared formatter that produces the
   * Tournament Rules snapshot. The frontend renders this value; it never
   * interprets the rules JSON itself (single source of truth).
   *
   * Group 1A — when a bracket type is supplied, the humanReadable also
   * includes the bracket so the create-screen preview matches the persisted
   * snapshot ("Single Elimination — Padel Standard — Doubles.").
   */
  async listSportFormatsCascade(sportId: number, bracketTypeId?: number) {
    const bracket = await this.resolveBracketContext(bracketTypeId);
    const cascade = await matchResultRepository.listRuleSetsBySport(sportId, true);
    return cascade.map(({ format, ruleSets }) => ({
      format,
      ruleSets: ruleSets.map((rs) => ({
        ...rs,
        humanReadable: formatSportRules(rs.rules as any, {
          bracket,
          format: { name: format.name, formatType: format.formatType, playersPerSide: format.playersPerSide, description: format.description ?? null },
          ruleSet: { name: rs.name, version: rs.version },
        }),
      })),
    }));
  }

  /**
   * Group 1 — resolve the authoritative human-readable Tournament Rules from
   * the selected Bracket Type + Match Format + Rule Set. Explicit
   * format/rule-set wins; when absent, falls back to the sport's authoritative
   * default (is_default) resolution. Returns `null` when no valid
   * format/rule-set can be resolved — the caller never invents a fallback
   * string.
   */
  private async resolveRulesSnapshot(sportId: number | undefined, matchFormatId: number | undefined, ruleSetId: number | undefined, bracketTypeId: number | undefined): Promise<string | null> {
    const bracket = await this.resolveBracketContext(bracketTypeId);
    if (matchFormatId != null && ruleSetId != null) {
      const fmt = await matchResultRepository.findFormatById(matchFormatId);
      if (!fmt) throw new ConflictError('Configured Match Format not found', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
      const ruleSet = await matchResultRepository.findRuleSetById(ruleSetId);
      if (!ruleSet) throw new ConflictError('Configured Rule Set not found', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
      return formatSportRules(ruleSet.rules as any, {
        bracket,
        format: { name: fmt.name, formatType: fmt.formatType, playersPerSide: fmt.playersPerSide, description: null },
        ruleSet: { name: null, version: ruleSet.version },
      });
    }
    // Sport default resolution — authoritative is_default mechanism, never
    // arbitrary rows (formats[0] / ruleSets[0]).
    if (sportId == null) return null;
    const def = await matchResultRepository.resolveDefaultFormatForSport(sportId);
    if (!def) return null;
    const ruleSet = await matchResultRepository.findActiveRuleSetForFormat(def.formatId);
    if (!ruleSet) return null;
    return formatSportRules(ruleSet.rules as any, {
      bracket,
      format: { name: def.name, formatType: def.formatType, playersPerSide: def.playersPerSide, description: null },
      ruleSet: { name: null, version: ruleSet.version },
    });
  }

  /** Group 1A — resolve the bracket context from the authoritative bracket type. */
  private async resolveBracketContext(bracketTypeId: number | undefined): Promise<{ name: string | null; slug: string | null } | null> {
    if (bracketTypeId == null) return null;
    const bt = await tournamentRepository.findBracketTypeById(bracketTypeId);
    if (!bt) return null;
    return { name: bt.name, slug: bt.slug };
  }

  async assertFormatBelongsToSport(sportId: number | undefined, formatId: number): Promise<void> {
    if (sportId == null) return;
    const fmt = await matchResultRepository.findFormatById(formatId);
    if (!fmt) throw new ConflictError('Match Format not found', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    if (fmt.sportId !== sportId) {
      throw new ConflictError('Match Format does not belong to the selected Sport', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
  }

  async update(id: number, data: Partial<Tournament>): Promise<Tournament> {
    const current = await this.getById(id);
    if (data.code) {
      const existing = await tournamentRepository.findByCode(data.code);
      if (existing && existing.id !== id) throw new ConflictError('Tournament code already exists', ErrorCodes.ACADEMY_PROGRAM_CODE_EXISTS);
    }
    // Group 1A — an organisation-owned tournament must never be stored as
    // `platform`. Apply the same derivation on update so a client cannot turn
    // an org tournament into a platform tournament after creation.
    const effectiveOrgId = data.organisation_id ?? current.organisation_id;
    if (data.tournament_type !== undefined) {
      data = { ...data, tournament_type: this.deriveOrgTournamentType(effectiveOrgId, data.tournament_type) };
    }
    // Group 1A — authoritative currency for organisation tournaments. When the
    // organisation or branch changes (or a client supplies a currency), re-resolve
    // server-side from the effective org/branch. A client-supplied currency_code
    // is never trusted as authoritative for an org-owned tournament.
    if (effectiveOrgId != null && (data.organisation_id !== undefined || data.branch_id !== undefined || data.currency_code !== undefined)) {
      const effectiveBranchId = data.branch_id ?? current.branch_id;
      const resolvedCurrency = await resolveOrganisationCurrency(effectiveOrgId, effectiveBranchId);
      if (resolvedCurrency) data = { ...data, currency_code: resolvedCurrency };
    }
    // Group 2 — structured prizes: when supplied, validate + normalise against
    // the authoritative tournament currency and replace the whole set.
    if (data.prizes !== undefined) {
      const effectiveCurrency = data.currency_code ?? current.currency_code;
      const prizes = this.normalisePrizes(data.prizes, effectiveCurrency);
      await tournamentRepository.replacePrizes(id, prizes);
      eventBusV2.emit('tournament:prizes-updated', { tournamentId: id, prizeCount: prizes.length } as Record<string, unknown>, {
        aggregateType: 'tournament', aggregateId: String(id), aggregateVersion: 1,
      });
      delete (data as any).prizes;
    }
    // Group 3 — registration payment-method configuration is mutable
    // Tournament state. When supplied, normalise (validate + dedupe + order)
    // and persist; a change emits the authoritative realtime event so the
    // admin/org workbenches refresh without a manual reload.
    let paymentMethodsChanged = false;
    if (data.registration_payment_methods !== undefined) {
      const before = this.readRegistrationPaymentMethods((current as any).registration_payment_methods);
      const after = this.normaliseRegistrationPaymentMethods(data.registration_payment_methods);
      data = { ...data, registration_payment_methods: after };
      paymentMethodsChanged = before.join(',') !== after.join(',');
    }
    if (paymentMethodsChanged) {
      eventBusV2.emit('tournament:registration-payment-methods-updated', {
        tournamentId: id,
        organisationId: current.organisation_id ?? null,
        methods: this.normaliseRegistrationPaymentMethods(data.registration_payment_methods),
      } as Record<string, unknown>, {
        aggregateType: 'tournament', aggregateId: String(id), aggregateVersion: 1,
      });
    }
    // Group 4 — mutable schedule configuration (registration deadline, venue
    // branch, daily playing window, tournament dates) is validated against the
    // resulting row and, when it actually changes, announced through the
    // authoritative realtime channel (EventBusV2 → SocketPublisher).
    const scheduleTouched =
      data.registration_closes !== undefined || data.registration_opens !== undefined
      || data.branch_id !== undefined || data.daily_start_time !== undefined
      || data.daily_end_time !== undefined || data.start_date !== undefined
      || data.end_date !== undefined;
    if (scheduleTouched) {
      await this.normaliseSchedule(data, current);
      const before = `${current.start_date ?? ''}|${current.registration_closes ?? ''}|${current.branch_id ?? ''}|${current.daily_start_time ?? ''}|${current.daily_end_time ?? ''}`;
      const after = `${data.start_date ?? current.start_date ?? ''}|${data.registration_closes ?? current.registration_closes ?? ''}|${data.branch_id ?? current.branch_id ?? ''}|${data.daily_start_time ?? current.daily_start_time ?? ''}|${data.daily_end_time ?? current.daily_end_time ?? ''}`;
      if (before !== after) {
        eventBusV2.emit('tournament:schedule-updated', {
          tournamentId: id,
          organisationId: current.organisation_id ?? null,
          startDate: data.start_date ?? current.start_date ?? null,
          endDate: data.end_date ?? current.end_date ?? null,
          registrationCloses: data.registration_closes ?? current.registration_closes ?? null,
          branchId: data.branch_id ?? current.branch_id ?? null,
          dailyStartTime: data.daily_start_time ?? current.daily_start_time ?? null,
          dailyEndTime: data.daily_end_time ?? current.daily_end_time ?? null,
        } as Record<string, unknown>, {
          aggregateType: 'tournament', aggregateId: String(id), aggregateVersion: 1,
        });
      }
    }
    // Group 1 — whenever the rules-affecting configuration changes (sport_id,
    // match_format_id, rule_set_id, bracket_type_id), regenerate the
    // human-readable Rules snapshot server-side. A client-supplied `rules`
    // string is never trusted as authoritative when a valid format/rule-set
    // exists; the server-derived value wins.
    const configChanged = data.sport_id !== undefined || data.match_format_id !== undefined || data.rule_set_id !== undefined || data.bracket_type_id !== undefined;
    if (configChanged) {
      // Merge the update into the current row so regeneration reflects the
      // effective (resulting) configuration, not just the delta.
      const effective = {
        sport_id: data.sport_id ?? current.sport_id,
        match_format_id: data.match_format_id ?? current.match_format_id,
        rule_set_id: data.rule_set_id ?? current.rule_set_id,
        bracket_type_id: data.bracket_type_id ?? current.bracket_type_id,
      };
      if ((effective.match_format_id == null) !== (effective.rule_set_id == null)) {
        throw new ConflictError('Tournament must configure both a Match Format and a Rule Set, or neither', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
      }
      if (effective.match_format_id != null && effective.rule_set_id != null) {
        await this.assertMatchFormatRuleSetPair(effective.match_format_id, effective.rule_set_id);
        await this.assertFormatBelongsToSport(effective.sport_id, effective.match_format_id);
      }
      const rulesSnapshot = await this.resolveRulesSnapshot(effective.sport_id, effective.match_format_id, effective.rule_set_id, effective.bracket_type_id);
      data = { ...data, rules: rulesSnapshot ?? undefined };
    } else if (data.rules !== undefined) {
      // Client attempted to supply free-text rules without changing the
      // config — server-derived value wins; never accept raw client text.
      const rulesSnapshot = await this.resolveRulesSnapshot(current.sport_id, current.match_format_id, current.rule_set_id, current.bracket_type_id);
      if (rulesSnapshot != null) {
        data = { ...data, rules: rulesSnapshot };
      } else {
        delete (data as any).rules;
      }
    }
    await tournamentRepository.update(id, data);
    return this.getById(id);
  }

  async updateStatus(id: number, status: string): Promise<Tournament> {
    const t = await this.getById(id);
    validateTournamentTransition(t.status, status as any);
    await tournamentRepository.updateStatus(id, status);
    return this.getById(id);
  }

  async publish(id: number) {
    const t = await this.updateStatus(id, 'published');
    // Group 4 — notify players whose primary sport / interests match the
    // tournament sport (idempotent via the notification engine dedup).
    await this.emitRegistrationOpenNotifications(t);
    return t;
  }
  async openRegistration(id: number) {
    const t = await this.updateStatus(id, 'registration_open');
    // Group 4 — same audience as publish; repeated events are deduped by the
    // notification engine so players never receive duplicates.
    await this.emitRegistrationOpenNotifications(t);
    return t;
  }
  async closeRegistration(id: number) { return this.updateStatus(id, 'registration_closed'); }
  async startTournament(id: number) { return this.updateStatus(id, 'running'); }
  async complete(id: number) { return this.updateStatus(id, 'completed'); }
  async cancel(id: number) { return this.updateStatus(id, 'cancelled'); }
  async archive(id: number) { return this.updateStatus(id, 'archived'); }

  async getOpenTournaments() {
    return tournamentRepository.findOpen();
  }

  async register(
    tournamentId: number,
    userId: number,
    teamId?: number,
    paymentMethod?: string,
  ): Promise<TournamentRegistration & { payment?: Record<string, unknown> | null }> {
    const t = await this.getById(tournamentId);
    if (t.status !== 'registration_open' && t.status !== 'published') {
      throw new ConflictError('Registration is not open for this tournament', ErrorCodes.TOURNAMENT_REGISTRATION_CLOSED);
    }

    // Group 4 — server-side registration deadline enforcement. The deadline is
    // `registration_closes` (timestamp); players must not register after it.
    // Frontend validation alone is insufficient — this is authoritative.
    if (t.registration_closes) {
      const deadline = new Date(t.registration_closes);
      if (!Number.isNaN(deadline.getTime()) && Date.now() >= deadline.getTime()) {
        throw new ConflictError(
          'Registration has closed for this tournament',
          ErrorCodes.TOURNAMENT_REGISTRATION_CLOSED,
        );
      }
    }

    const existing = await tournamentRepository.findRegistrationsByTournament(tournamentId);
    if (existing.some((r) => r.player_id === userId)) {
      throw new ConflictError('Already registered in this tournament', ErrorCodes.TOURNAMENT_REGISTRATION_EXISTS);
    }

    const cap = t.max_participants || 0;
    const confirmedCount = existing.filter((r) => r.status === 'confirmed').length;
    const isFull = cap > 0 && confirmedCount >= cap;
    const waitlistEnabled = Boolean(Number((t as any).waitlist_enabled ?? 0));
    if (isFull) {
      // Group 6 — real FIFO waitlist: when enabled, the registration enters the
      // waiting state (NO payment, NO entitlement) instead of erroring.
      if (!waitlistEnabled) {
        throw new ConflictError('Tournament is at full capacity', ErrorCodes.TOURNAMENT_CAPACITY_FULL);
      }
      const waitingOrder = await participantDrawRepository.getNextWaitingOrderByTournament(tournamentId);
      const id = await tournamentRepository.createRegistration({
        tournament_id: tournamentId,
        user_id: userId,
        player_id: userId,
        team_id: teamId,
        status: 'waiting',
        payment_status: 'unpaid',
        waiting_order: waitingOrder,
      });
      await participantDrawRepository.createParticipant({
        tournament_id: tournamentId,
        registration_id: id,
        participant_type: 'individual',
        status: 'waiting',
        member_user_ids: [userId],
        waiting_order: waitingOrder,
      });
      eventBusV2.emit('registration.received', { tournamentId, userId, registrationId: id, status: 'waiting', paymentRequired: false } as Record<string, unknown>, {
        aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
      });
      eventBusV2.emit('tournament:waitlist-updated', { tournamentId } as Record<string, unknown>, {
        aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
      });
      const waiting = await tournamentRepository.getRegistrationById(id);
      return { ...waiting!, payment: null };
    }

    // Group 3 — when the player declares a payment method it MUST be one of the
    // EFFECTIVE allowed methods (config ∩ global policy ∩ org policy). Wallet
    // can never be offered or accepted. When no method is supplied (legacy
    // callers) the registration is created 'registered'/'unpaid' exactly as
    // before — backward compatible.
    const paymentRequired = Number(t.entry_fee ?? 0) > 0;
    if (paymentMethod) {
      const effective = await this.resolveEffectiveRegistrationPaymentMethods(t);
      if (!effective.includes(paymentMethod)) {
        throw new ConflictError(
          `Payment method "${paymentMethod}" is not accepted for this tournament`,
          ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD,
        );
      }
    }

    const status = paymentRequired ? 'registered' : 'registered';
    const seed = existing.length + 1;
    const id = await tournamentRepository.createRegistration({
      tournament_id: tournamentId,
      user_id: userId,
      player_id: userId,
      team_id: teamId,
      seed,
      status,
      payment_status: 'unpaid',
    });

    // Group 5/6 — the authoritative participant is materialized immediately for
    // the active registration (the G5 participant model is the primary model).
    const existingParticipant = await participantDrawRepository.findParticipantByRegistration(tournamentId, id);
    if (!existingParticipant) {
      await participantDrawRepository.createParticipant({
        tournament_id: tournamentId,
        registration_id: id,
        participant_type: 'individual',
        status: 'active',
        member_user_ids: [userId],
      });
    }

    // ── Group 3 — registration-payment routing through the SHARED Payment
    // capability (payment_transactions + PaymentService.charge). No
    // tournament-specific transaction system exists: the shared service owns
    // the gateway abstraction, idempotency and lifecycle.
    let payment: Record<string, unknown> | null = null;
    if (paymentRequired && paymentMethod === 'cash') {
      // Cash/Offline — reuse the existing offline-cash record path (a PAID
      // payment_transactions row, reference_type='tournament', deterministic
      // idempotency key) and mark the registration paid durably. The
      // payment:succeeded event runs the shared pipeline (listener re-marks
      // idempotently; tournament accounting is intentionally not posted yet).
      const amount = Math.round(Number(t.entry_fee) * 100) / 100;
      const paymentId = await tournamentRepository.createCashPaymentTransaction({
        userId,
        registrationId: id,
        amount,
        currency: t.currency_code,
      });
      await tournamentRepository.updateRegistrationPaymentStatus(id, 'paid');
      eventBusV2.emit('payment:succeeded', {
        paymentId,
        referenceType: 'tournament',
        referenceId: id,
        amount,
        metadata: { paymentMethod: 'cash', currency: t.currency_code, userId },
      } as Record<string, unknown>);
      payment = { method: 'cash', status: 'paid', paymentId };
    } else if (paymentRequired && paymentMethod === 'card') {
      // Card/Gateway — the Tournament domain provides the reference, amount and
      // authoritative currency; the SHARED PaymentService owns the gateway
      // intention + pending payment_transactions row. Confirmation flows
      // through the existing webhook/confirm → payment:succeeded → the
      // tournament payment listener marks the registration paid.
      const { paymentService } = await import('../../payment/application/payment.service.js');
      const gwResult: any = await paymentService.charge(userId, {
        referenceType: 'tournament' as any,
        referenceId: id,
        amount: Math.round(Number(t.entry_fee) * 100) / 100,
        currency: t.currency_code,
        paymentMethod: 'card',
      });
      if (!gwResult?.success) {
        throw new ConflictError(
          (gwResult?.errorMessage as string) || 'Payment gateway rejected the transaction',
          ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD,
        );
      }
      payment = {
        method: 'card',
        status: gwResult.status ?? 'pending',
        paymentId: gwResult.paymentId ?? null,
        paymentUrl: gwResult.paymentUrl ?? null,
        clientSecret: gwResult.clientSecret ?? null,
        intentionId: gwResult.intentionId ?? null,
      };
    }

    eventBusV2.emit('registration.received', { tournamentId, userId, registrationId: id, status, paymentRequired } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
    });

    const created = await tournamentRepository.getRegistrationById(id);
    return { ...created!, payment };
  }

  /** Group 5A — record that an entry fee was settled via the shared Payment capability. */
  async markRegistrationPaid(regId: number, actorId: number): Promise<void> {
    const reg = await tournamentRepository.getRegistrationById(regId);
    if (!reg) throw new NotFoundError('Registration', ErrorCodes.TOURNAMENT_REGISTRATION_NOT_FOUND);
    await tournamentRepository.updateRegistrationPaymentStatus(regId, 'paid');
    await recordAudit({ actorId, action: 'tournament.registration.paid', entityType: 'tournament_registration', entityId: regId, afterState: { payment_status: 'paid' } });
  }

  async cancelRegistration(regId: number): Promise<void> {
    const reg = await tournamentRepository.getRegistrationById(regId);
    if (!reg) throw new NotFoundError('Registration', ErrorCodes.TOURNAMENT_REGISTRATION_NOT_FOUND);
    validateRegistrationTransition(reg.status, 'withdrawn');
    await tournamentRepository.updateRegistrationStatus(regId, 'withdrawn');
  }

  async confirmRegistration(regId: number): Promise<void> {
    const reg = await tournamentRepository.getRegistrationById(regId);
    if (!reg) throw new NotFoundError('Registration', ErrorCodes.TOURNAMENT_REGISTRATION_NOT_FOUND);
    validateRegistrationTransition(reg.status, 'confirmed');
    const t = await this.getById(reg.tournament_id);
    // Entry-fee tournaments require settlement (shared payment) before confirmation.
    if (Number(t.entry_fee ?? 0) > 0 && reg.payment_status !== 'paid') {
      throw new ConflictError('Entry fee must be paid before confirmation', ErrorCodes.TOURNAMENT_REGISTRATION_CLOSED);
    }
    await tournamentRepository.updateRegistrationStatus(regId, 'confirmed');
  }

  async generateGroups(tournamentId: number, groupSize: number, advanceCount: number): Promise<void> {
    const t = await this.getById(tournamentId);
    const registrations = await tournamentRepository.findRegistrationsByTournament(tournamentId);
    const confirmed = registrations.filter((r) => r.status === 'confirmed');
    if (confirmed.length === 0) throw new ConflictError('No confirmed registrations', ErrorCodes.TOURNAMENT_CAPACITY_EXCEEDED);

    const numGroups = Math.ceil(confirmed.length / groupSize);
    // Group 5A — deterministic seeded shuffle (draw_seed), not Math.random().
    const seed = t.draw_seed ?? Date.now();
    const shuffled = seededShuffle(confirmed, seed);

    for (let g = 0; g < numGroups; g++) {
      const groupName = String.fromCharCode(65 + g);
      const groupId = await tournamentRepository.createGroup({
        tournament_id: tournamentId,
        name: groupName,
        advance_count: advanceCount,
      });
      const members = shuffled.slice(g * groupSize, (g + 1) * groupSize);
      for (let s = 0; s < members.length; s++) {
        await tournamentRepository.addGroupMember({
          group_id: groupId,
          registration_id: members[s].id,
          seed: s + 1,
        });
      }
    }
  }

  async generateFixtures(tournamentId: number): Promise<void> {
    const groups = await tournamentRepository.findGroups(tournamentId);
    if (groups.length === 0) throw new ConflictError('No groups exist. Generate groups first.', ErrorCodes.TOURNAMENT_GROUP_NOT_FOUND);

    const t = await this.getById(tournamentId);
    const formatCtx = await this.resolveMatchFormatContext(t);

    for (const group of groups) {
      const members = await tournamentRepository.findGroupMembers(group.id!);
      const regIds = members.map((m) => m.registration_id);
      const regs = await tournamentRepository.findRegistrationsByTournament(tournamentId);
      const idToPlayer = new Map<number, number>();
      for (const reg of regs) { if (reg.id != null && reg.player_id != null) idToPlayer.set(reg.id, reg.player_id); }

      const matches = generateRoundRobinMatches(regIds);
      for (const m of matches) {
        const p1 = idToPlayer.get(m.player1Id);
        const p2 = idToPlayer.get(m.player2Id);
        if (p1 == null || p2 == null) continue;
        const sharedMatch = await this.createTournamentMatchFromSlot(t, formatCtx, {
          round: m.round,
          player1Id: p1,
          player2Id: p2,
        });
        await tournamentRepository.createMatch({
          tournament_id: tournamentId,
          group_id: group.id,
          round: m.round,
          match_id: sharedMatch.id,
          player1_id: p1,
          player2_id: p2,
          status: 'scheduled',
          progression_state: 'pending',
          progression_meta: { is_bracket: false },
        });
      }
    }
  }

  async generateBracket(tournamentId: number): Promise<void> {
    const t = await this.getById(tournamentId);

    // Group 5B — idempotent draw: an existing bracket is never regenerated
    // (results may already be flowing through progression). Defensive against
    // repository stubs in unit tests where findMatches may be unresolved.
    let existingMatches: TournamentMatch[] | undefined;
    try {
      existingMatches = await tournamentRepository.findMatches(tournamentId);
    } catch {
      existingMatches = undefined;
    }
    if (existingMatches && existingMatches.length > 0) {
      throw new ConflictError('Bracket already generated for this tournament', ErrorCodes.TOURNAMENT_BRACKET_EXISTS);
    }

    const registrations = await tournamentRepository.findRegistrationsByTournament(tournamentId);
    const confirmed = registrations.filter((r) => r.status === 'confirmed');
    const userIds = confirmed.map((r) => r.player_id!).filter(Boolean);
    if (userIds.length < 2) throw new ConflictError('Need at least 2 participants', ErrorCodes.TOURNAMENT_CAPACITY_EXCEEDED);

    // Deterministic draw from the persisted seed (reproducible + auditable).
    const seed = t.draw_seed ?? Date.now();
    const seededBy = new Map<number, number>();
    for (const reg of confirmed) {
      if (reg.player_id != null && reg.seed != null) seededBy.set(reg.player_id, reg.seed);
    }

    const formatCtx = await this.resolveMatchFormatContext(t);

    let slots: BracketSlot[] = [];
    let isKnockout = false;
    if (t.format === 'knockout') {
      slots = normaliseBracketTargets(generateKnockoutBracket(userIds, { seed, seededBy }), userIds.length);
      isKnockout = true;
    } else if (t.format === 'round_robin') {
      slots = generateRoundRobinMatches(userIds).map((m) => ({ round: m.round, bracketPosition: 0, player1Id: m.player1Id, player2Id: m.player2Id }));
    } else if (t.format === 'group_stage_knockout') {
      const groups = await tournamentRepository.findGroups(tournamentId);
      if (groups.length > 0) {
        for (const group of groups) {
          const members = await tournamentRepository.findGroupMembers(group.id!);
          const regIds = members.map((m) => m.registration_id);
          const regs = await tournamentRepository.findRegistrationsByTournament(tournamentId);
          const idToPlayer = new Map<number, number>();
          for (const reg of regs) { if (reg.id != null && reg.player_id != null) idToPlayer.set(reg.id, reg.player_id); }
          const rr = generateRoundRobinMatches(regIds);
          for (const m of rr) {
            const p1 = idToPlayer.get(m.player1Id);
            const p2 = idToPlayer.get(m.player2Id);
            if (p1 == null || p2 == null) continue;
            const sharedMatch = await this.createTournamentMatchFromSlot(t, formatCtx, { round: m.round, player1Id: p1, player2Id: p2 });
            await tournamentRepository.createMatch({
              tournament_id: tournamentId,
              group_id: group.id,
              round: m.round,
              match_id: sharedMatch.id,
              player1_id: p1,
              player2_id: p2,
              status: 'scheduled',
              progression_state: 'pending',
              progression_meta: { is_bracket: false },
            });
          }
        }
        // Group stage fixtures are round-robin — nothing to auto-advance.
        await this.autoStartAfterDraw(t);
        return;
      }
      slots = normaliseBracketTargets(generateKnockoutBracket(userIds, { seed, seededBy }), userIds.length);
      isKnockout = true;
    } else if (t.format === 'mixed') {
      slots = await this.generateMixedStages(t, formatCtx, userIds, seed, seededBy);
      isKnockout = true;
    } else {
      slots = generateStageMatches(t.format ?? 'round_robin', userIds, { seed, seededBy });
      isKnockout = t.format === 'double_elimination' || t.format === 'swiss';
      if (isKnockout) slots = normaliseBracketTargets(slots, userIds.length);
    }

    for (const slot of slots) {
      const meta = this.buildDrawMeta(slot, isKnockout);
      const hasBoth = slot.player1Id != null && slot.player2Id != null;
      if (hasBoth) {
        // Round-1 (or direct-draw) real match — participants are known now, so a
        // shared Match is created and linked immediately.
        const sharedMatch = await this.createTournamentMatchFromSlot(t, formatCtx, slot);
        await tournamentRepository.createMatch({
          tournament_id: tournamentId,
          round: slot.round,
          bracket_position: slot.bracketPosition,
          stage_id: slot.stageId ?? null,
          match_id: sharedMatch.id,
          player1_id: slot.player1Id ?? null,
          player2_id: slot.player2Id ?? null,
          status: 'scheduled',
          progression_state: 'pending',
          progression_meta: meta as unknown as Record<string, unknown>,
        });
      } else {
        // A round-1 BYE (explicit metadata — no fake participant, no Match) or a
        // later-round placeholder whose participants come from progression.
        await tournamentRepository.createMatch({
          tournament_id: tournamentId,
          round: slot.round,
          bracket_position: slot.bracketPosition,
          stage_id: slot.stageId ?? null,
          match_number: slot.bye === true ? 0 : undefined,
          player1_id: slot.player1Id ?? null,
          player2_id: slot.player2Id ?? null,
          status: 'scheduled',
          progression_state: 'pending',
          progression_meta: meta as unknown as Record<string, unknown>,
        });
      }
    }

    // Group 5B — propagate explicit byes and padding slots through the bracket
    // (fixpoint; runs once at draw time, never during live play).
    await this.advanceByes(tournamentId);

    // Group 5B — a deterministic draw starts the tournament lifecycle.
    await this.autoStartAfterDraw(t);

    eventBusV2.emit('tournament:bracket-generated', { tournamentId, matchCount: slots.length } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
    });
  }

  /**
   * Group 5A — resolve the frozen Match Format + Rule Set context a tournament
   * generated Match must use. Falls back to the sport's active default when the
   * tournament did not explicitly configure a Match Format/Rule Set. Public so
   * the G8 match-generation/schedule service reuses the SAME frozen context.
   */
  async resolveMatchFormatContext(t: Tournament): Promise<{ formatId: number; ruleSetId: number; formatSnapshot: MatchFormatSnapshot; ruleSnapshot: Record<string, unknown> }> {
    if (t.match_format_id != null && t.rule_set_id != null) {
      const fmt = await matchResultRepository.findFormatById(t.match_format_id);
      if (!fmt) throw new ConflictError('Configured Match Format not found', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
      const ruleSet = await matchResultRepository.findRuleSetById(t.rule_set_id);
      if (!ruleSet) throw new ConflictError('Configured Rule Set not found', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
      return {
        formatId: fmt.formatId,
        ruleSetId: t.rule_set_id,
        formatSnapshot: { formatId: fmt.formatId, formatType: fmt.formatType, playersPerSide: fmt.playersPerSide, name: fmt.name },
        ruleSnapshot: (typeof ruleSet.rules === 'string' ? JSON.parse(ruleSet.rules) : ruleSet.rules) as Record<string, unknown>,
      };
    }
    // Fallback: the sport's default active format + its active rule set.
    const sportId = t.sport_id;
    if (sportId == null) throw new ConflictError('Tournament has no sport configured', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    const def = await matchResultRepository.resolveDefaultFormatForSport(sportId);
    if (!def) throw new ConflictError('No active sport format configured', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    const ruleSet = await matchResultRepository.findActiveRuleSetForFormat(def.formatId);
    if (!ruleSet) throw new ConflictError('No active rule set configured', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    return {
      formatId: def.formatId,
      ruleSetId: ruleSet.ruleSetId,
      formatSnapshot: { formatId: def.formatId, formatType: def.formatType, playersPerSide: def.playersPerSide, name: def.name },
      ruleSnapshot: (typeof ruleSet.rules === 'string' ? JSON.parse(ruleSet.rules) : ruleSet.rules) as Record<string, unknown>,
    };
  }

/** Group 5A — validate that the Rule Set belongs to the selected Match Format. */
  private async assertMatchFormatRuleSetPair(matchFormatId: number, ruleSetId: number): Promise<void> {
    const fmt = await matchResultRepository.findFormatById(matchFormatId);
    if (!fmt) throw new ConflictError('Match Format not found', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    const ruleSet = await matchResultRepository.findRuleSetById(ruleSetId);
    if (!ruleSet) throw new ConflictError('Rule Set not found', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    if (ruleSet.formatId !== fmt.formatId) {
      throw new ConflictError('Match Format and Rule Set must belong to the same sport configuration', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
  }

  /** Group 5A — create the shared Match for a bracket slot and return it. */
  private async createTournamentMatchFromSlot(t: Tournament, formatCtx: { formatId: number; ruleSetId: number; formatSnapshot: MatchFormatSnapshot; ruleSnapshot: Record<string, unknown> }, slot: BracketSlot): Promise<any> {
    const { matchService } = await import('../../match/application/services/match.service.js');
    const participants = [
      { userId: slot.player1Id!, side: 'home' as const, teamIndex: 0, role: 'host' as const },
      { userId: slot.player2Id!, side: 'away' as const, teamIndex: 1, role: 'joiner' as const },
    ].filter((p) => p.userId != null);
    if (participants.length < 2) throw new ConflictError('A tournament match requires two participants', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    return matchService.createForTournament({
      tournamentId: t.id!,
      sportId: t.sport_id!,
      formatId: formatCtx.formatId,
      ruleSetId: formatCtx.ruleSetId,
      formatSnapshot: formatCtx.formatSnapshot,
      ruleSnapshot: formatCtx.ruleSnapshot,
      participants,
    });
  }

  /** Group 5A — MIXED tournaments: per-stage progression (round-robin -> knockout). */
  private async generateMixedStages(t: Tournament, formatCtx: { formatId: number; ruleSetId: number; formatSnapshot: MatchFormatSnapshot; ruleSnapshot: Record<string, unknown> }, userIds: number[], seed: number, seededBy: Map<number, number>): Promise<BracketSlot[]> {
    const stages = await tournamentRepository.findStages(t.id!);
    if (stages.length === 0) {
      // No explicit stages — default to a single round-robin stage.
      return generateRoundRobinMatches(userIds).map((m) => ({ round: m.round, bracketPosition: 0, player1Id: m.player1Id, player2Id: m.player2Id }));
    }
    const slots: BracketSlot[] = [];
    let offset = 0;
    for (const stage of stages) {
      const stageFormat = stage.progression_format as Tournament['format'];
      const stageCtx = stage.match_format_id != null && stage.rule_set_id != null
        ? await this.resolveMatchFormatContext({ ...t, match_format_id: stage.match_format_id, rule_set_id: stage.rule_set_id })
        : formatCtx;
      if (stageFormat === 'knockout') {
        const knock = generateKnockoutBracket(userIds, { seed: seed + offset, seededBy });
        const stageRounds = Math.max(1, Math.ceil(Math.log2(Math.max(userIds.length, 2))));
        slots.push(...knock.map((s) => {
          const isFirstRound = s.sourceRound == null;
          return {
            ...s,
            stageId: stage.id,
            round: s.round + offset,
            // Absolute-round target wiring so buildDrawMeta does not need to know the stage offset.
            targetRound: s.targetRound != null
              ? s.targetRound + offset
              : (isFirstRound && stageRounds > 1 ? offset + 2 : undefined),
            targetBracketPosition: s.targetBracketPosition != null
              ? s.targetBracketPosition
              : (isFirstRound ? Math.floor((s.bracketPosition ?? 0) / 2) : undefined),
          };
        }));
      } else {
        const rr = generateRoundRobinMatches(userIds).map((m) => ({
          round: m.round + offset,
          bracketPosition: 0,
          stageId: stage.id,
          player1Id: m.player1Id,
          player2Id: m.player2Id,
        }));
        slots.push(...rr);
      }
      offset += 100;
    }
    return slots;
  }

  // ── Group 5B: Progression engine ──────────────────────────────────────────

  /** Parse the draw-time progression provenance of a bracket slot. */
  private parseProgressionMeta(match: TournamentMatch | null | undefined): BracketProgressionMeta | null {
    if (!match) return null;
    const raw = match.progression_meta;
    if (raw == null) return null;
    try {
      const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (typeof obj !== 'object' || obj === null) return null;
      return obj as BracketProgressionMeta;
    } catch {
      return null;
    }
  }

  /** Build the persisted progression_meta for one draw slot. */
  private buildDrawMeta(slot: BracketSlot, isKnockout: boolean): BracketProgressionMeta {
    if (!isKnockout) return { is_bracket: false };
    return {
      is_bracket: true,
      bye: slot.bye === true ? true : undefined,
      target_round: slot.targetRound != null ? slot.targetRound : null,
      target_bracket_position: slot.targetBracketPosition != null ? slot.targetBracketPosition : null,
      target_side: slot.targetSide ?? (((slot.bracketPosition ?? 0) % 2 === 0) ? 'player1' : 'player2'),
    };
  }

  /** Group 5B — walk the tournament lifecycle forward to 'running' after a draw. */
  private async autoStartAfterDraw(t: Tournament): Promise<void> {
    if (!DRAW_LIFECYCLE_ORDER.includes(t.status)) return;
    let cur: string = t.status;
    for (const next of DRAW_LIFECYCLE_ORDER.slice(DRAW_LIFECYCLE_ORDER.indexOf(cur) + 1)) {
      try {
        validateTournamentTransition(cur as any, next as any);
      } catch {
        return; // a chain link is not permitted — stop, never force a transition
      }
      await tournamentRepository.updateStatus(t.id!, next);
      cur = next;
    }
  }

  /**
   * Group 5B — propagate draw-time byes and padding slots (fixpoint).
   *
   * A bracket padded to the next power of two has two kinds of automatic slots:
   *   * Empty padding byes (no participant) — finalise in place.
   *   * Lone slots (one real participant, other side never arrives) — the
   *     participant advances when the missing feed is a finalised empty bye.
   * Runs once at draw time. During live play every real slot is resolved by
   * progressFromApprovedResult — never by this loop.
   */
  async advanceByes(tournamentId: number): Promise<{ advanced: number }> {
    let advanced = 0;
    let changed = true;
    let guard = 0;
    while (changed && guard < 100) {
      changed = false;
      guard += 1;
      const matches = await tournamentRepository.findMatches(tournamentId);
      if (!matches || matches.length === 0) break;
      const ordered = [...matches].sort((a, b) => a.round - b.round);
      for (const slot of ordered) {
        if (slot.progression_state === 'bye' || slot.progression_state === 'completed' || slot.progression_state === 'cancelled') continue;
        const meta = this.parseProgressionMeta(slot);
        if (meta == null || meta.is_bracket !== true) continue;
        const p1 = slot.player1_id ?? null;
        const p2 = slot.player2_id ?? null;
        const absent = p1 == null && p2 == null;
        const lone = (p1 != null) !== (p2 != null);

        if (meta.bye === true) {
          if (absent) {
            // Padding empty bye — finalise in place, nothing propagates.
            await tournamentRepository.updateMatch(slot.id!, { status: 'completed', progression_state: 'bye' });
            changed = true;
            advanced += 1;
          } else if (lone) {
            // Round-1 bye with a real participant — the player advances.
            const winner = p1 != null ? p1 : p2!;
            await this.seatBracketWinner(slot, winner);
            changed = true;
            advanced += 1;
          }
          continue;
        }

        if (lone) {
          // Virtual-bye cascade: a later slot with one participant whose missing
          // feed is a finalised empty bye must advance the present player.
          const missingSide = p1 != null ? 'player2' : 'player1';
          const j = slot.bracket_position ?? 0;
          const missingPos = missingSide === 'player1' ? j * 2 : j * 2 + 1;
          const feed = await tournamentRepository.findBracketSlot(tournamentId, slot.round - 1, missingPos);
          if (feed && feed.progression_state === 'bye' && feed.winner_id == null) {
            const winner = p1 != null ? p1 : p2!;
            await this.seatBracketWinner(slot, winner);
            changed = true;
            advanced += 1;
          }
        }
      }
    }
    return { advanced };
  }

  /**
   * Group 5B — finalise a resolved slot and seat its winner in the target slot.
   * Shared helper for draw-time byes and live progression.
   */
  private async seatBracketWinner(slot: TournamentMatch, winnerId: number): Promise<TournamentMatch | null> {
    const meta = this.parseProgressionMeta(slot);
    await tournamentRepository.updateMatch(slot.id!, { winner_id: winnerId, status: 'completed', progression_state: 'completed' });
    if (!meta || meta.target_round == null || meta.target_bracket_position == null) {
      return null;
    }
    const target = await tournamentRepository.findBracketSlot(slot.tournament_id, meta.target_round, meta.target_bracket_position);
    if (!target) return null;
    const side = meta.target_side === 'player2' ? 'player2_id' : 'player1_id';
    if ((target as any)[side] != null) return target;
    await tournamentRepository.updateMatch(target.id!, ({ [side]: winnerId }) as Partial<TournamentMatch>);
    eventBusV2.emit('tournament:match-progressed', {
      tournamentId: slot.tournament_id, matchId: null, fromSlotId: slot.id, toSlotId: target.id,
      winnerId, stageId: target.stage_id ?? null,
    } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(slot.tournament_id), aggregateVersion: 1,
    });
    return target;
  }

  /**
   * Group 5B — progression entry point driven EXCLUSIVELY by authoritative
   * APPROVED shared Match results (match:result-approved / auto-approved /
   * resolved-approved). Idempotent: a slot is resolved once.
   */
  async progressFromApprovedResult(input: { matchId: number; resultId: number }): Promise<{
    source?: TournamentMatch;
    advancedTo: number | null;
    sharedMatchId?: number | null;
    stageCompleted?: boolean;
    tournamentCompleted?: boolean;
  }> {
    const source = await tournamentRepository.findMatchBySharedMatchId(input.matchId);
    if (!source) {
      // Not a tournament bracket slot — nothing to progress.
      return { advancedTo: null };
    }

    const participants = await matchResultRepository.getParticipants(input.resultId);
    const winnerId = participants.find((p) => p.outcome === 'win')?.userId ?? null;

    const meta = this.parseProgressionMeta(source);
    if (meta == null || meta.is_bracket !== true) {
      // Round-robin / group stage / legacy slot — standings ingestion only.
      const conn = await getPool().getConnection();
      try {
        await conn.beginTransaction();
        await tournamentRepository.updateMatch(source.id!, {
          winner_id: winnerId,
          status: 'completed',
          progression_state: 'completed',
        }, conn);
        await tournamentRepository.recalculateStandings(source.tournament_id, source.group_id ?? undefined, conn);
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
      eventBusV2.emit('tournament:match-progressed', {
        tournamentId: source.tournament_id, matchId: input.matchId, resultId: input.resultId,
        winnerId, fromSlotId: source.id, advancedTo: null, stageId: source.stage_id ?? null,
      } as Record<string, unknown>, {
        aggregateType: 'tournament', aggregateId: String(source.tournament_id), aggregateVersion: 1,
      });
      return { source, advancedTo: null };
    }

    // Bracket slot.
    if (source.progression_state === 'completed' || source.progression_state === 'bye' || source.progression_state === 'cancelled') {
      // Duplicate delivery — already resolved.
      return { source, advancedTo: null };
    }
    if (winnerId == null) {
      // Approved no-result / draw — the slot resolves without a winner; nothing propagates.
      await tournamentRepository.updateMatch(source.id!, { status: 'completed', progression_state: 'completed' });
      return { source, advancedTo: null };
    }

    const t = await this.getById(source.tournament_id);
    const conn = await getPool().getConnection();
    let target: TournamentMatch | null = null;
    let stageCompleted = false;
    let tournamentCompleted = false;
    try {
      await conn.beginTransaction();
      await tournamentRepository.updateMatch(source.id!, {
        winner_id: winnerId,
        status: 'completed',
        progression_state: 'completed',
      }, conn);

      if (meta.target_round == null || meta.target_bracket_position == null) {
        // Final round — the tournament is complete.
        await tournamentRepository.updateStatus(source.tournament_id, 'completed', conn);
        tournamentCompleted = true;
      } else {
        target = await tournamentRepository.findBracketSlot(source.tournament_id, meta.target_round, meta.target_bracket_position);
        if (target) {
          const side = meta.target_side === 'player2' ? 'player2_id' : 'player1_id';
          if ((target as any)[side] == null) {
            await tournamentRepository.updateMatch(target.id!, ({ [side]: winnerId }) as Partial<TournamentMatch>, conn);
            // Keep the in-memory slot authoritative so attachSharedMatchToTarget
            // (which runs after commit) sees both participants without a re-read.
            (target as any)[side] = winnerId;
          }
        }
      }

      if (source.stage_id != null) {
        const remaining = await tournamentRepository.countIncompleteStageMatches(source.stage_id, conn);
        if (remaining === 0) {
          await tournamentRepository.updateStageStatus(source.stage_id, 'completed', conn);
          stageCompleted = true;
          const stages = await tournamentRepository.findStages(source.tournament_id);
          if (stages.length > 0) {
            const maxOrder = Math.max(...stages.map((s) => s.stage_order));
            const stage = stages.find((s) => s.id === source.stage_id);
            if (stage && stage.stage_order === maxOrder) {
              await tournamentRepository.updateStatus(source.tournament_id, 'completed', conn);
              tournamentCompleted = true;
            }
          }
        }
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    let sharedMatchId: number | null = null;
    if (target) {
      const attached = await this.attachSharedMatchToTarget(target, t);
      if (attached) {
        sharedMatchId = attached;
        eventBusV2.emit('tournament:match-created', {
          tournamentId: t.id, matchId: sharedMatchId, tournamentMatchId: target.id, winnerId,
          organisationId: t.organisation_id ?? null,
        } as Record<string, unknown>, {
          aggregateType: 'tournament', aggregateId: String(t.id), aggregateVersion: 1,
        });
      }
    }

    if (stageCompleted) {
      eventBusV2.emit('tournament:stage-completed', { tournamentId: t.id, stageId: source.stage_id, winnerId, organisationId: t.organisation_id ?? null } as Record<string, unknown>, {
        aggregateType: 'tournament', aggregateId: String(t.id), aggregateVersion: 1,
      });
    }
    if (tournamentCompleted) {
      eventBusV2.emit('tournament:completed', { tournamentId: t.id, winnerId, userId: winnerId, name: t.name, organisationId: t.organisation_id ?? null } as Record<string, unknown>, {
        aggregateType: 'tournament', aggregateId: String(t.id), aggregateVersion: 1,
      });
    }
    eventBusV2.emit('tournament:match-progressed', {
      tournamentId: t.id, matchId: input.matchId, resultId: input.resultId, winnerId,
      fromSlotId: source.id, toSlotId: target?.id ?? null, stageId: source.stage_id ?? null,
      organisationId: t.organisation_id ?? null,
    } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(t.id), aggregateVersion: 1,
    });
    return { source, advancedTo: target?.id ?? null, sharedMatchId, stageCompleted, tournamentCompleted };
  }

  /**
   * Group 5B — once a target slot has BOTH participants and no shared Match yet,
   * create the shared Match (with the stage/tournament frozen format) and link it.
   */
  private async attachSharedMatchToTarget(target: TournamentMatch, t: Tournament): Promise<number | null> {
    if (target.match_id != null) return target.match_id;
    if (target.player1_id == null || target.player2_id == null) return null;
    let formatCtx = await this.resolveMatchFormatContext(t);
    if (target.stage_id != null) {
      const stages = await tournamentRepository.findStages(t.id!);
      const stage = stages.find((s) => s.id === target.stage_id);
      if (stage && stage.match_format_id != null && stage.rule_set_id != null) {
        formatCtx = await this.resolveMatchFormatContext({ ...t, match_format_id: stage.match_format_id, rule_set_id: stage.rule_set_id });
      }
    }
    const shared = await this.createTournamentMatchFromSlot(t, formatCtx, {
      round: target.round,
      player1Id: target.player1_id,
      player2Id: target.player2_id,
    });
    await tournamentRepository.updateMatch(target.id!, { match_id: shared.id, progression_state: 'ready' });
    return shared.id;
  }

  /**
   * @deprecated T-B — legacy cosmetic result path. Writes to
   * `tournament_match_results` and emits the dead `match.result.recorded`
   * event; it does NOT drive bracket progression. Retained ONLY for historical
   * audit compatibility — new results MUST use `recordSharedResult` (the
   * authoritative shared Match Result lifecycle).
   */
  async recordMatchResult(matchId: number, winnerId: number, homeScore?: string, awayScore?: string, scoreDetails?: string, enteredBy?: number): Promise<void> {
    const match = await tournamentRepository.findMatchById(matchId);
    if (!match) throw new NotFoundError('Match', ErrorCodes.MATCH_NOT_FOUND);

    await tournamentRepository.createMatchResult({
      match_id: matchId,
      winner_id: winnerId,
      home_score: homeScore,
      away_score: awayScore,
      score_details: scoreDetails,
      entered_by: enteredBy!,
    });

    await tournamentRepository.updateMatchStatus(matchId, 'completed', winnerId);

    if (match.tournament_id) {
      await tournamentRepository.recalculateStandings(match.tournament_id, match.group_id ?? undefined);
    }

    eventBusV2.emit('match.result.recorded', { matchId, winnerId } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(match.tournament_id), aggregateVersion: 1,
    });
  }

  async assignCourt(matchId: number, resourceId: number): Promise<void> {
    const match = await tournamentRepository.findMatchById(matchId);
    if (!match) throw new NotFoundError('Match', ErrorCodes.MATCH_NOT_FOUND);
    await tournamentRepository.assignCourt(matchId, resourceId);
  }

  async assignReferee(matchId: number, refereeId: number): Promise<void> {
    const match = await tournamentRepository.findMatchById(matchId);
    if (!match) throw new NotFoundError('Match', ErrorCodes.MATCH_NOT_FOUND);
    await tournamentRepository.assignReferee(matchId, refereeId);
    await this.emitRefereeAssigned(match, refereeId, 'tournament');
  }

  // ── T-B: shared playable Match lifecycle bridge ────────────────────────────
  //
  // Tournament matches are ORCHESTRATED through the EXISTING shared Match /
  // Match Session / Match Result lifecycle. No tournament-specific session,
  // booking, court or result engine exists. A "start" only means "this match
  // is now being played" — it never invents a court reservation or schedule.

  /**
   * T-B — start a Tournament Match through the shared Match Session lifecycle.
   * `sessionService.start` requires the shared Match to be `closed` (tournament
   * matches are created `closed`), creates the `match_sessions` row (idempotent
   * — a second call throws SESSION_EXISTS), sets the shared Match to
   * `in_progress` and emits the canonical `session:started` event. The match
   * status is mirrored onto the bracket slot for display.
   */
  async startTournamentMatch(matchId: number, actorId: number): Promise<TournamentMatch> {
    const match = await tournamentRepository.findMatchById(matchId);
    if (!match) throw new NotFoundError('Tournament match', ErrorCodes.TOURNAMENT_NOT_FOUND);
    if (match.match_id == null) {
      throw new ConflictError('This tournament match has no shared Match — cannot start it', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
    const { matchService } = await import('../../match/application/services/match.service.js');
    await matchService.startMatch(match.match_id);
    await tournamentRepository.updateMatch(match.id!, { status: 'in_progress' });
    await recordAudit({ actorId, action: 'tournament.match.started', entityType: 'tournament_match', entityId: match.id, afterState: { shared_match_id: match.match_id } });
    // session:started is not socket-bridged; match:updated is. Emit both so the
    // admin/org match lists refresh live without a manual reload.
    eventBusV2.emit('match:updated', { matchId: match.match_id } as Record<string, unknown>, {
      aggregateType: 'match', aggregateId: String(match.match_id), aggregateVersion: 1,
    });
    return (await tournamentRepository.findMatchById(matchId))!;
  }

  /**
   * T-B — complete the shared Match Session of a Tournament Match. Delegates to
   * `sessionService.complete` (requires an in-progress session; records
   * `ended_at`, the source of `played_at`, and emits `session:completed`).
   */
  async completeTournamentMatch(matchId: number, actorId: number): Promise<TournamentMatch> {
    const match = await tournamentRepository.findMatchById(matchId);
    if (!match) throw new NotFoundError('Tournament match', ErrorCodes.TOURNAMENT_NOT_FOUND);
    if (match.match_id == null) {
      throw new ConflictError('This tournament match has no shared Match — cannot complete it', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
    const { matchService } = await import('../../match/application/services/match.service.js');
    await matchService.completeMatch(match.match_id);
    await tournamentRepository.updateMatch(match.id!, { status: 'completed' });
    await recordAudit({ actorId, action: 'tournament.match.completed', entityType: 'tournament_match', entityId: match.id, afterState: { shared_match_id: match.match_id } });
    eventBusV2.emit('match:updated', { matchId: match.match_id } as Record<string, unknown>, {
      aggregateType: 'match', aggregateId: String(match.match_id), aggregateVersion: 1,
    });
    return (await tournamentRepository.findMatchById(matchId))!;
  }

  /**
   * T-B — record a Tournament Match result through the AUTHORITATIVE shared
   * Match Result lifecycle. The operator (admin/org staff) submits on behalf of
   * the match via the manage-guarded `actorIsOperator` option; the shared
   * rules engine validates against the FROZEN format/rule snapshots, the shared
   * state machine (pending_confirmation → accepted/disputed/auto-approved)
   * drives approval, and the existing progression listener consumes the
   * `match:result-approved` event to propagate the winner.
   *
   * The legacy `recordMatchResult` path is NOT used for new results.
   */
  async recordSharedResult(
    matchId: number,
    actorId: number,
    payload: RawMatchResultPayload,
    ip?: string,
  ): Promise<{ sharedMatchId: number; resultId: number }> {
    const match = await tournamentRepository.findMatchById(matchId);
    if (!match) throw new NotFoundError('Tournament match', ErrorCodes.TOURNAMENT_NOT_FOUND);
    if (match.match_id == null) {
      throw new ConflictError('This tournament match has no shared Match — record the result on the shared Match instead', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
    const { matchResultService } = await import('../../match-result/application/match-result.service.js');
    const record = await matchResultService.submitMatchResult(match.match_id, actorId, payload, ip, { actorIsOperator: true });
    await tournamentRepository.updateMatch(match.id!, { score_summary: record.finalResult?.scoreSummary ?? null });
    return { sharedMatchId: match.match_id, resultId: record.id };
  }

  /** T-B — bracket slots joined to their shared Match context (admin/org result screen). */
  async getMatchesDetailed(tournamentId: number) {
    return tournamentRepository.findMatchesDetailed(tournamentId);
  }

  /** Emit referee:assigned with the referee's user_id (non-fatal). */
  private async emitRefereeAssigned(match: any, refereeId: number, matchType: 'league' | 'tournament'): Promise<void> {
    try {
      const [rows] = await getPool().execute<any[]>(
        'SELECT user_id FROM referees WHERE id = ? AND deleted_at IS NULL LIMIT 1', [refereeId],
      );
      const userId = rows[0]?.user_id;
      if (!userId) return;
      eventBusV2.emit('referee:assigned', {
        matchId: Number(match.id),
        refereeId,
        userId,
        matchType,
      } as any);
    } catch (err) {
      // Notification emission is non-fatal; assignment already persisted.
      console.error('emitRefereeAssigned failed', err);
    }
  }

  async recalculateStandings(tournamentId: number): Promise<void> {
    await this.getById(tournamentId);
    await tournamentRepository.recalculateStandings(tournamentId);
  }

  async getDashboard() {
    return tournamentRepository.getDashboard();
  }

  async getBracket(tournamentId: number) {
    return tournamentRepository.findMatches(tournamentId);
  }

  async getStandings(tournamentId: number, groupId?: number) {
    return tournamentRepository.getStandings(tournamentId, groupId);
  }

  async getMatches(tournamentId: number) {
    return tournamentRepository.findMatchesDetailed(tournamentId);
  }

  async getGroups(tournamentId: number) {
    return tournamentRepository.findGroups(tournamentId);
  }

  async getRegistrations(tournamentId: number) {
    return tournamentRepository.findRegistrationsByTournament(tournamentId);
  }

  /** Group 5A — MIXED tournament stages. */
  async createStage(tournamentId: number, data: Partial<TournamentStage>): Promise<TournamentStage> {
    const t = await this.getById(tournamentId);
    if (data.match_format_id != null && data.rule_set_id != null) {
      await this.assertMatchFormatRuleSetPair(data.match_format_id, data.rule_set_id);
    }
    if (data.match_format_id != null && data.rule_set_id == null) {
      throw new ConflictError('A stage with a Match Format must also configure a Rule Set', ErrorCodes.TOURNAMENT_INVALID_FORMAT);
    }
    const id = await tournamentRepository.createStage({ ...data, tournament_id: tournamentId });
    const stage = (await tournamentRepository.findStages(tournamentId)).find((s) => s.id === id);
    if (!stage) throw new NotFoundError('Stage', ErrorCodes.TOURNAMENT_GROUP_NOT_FOUND);
    eventBusV2.emit('tournament.stage-created', { tournamentId, stageId: id, name: stage.name, progressionFormat: stage.progression_format } as Record<string, unknown>, {
      aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1,
    });
    return stage;
  }

  async getStages(tournamentId: number) {
    return tournamentRepository.findStages(tournamentId);
  }
}

export const tournamentService = new TournamentService();

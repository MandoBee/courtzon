import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { competitionRepository } from '../infrastructure/repositories/competition.repository.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import { participantDrawRepository } from '../infrastructure/repositories/participant-draw.repository.js';
import { recordAudit } from '../../audit-log/index.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import type { Tournament, TournamentCompetition, TournamentVenue } from '../domain/tournament-aggregate.js';

/**
 * G11.20 — realtime broadcast for a competition-category change.
 * Emitted from the SERVICE layer (never the controller) with the tournament
 * aggregate scope, so organisation dashboards and the public competition list
 * refresh without a browser reload. These events are UI-refresh only — they carry
 * no notification intent, so they are not routed to the notification engine.
 */
function emitCompetitionEvent(eventName: string, tournamentId: number, competitionId: number): void {
  eventBusV2.emit(
    eventName,
    { tournamentId, competitionId },
    { aggregateType: 'tournament', aggregateId: String(tournamentId), aggregateVersion: 1 },
  );
}

/** G11.20 — writable competition configuration (everything the table already supports). */
export interface CompetitionManagementInput {
  competition_type?: 'singles' | 'doubles' | 'team';
  name?: string;
  match_format_id?: number | null;
  rule_set_id?: number | null;
  bracket_type_id?: number | null;
  sport_id?: number | null;
  entry_fee?: number;
  registration_fee?: number;
  currency_code?: string;
  price_type?: 'FREE' | 'FIXED' | 'MEMBERS_ONLY';
  max_participants?: number | null;
  min_participants?: number;
  registration_payment_methods?: string[] | null;
  waitlist_enabled?: boolean;
  age_mode?: 'open' | 'categories' | null;
  age_category_ids?: number[] | null;
  gender_categories?: string[] | null;
  level_ids?: number[] | null;
}

/**
 * G11.18 — Competition Category domain service (Phase 1 foundation).
 *
 * The authoritative resolver for competition identity. Phase 2+ will route
 * registration / format / fee / eligibility / prize reads through these
 * methods; today they establish the ownership + tenant guards that make a
 * client-supplied competitionId SAFE (defence in depth, never trusted alone).
 */
export class CompetitionService {
  /**
   * Resolve a competition that MUST belong to the given tournament.
   * When `organisationId` is supplied, the tournament must ALSO belong to that
   * organisation. Cross-tournament and cross-tenant ids fail closed with
   * NotFound (never 403 — the existence is not leaked).
   */
  async resolveCompetition(
    tournamentId: number,
    competitionId: number,
    opts: { organisationId?: number | null } = {},
  ): Promise<TournamentCompetition> {
    const competition = await competitionRepository.findById(Number(competitionId));
    if (!competition || Number(competition.tournament_id) !== Number(tournamentId)) {
      throw new NotFoundError('Competition', ErrorCodes.TOURNAMENT_COMPETITION_NOT_FOUND);
    }
    if (opts.organisationId != null) {
      const t = await tournamentRepository.findById(Number(tournamentId));
      if (!t || Number(t.organisation_id ?? null) !== Number(opts.organisationId)) {
        throw new NotFoundError('Competition', ErrorCodes.TOURNAMENT_COMPETITION_NOT_FOUND);
      }
    }
    return competition;
  }

  /** The legacy-preserving default competition of a tournament (auto-created). */
  async findDefault(tournamentId: number): Promise<TournamentCompetition | null> {
    return competitionRepository.findDefaultByTournament(Number(tournamentId));
  }

  /** List every competition of a tournament (default first). */
  async listCompetitions(tournamentId: number): Promise<TournamentCompetition[]> {
    return competitionRepository.findByTournament(Number(tournamentId));
  }

  /**
   * G11.18 Phase 2 — the authoritative registration-time competition resolution.
   *   * explicit competitionId → must belong to the tournament (fail closed);
   *   * omitted competitionId → backward compatibility: the tournament's SINGLE
   *     competition (the default) is used; with MULTIPLE competitions, omitting
   *     the id fails clearly (never silently pick one).
   */
  async resolveRegistrationCompetition(
    tournamentId: number,
    competitionId?: number | null,
  ): Promise<TournamentCompetition | null> {
    if (competitionId != null) {
      return this.resolveCompetition(tournamentId, competitionId);
    }
    // A null result = legacy fallback: the row has NO competition identifiers
    // (pre-Phase-2 data or a unit/mock environment). Every downstream value then
    // stays at tournament scope and the DB trigger assigns the default
    // competition on insert — byte-identical pre-Phase-2 behavior.
    let competitions: TournamentCompetition[];
    try {
      competitions = (await competitionRepository.findByTournament(Number(tournamentId))) ?? [];
    } catch {
      return null;
    }
    if (competitions.length === 0) return null;
    if (competitions.length > 1) {
      throw new ValidationError(
        'This tournament has multiple competition categories — select one to register',
        ErrorCodes.TOURNAMENT_COMPETITION_REQUIRED,
        { competitions: competitions.map((c) => c.id) },
      );
    }
    return competitions[0];
  }

  // ── G11.20 — Competition Category Management ──────────────────────────────
  // Until G11.20 the only non-test writer of `tournament_competitions` was
  // `tournament.service.ts → createDefault` at tournament creation, so a
  // tournament could never own a SECOND category in the product. That made every
  // competition-scoped read/write shipped by G11.18 (P2/P3), G11.19 (seeds) and
  // C1/C2 (prizes/matches) unreachable dead code. These methods make the
  // multi-competition state reachable — with NO schema change, because the table
  // already carried every configuration column and `uk_comp_tournament_default`
  // (tournament_id, default_flag) already permits exactly ONE default alongside
  // unlimited non-defaults.

  /**
   * Load the tournament and FAIL CLOSED on the organisation boundary.
   * Returns NotFound (never 403) so a foreign tournament id is indistinguishable
   * from a missing one.
   */
  private async assertTournamentInOrg(tournamentId: number, organisationId: number): Promise<Tournament> {
    const t = await tournamentRepository.findById(Number(tournamentId));
    if (!t || Number(t.organisation_id ?? null) !== Number(organisationId)) {
      throw new NotFoundError('Tournament', ErrorCodes.TOURNAMENT_NOT_FOUND);
    }
    return t;
  }

  /** Reject unknown configuration FK targets with a clean 422 instead of a raw MySQL 1452. */
  private async assertReferencesExist(input: CompetitionManagementInput): Promise<void> {
    const missing = await competitionRepository.missingReferences(input);
    if (missing.length > 0) {
      throw new ValidationError(
        `Unknown competition reference(s): ${missing.join(', ')}`,
        ErrorCodes.TOURNAMENT_COMPETITION_TYPE_INVALID,
        { fields: missing },
      );
    }
  }

  /**
   * G11.20 — create an ADDITIONAL competition category on a tournament.
   * `is_default` is always 0 (the default is created once at tournament creation
   * and is immutable), which is what keeps "exactly one default per tournament"
   * true by construction rather than by a compensating write.
   */
  async createCompetition(
    tournamentId: number,
    organisationId: number,
    actorId: number,
    input: CompetitionManagementInput & { competition_type: 'singles' | 'doubles' | 'team'; name: string },
  ): Promise<TournamentCompetition> {
    const t = await this.assertTournamentInOrg(tournamentId, organisationId);
    await this.assertReferencesExist(input);

    // A new category is always internally consistent with its parent tournament:
    // currency and the sport/bracket anchors are inherited when omitted.
    const max = input.max_participants ?? null;
    const min = input.min_participants ?? 2;
    if (max != null && min > max) {
      throw new ValidationError(
        'min_participants cannot exceed max_participants',
        ErrorCodes.TOURNAMENT_COMPETITION_TYPE_INVALID,
        { min_participants: min, max_participants: max },
      );
    }

    const competitionId = await competitionRepository.create({
      tournament_id: Number(tournamentId),
      competition_type: input.competition_type,
      name: input.name,
      match_format_id: input.match_format_id ?? null,
      rule_set_id: input.rule_set_id ?? null,
      bracket_type_id: input.bracket_type_id ?? (t.bracket_type_id ?? null),
      sport_id: input.sport_id ?? (t.sport_id ?? null),
      entry_fee: input.entry_fee ?? 0,
      registration_fee: input.registration_fee ?? input.entry_fee ?? 0,
      currency_code: input.currency_code ?? t.currency_code ?? 'EGP',
      price_type: input.price_type ?? 'FIXED',
      max_participants: max,
      min_participants: min,
      registration_payment_methods: input.registration_payment_methods ?? null,
      waitlist_enabled: input.waitlist_enabled ?? false,
      age_mode: input.age_mode ?? null,
      age_category_ids: input.age_category_ids ?? null,
      gender_categories: input.gender_categories ?? null,
      level_ids: input.level_ids ?? null,
    });

    await recordAudit({
      actorId,
      action: 'TOURNAMENT.COMPETITION_CREATED',
      entityType: 'tournament_competition',
      entityId: competitionId,
      beforeState: null,
      afterState: {
        tournament_id: Number(tournamentId),
        competition_type: input.competition_type,
        name: input.name,
        entry_fee: input.entry_fee ?? 0,
        currency_code: input.currency_code ?? t.currency_code ?? 'EGP',
        max_participants: max,
      },
    });
    emitCompetitionEvent('tournament:competition-created', Number(tournamentId), competitionId);

    return (await competitionRepository.findById(competitionId))!;
  }

  /**
   * G11.20 — PATCH a competition category.
   * `tournament_id` and `is_default` are not updatable, so a category can never be
   * moved between tournaments nor silently lose default status.
   */
  async updateCompetition(
    tournamentId: number,
    competitionId: number,
    organisationId: number,
    actorId: number,
    input: CompetitionManagementInput,
  ): Promise<TournamentCompetition> {
    // Fail closed across BOTH the tournament and the organisation boundary.
    const existing = await this.resolveCompetition(tournamentId, competitionId, { organisationId });
    const t = await this.assertTournamentInOrg(tournamentId, organisationId);
    await this.assertReferencesExist(input);

    // Cross-field validation against the MERGED result, not just the patch, so a
    // min-only or max-only edit can never produce an impossible range.
    const mergedMax = input.max_participants !== undefined ? input.max_participants : (existing.max_participants ?? null);
    const mergedMin = input.min_participants !== undefined ? input.min_participants : Number(existing.min_participants ?? 2);
    if (mergedMax != null && mergedMin > mergedMax) {
      throw new ValidationError(
        'min_participants cannot exceed max_participants',
        ErrorCodes.TOURNAMENT_COMPETITION_TYPE_INVALID,
        { min_participants: mergedMin, max_participants: mergedMax },
      );
    }

    // Shrinking capacity below the participants already admitted would leave the
    // competition permanently over capacity and make waitlist promotion
    // impossible — refuse it rather than corrupt the invariant.
    if (mergedMax != null && input.max_participants !== undefined) {
      const active = await participantDrawRepository.countParticipantsByCompetition(Number(tournamentId), Number(competitionId));
      if (Number(input.max_participants) < active) {
        throw new ConflictError(
          `Cannot reduce capacity to ${input.max_participants} — ${active} participant(s) are already active in this competition`,
          ErrorCodes.TOURNAMENT_CAPACITY_FULL,
          { active_participants: active, requested: Number(input.max_participants) },
        );
      }
    }

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      patch[key] = value;
    }
    // Never let the service leak an inherited field into the SET clause.
    delete patch.tournament_id;
    delete patch.is_default;

    if (Object.keys(patch).length === 0) return existing;

    await competitionRepository.update(Number(competitionId), patch as any);
    const updated = (await competitionRepository.findById(Number(competitionId)))!;

    await recordAudit({
      actorId,
      action: 'TOURNAMENT.COMPETITION_UPDATED',
      entityType: 'tournament_competition',
      entityId: Number(competitionId),
      beforeState: {
        name: existing.name,
        competition_type: existing.competition_type,
        entry_fee: existing.entry_fee ?? null,
        currency_code: existing.currency_code ?? null,
        max_participants: existing.max_participants ?? null,
        waitlist_enabled: existing.waitlist_enabled ?? null,
        price_type: existing.price_type ?? null,
      },
      afterState: {
        name: updated.name,
        competition_type: updated.competition_type,
        entry_fee: updated.entry_fee ?? null,
        currency_code: updated.currency_code ?? null,
        max_participants: updated.max_participants ?? null,
        waitlist_enabled: updated.waitlist_enabled ?? null,
        price_type: updated.price_type ?? null,
      },
    });
    emitCompetitionEvent('tournament:competition-updated', Number(tournamentId), Number(competitionId));

    return updated;
  }

  /**
   * G11.20 — deactivate (remove) a competition category.
   *
   * `tournament_competitions` has NO `is_active`/`status` column and G11.20 is
   * explicitly schema-free, so deactivation is modelled as a GUARDED REMOVAL.
   * Nine descendant tables FK to this table with ON DELETE CASCADE (draws,
   * groups, matches, participants, placements, prizes, registrations, seeds,
   * stages), so an unguarded DELETE would silently destroy real registrations,
   * seeds and match history. Three invariants therefore block the removal:
   *
   *   1. the DEFAULT competition can never be removed (registration without an
   *      explicit competition id must always resolve, and it is what keeps
   *      "exactly one default" true);
   *   2. the LAST remaining competition can never be removed (a tournament must
   *      always expose at least one category);
   *   3. no category with dependent business data can be removed.
   */
  async deactivateCompetition(
    tournamentId: number,
    competitionId: number,
    organisationId: number,
    actorId: number,
  ): Promise<{ deactivated: true; competition_id: number }> {
    const competition = await this.resolveCompetition(tournamentId, competitionId, { organisationId });

    if (Number(competition.is_default ?? 0) === 1) {
      throw new ConflictError(
        'The default competition cannot be deactivated — it preserves legacy single-competition behavior',
        ErrorCodes.TOURNAMENT_COMPETITION_TYPE_INVALID,
        { competition_id: Number(competitionId) },
      );
    }

    const total = await competitionRepository.countByTournament(Number(tournamentId));
    if (total <= 1) {
      throw new ConflictError(
        'A tournament must always have at least one competition category',
        ErrorCodes.TOURNAMENT_COMPETITION_TYPE_INVALID,
        { competition_id: Number(competitionId), competitions: total },
      );
    }

    // Dependency guard — report exactly which tables still reference the category.
    const dependents = await competitionRepository.countDependents(Number(competitionId));
    const blockers = Object.entries(dependents).filter(([, count]) => count > 0);
    if (blockers.length > 0) {
      throw new ConflictError(
        'Cannot deactivate a competition that still has registrations or tournament data',
        ErrorCodes.TOURNAMENT_COMPETITION_TYPE_INVALID,
        {
          competition_id: Number(competitionId),
          blocked_by: Object.fromEntries(blockers),
        },
      );
    }

    const removed = await competitionRepository.setActive(Number(competitionId), false);
    if (!removed) {
      throw new NotFoundError('Competition', ErrorCodes.TOURNAMENT_COMPETITION_NOT_FOUND);
    }

    await recordAudit({
      actorId,
      action: 'TOURNAMENT.COMPETITION_DEACTIVATED',
      entityType: 'tournament_competition',
      entityId: Number(competitionId),
      beforeState: {
        tournament_id: Number(tournamentId),
        name: competition.name,
        competition_type: competition.competition_type,
      },
      afterState: { active: false },
    });
    emitCompetitionEvent('tournament:competition-deactivated', Number(tournamentId), Number(competitionId));

    return { deactivated: true, competition_id: Number(competitionId) };
  }

  /**
   * Competition management view — adds the derived numbers an operator needs to
   * decide whether a category can still be edited or deactivated.
   */
  async describeForManagement(
    tournamentId: number,
    competitionId: number,
    organisationId: number,
  ): Promise<Record<string, unknown>> {
    const competition = await this.resolveCompetition(tournamentId, competitionId, { organisationId });
    const active = await participantDrawRepository.countParticipantsByCompetition(Number(tournamentId), Number(competitionId));
    const waiting = await participantDrawRepository.countWaitingParticipantsByCompetition(Number(tournamentId), Number(competitionId));
    const dependents = await competitionRepository.countDependents(Number(competitionId));
    const blockers = Object.entries(dependents).filter(([, count]) => count > 0).map(([table]) => table);
    const isDefault = Number(competition.is_default ?? 0) === 1;
    const total = await competitionRepository.countByTournament(Number(tournamentId));
    return {
      ...competition,
      is_default: isDefault,
      active_participants: active,
      waiting_participants: waiting,
      // The UI uses these to disable the destructive action with a reason instead
      // of letting the operator fire a request that is guaranteed to be rejected.
      can_deactivate: !isDefault && total > 1 && blockers.length === 0,
      deactivation_blockers: blockers,
    };
  }

  // ── Competition-scoped config views (competition-first, tournament fallback) ──
  // The default competition copied the tournament values in Phase 1, so for a
  // single/default competition these resolve IDENTICALLY to the legacy values.

  entryFee(c: TournamentCompetition, t: Tournament): number {
    return Number(c.entry_fee ?? t.entry_fee ?? 0);
  }

  registrationFee(c: TournamentCompetition, t: Tournament): number {
    return Number(c.registration_fee ?? t.registration_fee ?? 0);
  }

  currency(c: TournamentCompetition, t: Tournament): string {
    return c.currency_code ?? t.currency_code ?? 'EGP';
  }

  priceType(c: TournamentCompetition, t: Tournament): 'FREE' | 'FIXED' | 'MEMBERS_ONLY' | null {
    return (c.price_type ?? t.price_type ?? null) as 'FREE' | 'FIXED' | 'MEMBERS_ONLY' | null;
  }

  maxParticipants(c: TournamentCompetition, t: Tournament): number {
    return Number(c.max_participants ?? t.max_participants ?? 0);
  }

  minParticipants(c: TournamentCompetition, t: Tournament): number {
    return Number(c.min_participants ?? t.min_participants ?? 2);
  }

  waitlistEnabled(c: TournamentCompetition, t: Tournament): boolean {
    return Boolean(Number(c.waitlist_enabled ?? (t as any).waitlist_enabled ?? 0));
  }

  registrationPaymentMethods(c: TournamentCompetition, t: Tournament): string[] | string | null {
    return c.registration_payment_methods ?? t.registration_payment_methods ?? null;
  }

  /**
   * Build an eligibility-anchored Tournament view for the central eligibility
   * service (it reads age_mode/age_category_ids/gender_categories/level_ids and
   * the start date for the age reference year). Competition eligibility fields
   * win when set; the tournament start date is intentionally inherited.
   */
  eligibilityView(t: Tournament, c: TournamentCompetition): Tournament {
    return {
      ...t,
      age_mode: (c.age_mode ?? t.age_mode ?? null) as Tournament['age_mode'],
      age_category_ids: (c.age_category_ids ?? t.age_category_ids ?? null) as Tournament['age_category_ids'],
      gender_categories: (c.gender_categories ?? t.gender_categories ?? null) as Tournament['gender_categories'],
      level_ids: (c.level_ids ?? t.level_ids ?? null) as Tournament['level_ids'],
    };
  }

  /** Format anchor of a competition (the tournament sport stays authoritative). */
  formatId(c: TournamentCompetition, t: Tournament): number | null | undefined {
    return c.match_format_id ?? t.match_format_id;
  }

  // ── G11.18 Phase 3 — venue resolution ──────────────────────────────────────

  /** Safe key-less map/navigation URL derived ONLY from real coordinates. */
  mapsUrlFrom(latitude?: number | null, longitude?: number | null): string | null {
    if (latitude == null || longitude == null) return null;
    const lat = Number(latitude); const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  /** Server-side validation of the external-venue payload (never trusts the client to type coordinates). */
  validateExternalVenue(v: {
    venueName?: string | null; address?: string | null; city?: string | null; country?: string | null;
    latitude?: number | null; longitude?: number | null; placeId?: string | null; venueContact?: string | null;
  }): void {
    const hasCoords = v.latitude != null && v.longitude != null
      && Number.isFinite(Number(v.latitude)) && Number.isFinite(Number(v.longitude))
      && Math.abs(Number(v.latitude)) <= 90 && Math.abs(Number(v.longitude)) <= 180;
    const hasLocator = Boolean(v.venueName?.trim()) || Boolean(v.address?.trim()) || Boolean(v.city?.trim());
    if (!hasCoords && !hasLocator) {
      throw new ValidationError(
        'External venue requires at least a name/address or valid map coordinates',
        ErrorCodes.TOURNAMENT_COMPETITION_TYPE_INVALID,
      );
    }
  }

  /** Server-side validation of a competition venue override (documented shape). */
  validateVenueOverride(raw: unknown): Record<string, unknown> {
    const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const allowed = ['venueName', 'address', 'city', 'country', 'latitude', 'longitude', 'placeId', 'venueContact', 'mapsUrl'];
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) {
      if (allowed.includes(k)) out[k] = v[k];
    }
    const o = out as any;
    o.venueName = o.venueName ? String(o.venueName).slice(0, 200) : null;
    o.address = o.address ? String(o.address).slice(0, 500) : null;
    o.city = o.city ? String(o.city).slice(0, 120) : null;
    o.country = o.country ? String(o.country).slice(0, 80) : null;
    o.latitude = o.latitude != null ? Number(o.latitude) : null;
    o.longitude = o.longitude != null ? Number(o.longitude) : null;
    if (o.latitude != null && (Number.isNaN(o.latitude) || Math.abs(o.latitude) > 90)) throw new ValidationError('Invalid venue latitude', ErrorCodes.TOURNAMENT_COMPETITION_TYPE_INVALID);
    if (o.longitude != null && (Number.isNaN(o.longitude) || Math.abs(o.longitude) > 180)) throw new ValidationError('Invalid venue longitude', ErrorCodes.TOURNAMENT_COMPETITION_TYPE_INVALID);
    o.placeId = o.placeId ? String(o.placeId).slice(0, 200) : null;
    o.venueContact = o.venueContact ? String(o.venueContact).slice(0, 120) : null;
    // mapsUrl is always derived server-side from coordinates (never trusted from the client).
    o.mapsUrl = this.mapsUrlFrom(o.latitude, o.longitude);
    return o;
  }

  /**
   * Centralized effective-venue resolver:
   *   competition.venue_override (validated) ?? tournament venue.
   * The tournament venue is branch-derived (ORGANISATION_COURTS) or the stored
   * external venue fields (EXTERNAL_VENUE). One resolver — never duplicated.
   */
  resolveEffectiveVenue(t: Tournament, competition?: TournamentCompetition | null): TournamentVenue {
    // Competition override wins when present and valid.
    if (competition?.venue_override && typeof competition.venue_override === 'object') {
      const o = competition.venue_override;
      return {
        venueMode: 'EXTERNAL_VENUE',
        branchId: null,
        name: (o as any).venueName ?? t.venue_name ?? 'Venue',
        addressLine1: (o as any).address ?? null,
        city: (o as any).city ?? null,
        country: (o as any).country ?? null,
        latitude: (o as any).latitude ?? null,
        longitude: (o as any).longitude ?? null,
        placeId: (o as any).placeId ?? null,
        venueContact: (o as any).venueContact ?? null,
        mapsUrl: (o as any).mapsUrl ?? this.mapsUrlFrom((o as any).latitude, (o as any).longitude),
      };
    }
    const mode = t.venue_type === 'EXTERNAL_VENUE' ? 'EXTERNAL_VENUE' : 'ORGANISATION_COURTS';
    return {
      venueMode: mode,
      branchId: t.branch_id ?? null,
      name: mode === 'EXTERNAL_VENUE'
        ? (t.venue_name ?? 'Venue')
        : ((t as any).branch_name ?? t.venue_name ?? 'Venue'),
      addressLine1: (t as any).branch_address_line1 ?? (mode === 'EXTERNAL_VENUE' ? t.venue_address : null) ?? null,
      addressLine2: (t as any).branch_address_line2 ?? null,
      city: (t as any).branch_city ?? t.venue_city ?? null,
      state: (t as any).branch_state ?? null,
      postalCode: (t as any).branch_postal_code ?? null,
      country: mode === 'EXTERNAL_VENUE' ? t.venue_country ?? null : null,
      countryId: (t as any).branch_country_id ?? null,
      latitude: (t as any).branch_latitude ?? t.latitude ?? null,
      longitude: (t as any).branch_longitude ?? t.longitude ?? null,
      placeId: t.place_id ?? null,
      venueContact: t.venue_contact ?? null,
      timezone: (t as any).branch_timezone ?? null,
      openingTime: (t as any).branch_opening_time ?? null,
      closingTime: (t as any).branch_closing_time ?? null,
      mapsUrl: t.maps_url ?? this.mapsUrlFrom((t as any).branch_latitude ?? t.latitude, (t as any).branch_longitude ?? t.longitude),
    };
  }
}

export const competitionService = new CompetitionService();
import { NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { competitionRepository } from '../infrastructure/repositories/competition.repository.js';
import { tournamentRepository } from '../infrastructure/repositories/tournament.repository.js';
import type { Tournament, TournamentCompetition, TournamentVenue } from '../domain/tournament-aggregate.js';

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
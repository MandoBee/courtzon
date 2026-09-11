import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../../shared/errors/app-error.js';
import { commissionService } from '../../financial/application/commission.service.js';
import { activitiesRepository as repo } from '../infrastructure/repositories/activities.repository.js';
import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { getPlanNumericLimit } from '../../organisations/application/plan-limits.util.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { bookingService } from '../../booking/application/booking.service.js';
import { bookingRepository } from '../../booking/infrastructure/repositories/booking.repository.js';
import { coachSessionStateService } from '../../coaches/application/coach-session-state.service.js';
import type { CoachSessionActor } from '../../coaches/application/coach-session-access.js';

type RowData = mysql.RowDataPacket[];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Coach-session states from which a cancellation may be legitimately issued
// (mirrors the state machine's cancellable sources).
const CANCELLABLE_SESSION_STATUSES = ['pending_acceptance', 'scheduled', 'confirmed', 'in_progress'];
// Booking statuses in which a cancellation would be a no-op (already cancelled).
const ALREADY_CANCELLED_BOOKING_STATUSES = ['cancelled', 'cancelled_with_fee'];

/**
 * Emit the canonical `coach:availability-changed` realtime event AFTER a coach
 * availability mutation has persisted (weekly schedule, blackout, is_available
 * toggle). The relevant organisation ids are resolved from the coach's accepted
 * + active org agreements (the same canonical source used by agreement/service-
 * location logic) so the socket mapper can route to every applicable
 * `organisation:<id>` room. Realtime is non-fatal — never throws into the
 * request path.
 */
async function emitCoachAvailabilityChanged(userId: number, coachId: number, isAvailable: boolean): Promise<void> {
  try {
    const agreements = await repo.findOrgAgreements(coachId);
    const organisationIds = (agreements as any[])
      .map((a: any) => Number(a.organisation_id))
      .filter((id: number) => Number.isFinite(id) && id > 0);
    eventBusV2.emit('coach:availability-changed', {
      userId,
      coachId,
      isAvailable,
      organisationIds,
    } as any);
  } catch { /* realtime is non-fatal */ }
}

export const activitiesService = {
  // ── Tournaments ──
  async listTournaments(filters: any) { return repo.findTournaments(filters); },
  async getTournament(id: number) {
    const t = await repo.findTournamentById(id);
    if (!t) throw new NotFoundError('Tournament');
    const registrations = await repo.findRegistrations(id);
    const matches = await repo.findMatches(id);
    return { ...t, registrations, matches };
  },
  async createTournament(userId: number, data: any) {
    const orgId = data.organisationId ?? null;
    if (orgId) {
      const limit = await getPlanNumericLimit(orgId, 'tournaments', 0);
      const pool = getPool();
      const [countRows] = await pool.execute<RowData>(
        'SELECT COUNT(*) AS cnt FROM tournaments WHERE organisation_id = ? AND deleted_at IS NULL',
        [orgId],
      );
      const current = Number((countRows[0] as any)?.cnt ?? 0);
      if (current >= limit) {
        throw new ConflictError(
          limit === Infinity ? '' : `Tournament limit reached (max ${limit}). Upgrade your plan to create more tournaments.`,
        );
      }
    }
    let commissionRate = 0;
    const orgRef = data.organisationId ?? data.branchId;
    if (orgRef) {
      try {
        const comm = await commissionService.calculate(orgRef, 'tournament', Math.max(Number(data.entryFee) || 0, 1));
        commissionRate = comm.rate;
      } catch {
        // Plan lookup is non-fatal; tournament still created with default rate
      }
    }
    const id = await repo.createTournament({ ...data, creatorId: userId, commissionRate });
    eventBusV2.emit('tournament:created', {
      tournamentId: id,
      userId,
      name: data.name || 'Tournament',
    });
    return repo.findTournamentById(id);
  },
  async updateTournament(id: number, data: any) {
    const updated = await repo.updateTournament(id, data);
    if (!updated) throw new NotFoundError('Tournament');
    return repo.findTournamentById(id);
  },
  async registerPlayer(tournamentId: number, playerId: number) {
    const t = await repo.findTournamentById(tournamentId);
    if (!t) throw new NotFoundError('Tournament');
    if (t.status !== 'open') throw new ConflictError('Tournament is not open for registration');
    const regs = await repo.findRegistrations(tournamentId);
    if (regs.length >= t.max_participants) throw new ConflictError('Tournament is full');
    if (regs.some((r: any) => r.player_id === playerId)) throw new ConflictError('Already registered');
    await repo.registerPlayer(tournamentId, playerId);
  },
  async generateBracket(tournamentId: number) {
    const t = await repo.findTournamentById(tournamentId);
    if (!t) throw new NotFoundError('Tournament');
    const regs = await repo.findRegistrations(tournamentId);
    const confirmed = regs.filter((r: any) => r.status === 'confirmed' || r.status === 'registered');
    if (confirmed.length < 2) throw new ConflictError('Need at least 2 confirmed players');
    await repo.generateMatches(tournamentId, t.bracket_type_id, confirmed.map((r: any) => r.player_id));
    await repo.updateTournament(tournamentId, { status: 'in_progress' });
    const matches = await repo.findMatches(tournamentId);
    for (const match of matches as any[]) {
      eventBusV2.emit('tournament:match-scheduled', {
        matchId: match.id,
        userId: match.player1_id,
        opponent: match.player2_name || 'TBD',
        date: match.scheduled_date || new Date(),
      });
      if (match.player2_id) {
        eventBusV2.emit('tournament:match-scheduled', {
          matchId: match.id,
          userId: match.player2_id,
          opponent: match.player1_name || 'TBD',
          date: match.scheduled_date || new Date(),
        });
      }
    }
    return matches;
  },
  async enterMatchScore(matchId: number, data: any, userId: number) {
    const match = await repo.findMatchById(matchId);
    await repo.updateMatchScore(matchId, data.winnerId, data.scoreSummary || null, 'completed');
    if (data.sets) {
      for (const set of data.sets) {
        await repo.insertSetScore(matchId, set.setNumber, set.player1Score, set.player2Score, userId);
      }
    }
    if (match) {
      const result = data.winnerId === match.player1_id ? 'Win' : 'Loss';
      eventBusV2.emit('tournament:result', {
        matchId,
        userId: match.player1_id,
        result: data.winnerId === match.player1_id ? 'win' : 'loss',
      });
      if (match.player2_id) {
        eventBusV2.emit('tournament:result', {
          matchId,
          userId: match.player2_id,
          result: data.winnerId === match.player2_id ? 'win' : 'loss',
        });
      }
    }
  },

  // ── Academies ──
  async listAcademies(orgId?: number, branchId?: number) { return repo.findAcademies(orgId, branchId); },
  async getAcademy(id: number) {
    const a = await repo.findAcademyById(id);
    if (!a) throw new NotFoundError('Academy');
    const curriculums = await repo.findCurriculums(id);
    const enrollments = await repo.findEnrollments(id);
    const sessions = await repo.findAcademySessions(id);
    return { ...a, curriculums, enrollments, sessions };
  },
  async createAcademy(data: any) {
    if (data.organisationId) {
      const limit = await getPlanNumericLimit(data.organisationId, 'academies', 0);
      const pool = getPool();
      const [countRows] = await pool.execute<RowData>(
        'SELECT COUNT(*) AS cnt FROM academies WHERE organisation_id = ? AND deleted_at IS NULL',
        [data.organisationId],
      );
      const current = Number((countRows[0] as any)?.cnt ?? 0);
      if (current >= limit) {
        throw new ConflictError(
          limit === Infinity ? '' : `Academy limit reached (max ${limit}). Upgrade your plan to create more academies.`,
        );
      }
    }
    const id = await repo.createAcademy(data);
    return repo.findAcademyById(id);
  },
  async createCurriculum(academyId: number, data: any) {
    const id = await repo.createCurriculum({ ...data, academyId });
    return id;
  },
  async enrollPlayer(academyId: number, playerId: number, curriculumId?: number) {
    const a = await repo.findAcademyById(academyId);
    if (!a) throw new NotFoundError('Academy');
    // G1 quarantine: the legacy enrollment path is disabled and throws; this
    // branch exists only to keep the call surface stable until the legacy
    // module is retired.
    const enrollments: any[] = (await repo.findEnrollments(academyId)) as any;
    if (enrollments.some((e: any) => e.player_id === playerId)) throw new ConflictError('Already enrolled');
    await repo.enrollPlayer(academyId, playerId, curriculumId);
    eventBusV2.emit('academy:enrolled', { academyId, userId: playerId, studentName: a.name || 'Student' });
  },
  async createSession(academyId: number, data: any) {
    const id = await repo.createAcademySession({ ...data, academyId });
    return id;
  },
  async markAttendance(sessionId: number, playerId: number, status: string) {
    await repo.markAttendance(sessionId, playerId, status);
  },
  async createEvaluation(academyId: number, evaluatorId: number, data: any) {
    return repo.createEvaluation({ ...data, academyId, evaluatorId });
  },

  // ── Coaches ──
  async listCoaches(filters: any) { return repo.findCoaches(filters); },
  async getCoachProfile(userId: number) {
    const p = await repo.findCoachByUserId(userId);
    if (!p) return null;
    const agreements = await repo.findOrgAgreements(p.id);
    const sessions = await repo.findCoachSessions({ coachId: p.id, page: 1, limit: 50 });
    return { ...p, agreements, sessions };
  },
  async getCoachById(id: number) {
    const p = await repo.findCoachById(id);
    if (!p) throw new NotFoundError('Coach');
    const status = await repo.getCoachStatus(p.user_id);
    if (status !== 'approved') throw new NotFoundError('Coach');
    const agreements = await repo.findOrgAgreements(p.id);
    return { ...p, agreements };
  },
  async getCoachProfilePublic(id: number) {
    return repo.findCoachById(id);
  },
  async getOrgAgreements(userId: number) {
    const p = await repo.findCoachByUserId(userId);
    if (!p) return [];
    return repo.listOrgAgreements(p.id);
  },
  async getCoachAgreements(coachId: number) {
    return repo.listOrgAgreements(coachId);
  },

  // ── Coach service locations ──
  async getMyCoachServiceLocations(userId: number) {
    const coach = await repo.findCoachByUserId(userId);
    if (!coach) return [];
    return repo.getCoachServiceLocations(coach.id);
  },
  async listAllBranches() {
    return repo.listAllBranches();
  },
  async getCoachServiceLocations(coachId: number) {
    return repo.getCoachServiceLocations(coachId);
  },
  async setMyCoachServiceLocations(userId: number, branchIds: number[]) {
    const coach = await repo.findCoachByUserId(userId);
    if (!coach) throw new NotFoundError('Coach profile');
    const unique = Array.from(new Set(branchIds || []));
    // Business rule: a coach must explicitly select at least one branch where
    // they provide services. An empty selection is rejected server-side so a
    // zero-location coach can never be silently left non-bookable, and a coach
    // can never clear their service locations to empty via the API.
    if (unique.length === 0) {
      throw new ValidationError('At least one service location (branch) is required.');
    }
    const pool = getPool();
    for (const branchId of unique) {
      const [[branchRow]] = await pool.execute<RowData>(
        'SELECT id FROM branches WHERE id = ? AND deleted_at IS NULL', [branchId]
      ) as any;
      if (!branchRow) throw new NotFoundError('Branch');
    }
    await repo.setCoachServiceLocations(coach.id, unique);
    const saved = await repo.getCoachServiceLocations(coach.id);
    try {
      eventBusV2.emit('coach:service-locations-changed', {
        userId,
        coachId: coach.id,
        branchIds: unique,
      } as any);
    } catch { /* realtime notification is non-fatal */ }
    return saved;
  },
  async getBranchCoachPolicy(branchId: number) {
    return repo.getBranchCoachPolicy(branchId);
  },
  async findBranchCoachPolicy(branchId: number) {
    return repo.findBranchCoachPolicy(branchId);
  },
  async setBranchCoachPolicy(branchId: number, policy: 'contract_required' | 'independent_coaches_allowed') {
    await repo.setBranchCoachPolicy(branchId, policy);
  },
  async checkCoachEligibleAtBranch(coachId: number, branchId: number) {
    return repo.isCoachEligibleAtBranch(coachId, branchId);
  },
  async coachHasServiceAccess(coachId: number, branchId: number) {
    return repo.coachHasServiceAccess(coachId, branchId);
  },
  async getAcceptedOrgAgreement(coachId: number, organisationId: number) {
    return repo.getAcceptedAgreement(coachId, organisationId);
  },

  async createCoachProfile(userId: number, data: any) {
    const existing = await repo.findCoachByUserId(userId);
    const pool = getPool();
    const [userRows] = await pool.execute(`SELECT full_name FROM users WHERE id = ?`, [userId]) as any;
    const playerName = userRows[0]?.full_name || 'A player';
    if (existing) {
      await repo.resetCoachStatus(userId);
      const coach = await repo.findCoachByUserId(userId);
      try { eventBusV2.emit('coach:application-submitted' as any, { userId, coachId: coach?.id, playerName }); } catch {}
      return coach;
    }
    await repo.createCoachProfile(userId, data);
    const coach = await repo.findCoachByUserId(userId);
    try { eventBusV2.emit('coach:application-submitted' as any, { userId, coachId: coach?.id, playerName }); } catch {}
    return coach;
  },
  async updateCoachProfile(userId: number, data: any) {
    // Self-service update targets the authenticated user's OWN coach profile.
    // Guard existence first so a user without a coach profile gets a clean 404
    // instead of the repository creating a stray professional_profiles row.
    const existing = await repo.findCoachByUserId(userId);
    if (!existing) throw new NotFoundError('Coach profile');
    const updated = await repo.updateCoachProfile(userId, data);
    if (!updated) throw new NotFoundError('Coach profile');
    const profile = await repo.findCoachByUserId(userId);
    // Realtime: a self-service availability toggle changes player-facing coach
    // discovery/eligibility. Emit the SAME canonical coach:availability-changed
    // event the admin toggle uses so search/booking caches refresh live, and so
    // every relevant organisation room is notified.
    if (data.isAvailable !== undefined && profile && Number(profile.is_available) !== Number(existing.is_available)) {
      await emitCoachAvailabilityChanged(userId, profile.id, Number(profile.is_available) === 1);
    }
    return profile;
  },
  async upsertOrgAgreement(userId: number, data: any) {
    const coach = await repo.findCoachByUserId(userId);
    if (!coach) throw new NotFoundError('Coach profile');
    await repo.upsertOrgAgreement({ ...data, coachId: coach.id });

    const [orgName, coachUserName] = await Promise.all([
      repo.findOrgNameById(data.organisationId),
      repo.findUserFullName(userId),
    ]);
    if (orgName && data.organisationId) {
      eventBusV2.emit('coach:agreement-added', {
        coachId: coach.id,
        coachName: coachUserName || 'A coach',
        userId,
        organisationId: data.organisationId,
        organisationName: orgName,
      });
    }
  },
  async respondToOrgInvite(userId: number, agreementId: number, accept: boolean) {
    const coach = await repo.findCoachByUserId(userId);
    if (!coach) throw new NotFoundError('Coach profile');
    const affected = await repo.respondToOrgInvite(coach.id, agreementId, accept);
    if (!affected) throw new NotFoundError('Pending invite');

    const pool = getPool();
    const [agrRows] = await pool.execute(`SELECT organisation_id FROM coach_org_agreements WHERE id = ?`, [agreementId]) as any;
    if (agrRows.length) {
      const orgId = agrRows[0].organisation_id;
      const orgName = await repo.findOrgNameById(orgId);
      const coachProf = await repo.findCoachByUserId(userId);
      const coachName = (await pool.execute('SELECT full_name FROM users WHERE id = ?', [userId]) as any)[0]?.[0]?.full_name || 'A coach';
      const eventName = accept ? 'coach:invite-accepted' : 'coach:invite-rejected';
      eventBusV2.emit(eventName as any, {
        coachId: coachProf?.id,
        coachUserId: userId,
        coachName,
        organisationId: orgId,
        organisationName: orgName || 'Unknown Organisation',
      });
    }

    return { agreementId, status: accept ? 'active' : 'rejected' };
  },
  async createCoachReview(userId: number, coachId: number, data: any) {
    return repo.createCoachReview({ ...data, coachId, playerId: userId });
  },
  async getCoachSessions(userId: number, role: 'coach' | 'player', page: number, limit: number) {
    const coach = role === 'coach' ? await repo.findCoachByUserId(userId) : null;
    return repo.findCoachSessions({
      coachId: role === 'coach' ? coach?.id : undefined,
      playerId: role === 'player' ? userId : undefined,
      page, limit,
    });
  },

   /**
    * Cancel a coach session (actor already authorized via G2-C object-level
    * authorization).
    *
    * The booking linkage is the financial source of truth (bookings); the
    * coach session is the operational/reporting projection. Cancellation of a
    * session LINKED to a booking delegates the booking cancellation to a
    * CANONICAL booking path — never duplicated here:
    *
    *   - PLAYER → `bookingService.cancelBooking` (canonical player path; owns
    *     ownership, cancellation policy/window/fee, refund guards, accounting
    *     reversal, idempotency). Group 1 behavior — UNCHANGED.
    *   - COACH → `bookingService.cancelBookingByProvider` (full refund; NO
    *     player cancellation window; NO cancellation fee — AUD-003 G2-E2
    *     Group 2). The coach is authorized via the session's owner relationship
    *     (coach_profiles.user_id) established by the G2-C object-level guard.
    *   - ADMIN → `bookingService.updateBookingStatus(id, 'cancelled', actorId)`
    *     (canonical organization/admin booking-cancellation path; preserves the
    *     existing admin cancellation policy/fee semantics).
    *
    * Ordering: the booking is cancelled FIRST. If the booking cancellation
    * fails (e.g. outside the player window, refund failure, or un-authorized
    * admin), the error propagates and the session is NOT falsely presented as
    * cancelled. If the booking succeeds but the session transition then fails,
    * the state left behind is a cancelled booking + active session, which the
    * saga-repair worker (R1) reconciles — never the un-repaired active-booking
    * + cancelled-session state. No second refund is ever issued in that branch.
    *
    * Idempotency:
    *  - session already cancelled → no booking cancellation is re-triggered
    *  - session active + booking already cancelled → the session is safely
    *    cancelled without issuing another refund
    */
  async cancelCoachSession(sessionId: number, actor: CoachSessionActor, reason?: string) {
    if (actor.status === 'cancelled') {
      return coachSessionStateService.transition(
        sessionId, 'cancelled',
        { id: actor.id, role: actor.role },
        { cancelledBy: actor.role, reason },
      );
    }

    if (actor.bookingId != null && CANCELLABLE_SESSION_STATUSES.includes(actor.status)) {
      const booking = await bookingRepository.findById(actor.bookingId);
      if (booking && !ALREADY_CANCELLED_BOOKING_STATUSES.includes(booking.booking_status)) {
        if (actor.role === 'coach') {
          // Authorized service-provider cancellation with FULL refund (no
          // player window, no cancellation fee). All refund/accounting/payment
          // guards are owned by the canonical path.
          await bookingService.cancelBookingByProvider(actor.bookingId, actor.id, reason || '');
        } else if (actor.role === 'admin') {
          // Canonical organization/admin booking-cancellation path. Preserves
          // the existing admin cancellation policy/fee semantics; no duplicate
          // refund/accounting logic.
          await bookingService.updateBookingStatus(actor.bookingId, 'cancelled', actor.id);
        } else {
          // actor.role === 'player' → canonical player cancellation path
          // (Group 1, UNCHANGED): owns the player cancellation window/fee.
          await bookingService.cancelBooking(actor.bookingId, actor.id, reason || '');
        }
      }
    }

    return coachSessionStateService.transition(
      sessionId, 'cancelled',
      { id: actor.id, role: actor.role },
      { cancelledBy: actor.role, reason },
    );
  },

  // ── Coach availability (weekly schedule + blackout dates) ──
  async getMyCoachAvailability(userId: number) {
    const coach = await repo.findCoachByUserId(userId);
    if (!coach) throw new NotFoundError('Coach profile');
    const weekly = await repo.getCoachAvailability(coach.id);
    const blackouts = await repo.getCoachBlackouts(coach.id, todayISO());
    return { weekly, blackouts };
  },
  async setMyCoachAvailability(userId: number, slots: { dayOfWeek: number; startTime: string; endTime: string }[]) {
    const coach = await repo.findCoachByUserId(userId);
    if (!coach) throw new NotFoundError('Coach profile');
    for (const s of slots) {
      if (s.endTime <= s.startTime) {
        throw new ValidationError('Each availability range must end after it starts');
      }
    }
    // Reject overlapping ranges within the same day.
    const byDay = new Map<number, { startTime: string; endTime: string }[]>();
    for (const s of slots) {
      if (!byDay.has(s.dayOfWeek)) byDay.set(s.dayOfWeek, []);
      byDay.get(s.dayOfWeek)!.push(s);
    }
    for (const day of byDay.values()) {
      const sorted = [...day].sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].startTime < sorted[i - 1].endTime) {
          throw new ValidationError('Availability ranges on the same day cannot overlap');
        }
      }
    }
    await repo.setCoachAvailability(coach.id, slots);
    // Realtime after persistence: weekly availability changes player-facing
    // discovery/slots; notify the coach's devices and every relevant org room.
    await emitCoachAvailabilityChanged(userId, coach.id, Number(coach.is_available ?? 1) === 1);
    return repo.getCoachAvailability(coach.id);
  },
  async addMyCoachBlackout(userId: number, date: string, reason?: string) {
    const coach = await repo.findCoachByUserId(userId);
    if (!coach) throw new NotFoundError('Coach profile');
    const conflicts = await repo.findScheduledSessionsOnDate(coach.id, date);
    if (conflicts.length) {
      throw new ConflictError(
        `You have ${conflicts.length} scheduled session(s) on ${date}. Cancel them before marking the day unavailable.`
      );
    }
    const id = await repo.addCoachBlackout(coach.id, date, reason);
    // Realtime after persistence: a blackout makes the coach unavailable that
    // day for discovery/slots; notify the coach's devices and relevant orgs.
    await emitCoachAvailabilityChanged(userId, coach.id, Number(coach.is_available ?? 1) === 1);
    return { id };
  },
  async removeMyCoachBlackout(userId: number, id: number) {
    const coach = await repo.findCoachByUserId(userId);
    if (!coach) throw new NotFoundError('Coach profile');
    const ok = await repo.removeCoachBlackout(coach.id, id);
    if (!ok) throw new NotFoundError('Blackout date');
    // Realtime after deletion: the day becomes available again for discovery/slots.
    await emitCoachAvailabilityChanged(userId, coach.id, Number(coach.is_available ?? 1) === 1);
  },
  async getCoachAvailabilityPublic(coachId: number) {
    const weekly = await repo.getCoachAvailability(coachId);
    const blackouts = await repo.getCoachBlackouts(coachId, todayISO());
    return { weekly, blackouts };
  },

  async getCoachStats(userId: number) {
    const coach = await repo.findCoachByUserId(userId);
    if (!coach) throw new ForbiddenError('Not a coach');
    return repo.getCoachStats(coach.id);
  },

  async getCoachPlayers(userId: number) {
    const coach = await repo.findCoachByUserId(userId);
    if (!coach) throw new ForbiddenError('Not a coach');
    return repo.getCoachPlayers(coach.id);
  },

  // ── Admin: Tournaments ──
  async listTournamentsAdmin(page: number, limit: number, status?: string) {
    return repo.findTournamentsAdmin({ page, limit, status });
  },
  async deleteTournament(id: number) {
    const t = await repo.findTournamentByIdAdmin(id);
    if (!t) throw new NotFoundError('Tournament');
    await repo.softDeleteTournament(id);
    return { success: true };
  },

  // ── Admin: Academies ──
  async listAcademiesAdmin(page: number, limit: number) {
    return repo.findAcademiesAdmin({ page, limit });
  },
  async updateAcademy(id: number, data: any) {
    const updated = await repo.updateAcademy(id, data);
    if (!updated) throw new NotFoundError('Academy');
    return repo.findAcademyById(id);
  },
  async deleteAcademy(id: number) {
    const a = await repo.findAcademyById(id);
    if (!a) throw new NotFoundError('Academy');
    await repo.softDeleteAcademy(id);
    return { success: true };
  },

  // ── Admin: Coaches ──
  async listCoachesAdmin(page: number, limit: number) {
    return repo.findCoachesAdmin({ page, limit });
  },
  async updateCoachAdmin(id: number, data: any) {
    const updated = await repo.updateCoachById(id, data);
    if (!updated) throw new NotFoundError('Coach');
    return repo.findCoachById(id);
  },
  async deleteCoach(id: number) {
    const c = await repo.findCoachById(id);
    if (!c) throw new NotFoundError('Coach');
    await repo.softDeleteCoach(id);
    return { success: true };
  },
  async verifyCoach(id: number) {
    const c = await repo.findCoachById(id);
    if (!c) throw new NotFoundError('Coach');
    await repo.verifyCoach(id);
    try { eventBusV2.emit('coach:verified' as any, { userId: c.user_id, coachId: id }); } catch {}
    return { success: true };
  },
  async toggleCoachAvailability(id: number) {
    const result = await repo.toggleCoachAvailability(id);
    if (!result) throw new NotFoundError('Coach');
    await emitCoachAvailabilityChanged((result as any).user_id, id, (result as any).is_available);
    return result;
  },

  async findCoachByUserId(userId: number) {
    return repo.findCoachByUserId(userId);
  },
};

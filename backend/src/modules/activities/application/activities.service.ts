import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../../shared/errors/app-error.js';
import { commissionService } from '../../financial/application/commission.service.js';
import { activitiesRepository as repo } from '../infrastructure/repositories/activities.repository.js';
import { pricingEngine } from '../../booking/domain/pricing-engine.js';
import { TimeEngine } from '../../time/index.js';
import { generateUUID } from '../../../shared/utils/token.js';
import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import { getPlanNumericLimit } from '../../organisations/application/plan-limits.util.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';

type RowData = mysql.RowDataPacket[];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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
    const enrollments = await repo.findEnrollments(academyId);
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
  async getOrgAgreements(userId: number) {
    const p = await repo.findCoachByUserId(userId);
    if (!p) return [];
    return repo.listOrgAgreements(p.id);
  },
  async getCoachAgreements(coachId: number) {
    return repo.listOrgAgreements(coachId);
  },

  async createCoachProfile(userId: number, data: any) {
    const existing = await repo.findCoachByUserId(userId);
    if (existing) {
      await repo.resetCoachStatus(userId);
      return repo.findCoachByUserId(userId);
    }
    await repo.createCoachProfile(userId, data);
    return repo.findCoachByUserId(userId);
  },
  async updateCoachProfile(userId: number, data: any) {
    const updated = await repo.updateCoachProfile(userId, data);
    if (!updated) throw new NotFoundError('Coach profile');
    return repo.findCoachByUserId(userId);
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
    return { agreementId, status: accept ? 'accepted' : 'rejected' };
  },
  async createCoachSession(userId: number, data: any) {
    const coach = await repo.findCoachByUserId(userId);
    if (!coach) throw new ForbiddenError('Not a coach');
    if (data.organisationId) {
      const hasAgreement = await repo.hasAcceptedAgreement(coach.id, data.organisationId);
      if (!hasAgreement) {
        throw new ForbiddenError('Coach does not have an active agreement with this organisation');
      }
    }
    let platformCommissionPct = 10;
    if (data.organisationId) {
      try {
        const comm = await commissionService.calculate(data.organisationId, 'coach_session', data.price);
        platformCommissionPct = comm.rate;
      } catch { /* use default */ }
    }
    const remaining = 100 - platformCommissionPct;
    const coachEarnings = (data.price * remaining) / 100;
    const orgEarnings = data.price - coachEarnings - (data.price * platformCommissionPct) / 100;
    const id = await repo.createCoachSession({
      ...data, coachId: coach.id, platformCommissionPct, coachEarnings, orgEarnings,
    });
    eventBusV2.emit('coaching:session-scheduled', {
      sessionId: id,
      coachId: coach.id,
      userId: data.playerId || userId,
      startTime: new Date(data.startTime),
    });
    return id;
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
    return { id };
  },
  async removeMyCoachBlackout(userId: number, id: number) {
    const coach = await repo.findCoachByUserId(userId);
    if (!coach) throw new NotFoundError('Coach profile');
    const ok = await repo.removeCoachBlackout(coach.id, id);
    if (!ok) throw new NotFoundError('Blackout date');
  },
  async getCoachAvailabilityPublic(coachId: number) {
    const weekly = await repo.getCoachAvailability(coachId);
    const blackouts = await repo.getCoachBlackouts(coachId, todayISO());
    return { weekly, blackouts };
  },

  async getPendingCoachSessions(userId: number) {
    const coach = await repo.findCoachByUserId(userId);
    if (!coach) throw new ForbiddenError('Not a coach');
    return repo.findPendingCourtSessions(coach.id);
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

  async getCoachSessionById(sessionId: number, userId: number) {
    const session = await repo.findCoachSessionById(sessionId);
    if (!session) throw new NotFoundError('Coach session');
    const coach = await repo.findCoachByUserId(userId);
    const isCoach = coach && coach.id === session.coach_id;
    const isPlayer = userId === session.player_id;
    if (!isCoach && !isPlayer) throw new ForbiddenError('You can only view your own sessions');

    const priceBreakdown = this.buildPriceBreakdown(session);
    return { ...session, priceBreakdown };
  },

  async getAvailableCourts(sessionId: number, userId: number) {
    const session = await repo.findCoachSessionById(sessionId);
    if (!session) throw new NotFoundError('Coach session');
    const coach = await repo.findCoachByUserId(userId);
    if (!coach || coach.id !== session.coach_id) throw new ForbiddenError('Only the coach can view available courts');
    if (!session.branch_id) throw new ValidationError('Session has no branch assigned');

    const startStr = typeof session.start_time === 'string' ? session.start_time : (session.start_time as any).toISOString?.() || String(session.start_time);
    const endStr = typeof session.end_time === 'string' ? session.end_time : (session.end_time as any).toISOString?.() || String(session.end_time);
    const bookingDate = startStr.slice(0, 10);
    const startTime = startStr.slice(11, 16);
    const endTime = endStr.slice(11, 16);

    const resources = await repo.findResourcesInBranch(session.branch_id);
    const resourceIds = resources.map((r: any) => r.id);
    const bookings = await repo.findBookingsForResources(resourceIds, bookingDate);

    const bookedResourceIds = new Set<number>();
    for (const b of bookings as any[]) {
      const bStart = String(b.start_time).slice(0, 5);
      const bEnd = String(b.end_time).slice(0, 5);
      if (startTime < bEnd && endTime > bStart) {
        bookedResourceIds.add(Number(b.resource_id));
      }
    }

    const available: any[] = [];
    for (const r of resources as any[]) {
      if (bookedResourceIds.has(Number(r.id))) continue;
      let price = 0;
      try {
        const pricing = await pricingEngine.calculatePrice(Number(r.id), startTime, endTime);
        price = pricing.totalPrice;
      } catch { /* pricing non-fatal */ }
      available.push({
        resourceId: Number(r.id),
        resourceName: r.name,
        startTime: startStr,
        endTime: endStr,
        price,
      });
    }
    return available;
  },

  async bookCourtForSession(userId: number, sessionId: number, data: { resourceId: number; startTime?: string; endTime?: string }) {
    const session = await repo.findCoachSessionById(sessionId);
    if (!session) throw new NotFoundError('Coach session');
    const coach = await repo.findCoachByUserId(userId);
    if (!coach || coach.id !== session.coach_id) throw new ForbiddenError('Only the coach can book a court');
    if (session.status !== 'pending_court') throw new ConflictError('Session is not awaiting court booking');

    const startStr = typeof session.start_time === 'string' ? session.start_time : (session.start_time as any).toISOString?.() || String(session.start_time);
    const endStr = typeof session.end_time === 'string' ? session.end_time : (session.end_time as any).toISOString?.() || String(session.end_time);
    const bookingDate = startStr.slice(0, 10);
    const startTime = data.startTime || startStr.slice(11, 16);
    const endTime = data.endTime || endStr.slice(11, 16);

    const courtPricing = await pricingEngine.calculatePrice(data.resourceId, startTime, endTime);
    const courtTotal = courtPricing.totalPrice;

    let commissionAmount = 0;
    let clubAmount = courtTotal;
    try {
      const comm = await commissionService.calculate(session.branch_id || session.organisation_id, 'booking', courtTotal);
      commissionAmount = comm.commissionAmount;
      clubAmount = comm.netAmount;
    } catch { /* use default */ }

    const pool = getPool();

    // Resolve branch timezone for canonical time fields
    const [brRows] = await pool.execute<any[]>(
      'SELECT timezone FROM branches WHERE id = ?', [session.branch_id],
    );
    const branchTz = brRows[0]?.timezone || 'Africa/Cairo';
    const startAtUtc = TimeEngine.localToUtc(bookingDate, startTime, branchTz);
    const endAtUtc = TimeEngine.localToUtc(bookingDate, endTime, branchTz);
    const openingTime = '08:00';
    const closingTime = '22:00';
    const businessDate = TimeEngine.getBusinessDate(startAtUtc, openingTime, closingTime, branchTz);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.execute(
        `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
          booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc,
          total_amount, commission_amount, club_amount,
          booking_status, payment_status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateUUID(), userId, session.organisation_id || null, session.branch_id || null, data.resourceId,
         'coach_session', bookingDate, businessDate, startTime, endTime,
         String(startAtUtc).replace('T', ' ').replace(/\.\d+Z$/, ''),
         String(endAtUtc).replace('T', ' ').replace(/\.\d+Z$/, ''),
         courtTotal, commissionAmount, clubAmount, 'pending', 'pending', `Coach session #${sessionId}`]
      );
      const bookingId = (result as any).insertId;

      await conn.execute(
        'UPDATE coach_sessions SET booking_id = ?, resource_id = ?, status = ? WHERE id = ?',
        [bookingId, data.resourceId, 'pending_acceptance', sessionId]
      );

      await conn.commit();

      const sessionPrice = Number(session.price || 0);
      const platformCommissionPct = Number(session.platform_commission_pct || 10);
      const coachEarnings = Number(session.coach_earnings || 0);
      const orgEarnings = Number(session.org_earnings || 0);
      const platformCoachCommission = (sessionPrice * platformCommissionPct) / 100;

      let coachSplitPct = 100;
      let orgSplitPct = 0;
      if (session.organisation_id) {
        const agreement = await repo.findOrgAgreement(coach.id, session.organisation_id);
        if (agreement) {
          coachSplitPct = Number(agreement.coach_split_pct);
          orgSplitPct = Number(agreement.org_split_pct);
        }
      }

      return {
        sessionId,
        bookingId,
        status: 'pending_acceptance',
        priceBreakdown: {
          coachFee: coachEarnings,
          courtFee: courtTotal,
          platformFee: platformCoachCommission + commissionAmount,
          orgFee: orgEarnings + clubAmount,
          total: sessionPrice + courtTotal,
          currency: session.currency_code,
        },
        coachSplitPct,
        orgSplitPct,
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async acceptCoachSession(userId: number, sessionId: number) {
    const session = await repo.findCoachSessionById(sessionId);
    if (!session) throw new NotFoundError('Coach session');
    if (userId !== session.player_id) throw new ForbiddenError('Only the player can accept the session');
    if (session.status !== 'pending_acceptance') throw new ConflictError('Session is not awaiting acceptance');

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (session.booking_id) {
        const { confirmBooking } = await import('../../../platform/booking/BookingSaga.js');
        await confirmBooking(session.booking_id, { paymentStatus: 'pending', paymentMethod: 'cash' }, conn);
      }

      await conn.execute(
        "UPDATE coach_sessions SET status = 'confirmed' WHERE id = ?",
        [sessionId]
      );

      await conn.commit();
      return { sessionId, status: 'confirmed' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async declineCoachSession(userId: number, sessionId: number, reason?: string) {
    const session = await repo.findCoachSessionById(sessionId);
    if (!session) throw new NotFoundError('Coach session');
    if (userId !== session.player_id) throw new ForbiddenError('Only the player can decline the session');
    if (session.status !== 'pending_acceptance') throw new ConflictError('Session is not awaiting acceptance');

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (session.booking_id) {
        const { cancelBooking } = await import('../../../platform/booking/BookingSaga.js');
        const { CancellationReason } = await import('../../../platform/shared/booking-types.js');
        await cancelBooking(session.booking_id, userId, reason || CancellationReason.SESSION_DECLINED, 0, conn);
      }

      await conn.execute(
        "UPDATE coach_sessions SET status = 'cancelled' WHERE id = ?",
        [sessionId]
      );

      await conn.commit();
      eventBusV2.emit('coaching:session-cancelled', {
        sessionId,
        userId: session.player_id,
        reason,
      });
      return { sessionId, status: 'cancelled', reason };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  buildPriceBreakdown(session: any) {
    const sessionPrice = Number(session.price || 0);
    const platformCommissionPct = Number(session.platform_commission_pct || 10);
    const coachEarnings = Number(session.coach_earnings || 0);
    const orgEarnings = Number(session.org_earnings || 0);
    const platformCoachCommission = (sessionPrice * platformCommissionPct) / 100;
    const bookingTotalAmount = Number(session.booking_total_amount || 0);
    const bookingCommissionAmount = Number(session.booking_commission_amount || 0);
    const bookingClubAmount = Number(session.booking_club_amount || 0);

    return {
      coachFee: coachEarnings,
      courtFee: bookingTotalAmount,
      platformFee: platformCoachCommission + bookingCommissionAmount,
      orgFee: orgEarnings + bookingClubAmount,
      total: sessionPrice + bookingTotalAmount,
      currency: session.currency_code,
    };
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
    return { success: true };
  },
  async toggleCoachAvailability(id: number) {
    const result = await repo.toggleCoachAvailability(id);
    if (!result) throw new NotFoundError('Coach');
    return result;
  },

  async findCoachByUserId(userId: number) {
    return repo.findCoachByUserId(userId);
  },
};

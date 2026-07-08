import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import {
  cascadeTournamentSoftDelete,
  cascadeAcademySoftDelete,
  cascadeCoachProfileSoftDelete,
} from '../../../../shared/cascade/index.js';

type RowData = mysql.RowDataPacket[];

export const activitiesRepository = {
  // ── Tournament Bracket Types ──
  async findBracketTypes() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM tournament_bracket_types WHERE is_active = TRUE');
    return rows;
  },

  // ── Tournaments ──
  async findTournaments(filters: { status?: string; sportId?: number; orgId?: number; page: number; limit: number }) {
    const pool = getPool();
    let sql = `SELECT t.*, bt.name as bracket_type_name, s.name as sport_name, o.name as organisation_name
               FROM tournaments t
               JOIN tournament_bracket_types bt ON t.bracket_type_id = bt.id
               LEFT JOIN sports s ON t.sport_id = s.id
               LEFT JOIN organisations o ON t.organisation_id = o.id AND o.deleted_at IS NULL
               WHERE t.deleted_at IS NULL
                 AND (t.organisation_id IS NULL OR o.id IS NOT NULL)`;
    const params: any[] = []; const conds: string[] = [];
    if (filters.status) { conds.push('t.status = ?'); params.push(filters.status); }
    if (filters.sportId) { conds.push('t.sport_id = ?'); params.push(filters.sportId); }
    if (filters.orgId) { conds.push('t.organisation_id = ?'); params.push(filters.orgId); }
    if (conds.length) sql += ' AND ' + conds.join(' AND ');
    sql += ' ORDER BY t.start_date DESC LIMIT ? OFFSET ?';
    const offset = (filters.page - 1) * filters.limit;
    params.push(filters.limit, offset);
    const [rows] = await pool.query<RowData>(sql, params);
    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) as total FROM tournaments t
       LEFT JOIN organisations o ON t.organisation_id = o.id AND o.deleted_at IS NULL
       WHERE t.deleted_at IS NULL
         AND (t.organisation_id IS NULL OR o.id IS NOT NULL)${conds.length ? ' AND ' + conds.join(' AND ') : ''}`,
      params.slice(0, conds.length)
    );
    return { data: rows, total: countRows[0].total, page: filters.page, limit: filters.limit };
  },

  async findTournamentById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT t.*, bt.name as bracket_type_name, o.name as organisation_name
       FROM tournaments t
       JOIN tournament_bracket_types bt ON t.bracket_type_id = bt.id
       LEFT JOIN organisations o ON t.organisation_id = o.id
       WHERE t.id = ? AND t.deleted_at IS NULL`,
      [id]
    );
    return rows[0] || null;
  },

  async createTournament(data: any) {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO tournaments (public_id, creator_id, organisation_id, branch_id, bracket_type_id, sport_id, name, description, max_participants, min_participants, entry_fee, currency_code, commission_rate, prize_description, registration_opens, registration_closes, start_date, end_date, rules, image_url)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.creatorId, data.organisationId || null, data.branchId || null, data.bracketTypeId, data.sportId || null, data.name, data.description || null, data.maxParticipants, data.minParticipants || 2, data.entryFee || 0, data.currencyCode, data.commissionRate || 0, data.prizeDescription || null, data.registrationOpens || null, data.registrationCloses || null, data.startDate, data.endDate || null, data.rules || null, data.imageUrl || null]
    );
    return (result as any).insertId;
  },

  async updateTournament(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = []; const params: any[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) { fields.push(`${key} = ?`); params.push(val); }
    }
    if (!fields.length) return false;
    params.push(id);
    const [result] = await pool.execute(`UPDATE tournaments SET ${fields.join(', ')} WHERE id = ?`, params);
    return (result as any).affectedRows > 0;
  },

  async findRegistrations(tournamentId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT tr.*, u.full_name as player_name, u.email as player_email
       FROM tournament_registrations tr
       JOIN users u ON tr.player_id = u.id
       WHERE tr.tournament_id = ?`,
      [tournamentId]
    );
    return rows;
  },

  async registerPlayer(tournamentId: number, playerId: number) {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO tournament_registrations (tournament_id, player_id) VALUES (?, ?)',
      [tournamentId, playerId]
    );
    return (result as any).insertId;
  },

  async updateRegistrationStatus(tournamentId: number, playerId: number, status: string) {
    const pool = getPool();
    await pool.execute(
      'UPDATE tournament_registrations SET status = ? WHERE tournament_id = ? AND player_id = ?',
      [status, tournamentId, playerId]
    );
  },

  async findMatchById(matchId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT tm.*, p1.full_name as player1_name, p2.full_name as player2_name, r.name as resource_name
       FROM tournament_matches tm
       LEFT JOIN users p1 ON tm.player1_id = p1.id
       LEFT JOIN users p2 ON tm.player2_id = p2.id
       LEFT JOIN resources r ON tm.resource_id = r.id
       WHERE tm.id = ?`,
      [matchId]
    );
    return rows.length ? rows[0] : null;
  },

  async findMatches(tournamentId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT tm.*, p1.full_name as player1_name, p2.full_name as player2_name, r.name as resource_name
       FROM tournament_matches tm
       LEFT JOIN users p1 ON tm.player1_id = p1.id
       LEFT JOIN users p2 ON tm.player2_id = p2.id
       LEFT JOIN resources r ON tm.resource_id = r.id
       WHERE tm.tournament_id = ?
       ORDER BY tm.round, tm.match_number`,
      [tournamentId]
    );
    return rows;
  },

  async generateMatches(tournamentId: number, bracketTypeId: number, playerIds: number[]) {
    const pool = getPool();
    const shuffled: (number | null)[] = [...playerIds].sort(() => Math.random() - 0.5);
    const matches: { round: number; matchNumber: number; player1Id: number | null; player2Id: number | null }[] = [];

    if (bracketTypeId === 1) {
      let round = 1; let remaining = shuffled;
      if (remaining.length % 2 !== 0) { remaining.push(null); }
      while (remaining.length > 1) {
        const nextRound: (number | null)[] = [];
        for (let i = 0; i < remaining.length; i += 2) {
          const mn = matches.filter(m => m.round === round).length + 1;
          matches.push({ round, matchNumber: mn, player1Id: remaining[i], player2Id: remaining[i + 1] || null });
          nextRound.push(null);
        }
        remaining = nextRound;
        round++;
      }
    } else {
      for (let i = 0; i < shuffled.length; i += 2) {
        if (i + 1 < shuffled.length) {
          matches.push({ round: 1, matchNumber: matches.length + 1, player1Id: shuffled[i], player2Id: shuffled[i + 1] });
        }
      }
    }

    for (const m of matches) {
      await pool.execute(
        'INSERT INTO tournament_matches (tournament_id, round, match_number, player1_id, player2_id) VALUES (?, ?, ?, ?, ?)',
        [tournamentId, m.round, m.matchNumber, m.player1Id, m.player2Id]
      );
    }
  },

  async updateMatchScore(matchId: number, winnerId: number | null, scoreSummary: string | null, status: string) {
    const pool = getPool();
    await pool.execute(
      'UPDATE tournament_matches SET winner_id = ?, score_summary = ?, status = ? WHERE id = ?',
      [winnerId, scoreSummary, status, matchId]
    );
  },

  async insertSetScore(matchId: number, setNumber: number, player1Score: string, player2Score: string, enteredBy: number) {
    const pool = getPool();
    await pool.execute(
      'INSERT INTO tournament_match_scores (match_id, set_number, player1_score, player2_score, entered_by) VALUES (?, ?, ?, ?, ?)',
      [matchId, setNumber, player1Score, player2Score, enteredBy]
    );
  },

  // ── Academy ──
  async findAcademies(orgId?: number, branchId?: number) {
    const pool = getPool();
    let sql = `SELECT a.*, s.name as sport_name, o.name as organisation_name
               FROM academies a
               LEFT JOIN sports s ON a.sport_id = s.id
               LEFT JOIN organisations o ON a.organisation_id = o.id
               WHERE a.deleted_at IS NULL AND a.is_active = TRUE`;
    const params: any[] = [];
    if (orgId) { sql += ' AND a.organisation_id = ?'; params.push(orgId); }
    if (branchId) { sql += ' AND a.branch_id = ?'; params.push(branchId); }
    sql += ' ORDER BY a.name';
    const [rows] = await pool.execute<RowData>(sql, params);
    return rows;
  },

  async findAcademyById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT a.*, s.name as sport_name, o.name as organisation_name
       FROM academies a
       LEFT JOIN sports s ON a.sport_id = s.id
       LEFT JOIN organisations o ON a.organisation_id = o.id
       WHERE a.id = ? AND a.deleted_at IS NULL`,
      [id]
    );
    return rows[0] || null;
  },

  async createAcademy(data: any) {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO academies (organisation_id, branch_id, sport_id, name, description, image_url) VALUES (?, ?, ?, ?, ?, ?)',
      [data.organisationId, data.branchId || null, data.sportId || null, data.name, data.description || null, data.imageUrl || null]
    );
    return (result as any).insertId;
  },

  async findCurriculums(academyId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM academy_curriculums WHERE academy_id = ? AND is_active = TRUE ORDER BY name',
      [academyId]
    );
    return rows;
  },

  async createCurriculum(data: any) {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO academy_curriculums (academy_id, name, description, level_required, duration_weeks, price, currency_code) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.academyId, data.name, data.description || null, data.levelRequired || null, data.durationWeeks || null, data.price || 0, data.currencyCode]
    );
    return (result as any).insertId;
  },

  async findEnrollments(academyId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT ae.*, u.full_name as player_name, ac.name as curriculum_name
       FROM academy_enrollments ae
       JOIN users u ON ae.player_id = u.id
       LEFT JOIN academy_curriculums ac ON ae.curriculum_id = ac.id
       WHERE ae.academy_id = ?`,
      [academyId]
    );
    return rows;
  },

  async enrollPlayer(academyId: number, playerId: number, curriculumId?: number) {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO academy_enrollments (academy_id, curriculum_id, player_id) VALUES (?, ?, ?)',
      [academyId, curriculumId || null, playerId]
    );
    return (result as any).insertId;
  },

  async updateEnrollmentStatus(academyId: number, playerId: number, status: string) {
    const pool = getPool();
    await pool.execute(
      'UPDATE academy_enrollments SET status = ? WHERE academy_id = ? AND player_id = ?',
      [status, academyId, playerId]
    );
  },

  async findAcademySessions(academyId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT s.*, u.full_name as coach_name, r.name as resource_name
       FROM academy_sessions s
       LEFT JOIN users u ON s.coach_id = u.id
       LEFT JOIN resources r ON s.resource_id = r.id
       WHERE s.academy_id = ?
       ORDER BY s.start_time`,
      [academyId]
    );
    return rows;
  },

  async createAcademySession(data: any) {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO academy_sessions (academy_id, curriculum_id, coach_id, resource_id, title, description, start_time, end_time, max_participants) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.academyId, data.curriculumId || null, data.coachId || null, data.resourceId || null, data.title, data.description || null, data.startTime, data.endTime, data.maxParticipants || 1]
    );
    return (result as any).insertId;
  },

  async findSessionAttendance(sessionId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT a.*, u.full_name as player_name FROM academy_session_attendance a JOIN users u ON a.player_id = u.id WHERE a.session_id = ?`,
      [sessionId]
    );
    return rows;
  },

  async markAttendance(sessionId: number, playerId: number, status: string) {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO academy_session_attendance (session_id, player_id, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [sessionId, playerId, status]
    );
  },

  async createEvaluation(data: any) {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO academy_evaluations (academy_id, player_id, evaluator_id, skill_scores, overall_score, notes, recommended_level_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.academyId, data.playerId, data.evaluatorId, JSON.stringify(data.skillScores), data.overallScore || null, data.notes || null, data.recommendedLevelId || null]
    );
    return (result as any).insertId;
  },

  // ── Coaches ──
  async findCoachByUserId(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM coach_profiles WHERE user_id = ? AND deleted_at IS NULL', [userId]);
    return rows[0] || null;
  },

  async listSports() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT id, name FROM sports WHERE is_active = TRUE AND deleted_at IS NULL ORDER BY sort_order, name');
    return rows;
  },

  async findCoachById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT cp.*, u.full_name, u.email FROM coach_profiles cp JOIN users u ON cp.user_id = u.id WHERE cp.id = ? AND cp.deleted_at IS NULL`,
      [id]
    );
    return rows[0] || null;
  },

  async findCoaches(filters: { sportId?: number; isAvailable?: boolean; page: number; limit: number }) {
    const pool = getPool();
    let sql = `SELECT cp.*, u.full_name, u.email FROM coach_profiles cp JOIN users u ON cp.user_id = u.id WHERE cp.deleted_at IS NULL AND cp.status = 'approved'`;
    const params: any[] = [];
    if (filters.isAvailable !== undefined) { sql += ' AND cp.is_available = ?'; params.push(filters.isAvailable); }
    if (filters.sportId) { sql += ' AND JSON_CONTAINS(cp.sports, ?)'; params.push(JSON.stringify(filters.sportId)); }
    sql += ' ORDER BY cp.rating_avg DESC LIMIT ? OFFSET ?';
    const offset = (filters.page - 1) * filters.limit;
    params.push(filters.limit, offset);
    const [rows] = await pool.query<RowData>(sql, params);
    return rows;
  },

  async createCoachProfile(userId: number, data: any) {
    const pool = getPool();
    const [result] = await pool.execute(
      "INSERT INTO coach_profiles (user_id, bio, experience_years, certifications, sports, hourly_rate, currency_code, session_durations, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending') ON DUPLICATE KEY UPDATE bio = VALUES(bio), experience_years = VALUES(experience_years), certifications = VALUES(certifications), sports = VALUES(sports), hourly_rate = VALUES(hourly_rate), currency_code = VALUES(currency_code), session_durations = VALUES(session_durations), status = 'pending', deleted_at = NULL",
      [userId, data.bio || null, data.experienceYears || null, data.certifications ? JSON.stringify(data.certifications) : null, data.sports ? JSON.stringify(data.sports) : null, data.hourlyRate || null, data.currencyCode || null, data.sessionDurations ? JSON.stringify(data.sessionDurations) : null]
    );
    // Transitional dual-write to the legacy player_profiles columns (dropped later).
    await pool.execute(
      `INSERT INTO player_profiles (user_id, coach_status) VALUES (?, 'pending')
       ON DUPLICATE KEY UPDATE coach_status = 'pending', is_coach = 0`,
      [userId]
    );
    return (result as any).insertId;
  },

  async getCoachStatus(userId: number): Promise<string | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT status FROM coach_profiles WHERE user_id = ? AND deleted_at IS NULL', [userId]);
    return rows[0]?.status || null;
  },

  async resetCoachStatus(userId: number) {
    const pool = getPool();
    await pool.execute("UPDATE coach_profiles SET status = 'pending', deleted_at = NULL WHERE user_id = ?", [userId]);
    // Transitional dual-write to the legacy player_profiles columns (dropped later).
    await pool.execute(
      `INSERT INTO player_profiles (user_id, coach_status) VALUES (?, 'pending')
       ON DUPLICATE KEY UPDATE coach_status = 'pending', is_coach = 0`,
      [userId]
    );
  },

  async updateCoachProfile(userId: number, data: any) {
    const pool = getPool();
    const fields: string[] = []; const params: any[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        fields.push(`${col} = ?`);
        params.push(Array.isArray(val) || typeof val === 'object' ? JSON.stringify(val) : val);
      }
    }
    if (!fields.length) return false;
    params.push(userId);
    const [result] = await pool.execute(`UPDATE coach_profiles SET ${fields.join(', ')} WHERE user_id = ?`, params);
    return (result as any).affectedRows > 0;
  },

  async findOrgAgreements(coachId: number) {
    // Effective agreements (shown publicly): accepted + active only.
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT coa.*, o.name as organisation_name FROM coach_org_agreements coa JOIN organisations o ON coa.organisation_id = o.id WHERE coa.coach_id = ? AND coa.is_active = TRUE AND coa.status = 'accepted'`,
      [coachId]
    );
    return rows;
  },

  async upsertOrgAgreement(data: { coachId: number; organisationId: number; coachSplitPct: number; orgSplitPct: number; isActive?: boolean }) {
    // Coach-initiated agreements are auto-accepted.
    const pool = getPool();
    await pool.execute(
      `INSERT INTO coach_org_agreements (coach_id, organisation_id, coach_split_pct, org_split_pct, is_active, status, initiated_by)
       VALUES (?, ?, ?, ?, ?, 'accepted', 'coach')
       ON DUPLICATE KEY UPDATE coach_split_pct = VALUES(coach_split_pct), org_split_pct = VALUES(org_split_pct), is_active = VALUES(is_active), status = 'accepted', initiated_by = 'coach'`,
      [data.coachId, data.organisationId, data.coachSplitPct, data.orgSplitPct, data.isActive ?? true]
    );
  },

  /** Coach responds to a pending org-initiated invite. Returns affected rows. */
  async respondToOrgInvite(coachId: number, agreementId: number, accept: boolean): Promise<number> {
    const pool = getPool();
    const [result] = await pool.execute(
      `UPDATE coach_org_agreements
          SET status = ?, is_active = ?
        WHERE id = ? AND coach_id = ? AND initiated_by = 'org' AND status = 'pending'`,
      [accept ? 'accepted' : 'rejected', accept ? 1 : 0, agreementId, coachId]
    );
    return (result as any).affectedRows as number;
  },

  async listOrgAgreements(coachId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT coa.*, o.name as organisation_name FROM coach_org_agreements coa JOIN organisations o ON coa.organisation_id = o.id WHERE coa.coach_id = ?`,
      [coachId]
    );
    return rows;
  },

  async findCoachSessions(filters: { coachId?: number; playerId?: number; status?: string; page: number; limit: number }) {
    const pool = getPool();
    let sql = `SELECT cs.*, cp.id as coach_profile_id,
                      u.full_name as player_name,
                      cu.full_name as coach_name,
                      o.name as organisation_name
               FROM coach_sessions cs
               JOIN coach_profiles cp ON cs.coach_id = cp.id
               JOIN users u ON cs.player_id = u.id
               JOIN users cu ON cp.user_id = cu.id
               LEFT JOIN organisations o ON cs.organisation_id = o.id
               WHERE 1=1`;
    const params: any[] = [];
    if (filters.coachId) { sql += ' AND cs.coach_id = ?'; params.push(filters.coachId); }
    if (filters.playerId) { sql += ' AND cs.player_id = ?'; params.push(filters.playerId); }
    if (filters.status) { sql += ' AND cs.status = ?'; params.push(filters.status); }
    sql += ' ORDER BY cs.start_time DESC LIMIT ? OFFSET ?';
    const offset = (filters.page - 1) * filters.limit;
    params.push(filters.limit, offset);
    const [rows] = await pool.query<RowData>(sql, params);
    return rows;
  },

  async createCoachSession(data: any) {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO coach_sessions (coach_id, organisation_id, branch_id, resource_id, player_id, start_time, end_time, price, currency_code, platform_commission_pct, coach_earnings, org_earnings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.coachId, data.organisationId || null, data.branchId || null, data.resourceId || null, data.playerId, data.startTime, data.endTime, data.price, data.currencyCode, data.platformCommissionPct, data.coachEarnings, data.orgEarnings]
    );
    return (result as any).insertId;
  },

  async createCoachReview(data: { coachId: number; playerId: number; sessionId?: number; rating: number; reviewText?: string }) {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO coach_reviews (coach_id, player_id, session_id, rating, review_text) VALUES (?, ?, ?, ?, ?)',
      [data.coachId, data.playerId, data.sessionId || null, data.rating, data.reviewText || null]
    );
    return (result as any).insertId;
  },

  // ── Coach availability (weekly schedule + blackout dates) ──
  async getCoachAvailability(coachId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id, day_of_week, TIME_FORMAT(start_time, '%H:%i') AS start_time, TIME_FORMAT(end_time, '%H:%i') AS end_time
       FROM coach_availability WHERE coach_id = ? ORDER BY day_of_week, start_time`,
      [coachId]
    );
    return rows;
  },

  async setCoachAvailability(coachId: number, slots: { dayOfWeek: number; startTime: string; endTime: string }[]) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM coach_availability WHERE coach_id = ?', [coachId]);
      for (const s of slots) {
        await conn.execute(
          'INSERT INTO coach_availability (coach_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
          [coachId, s.dayOfWeek, s.startTime, s.endTime]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  },

  async getCoachBlackouts(coachId: number, fromDate?: string) {
    const pool = getPool();
    let sql = `SELECT id, DATE_FORMAT(blackout_date, '%Y-%m-%d') AS blackout_date, reason
               FROM coach_availability_blackouts WHERE coach_id = ?`;
    const params: any[] = [coachId];
    if (fromDate) { sql += ' AND blackout_date >= ?'; params.push(fromDate); }
    sql += ' ORDER BY blackout_date';
    const [rows] = await pool.execute<RowData>(sql, params);
    return rows;
  },

  async addCoachBlackout(coachId: number, date: string, reason?: string) {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO coach_availability_blackouts (coach_id, blackout_date, reason) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason)',
      [coachId, date, reason || null]
    );
    return (result as any).insertId;
  },

  async removeCoachBlackout(coachId: number, id: number) {
    const pool = getPool();
    const [result] = await pool.execute(
      'DELETE FROM coach_availability_blackouts WHERE id = ? AND coach_id = ?',
      [id, coachId]
    );
    return (result as any).affectedRows > 0;
  },

  async findScheduledSessionsOnDate(coachId: number, date: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id, start_time, end_time FROM coach_sessions
       WHERE coach_id = ? AND DATE(start_time) = ? AND status IN ('scheduled', 'in_progress')`,
      [coachId, date]
    );
    return rows;
  },

  // ── Admin: Tournaments ──
  async findTournamentsAdmin(filters: { page: number; limit: number; status?: string }) {
    const pool = getPool();
    let sql = `SELECT t.*, bt.name as bracket_type_name, s.name as sport_name, o.name as organisation_name
               FROM tournaments t
               JOIN tournament_bracket_types bt ON t.bracket_type_id = bt.id
               LEFT JOIN sports s ON t.sport_id = s.id
               LEFT JOIN organisations o ON t.organisation_id = o.id WHERE 1=1`;
    const params: any[] = [];
    if (filters.status) { sql += ' AND t.status = ?'; params.push(filters.status); }
    sql += ' ORDER BY t.start_date DESC LIMIT ? OFFSET ?';
    const offset = (filters.page - 1) * filters.limit;
    params.push(filters.limit, offset);
    const [rows] = await pool.query<RowData>(sql, params);
    const [countRows] = await pool.query<RowData>(
      'SELECT COUNT(*) as total FROM tournaments t WHERE 1=1' + (filters.status ? ' AND t.status = ?' : ''),
      filters.status ? [filters.status] : []
    );
    return { data: rows, total: (countRows[0] as any).total, page: filters.page, limit: filters.limit };
  },

  async findTournamentByIdAdmin(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT t.*, bt.name as bracket_type_name, o.name as organisation_name
       FROM tournaments t
       JOIN tournament_bracket_types bt ON t.bracket_type_id = bt.id
       LEFT JOIN organisations o ON t.organisation_id = o.id
       WHERE t.id = ?`, [id]
    );
    return rows[0] || null;
  },

  async softDeleteTournament(id: number) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await cascadeTournamentSoftDelete(id, conn);
      await conn.execute(
        'UPDATE tournaments SET deleted_at = NOW(), status = ? WHERE id = ?',
        ['cancelled', id],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  // ── Admin: Academies ──
  async findAcademiesAdmin(filters: { page: number; limit: number }) {
    const pool = getPool();
    const sql = `SELECT a.*, s.name as sport_name, o.name as organisation_name
                 FROM academies a
                 LEFT JOIN sports s ON a.sport_id = s.id
                 LEFT JOIN organisations o ON a.organisation_id = o.id AND o.deleted_at IS NULL
                 WHERE a.deleted_at IS NULL
                   AND (a.organisation_id IS NULL OR o.id IS NOT NULL)
                 ORDER BY a.name LIMIT ? OFFSET ?`;
    const offset = (filters.page - 1) * filters.limit;
    const [rows] = await pool.query<RowData>(sql, [filters.limit, offset]);
    const [countRows] = await pool.query<RowData>(
      `SELECT COUNT(*) as total FROM academies a
       LEFT JOIN organisations o ON a.organisation_id = o.id AND o.deleted_at IS NULL
       WHERE a.deleted_at IS NULL AND (a.organisation_id IS NULL OR o.id IS NOT NULL)`,
    );
    return { data: rows, total: (countRows[0] as any).total, page: filters.page, limit: filters.limit };
  },

  async updateAcademy(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = []; const params: any[] = [];
    const map: Record<string, string> = { name: 'name', description: 'description', image_url: 'image_url', sport_id: 'sport_id', is_active: 'is_active' };
    for (const [k, c] of Object.entries(map)) {
      if (data[k] !== undefined) { fields.push(`${c} = ?`); params.push(data[k]); }
    }
    if (!fields.length) return false;
    params.push(id);
    const [result] = await pool.execute(`UPDATE academies SET ${fields.join(', ')} WHERE id = ?`, params);
    return (result as any).affectedRows > 0;
  },

  async softDeleteAcademy(id: number) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await cascadeAcademySoftDelete(id, conn);
      await conn.execute('UPDATE academies SET deleted_at = NOW() WHERE id = ?', [id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  // ── Admin: Coaches ──
  async findCoachesAdmin(filters: { page: number; limit: number }) {
    const pool = getPool();
    const sql = `SELECT cp.*, u.full_name, u.email, cp.status AS coach_status
                 FROM coach_profiles cp
                 JOIN users u ON cp.user_id = u.id
                 ORDER BY FIELD(cp.status, 'pending', 'approved', 'rejected', 'none') ASC, cp.rating_avg DESC LIMIT ? OFFSET ?`;
    const offset = (filters.page - 1) * filters.limit;
    const [rows] = await pool.query<RowData>(sql, [filters.limit, offset]);
    const [countRows] = await pool.query<RowData>('SELECT COUNT(*) as total FROM coach_profiles cp');
    return { data: rows, total: (countRows[0] as any).total, page: filters.page, limit: filters.limit };
  },

  async updateCoachById(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = []; const params: any[] = [];
    const map: Record<string, string> = { bio: 'bio', experience_years: 'experience_years', hourly_rate: 'hourly_rate', is_available: 'is_available', is_verified: 'is_verified' };
    for (const [k, c] of Object.entries(map)) {
      if (data[k] !== undefined) { fields.push(`${c} = ?`); params.push(data[k]); }
    }
    if (!fields.length) return false;
    params.push(id);
    const [result] = await pool.execute(`UPDATE coach_profiles SET ${fields.join(', ')} WHERE id = ?`, params);
    return (result as any).affectedRows > 0;
  },

  async softDeleteCoach(id: number) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await cascadeCoachProfileSoftDelete(id, conn);
      await conn.execute('UPDATE coach_profiles SET deleted_at = NOW() WHERE id = ?', [id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async verifyCoach(id: number) {
    const pool = getPool();
    await pool.execute('UPDATE coach_profiles SET is_verified = TRUE WHERE id = ?', [id]);
  },

  async toggleCoachAvailability(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT is_available FROM coach_profiles WHERE id = ?', [id]);
    if (!rows.length) return null;
    const newVal = (rows[0] as any).is_available ? 0 : 1;
    await pool.execute('UPDATE coach_profiles SET is_available = ? WHERE id = ?', [newVal, id]);
    return { is_available: !!newVal };
  },

  async findPendingCourtSessions(coachId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT cs.*, u.full_name as player_name, u.phone as player_phone,
              b.name as branch_name, o.name as organisation_name
       FROM coach_sessions cs
       JOIN users u ON cs.player_id = u.id
       LEFT JOIN branches b ON cs.branch_id = b.id
       LEFT JOIN organisations o ON cs.organisation_id = o.id
       WHERE cs.coach_id = ? AND cs.status = 'pending_court'
       ORDER BY cs.start_time`,
      [coachId]
    );
    return rows;
  },

  async findCoachSessionById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT cs.*, cp.user_id as coach_user_id,
              u.full_name as player_name, u.phone as player_phone, u.email as player_email,
              cu.full_name as coach_name,
              b.name as branch_name, o.name as organisation_name,
              bk.id as booking_id, bk.booking_status, bk.payment_status,
              bk.total_amount as booking_total_amount,
              bk.commission_amount as booking_commission_amount,
              bk.club_amount as booking_club_amount,
              r.name as resource_name
       FROM coach_sessions cs
       JOIN coach_profiles cp ON cs.coach_id = cp.id
       JOIN users u ON cs.player_id = u.id
       JOIN users cu ON cp.user_id = cu.id
       LEFT JOIN branches b ON cs.branch_id = b.id
       LEFT JOIN organisations o ON cs.organisation_id = o.id
       LEFT JOIN bookings bk ON cs.booking_id = bk.id
       LEFT JOIN resources r ON cs.resource_id = r.id
       WHERE cs.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async findResourcesInBranch(branchId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id, name, hourly_price, opening_time, closing_time, slot_duration
       FROM resources WHERE branch_id = ? AND is_active = TRUE AND deleted_at IS NULL`,
      [branchId]
    );
    return rows;
  },

  async findBookingsForResources(resourceIds: number[], date: string) {
    const pool = getPool();
    if (!resourceIds.length) return [];
    const placeholders = resourceIds.map(() => '?').join(',');
    const [rows] = await pool.execute<RowData>(
      `SELECT resource_id, start_time, end_time FROM bookings
       WHERE resource_id IN (${placeholders}) AND booking_date = ?
       AND booking_status NOT IN ('cancelled', 'expired', 'no_show')`,
      [...resourceIds, date]
    );
    return rows;
  },

  async updateSessionBooking(sessionId: number, bookingId: number, status: string): Promise<void> {
    const pool = getPool();
    await pool.execute(
      'UPDATE coach_sessions SET booking_id = ?, status = ? WHERE id = ?',
      [bookingId, status, sessionId]
    );
  },

  async cancelCoachSession(sessionId: number): Promise<void> {
    const pool = getPool();
    await pool.execute(
      "UPDATE coach_sessions SET status = 'cancelled' WHERE id = ?",
      [sessionId]
    );
  },

  async findOrgAgreement(coachId: number, organisationId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM coach_org_agreements
       WHERE coach_id = ? AND organisation_id = ? AND is_active = TRUE AND status = 'accepted'`,
      [coachId, organisationId]
    );
    return rows[0] || null;
  },

  async updateCoachSessionStatus(sessionId: number, status: string): Promise<void> {
    const pool = getPool();
    await pool.execute(
      'UPDATE coach_sessions SET status = ? WHERE id = ?',
      [status, sessionId]
    );
  },
};

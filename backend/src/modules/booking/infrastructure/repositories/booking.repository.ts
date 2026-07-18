import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import { generateUUID, generateQRToken } from '../../../../shared/utils/token.js';
import { ConflictError } from '../../../../shared/errors/app-error.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

type RowData = RowDataPacket[];
type Executor = mysql.Pool | mysql.PoolConnection;

export class BookingRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  private resolve(conn?: mysql.PoolConnection): Executor {
    return conn ?? this.pool;
  }

  /**
   * Create booking. Pass a transaction connection to participate in the caller's transaction.
   */
  async create(data: {
    userId: number; branchId: number; organisationId: number; resourceId: number;
    bookingType: string; bookingDate: string; startTime: string; endTime: string;
    totalAmount: number; commissionAmount?: number; clubAmount?: number;
    notes?: string; bookingStatus?: string; paymentStatus?: string;
    paymentMethod?: string; startAtUtc?: string; endAtUtc?: string;
    businessDate?: string; expiresAt?: string;
  }, conn?: mysql.PoolConnection): Promise<number> {
    const db = this.resolve(conn);
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
        booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc,
        total_amount, commission_amount, club_amount,
        booking_status, payment_status, payment_method, notes, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
       [generateUUID(), data.userId, data.organisationId, data.branchId, data.resourceId, data.bookingType,
        data.bookingDate, data.businessDate || data.bookingDate, data.startTime, data.endTime,
        data.startAtUtc ? data.startAtUtc.replace('T', ' ').replace(/\.\d+Z$/, '') : null,
        data.endAtUtc ? data.endAtUtc.replace('T', ' ').replace(/\.\d+Z$/, '') : null,
       data.totalAmount, data.commissionAmount || 0, data.clubAmount || 0,
       data.bookingStatus || 'pending', data.paymentStatus || 'pending', data.paymentMethod || null, data.notes || null,
       data.expiresAt || null]
    );
    return result.insertId;
  }

  async persistTransition(
    id: number,
    bookingStatus: string,
    paymentStatus?: string,
    extraWhere?: string,
    conn?: mysql.PoolConnection,
  ): Promise<void> {
    const db = this.resolve(conn);
    const whereClause = extraWhere ? ` AND ${extraWhere}` : '';
    const sql = paymentStatus !== undefined
      ? `UPDATE bookings SET booking_status = ?, payment_status = ?, updated_at = NOW() WHERE id = ?${whereClause}`
      : `UPDATE bookings SET booking_status = ?, updated_at = NOW() WHERE id = ?${whereClause}`;
    const params = paymentStatus !== undefined
      ? [bookingStatus, paymentStatus, id]
      : [bookingStatus, id];
    await db.execute(sql, params);
  }

  async findById(id: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT b.*, r.name as resource_name, br.name as branch_name
       FROM bookings b
       JOIN resources r ON r.id = b.resource_id
       JOIN branches br ON br.id = b.branch_id
       WHERE b.id = ?`,
      [id]
    );
    return rows.length ? rows[0] : null;
  }

  async findByUser(userId: number, _status?: string, from?: string, to?: string, page = 1, limit = 20, sortBy?: string, lat?: number, lng?: number): Promise<{ data: any[]; total: number; page: number; limit: number; statusCounts: Record<string, number> }> {
    const hasCoords = lat !== undefined && lng !== undefined;
    const distanceExpr = hasCoords
      ? `(6371 * acos(cos(radians(${lat})) * cos(radians(br.latitude)) * cos(radians(br.longitude) - radians(${lng})) + sin(radians(${lat})) * sin(radians(br.latitude))))`
      : 'NULL';

    const baseWhere = 'WHERE b.user_id = ?';
    const baseParams: any[] = [userId];
    const extraWhere: string[] = [];
    if (from) { extraWhere.push('b.created_at >= ?'); baseParams.push(from); }
    if (to) { extraWhere.push('b.created_at <= ?'); baseParams.push(to); }
    const extraClause = extraWhere.length ? ' AND ' + extraWhere.join(' AND ') : '';

    let sql = `SELECT b.*, r.name as resource_name, br.name as branch_name, org.name as organisation_name,
                      br.latitude, br.longitude, ${distanceExpr} as distance_km,
                      CASE WHEN b.booking_type = 'public_match'
                        THEN (SELECT COUNT(*) FROM match_participants mp JOIN matches m ON m.id = mp.match_id WHERE m.booking_id = b.id AND mp.role != 'host')
                        ELSE (SELECT COUNT(*) FROM booking_invitations WHERE booking_id = b.id AND status = 'accepted')
                      END as accepted_count,
                      CASE WHEN b.booking_type = 'public_match'
                        THEN (SELECT COUNT(*) FROM join_requests jr JOIN matches m ON m.id = jr.match_id WHERE m.booking_id = b.id)
                        ELSE (SELECT COUNT(*) FROM booking_invitations WHERE booking_id = b.id)
                       END as applied_count
               FROM bookings b
               JOIN resources r ON r.id = b.resource_id
               JOIN branches br ON br.id = b.branch_id
               JOIN organisations org ON org.id = br.organisation_id
               ${baseWhere}${extraClause}`;
    const params: any[] = [...baseParams];
    if (_status) {
      const statuses = _status.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        sql += ' AND b.booking_status = ?';
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        sql += ` AND b.booking_status IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
      }
    }

    const countSql = sql.replace(/SELECT b\.\*,[\s\S]*FROM/, 'SELECT COUNT(*) as cnt FROM');
    const [countRows] = await this.pool.execute<RowData>(countSql, params);
    const total = (countRows[0] as any)?.cnt || 0;
    const offset = (page - 1) * limit;

    const orderBy = (sortBy === 'nearest' && hasCoords)
      ? `ORDER BY ${distanceExpr} ASC`
      : 'ORDER BY b.created_at DESC';

    const [rows] = await this.pool.query<RowData>(`${sql} ${orderBy} LIMIT ? OFFSET ?`, [...params, limit, offset]);

    const [countRows2] = await this.pool.execute<RowData>(
      `SELECT b.booking_status, COUNT(*) as cnt
       FROM bookings b
       JOIN resources r ON r.id = b.resource_id
       JOIN branches br ON br.id = b.branch_id
       JOIN organisations org ON org.id = br.organisation_id
       ${baseWhere}${extraClause}
       GROUP BY b.booking_status`,
      baseParams
    );
    const statusCounts: Record<string, number> = {};
    for (const row of countRows2 as any[]) {
      statusCounts[row.booking_status] = row.cnt;
    }

    return { data: rows, total, page, limit, statusCounts };
  }

  async findByOrganisation(orgId: number, date?: string, status?: string): Promise<any[]> {
    let sql = `SELECT b.*, r.name as resource_name, br.name as branch_name
               FROM bookings b
               JOIN resources r ON r.id = b.resource_id
               JOIN branches br ON br.id = b.branch_id
               WHERE b.organisation_id = ?`;
    const params: any[] = [orgId];
    if (date) { sql += ' AND b.booking_date = ?'; params.push(date); }
    if (status) { sql += ' AND b.booking_status = ?'; params.push(status); }
    sql += ' ORDER BY b.created_at DESC';
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows;
  }

  async isAcceptedParticipant(bookingId: number, userId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowData>(
      "SELECT id FROM booking_invitations WHERE booking_id = ? AND invited_user_id = ? AND status = 'accepted'",
      [bookingId, userId]
    );
    return rows.length > 0;
  }

  /**
   * Check slot availability. Pass a transaction conn for FOR UPDATE semantics.
   */
  async checkSlotAvailability(resourceId: number, date: string, slots: { start: string; end: string; date?: string }[], conn?: mysql.PoolConnection): Promise<boolean> {
    const db = this.resolve(conn);
    const bookingSql = `SELECT COUNT(*) as cnt FROM bookings
                 WHERE resource_id = ? AND booking_date = ?
                 AND booking_status NOT IN ('cancelled', 'expired', 'no_show')
                 AND ((start_time < ? AND end_time > ?) OR (start_time < ? AND end_time > ?))`;
    let totalOverlap = 0;
    for (const slot of slots) {
      const slotDate = slot.date || date;
      const [bRows] = await db.execute<RowData>(bookingSql, [resourceId, slotDate, slot.end, slot.start, slot.end, slot.start]);
      totalOverlap += (bRows[0] as any).cnt;
    }
    return totalOverlap === 0;
  }

  async getAvailableSlots(resourceId: number, date: string): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT slot_start, slot_end, is_available FROM booking_slots
       WHERE resource_id = ? AND booking_date = ? AND is_available = TRUE`,
      [resourceId, date]
    );
    return rows;
  }

  async getAllSlotsWithStatus(resourceId: number, date: string): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT bs.slot_start, bs.slot_end,
         CASE WHEN b.id IS NOT NULL THEN 'booked'
              ELSE 'available' END as status
       FROM booking_slots bs
       LEFT JOIN bookings b ON b.resource_id = bs.resource_id
         AND b.booking_date = bs.booking_date
         AND b.start_time = bs.slot_start
         AND b.booking_status NOT IN ('cancelled', 'expired', 'no_show')
       WHERE bs.resource_id = ? AND bs.booking_date = ?`,
      [resourceId, date]
    );
    return rows;
  }

  async findBookingsForResourceDate(resourceId: number, date: string): Promise<any[]> {
    const [bRows] = await this.pool.execute<RowData>(
      `SELECT start_time, end_time FROM bookings
       WHERE resource_id = ? AND booking_date = ?
       AND booking_status NOT IN ('cancelled', 'expired', 'no_show')`,
      [resourceId, date]
    );
    return bRows;
  }

  async findBookingsByBusinessDate(resourceId: number, businessDate: string): Promise<Array<{ startAtUtc: string; endAtUtc: string; bookingDate?: string; startTime?: string; endTime?: string }>> {
    // Also check previous day to catch overnight bookings (e.g. 23:00→01:00)
    // Includes bookings where start_at_utc IS NULL (legacy records) — caller converts
    const [bRows] = await this.pool.execute<RowData>(
      `SELECT start_at_utc, end_at_utc, booking_date, start_time, end_time FROM bookings
       WHERE resource_id = ? AND (business_date = ? OR business_date = DATE_SUB(?, INTERVAL 1 DAY)
            OR (business_date IS NULL AND booking_date = ?))
       AND booking_status NOT IN ('cancelled', 'expired', 'no_show')`,
      [resourceId, businessDate, businessDate, businessDate]
    );
    // Normalize DB snake_case columns to camelCase TimeEngine contract
    return bRows.map((row: any) => ({
      startAtUtc: row.start_at_utc,
      endAtUtc: row.end_at_utc,
      bookingDate: row.booking_date,
      startTime: row.start_time,
      endTime: row.end_time,
    }));
  }

  async createMatchmakingRequest(data: {
    bookingId: number; minAge?: number; maxAge?: number; targetGender: string;
    targetLevelId?: number; maxPlayers: number; deadline?: string; autoApply: boolean;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO booking_matchmaking_requests (booking_id, min_age, max_age, target_gender, target_level_id, max_players, deadline, auto_apply)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE min_age = VALUES(min_age), max_age = VALUES(max_age), target_gender = VALUES(target_gender),
       target_level_id = VALUES(target_level_id), max_players = VALUES(max_players), deadline = VALUES(deadline),
       auto_apply = VALUES(auto_apply), is_active = 1`,
      [data.bookingId, data.minAge || null, data.maxAge || null, data.targetGender, data.targetLevelId || null, data.maxPlayers, data.deadline || null, data.autoApply]
    );
  }

  async findMatchmakingRequest(bookingId: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM booking_matchmaking_requests WHERE booking_id = ? AND is_active = 1', [bookingId]
    );
    return rows.length ? rows[0] : null;
  }

  async findMatchingPlayers(bookingId: number, criteria: {
    sportId: number; minAge?: number; maxAge?: number; targetGender: string;
    targetLevelId?: number; excludeUserId: number;
  }): Promise<any[]> {
    const conditions: string[] = ['u.id != ?'];
    const params: any[] = [criteria.excludeUserId];

    if (criteria.minAge) {
      conditions.push('u.birth_date IS NOT NULL');
      conditions.push('TIMESTAMPDIFF(YEAR, u.birth_date, CURDATE()) >= ?');
      params.push(criteria.minAge);
    }
    if (criteria.maxAge) {
      conditions.push('u.birth_date IS NOT NULL');
      conditions.push('TIMESTAMPDIFF(YEAR, u.birth_date, CURDATE()) <= ?');
      params.push(criteria.maxAge);
    }
    if (criteria.targetGender && criteria.targetGender !== 'any') {
      conditions.push('u.gender = ?');
      params.push(criteria.targetGender);
    }

    const profileConditions: string[] = [];
    if (criteria.sportId) {
      profileConditions.push(`(
        pp.main_sport_id = ?
        OR EXISTS (SELECT 1 FROM player_sport_interests psi WHERE psi.user_id = u.id AND psi.sport_id = ?)
        OR (
          pp.main_sport_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM player_sport_interests psi2 WHERE psi2.user_id = u.id)
        )
      )`);
      params.push(criteria.sportId, criteria.sportId);
    }
    if (criteria.targetLevelId) {
      profileConditions.push('pp.main_level_id = ?');
      params.push(criteria.targetLevelId);
    }

    const profileFilter = profileConditions.length
      ? `AND ${profileConditions.join(' AND ')}`
      : '';

    const [rows] = await this.pool.execute<RowData>(
      `SELECT u.id, u.full_name, u.gender, u.birth_date, u.avatar_url,
              pp.main_level_id, pl.name as level_name
       FROM users u
       LEFT JOIN player_profiles pp ON pp.user_id = u.id
       LEFT JOIN player_levels pl ON pl.id = pp.main_level_id
       WHERE ${conditions.join(' AND ')}
       AND u.account_status = 'active'
       ${profileFilter}
       ORDER BY u.full_name ASC`,
      params
    );
    return rows;
  }

  async createInvitation(bookingId: number, userId: number): Promise<number> {
    const [existing] = await this.pool.execute<RowData>(
      'SELECT id, status FROM booking_invitations WHERE booking_id = ? AND invited_user_id = ?',
      [bookingId, userId]
    );
    if (existing.length) {
      if ((existing[0] as any).status === 'declined') {
        await this.pool.execute(
          'UPDATE booking_invitations SET status = ? WHERE id = ?',
          ['pending', (existing[0] as any).id]
        );
        return (existing[0] as any).id;
      }
      throw new ConflictError('You have already applied to this booking');
    }

    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO booking_invitations (booking_id, invited_user_id, status, token)
       VALUES (?, ?, 'pending', UUID())`,
      [bookingId, userId]
    );
    return result.insertId;
  }

  async findInvitationById(invitationId: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT bi.*, b.user_id as owner_id, b.booking_type, b.booking_status
       FROM booking_invitations bi
       JOIN bookings b ON b.id = bi.booking_id
       WHERE bi.id = ?`,
      [invitationId]
    );
    return rows.length ? rows[0] : null;
  }

  async updateInvitationStatus(invitationId: number, status: string): Promise<void> {
    await this.pool.execute(
      'UPDATE booking_invitations SET status = ?, responded_at = NOW() WHERE id = ?',
      [status, invitationId]
    );
  }

  async countAcceptedPlayers(bookingId: number): Promise<number> {
    const [rows] = await this.pool.execute<RowData>(
      "SELECT COUNT(*) as cnt FROM booking_invitations WHERE booking_id = ? AND status = 'accepted'",
      [bookingId]
    );
    return (rows[0] as any).cnt;
  }

  async rejectAllPending(bookingId: number): Promise<{ userId: number; id: number }[]> {
    const [pending] = await this.pool.execute<RowData>(
      "SELECT id, invited_user_id as userId FROM booking_invitations WHERE booking_id = ? AND status = 'pending'",
      [bookingId]
    );
    if (pending.length > 0) {
      await this.pool.execute(
        "UPDATE booking_invitations SET status = 'declined', responded_at = NOW() WHERE booking_id = ? AND status = 'pending'",
        [bookingId]
      );
    }
    return pending as any[];
  }

  async addParticipantFromInvitation(bookingId: number, userId: number, fullName: string): Promise<void> {
    const [existing] = await this.pool.execute<RowData>(
      'SELECT id FROM booking_participants WHERE booking_id = ? AND user_id = ?',
      [bookingId, userId]
    );
    if (!existing.length) {
      await this.pool.execute(
        'INSERT INTO booking_participants (booking_id, user_id, full_name) VALUES (?, ?, ?)',
        [bookingId, userId, fullName]
      );
    }
  }

  async findApplicants(bookingId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT bi.*, u.full_name, u.email, u.avatar_url, u.gender,
              pp.main_level_id, pl.name as level_name
       FROM booking_invitations bi
       LEFT JOIN users u ON u.id = bi.invited_user_id
       LEFT JOIN player_profiles pp ON pp.user_id = bi.invited_user_id
       LEFT JOIN player_levels pl ON pl.id = pp.main_level_id
       WHERE bi.booking_id = ?
       ORDER BY bi.created_at DESC`,
      [bookingId]
    );
    return rows;
  }

  async findJoinedPlayers(bookingId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT bp.user_id, bp.full_name, u.avatar_url, u.gender,
              pp.main_level_id, pl.name as level_name
       FROM booking_participants bp
       LEFT JOIN users u ON u.id = bp.user_id
       LEFT JOIN player_profiles pp ON pp.user_id = bp.user_id
       LEFT JOIN player_levels pl ON pl.id = pp.main_level_id
       WHERE bp.booking_id = ?`,
      [bookingId]
    );
    return rows;
  }

  async findPublicMatches(userId: number, filters?: { lat?: number; lng?: number; date?: string }): Promise<any[]> {
    const hasCoords = filters?.lat !== undefined && filters?.lng !== undefined;
    const distanceExpr = hasCoords
      ? `(6371 * acos(cos(radians(${filters!.lat})) * cos(radians(br.latitude)) * cos(radians(br.longitude) - radians(${filters!.lng})) + sin(radians(${filters!.lat})) * sin(radians(br.latitude))))`
      : 'NULL';

    const params: any[] = [
      userId, // u.id (line 494)
      userId, // bi.invited_user_id (line 497)
      userId, // exclude owner (line 501)
      userId, // branch access (line 507)
      userId, // sport interests (line 513)
      userId, // sport fallback - no profile & no interests (line 517-519)
    ];

    let dateFilter = '';
    if (filters?.date) {
      dateFilter = 'AND b.booking_date = ?';
      params.push(filters.date);
    }

    const orderBy = hasCoords
      ? `ORDER BY ${distanceExpr} ASC, b.booking_date ASC, b.start_time ASC`
      : 'ORDER BY b.booking_date ASC, b.start_time ASC';

    const [rows] = await this.pool.execute<RowData>(
      `SELECT b.*, r.name as resource_name, r.sport_id, br.name as branch_name, org.name as organisation_name,
              br.latitude, br.longitude,
              ${distanceExpr} as distance_km,
              bmr.min_age, bmr.max_age, bmr.target_gender, bmr.target_level_id,
              bmr.max_players, bmr.deadline, bmr.auto_apply,
              pl.name as target_level_name,
              bi.id as invitation_id, bi.status as invitation_status,
              CASE WHEN b.booking_type = 'public_match'
                THEN (SELECT COUNT(*) FROM match_participants mp JOIN matches m ON m.id = mp.match_id WHERE m.booking_id = b.id AND mp.role != 'host')
                ELSE (SELECT COUNT(*) FROM booking_invitations WHERE booking_id = b.id AND status = 'accepted')
              END as accepted_count,
              (bmr.deadline IS NOT NULL AND bmr.deadline < NOW()) as is_expired
       FROM bookings b
       JOIN resources r ON r.id = b.resource_id
       JOIN branches br ON br.id = b.branch_id
       JOIN organisations org ON org.id = br.organisation_id
       INNER JOIN booking_matchmaking_requests bmr ON bmr.booking_id = b.id AND bmr.is_active = 1
       JOIN users u ON u.id = ?
       LEFT JOIN player_profiles pp ON pp.user_id = u.id
       LEFT JOIN player_levels pl ON pl.id = bmr.target_level_id
       LEFT JOIN booking_invitations bi ON bi.booking_id = b.id AND bi.invited_user_id = ?
       WHERE b.booking_type = 'public_match'
         AND b.booking_status IN ('confirmed', 'pending')
         AND b.booking_date >= CURDATE()
         AND b.user_id != ?
         AND (
           br.access_type = 'open'
           OR EXISTS (
             SELECT 1 FROM branch_player_access bpa
             WHERE bpa.branch_id = br.id AND bpa.player_id = ? AND bpa.status = 'approved'
           )
         )
          AND (
            r.sport_id = pp.main_sport_id
            OR EXISTS (
              SELECT 1 FROM player_sport_interests psi
              WHERE psi.user_id = ? AND psi.sport_id = r.sport_id
            )
            OR (
              pp.main_sport_id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM player_sport_interests psi2 WHERE psi2.user_id = ?
              )
            )
          )
         AND (
           bmr.target_gender = 'any'
           OR u.gender = bmr.target_gender
         )
         AND (
           bmr.min_age IS NULL
           OR (
             u.birth_date IS NOT NULL
             AND TIMESTAMPDIFF(YEAR, u.birth_date, CURDATE()) >= bmr.min_age
           )
         )
         AND (
           bmr.max_age IS NULL
           OR (
             u.birth_date IS NOT NULL
             AND TIMESTAMPDIFF(YEAR, u.birth_date, CURDATE()) <= bmr.max_age
           )
         )
         AND (
           bmr.target_level_id IS NULL
           OR pp.main_level_id = bmr.target_level_id
         )
          AND (
            (bmr.deadline IS NOT NULL AND bmr.deadline < NOW())
            OR (
              SELECT COUNT(*) FROM booking_invitations WHERE booking_id = b.id AND status = 'accepted'
            ) < bmr.max_players
            OR bi.status = 'accepted'
          )
         ${dateFilter}
       ${orderBy}`,
      params
    );
    return rows;
  }

  async createCancellationRecord(id: number, actorId: number, reason: string, feeAmount: number, conn?: mysql.PoolConnection): Promise<void> {
    const db = this.resolve(conn);
    await db.execute(
      `INSERT INTO booking_cancellations (booking_id, cancelled_by, reason, refund_amount)
       VALUES (?, ?, ?, ?)`,
      [id, actorId, reason, feeAmount]
    );
  }

  async persistPaymentStatus(id: number, paymentStatus: string, conn?: mysql.PoolConnection): Promise<void> {
    const db = this.resolve(conn);
    await db.execute(
      `UPDATE bookings SET payment_status = ?, updated_at = NOW() WHERE id = ?`,
      [paymentStatus, id]
    );
  }

  async findAll(filters?: { orgId?: number; branchId?: number; resourceId?: number; resource?: string; branch?: string; orgName?: string; date?: string; status?: string; paymentStatus?: string; bookingType?: string; page?: number; limit?: number }): Promise<{ rows: any[]; total: number }> {
    const join = `FROM bookings b
                  LEFT JOIN users u ON u.id = b.user_id
                  LEFT JOIN resources r ON r.id = b.resource_id
                  LEFT JOIN branches br ON br.id = b.branch_id
                  LEFT JOIN organisations org ON org.id = br.organisation_id`;
    const params: any[] = [];
    const conditions: string[] = [];
    if (filters?.orgId) { conditions.push(`br.organisation_id = ?`); params.push(filters.orgId); }
    if (filters?.branchId) { conditions.push(`b.branch_id = ?`); params.push(filters.branchId); }
    if (filters?.resourceId) { conditions.push(`b.resource_id = ?`); params.push(filters.resourceId); }
    if (filters?.resource) { conditions.push(`r.name LIKE ?`); params.push(`%${filters.resource}%`); }
    if (filters?.branch) { conditions.push(`br.name LIKE ?`); params.push(`%${filters.branch}%`); }
    if (filters?.orgName) { conditions.push(`org.name LIKE ?`); params.push(`%${filters.orgName}%`); }
    if (filters?.date) { conditions.push(`b.booking_date = ?`); params.push(filters.date); }
    if (filters?.status) { conditions.push(`b.booking_status = ?`); params.push(filters.status); }
    if (filters?.paymentStatus) { conditions.push(`b.payment_status = ?`); params.push(filters.paymentStatus); }
    if (filters?.bookingType) { conditions.push(`b.booking_type = ?`); params.push(filters.bookingType); }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const [countRows] = await this.pool.execute<RowData>(`SELECT COUNT(*) as total ${join}${where}`, params);
    const total = (countRows[0] as any).total;
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;
    const [rows] = await this.pool.query<RowData>(
      `SELECT b.*, u.full_name as user_name, u.phone_number as user_phone, r.name as resource_name,
               br.name as branch_name, org.name as organisation_name ${join}${where}
       ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return { rows, total };
  }

  async userHasRole(userId: number, roleSlug: string): Promise<boolean> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT 1 FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.slug = ? AND ur.is_active = TRUE
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
       AND r.deleted_at IS NULL
       LIMIT 1`,
      [userId, roleSlug]
    );
    return rows.length > 0;
  }

  async releaseSlots(bookingId: number, conn?: mysql.PoolConnection): Promise<void> {
    const db = this.resolve(conn);
    await db.execute(
      'UPDATE booking_slots SET is_available = TRUE WHERE booking_id = ? AND is_available = FALSE',
      [bookingId],
    );
  }

  async lockSlots(bookingId: number, conn?: mysql.PoolConnection): Promise<void> {
    const db = this.resolve(conn);
    await db.execute(
      'UPDATE booking_slots SET is_available = FALSE WHERE booking_id = ? AND is_available = TRUE',
      [bookingId],
    );
  }

  async createCancellation(
    bookingId: number,
    actorId: number,
    reason: string,
    feeAmount: number,
    conn?: mysql.PoolConnection,
  ): Promise<void> {
    const db = this.resolve(conn);
    await db.execute(
      `INSERT INTO booking_cancellations (booking_id, cancelled_by, reason, refund_amount)
       VALUES (?, ?, ?, ?)`,
      [bookingId, actorId, reason, feeAmount],
    );
  }
}

export const bookingRepository = new BookingRepository();

import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import type {
  PlayerDashboardData, PlayerActivityItem, PlayerStatisticsSummary,
  PlayerSearchResult, QRProfileData, PlayerFavorite, PlayerDevice, PlayerAchievement,
} from '../domain/player.types.js';

class PlayerService {
  async getDashboard(userId: number): Promise<PlayerDashboardData> {
    const pool = getPool();
    const [[walletRow]] = await pool.execute<any[]>('SELECT COALESCE(balance, 0) AS balance FROM user_wallets WHERE user_id = ?', [userId]);
    const [[notifRow]] = await pool.execute<any[]>('SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
    const [[bookingsRow]] = await pool.execute<any[]>("SELECT COUNT(*) AS cnt FROM bookings WHERE user_id = ? AND start_at_utc > NOW() AND booking_status IN ('confirmed','pending')", [userId]);
    const [[matchesRow]] = await pool.execute<any[]>("SELECT COUNT(*) AS cnt FROM tournament_matches WHERE (player1_id = ? OR player2_id = ?) AND start_time > NOW() AND status = 'scheduled'", [userId, userId]);
    const [[academyRow]] = await pool.execute<any[]>("SELECT COUNT(*) AS cnt FROM academy_enrollments WHERE player_id = ? AND status = 'active'", [userId]);
    const [[tournRow]] = await pool.execute<any[]>("SELECT COUNT(*) AS cnt FROM tournament_registrations WHERE player_id = ? AND status IN ('registered','confirmed')", [userId]);
    const [[leagueRow]] = await pool.execute<any[]>("SELECT COUNT(*) AS cnt FROM league_teams WHERE captain_id = ? AND status = 'confirmed'", [userId]);

    const [activityRows] = await pool.execute<any[]>(
      `SELECT 'booking' AS type, 'Upcoming Booking' AS title, NULL AS description, start_at_utc AS timestamp, booking_status AS status, id AS reference_id, 'booking' AS reference_type
       FROM bookings WHERE user_id = ? AND start_at_utc > NOW()
       UNION ALL
       SELECT 'tournament' AS type, t.name AS title, NULL AS description, tm.start_time AS timestamp, tm.status, tm.id, 'tournament_match'
       FROM tournament_matches tm JOIN tournaments t ON t.id = tm.tournament_id
       WHERE (tm.player1_id = ? OR tm.player2_id = ?) AND tm.start_time > NOW()
       ORDER BY timestamp ASC LIMIT 10`,
      [userId, userId, userId],
    );

    return {
      wallet_balance: Number(walletRow?.balance ?? 0),
      unread_notifications: Number(notifRow?.cnt ?? 0),
      upcoming_bookings: Number(bookingsRow?.cnt ?? 0),
      upcoming_matches: Number(matchesRow?.cnt ?? 0),
      active_academy_enrollments: Number(academyRow?.cnt ?? 0),
      active_tournament_registrations: Number(tournRow?.cnt ?? 0),
      active_league_teams: Number(leagueRow?.cnt ?? 0),
      recent_activity: (activityRows ?? []).map((r: any) => ({
        type: r.type,
        title: r.title,
        description: r.description ?? undefined,
        timestamp: r.timestamp,
        status: r.status ?? undefined,
        reference_id: r.reference_id ? Number(r.reference_id) : undefined,
        reference_type: r.reference_type ?? undefined,
      })),
    };
  }

  async getUpcoming(userId: number): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      `SELECT 'booking' AS type, b.id, b.start_at_utc AS start_time, b.booking_status AS status
       FROM bookings b WHERE b.user_id = ? AND b.start_at_utc > NOW()
       UNION ALL
       SELECT 'match', tm.id, tm.start_time, tm.status
       FROM tournament_matches tm WHERE (tm.player1_id = ? OR tm.player2_id = ?) AND tm.start_time > NOW() AND tm.status = 'scheduled'
       UNION ALL
       SELECT 'academy', ae.id, ae.enrolled_at, ae.status
       FROM academy_enrollments ae WHERE ae.player_id = ? AND ae.status = 'active'
       ORDER BY start_time ASC LIMIT 50`,
      [userId, userId, userId, userId],
    );
    return rows;
  }

  async getStatistics(userId: number): Promise<PlayerStatisticsSummary> {
    const pool = getPool();
    const [[bookingsRow]] = await pool.execute<any[]>('SELECT COUNT(*) AS cnt FROM bookings WHERE user_id = ?', [userId]);
    const [[matchesRow]] = await pool.execute<any[]>('SELECT COUNT(*) AS cnt FROM tournament_matches WHERE (player1_id = ? OR player2_id = ?) AND status = \'completed\'', [userId, userId]);
    const [[academyRow]] = await pool.execute<any[]>('SELECT COUNT(*) AS cnt FROM academy_enrollments WHERE player_id = ?', [userId]);
    const [[tournRow]] = await pool.execute<any[]>('SELECT COUNT(*) AS cnt FROM tournament_registrations WHERE player_id = ?', [userId]);
    const [[followersRow]] = await pool.execute<any[]>('SELECT COUNT(*) AS cnt FROM user_follows WHERE following_id = ?', [userId]);
    const [[followingRow]] = await pool.execute<any[]>('SELECT COUNT(*) AS cnt FROM user_follows WHERE follower_id = ?', [userId]);
    const [[walletRow]] = await pool.execute<any[]>('SELECT COALESCE(balance, 0) AS balance FROM user_wallets WHERE user_id = ?', [userId]);

    return {
      total_bookings: Number(bookingsRow?.cnt ?? 0),
      total_matches_played: Number(matchesRow?.cnt ?? 0),
      total_academy_sessions: Number(academyRow?.cnt ?? 0),
      total_tournaments_joined: Number(tournRow?.cnt ?? 0),
      total_achievements: 0,
      total_followers: Number(followersRow?.cnt ?? 0),
      total_following: Number(followingRow?.cnt ?? 0),
      wallet_balance: Number(walletRow?.balance ?? 0),
    };
  }

  async getQRProfile(userId: number): Promise<QRProfileData> {
    const pool = getPool();
    const [[userRow]] = await pool.execute<any[]>('SELECT id, full_name, avatar_url, created_at, is_public FROM users WHERE id = ?', [userId]);
    if (!userRow) throw new Error('User not found');

    const [[bookingsRow]] = await pool.execute<any[]>('SELECT COUNT(*) AS cnt FROM bookings WHERE user_id = ?', [userId]);
    const [[matchesRow]] = await pool.execute<any[]>('SELECT COUNT(*) AS cnt FROM tournament_matches WHERE (player1_id = ? OR player2_id = ?) AND status = \'completed\'', [userId, userId]);
    const [[followersRow]] = await pool.execute<any[]>('SELECT COUNT(*) AS cnt FROM user_follows WHERE following_id = ?', [userId]);

    return {
      id: userRow.id,
      full_name: userRow.full_name,
      avatar_url: userRow.avatar_url ?? undefined,
      player_since: userRow.created_at?.toString() ?? '',
      stats: [
        { label: 'Bookings', value: Number(bookingsRow?.cnt ?? 0) },
        { label: 'Matches Played', value: Number(matchesRow?.cnt ?? 0) },
        { label: 'Followers', value: Number(followersRow?.cnt ?? 0) },
      ],
    };
  }

  async searchPlayers(query: string, page = 1, limit = 20, currentUserId?: number): Promise<{ data: PlayerSearchResult[]; total: number }> {
    const pool = getPool();
    const offset = (page - 1) * limit;
    const like = `%${query}%`;

    const [[countRow]] = await pool.execute<any[]>(
      "SELECT COUNT(*) AS total FROM users WHERE full_name LIKE ? AND account_status = 'active' AND deleted_at IS NULL", [like],
    );
    const total = countRow?.total ?? 0;

    const [rows] = await pool.query<any[]>(
      `SELECT u.id, u.full_name, u.email, u.avatar_url, u.is_public,
              (SELECT 1 FROM user_follows uf WHERE uf.follower_id = ? AND uf.following_id = u.id) AS is_following
       FROM users u
       WHERE u.full_name LIKE ? AND u.account_status = 'active' AND u.deleted_at IS NULL
       ORDER BY u.full_name ASC
       LIMIT ? OFFSET ?`,
      [currentUserId ?? 0, like, limit, offset],
    );

    return {
      data: rows.map((r: any) => ({
        id: r.id,
        full_name: r.full_name,
        email: r.email ?? undefined,
        avatar_url: r.avatar_url ?? undefined,
        is_public: !!r.is_public,
        is_following: !!r.is_following,
      })),
      total,
    };
  }

  async getPlayerProfile(playerId: number, currentUserId?: number): Promise<any> {
    const pool = getPool();
    const [[userRow]] = await pool.execute<any[]>(
      `SELECT u.id, u.full_name, u.email, u.avatar_url, u.gender, u.is_public, u.created_at,
              (SELECT 1 FROM user_follows uf WHERE uf.follower_id = ? AND uf.following_id = u.id) AS is_following
       FROM users u WHERE u.id = ? AND u.account_status = 'active' AND u.deleted_at IS NULL`,
      [currentUserId ?? 0, playerId],
    );
    if (!userRow) throw new Error('Player not found');
    return {
      id: userRow.id,
      full_name: userRow.full_name,
      email: userRow.email,
      avatar_url: userRow.avatar_url ?? undefined,
      gender: userRow.gender,
      is_public: !!userRow.is_public,
      is_following: !!userRow.is_following,
      member_since: userRow.created_at,
    };
  }

  async getFavoriteClubs(userId: number): Promise<PlayerFavorite[]> {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      `SELECT o.id, o.name, o.logo_url AS image_url, o.description, uf.created_at
       FROM user_follows uf
       JOIN organisations o ON o.id = uf.following_id
       WHERE uf.follower_id = ?
       ORDER BY uf.created_at DESC`,
      [userId],
    );
    return rows.map((r: any) => ({
      id: r.id,
      type: 'club' as const,
      name: r.name,
      image_url: r.image_url ?? undefined,
      description: r.description ?? undefined,
      created_at: r.created_at?.toString() ?? '',
    }));
  }

  async addFavoriteClub(userId: number, orgId: number): Promise<void> {
    const pool = getPool();
    await pool.execute('INSERT IGNORE INTO user_follows (follower_id, following_id) VALUES (?, ?)', [userId, orgId]);
  }

  async removeFavoriteClub(userId: number, orgId: number): Promise<void> {
    const pool = getPool();
    await pool.execute('DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?', [userId, orgId]);
  }

  async getFavoriteCoaches(userId: number): Promise<PlayerFavorite[]> {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      `SELECT u.id, u.full_name AS name, u.avatar_url AS image_url, uf.created_at
       FROM user_follows uf
       JOIN users u ON u.id = uf.following_id
       WHERE uf.follower_id = ? AND u.account_status = 'active' AND u.deleted_at IS NULL
       ORDER BY uf.created_at DESC`,
      [userId],
    );
    return rows.map((r: any) => ({
      id: r.id,
      type: 'coach' as const,
      name: r.name,
      image_url: r.image_url ?? undefined,
      created_at: r.created_at?.toString() ?? '',
    }));
  }

  async removeFavoriteCoach(userId: number, coachId: number): Promise<void> {
    const pool = getPool();
    await pool.execute('DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?', [userId, coachId]);
  }

  async getDevices(userId: number): Promise<PlayerDevice[]> {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      'SELECT id, device_name, device_type, os, browser, last_seen_at AS last_active_at, created_at FROM user_devices WHERE user_id = ? ORDER BY last_seen_at DESC',
      [userId],
    );
    return rows.map((r: any) => ({
      id: r.id,
      device_name: r.device_name ?? undefined,
      device_type: r.device_type ?? undefined,
      os: r.os ?? undefined,
      browser: r.browser ?? undefined,
      last_active_at: r.last_active_at?.toString() ?? undefined,
      created_at: r.created_at?.toString() ?? '',
    }));
  }

  async removeDevice(userId: number, deviceId: number): Promise<void> {
    const pool = getPool();
    const [result] = await pool.execute<any>('DELETE FROM user_devices WHERE id = ? AND user_id = ?', [deviceId, userId]);
    if (result.affectedRows === 0) throw new Error('Device not found or does not belong to you');
  }

  async getAchievements(userId: number): Promise<PlayerAchievement[]> {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      `SELECT uta.id, uta.achievement_key AS \`key\`, a.title, a.description, a.icon_url, uta.unlocked_at,
              uta.progress, a.max_progress
       FROM user_targeted_achievements uta
       JOIN achievements a ON a.achievement_key = uta.achievement_key
       WHERE uta.user_id = ? AND uta.is_hidden = 0
       ORDER BY uta.unlocked_at DESC`,
      [userId],
    );
    if (rows.length > 0) {
      return rows.map((r: any) => ({
        id: r.id,
        key: r.key,
        title: r.title,
        description: r.description ?? undefined,
        icon_url: r.icon_url ?? undefined,
        unlocked_at: r.unlocked_at?.toString() ?? undefined,
        progress: r.progress != null ? Number(r.progress) : undefined,
        max_progress: r.max_progress != null ? Number(r.max_progress) : undefined,
      }));
    }

    return [
      { id: 1, key: 'first_booking', title: 'First Booking', description: 'Made your first booking', icon_url: undefined },
      { id: 2, key: 'five_bookings', title: 'Regular Player', description: 'Made 5 bookings', icon_url: undefined },
      { id: 3, key: 'first_match', title: 'First Match', description: 'Played your first match', icon_url: undefined },
      { id: 4, key: 'tournament_participant', title: 'Tournament Participant', description: 'Joined your first tournament', icon_url: undefined },
      { id: 5, key: 'academy_graduate', title: 'Academy Graduate', description: 'Completed an academy program', icon_url: undefined },
    ];
  }
}

export const playerService = new PlayerService();

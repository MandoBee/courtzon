import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const communityRepository = {
  // ── Follows ──
  async follow(followerId: number, followingId: number) {
    const pool = getPool();
    await pool.execute('INSERT IGNORE INTO user_follows (follower_id, following_id) VALUES (?, ?)', [followerId, followingId]);
  },
  async unfollow(followerId: number, followingId: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
  },
  async findFollowers(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT u.id, u.full_name FROM user_follows uf JOIN users u ON uf.follower_id = u.id WHERE uf.following_id = ?', [userId]);
    return rows;
  },
  async findFollowing(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT u.id, u.full_name FROM user_follows uf JOIN users u ON uf.following_id = u.id WHERE uf.follower_id = ?', [userId]);
    return rows;
  },

  // ── Friends ──
  async sendFriendRequest(requesterId: number, addresseeId: number) {
    const pool = getPool();
    await pool.execute('INSERT IGNORE INTO user_friends (requester_id, addressee_id) VALUES (?, ?)', [requesterId, addresseeId]);
  },
  async respondToFriendRequest(requesterId: number, addresseeId: number, status: string) {
    const pool = getPool();
    await pool.execute('UPDATE user_friends SET status = ?, responded_at = NOW() WHERE requester_id = ? AND addressee_id = ?', [status, requesterId, addresseeId]);
  },
  async findFriends(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT u.id, u.full_name FROM user_friends uf JOIN users u ON
       (CASE WHEN uf.requester_id = ? THEN uf.addressee_id = u.id ELSE uf.requester_id = u.id END)
       WHERE (uf.requester_id = ? OR uf.addressee_id = ?) AND uf.status = 'accepted'`,
      [userId, userId, userId]);
    return rows;
  },

  // ── Events ──
  async findEvents(filters: { page: number; limit: number }) {
    const pool = getPool();
    const offset = (filters.page - 1) * filters.limit;
    const [rows] = await pool.query<RowData>(
      `SELECT ce.*, u.full_name as creator_name FROM community_events ce JOIN users u ON ce.creator_id = u.id
       WHERE ce.status = 'active' ORDER BY ce.start_time ASC LIMIT ? OFFSET ?`, [filters.limit, offset]);
    return rows;
  },
  async findEventById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT ce.*, u.full_name as creator_name FROM community_events ce JOIN users u ON ce.creator_id = u.id WHERE ce.id = ?', [id]);
    return rows[0] || null;
  },
  async createEvent(data: any) {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO community_events (creator_id, organisation_id, branch_id, resource_id, title, description, event_type, start_time, end_time, max_participants, is_public)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.creatorId, data.organisationId || null, data.branchId || null, data.resourceId || null, data.title, data.description || null, data.eventType || 'other', data.startTime, data.endTime, data.maxParticipants || null, data.isPublic !== false]);
    return (result as any).insertId;
  },
  async rsvpEvent(eventId: number, userId: number, status: string) {
    const pool = getPool();
    await pool.execute(
      'INSERT INTO community_event_participants (event_id, user_id, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status)',
      [eventId, userId, status]);
  },
  async findEventsAdmin(filters: { page: number; limit: number; status?: string }) {
    const pool = getPool();
    let sql = `SELECT ce.*, u.full_name as creator_name
               FROM community_events ce JOIN users u ON ce.creator_id = u.id WHERE 1=1`;
    const params: any[] = [];
    if (filters.status) { sql += ' AND ce.status = ?'; params.push(filters.status); }
    sql += ' ORDER BY ce.start_time DESC LIMIT ? OFFSET ?';
    const offset = (filters.page - 1) * filters.limit;
    params.push(filters.limit, offset);
    const [rows] = await pool.query<RowData>(sql, params);
    const [countRows] = await pool.query<RowData>(
      'SELECT COUNT(*) as total FROM community_events WHERE 1=1' + (filters.status ? ' AND status = ?' : ''),
      filters.status ? [filters.status] : []
    );
    return { data: rows, total: (countRows[0] as any).total, page: filters.page, limit: filters.limit };
  },
  async updateEvent(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = []; const params: any[] = [];
    const map: Record<string, string> = { startTime: 'start_time', endTime: 'end_time', title: 'title', description: 'description', eventType: 'event_type', maxParticipants: 'max_participants', isPublic: 'is_public', status: 'status' };
    for (const [k, c] of Object.entries(map)) {
      if (data[k] !== undefined) { fields.push(`${c} = ?`); params.push(data[k]); }
    }
    if (!fields.length) return false;
    params.push(id);
    const [result] = await pool.execute(`UPDATE community_events SET ${fields.join(', ')} WHERE id = ?`, params);
    return (result as any).affectedRows > 0;
  },
  async softDeleteEvent(id: number) {
    const pool = getPool();
    await pool.execute("UPDATE community_events SET status = 'cancelled' WHERE id = ?", [id]);
  },
  async findEventParticipants(eventId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT u.id, u.full_name, cep.status FROM community_event_participants cep JOIN users u ON cep.user_id = u.id WHERE cep.event_id = ?', [eventId]);
    return rows;
  },

  // ── Chat ──
  async findUserIdByPhone(phone: string): Promise<number | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT id FROM users WHERE phone_number = ? AND deleted_at IS NULL AND account_status = \'active\' LIMIT 1',
      [phone]
    );
    return rows.length > 0 ? rows[0].id : null;
  },
  async findUserByPhoneInfo(phone: string): Promise<{ id: number; full_name: string; avatar_url: string | null } | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT id, full_name, avatar_url FROM users WHERE phone_number = ? AND deleted_at IS NULL AND account_status = \'active\' LIMIT 1',
      [phone]
    );
    return rows.length > 0 ? (rows[0] as any) : null;
  },
  async findOrCreateDirectConversation(user1Id: number, user2Id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT c.id FROM conversations c
       JOIN conversation_participants cp1 ON c.id = cp1.conversation_id AND cp1.user_id = ?
       JOIN conversation_participants cp2 ON c.id = cp2.conversation_id AND cp2.user_id = ?
       WHERE c.conversation_type = 'direct' LIMIT 1`,
      [user1Id, user2Id]);
    if (rows.length) return rows[0].id;
    const [result] = await pool.execute('INSERT INTO conversations (conversation_type) VALUES (\'direct\')');
    const convoId = (result as any).insertId;
    await pool.execute('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)', [convoId, user1Id, convoId, user2Id]);
    return convoId;
  },
  // ── Group Management ──
  async getGroupInfo(conversationId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT id, name, avatar_url, created_by FROM conversations WHERE id = ? AND conversation_type = ? LIMIT 1',
      [conversationId, 'group']
    );
    return rows.length > 0 ? rows[0] : null;
  },

  async isGroupCreator(conversationId: number, userId: number): Promise<boolean> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT 1 FROM conversations WHERE id = ? AND created_by = ? AND conversation_type = ? LIMIT 1',
      [conversationId, userId, 'group']
    );
    return rows.length > 0;
  },

  async getGroupMembers(conversationId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT u.id, u.full_name, u.avatar_url, u.email,
              cp.created_at AS joined_at, c.created_by
         FROM conversation_participants cp
         JOIN users u ON u.id = cp.user_id
         JOIN conversations c ON c.id = cp.conversation_id
        WHERE cp.conversation_id = ? AND c.conversation_type = 'group'
        ORDER BY CASE WHEN u.id = c.created_by THEN 0 ELSE 1 END, cp.created_at ASC`,
      [conversationId]
    );
    return rows;
  },

  async updateGroup(conversationId: number, data: { name?: string; avatarUrl?: string }) {
    const pool = getPool();
    const fields: string[] = [];
    const params: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.avatarUrl !== undefined) { fields.push('avatar_url = ?'); params.push(data.avatarUrl); }
    if (!fields.length) return;
    params.push(conversationId);
    await pool.execute(`UPDATE conversations SET ${fields.join(', ')} WHERE id = ? AND conversation_type = 'group'`, params);
  },

  async removeMember(conversationId: number, targetUserId: number) {
    const pool = getPool();
    await pool.execute(
      'DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, targetUserId]
    );
    await pool.execute(
      "DELETE FROM group_invitations WHERE conversation_id = ? AND invitee_id = ? AND status = 'pending'",
      [conversationId, targetUserId]
    );
  },

  async leaveGroup(conversationId: number, userId: number) {
    const pool = getPool();
    await pool.execute(
      'DELETE FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
  },

  async deleteGroup(conversationId: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
    await pool.execute('DELETE FROM group_invitations WHERE conversation_id = ?', [conversationId]);
    await pool.execute('DELETE FROM conversation_participants WHERE conversation_id = ?', [conversationId]);
    await pool.execute('DELETE FROM conversations WHERE id = ? AND conversation_type = ?', [conversationId, 'group']);
  },

  async isConversationParticipant(conversationId: number, userId: number): Promise<boolean> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1`,
      [conversationId, userId]
    );
    return rows.length > 0;
  },

  // ── Group Chat ──
  async createGroupConversation(creatorId: number, name: string, avatarUrl: string | undefined, inviteeIds: number[]): Promise<number> {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO conversations (conversation_type, name, avatar_url, created_by) VALUES (?, ?, ?, ?)',
      ['group', name, avatarUrl || null, creatorId]
    );
    const convoId = (result as any).insertId;
    await pool.execute('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)', [convoId, creatorId]);
    if (inviteeIds.length > 0) {
      const placeholders = inviteeIds.map(() => '(?, ?, ?, ?)').join(', ');
      const params: any[] = [];
      for (const inviteeId of inviteeIds) {
        params.push(convoId, creatorId, inviteeId, 'pending');
      }
      await pool.execute(
        `INSERT INTO group_invitations (conversation_id, inviter_id, invitee_id, status) VALUES ${placeholders}`,
        params
      );
    }
    return convoId;
  },

  async inviteToGroup(conversationId: number, inviterId: number, inviteeId: number) {
    const pool = getPool();
    await pool.execute(
      'INSERT INTO group_invitations (conversation_id, inviter_id, invitee_id, status) VALUES (?, ?, ?, ?)',
      [conversationId, inviterId, inviteeId, 'pending']
    );
  },

  async isAlreadyInvited(conversationId: number, inviteeId: number): Promise<boolean> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT 1 FROM group_invitations WHERE conversation_id = ? AND invitee_id = ? AND status = 'pending' LIMIT 1`,
      [conversationId, inviteeId]
    );
    return rows.length > 0;
  },

  async findGroupInvitations(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT gi.id, gi.conversation_id, gi.status, gi.created_at AS invitation_created_at,
              c.name AS conversation_name, c.avatar_url AS conversation_avatar_url,
              u.full_name AS inviter_name, u.avatar_url AS inviter_avatar_url
         FROM group_invitations gi
         JOIN conversations c ON c.id = gi.conversation_id
         JOIN users u ON u.id = gi.inviter_id
        WHERE gi.invitee_id = ? AND gi.status = 'pending'
        ORDER BY gi.created_at DESC`,
      [userId]
    );
    return rows;
  },

  async findInvitationById(invitationId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM group_invitations WHERE id = ? LIMIT 1',
      [invitationId]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  async respondToInvitation(invitationId: number, userId: number, status: string) {
    const pool = getPool();
    await pool.execute(
      'UPDATE group_invitations SET status = ?, updated_at = NOW() WHERE id = ? AND invitee_id = ?',
      [status, invitationId, userId]
    );
    if (status === 'accepted') {
      const [invRows] = await pool.execute<RowData>(
        'SELECT conversation_id FROM group_invitations WHERE id = ?', [invitationId]
      );
      if (invRows.length > 0) {
        await pool.execute(
          'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
          [invRows[0].conversation_id, userId]
        );
      }
    }
  },

  // ── Pin Conversations ──
  async pinConversation(conversationId: number, userId: number) {
    const pool = getPool();
    await pool.execute(
      'UPDATE conversation_participants SET pinned_at = NOW() WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
  },

  async unpinConversation(conversationId: number, userId: number) {
    const pool = getPool();
    await pool.execute(
      'UPDATE conversation_participants SET pinned_at = NULL WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
  },

  async getPinCount(userId: number): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM conversation_participants WHERE user_id = ? AND pinned_at IS NOT NULL`,
      [userId]
    );
    return rows[0]?.cnt ?? 0;
  },

  // ── Conversations (direct + group) ──
  async findConversations(userId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT c.id, c.conversation_type, c.name AS group_name, c.avatar_url AS group_avatar_url, c.updated_at,
              lm.content AS last_message,
              lm.created_at AS last_message_at,
              CASE WHEN c.conversation_type = 'direct' THEN ou.id ELSE NULL END AS other_user_id,
              CASE WHEN c.conversation_type = 'direct' THEN ou.full_name ELSE NULL END AS other_user_name,
              CASE WHEN c.conversation_type = 'direct' THEN ou.email ELSE NULL END AS other_user_email,
              CASE WHEN c.conversation_type = 'direct' THEN ou.avatar_url ELSE NULL END AS other_user_avatar,
              cp.pinned_at,
              CASE
                WHEN cp.last_read_at IS NULL THEN (
                  SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
                )
                ELSE (
                  SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL AND m.created_at > cp.last_read_at
                )
              END AS unread_count
         FROM conversations c
         JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
         LEFT JOIN conversation_participants ocp ON ocp.conversation_id = c.id AND ocp.user_id <> ? AND c.conversation_type = 'direct'
         LEFT JOIN users ou ON ou.id = ocp.user_id
         LEFT JOIN messages lm ON lm.id = (
           SELECT m.id FROM messages m
            WHERE m.conversation_id = c.id AND m.deleted_at IS NULL
            ORDER BY m.created_at DESC LIMIT 1
         )
        ORDER BY cp.pinned_at DESC, COALESCE(lm.created_at, c.updated_at) DESC`,
      [userId, userId]
    );
    return rows;
  },

  async markAsRead(conversationId: number, userId: number) {
    const pool = getPool();
    await pool.execute(
      'UPDATE conversation_participants SET last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
  },

  async sendMessage(conversationId: number, senderId: number, content: string) {
    const pool = getPool();
    await pool.execute(
      'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)',
      [conversationId, senderId, content]
    );
    await pool.execute('UPDATE conversations SET updated_at = NOW() WHERE id = ?', [conversationId]);
  },

  async findMessages(conversationId: number, page: number, limit: number) {
    const pool = getPool();
    const offset = (page - 1) * limit;
    const [rows] = await pool.query<RowData>(
      `SELECT m.*, u.full_name AS sender_name, u.avatar_url AS sender_avatar
         FROM messages m
         JOIN users u ON m.sender_id = u.id
        WHERE m.conversation_id = ? AND m.deleted_at IS NULL
        ORDER BY m.created_at ASC
        LIMIT ? OFFSET ?`,
      [conversationId, limit, offset]
    );
    return rows;
  },

  // ── Ads ──
  async findPlacements() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM ad_placements WHERE is_active = TRUE');
    return rows;
  },
  async findActiveCampaigns(placementId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT c.*, ac.image_url, ac.click_url, ac.alt_text FROM ad_campaigns c
       JOIN ad_creatives ac ON ac.campaign_id = c.id AND ac.is_active = TRUE
       WHERE c.placement_id = ? AND c.status = 'active' AND c.start_date <= NOW() AND c.end_date >= NOW()
       LIMIT 1`, [placementId]);
    return rows;
  },
  async createCampaign(data: any) {
    const pool = getPool();
    const [result] = await pool.execute(
      `INSERT INTO ad_campaigns (name, organisation_id, placement_id, start_date, end_date, daily_budget, total_budget, currency_code, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.organisationId || null, data.placementId, data.startDate, data.endDate, data.dailyBudget || null, data.totalBudget || null, data.currencyCode, data.status || 'draft', data.createdBy]);
    return (result as any).insertId;
  },
  async addCreative(data: any) {
    const pool = getPool();
    await pool.execute('INSERT INTO ad_creatives (campaign_id, image_url, click_url, alt_text) VALUES (?, ?, ?, ?)',
      [data.campaignId, data.imageUrl, data.clickUrl || null, data.altText || null]);
  },
  async recordImpression(data: { campaignId: number; creativeId?: number; userId?: number; placementKey: string; ipAddress?: string; userAgent?: string }) {
    const pool = getPool();
    const [result] = await pool.execute(
      'INSERT INTO ad_impressions (campaign_id, creative_id, user_id, placement_key, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      [data.campaignId, data.creativeId || null, data.userId || null, data.placementKey, data.ipAddress || null, data.userAgent || null]);
    return (result as any).insertId;
  },
  async recordClick(impressionId: number, campaignId: number, creativeId?: number, userId?: number) {
    const pool = getPool();
    await pool.execute('INSERT INTO ad_clicks (impression_id, campaign_id, creative_id, user_id) VALUES (?, ?, ?, ?)',
      [impressionId, campaignId, creativeId || null, userId || null]);
  },

  // ── Ads Admin ──
  async findAllPlacements() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM ad_placements ORDER BY name');
    return rows;
  },
  async createPlacement(data: { placementKey: string; name: string; description?: string; dimensions?: string; maxAds?: number }) {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader & RowData>(
      'INSERT INTO ad_placements (placement_key, name, description, dimensions, max_ads) VALUES (?, ?, ?, ?, ?)',
      [data.placementKey, data.name, data.description || null, data.dimensions || null, data.maxAds || 1]
    );
    return result.insertId;
  },
  async updatePlacement(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = []; const values: any[] = [];
    const map: Record<string, string> = { name: 'name', placementKey: 'placement_key', description: 'description', dimensions: 'dimensions', maxAds: 'max_ads' };
    for (const [k, c] of Object.entries(map)) {
      if (data[k] !== undefined) { fields.push(`${c} = ?`); values.push(data[k]); }
    }
    if (!fields.length) return;
    values.push(id);
    await pool.execute(`UPDATE ad_placements SET ${fields.join(', ')} WHERE id = ?`, values);
  },
  async togglePlacement(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT id, is_active FROM ad_placements WHERE id = ?', [id]);
    if (!rows.length) return null;
    const newVal = rows[0].is_active ? 0 : 1;
    await pool.execute('UPDATE ad_placements SET is_active = ? WHERE id = ?', [newVal, id]);
    return { id, isActive: !!newVal };
  },
  async deletePlacement(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM ad_placements WHERE id = ?', [id]);
  },

  async findAllCampaigns() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT c.*, ap.name as placement_name, u.full_name as creator_name
       FROM ad_campaigns c
       JOIN ad_placements ap ON ap.id = c.placement_id
       LEFT JOIN users u ON u.id = c.created_by
       ORDER BY c.created_at DESC`
    );
    return rows;
  },
  async findCampaign(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT c.*, ap.name as placement_name, ap.placement_key, u.full_name as creator_name
       FROM ad_campaigns c
       JOIN ad_placements ap ON ap.id = c.placement_id
       LEFT JOIN users u ON u.id = c.created_by
       WHERE c.id = ?`, [id]
    );
    if (!rows.length) return null;
    const [creatives] = await pool.execute<RowData>(
      'SELECT * FROM ad_creatives WHERE campaign_id = ? ORDER BY sort_order', [id]
    );
    return { ...rows[0], creatives };
  },
  async updateCampaign(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = []; const values: any[] = [];
    const map: Record<string, string> = { name: 'name', placementId: 'placement_id', startDate: 'start_date', endDate: 'end_date', dailyBudget: 'daily_budget', totalBudget: 'total_budget', currencyCode: 'currency_code', status: 'status', maxImpressions: 'max_impressions', maxClicks: 'max_clicks' };
    for (const [k, c] of Object.entries(map)) {
      if (data[k] !== undefined) { fields.push(`${c} = ?`); values.push(data[k]); }
    }
    if (!fields.length) return;
    values.push(id);
    await pool.execute(`UPDATE ad_campaigns SET ${fields.join(', ')} WHERE id = ?`, values);
  },
  async deleteCampaign(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM ad_creatives WHERE campaign_id = ?', [id]);
    await pool.execute('DELETE FROM ad_campaigns WHERE id = ?', [id]);
  },
  async updateCampaignStatus(id: number, status: string) {
    const pool = getPool();
    await pool.execute('UPDATE ad_campaigns SET status = ? WHERE id = ?', [status, id]);
  },
  async updateCreative(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = []; const values: any[] = [];
    const map: Record<string, string> = { imageUrl: 'image_url', clickUrl: 'click_url', altText: 'alt_text', sortOrder: 'sort_order', isActive: 'is_active' };
    for (const [k, c] of Object.entries(map)) {
      if (data[k] !== undefined) { fields.push(`${c} = ?`); values.push(data[k]); }
    }
    if (!fields.length) return;
    values.push(id);
    await pool.execute(`UPDATE ad_creatives SET ${fields.join(', ')} WHERE id = ?`, values);
  },
  async deleteCreative(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM ad_creatives WHERE id = ?', [id]);
  },

  // ── Admin / Audit ──
  async findAuditLogs(filters: { entityType?: string; actorId?: number; action?: string; page: number; limit: number }) {
    const pool = getPool();
    let sql = 'SELECT al.*, u.full_name as actor_name FROM audit_logs al LEFT JOIN users u ON al.actor_id = u.id WHERE 1=1';
    const params: any[] = [];
    if (filters.entityType) { sql += ' AND al.entity_type = ?'; params.push(filters.entityType); }
    if (filters.actorId) { sql += ' AND al.actor_id = ?'; params.push(filters.actorId); }
    if (filters.action) { sql += ' AND al.action LIKE ?'; params.push(`%${filters.action}%`); }
    sql += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    const offset = (filters.page - 1) * filters.limit;
    params.push(filters.limit, offset);
    const [rows] = await pool.query<RowData>(sql, params);
    const [countRows] = await pool.query<RowData>('SELECT COUNT(*) as total FROM audit_logs al WHERE 1=1', []);
    return { data: rows, total: countRows[0].total, page: filters.page, limit: filters.limit };
  },

  async revertAction(auditLogId: number, revertedBy: number, reason: string) {
    const pool = getPool();
    const [logs] = await pool.execute<RowData>('SELECT * FROM audit_logs WHERE id = ?', [auditLogId]);
    if (!logs.length) return { error: 'Audit log not found' };
    const log = logs[0];
    await pool.execute(
      'INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, before_state, after_state, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [revertedBy, `revert.${log.action}`, log.entity_type, log.entity_id, log.after_state, log.before_state, reason]);
    return { message: 'Revert logged' };
  },
};

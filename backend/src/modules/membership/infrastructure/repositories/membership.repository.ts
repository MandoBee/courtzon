import { getPool } from '../../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { MembershipPlan, Membership, LoyaltyPoints, Campaign, RewardCatalog, RewardClaim } from '../../domain/membership-aggregate.js';

type RowData = RowDataPacket[];

export class MembershipRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async findPlans(filters?: { isActive?: boolean; organisationId?: number }): Promise<MembershipPlan[]> {
    let sql = 'SELECT * FROM membership_plans WHERE 1=1';
    const params: any[] = [];
    if (filters?.isActive !== undefined) { sql += ' AND is_active = ?'; params.push(filters.isActive ? 1 : 0); }
    if (filters?.organisationId) { sql += ' AND organisation_id = ?'; params.push(filters.organisationId); }
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return (rows as any[]).map(r => ({ ...r, benefits: typeof r.benefits === 'string' ? JSON.parse(r.benefits) : r.benefits || [] }));
  }

  async findPlanById(id: number): Promise<MembershipPlan | null> {
    const [rows] = await this.pool.execute<RowData>('SELECT * FROM membership_plans WHERE id = ?', [id]);
    if (!rows.length) return null;
    const r = rows[0] as any;
    return { ...r, benefits: typeof r.benefits === 'string' ? JSON.parse(r.benefits) : r.benefits || [] };
  }

  async createPlan(data: MembershipPlan): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO membership_plans (name, plan_type, duration_days, price, credits, sessions, benefits, is_active, organisation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.planType, data.durationDays, data.price, data.credits || null, data.sessions || null,
       JSON.stringify(data.benefits), data.isActive ? 1 : 0, data.organisationId || null],
    );
    return result.insertId;
  }

  async createMembership(data: Membership): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO memberships (user_id, plan_id, status, start_date, end_date, credits_used, sessions_used, auto_renew, aggregate_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [data.userId, data.planId, data.status, data.startDate, data.endDate, data.creditsUsed || 0, data.sessionsUsed || 0, data.autoRenew ? 1 : 0],
    );
    return result.insertId;
  }

  async findMembershipsByUser(userId: number): Promise<any[]> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM memberships WHERE user_id = ? ORDER BY end_date DESC', [userId],
    );
    return rows;
  }

  async findActiveMembership(userId: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      "SELECT * FROM memberships WHERE user_id = ? AND status = 'active' AND end_date > NOW() ORDER BY end_date DESC LIMIT 1",
      [userId],
    );
    return rows[0] || null;
  }

  async getLoyaltyPoints(userId: number): Promise<any | null> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM loyalty_points WHERE user_id = ?', [userId],
    );
    return rows[0] || null;
  }

  async upsertLoyaltyPoints(points: LoyaltyPoints): Promise<void> {
    await this.pool.execute(
      `INSERT INTO loyalty_points (user_id, total_earned, total_spent, current_balance, current_tier)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE total_earned = VALUES(total_earned), total_spent = VALUES(total_spent),
       current_balance = VALUES(current_balance), current_tier = VALUES(current_tier)`,
      [points.userId, points.totalEarned, points.totalSpent, points.currentBalance, points.currentTier],
    );
  }

  async findCampaigns(active?: boolean): Promise<Campaign[]> {
    let sql = 'SELECT * FROM loyalty_campaigns WHERE 1=1';
    const params: any[] = [];
    if (active !== undefined) { sql += ' AND is_active = ?'; params.push(active ? 1 : 0); }
    sql += ' ORDER BY start_date DESC';
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows as Campaign[];
  }

  async createCampaign(data: Campaign): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO loyalty_campaigns (name, description, points_multiplier, start_date, end_date, is_active, applicable_activities)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.description || null, data.pointsMultiplier, data.startDate, data.endDate, data.isActive ? 1 : 0,
       data.applicableActivities ? JSON.stringify(data.applicableActivities) : null],
    );
    return result.insertId;
  }

  async findRewards(active?: boolean): Promise<RewardCatalog[]> {
    let sql = 'SELECT * FROM reward_catalog WHERE 1=1';
    const params: any[] = [];
    if (active !== undefined) { sql += ' AND is_active = ?'; params.push(active ? 1 : 0); }
    sql += ' ORDER BY points_cost ASC';
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows as RewardCatalog[];
  }

  async createReward(data: RewardCatalog): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO reward_catalog (name, description, points_cost, reward_type, reward_value, quantity, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.description || null, data.pointsCost, data.rewardType, data.rewardValue, data.quantity, data.isActive ? 1 : 0],
    );
    return result.insertId;
  }

  async claimReward(userId: number, rewardId: number, pointsUsed: number): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "INSERT INTO reward_claims (user_id, reward_id, points_used, claimed_at) VALUES (?, ?, ?, NOW())",
      [userId, rewardId, pointsUsed],
    );
    return result.insertId;
  }
}

export const membershipRepository = new MembershipRepository();

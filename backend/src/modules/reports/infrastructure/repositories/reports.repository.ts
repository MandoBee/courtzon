import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

function dateClause(start?: string, end?: string, field = 'created_at'): { clause: string; params: (string | number)[] } {
  if (start && end) return { clause: `AND ${field} BETWEEN ? AND ?`, params: [start, end] };
  if (start) return { clause: `AND ${field} >= ?`, params: [start] };
  if (end) return { clause: `AND ${field} <= ?`, params: [end] };
  return { clause: '', params: [] };
}

type DateParams = { dateFrom?: string; dateTo?: string };

export class ReportsRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  // ========================================================================
  // 1. FINANCIAL REPORTS
  // ========================================================================

  async revenueSummary(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'wt.created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT
         COALESCE(SUM(CASE WHEN wt.transaction_type = 'payment' THEN wt.amount ELSE 0 END), 0) as total_revenue,
         COALESCE(SUM(CASE WHEN wt.transaction_type = 'commission' THEN wt.amount ELSE 0 END), 0) as total_commission,
         COALESCE(SUM(CASE WHEN wt.transaction_type = 'deposit' THEN wt.amount ELSE 0 END), 0) as total_deposits,
         COALESCE(SUM(CASE WHEN wt.transaction_type = 'withdrawal' THEN wt.amount ELSE 0 END), 0) as total_withdrawals,
         COALESCE(SUM(CASE WHEN wt.transaction_type = 'refund' THEN wt.amount ELSE 0 END), 0) as total_refunds,
         COALESCE(SUM(CASE WHEN wt.transaction_type = 'settlement' THEN wt.amount ELSE 0 END), 0) as total_settlements,
         COUNT(*) as total_transactions
       FROM wallet_transactions wt
       WHERE wt.direction = 'credit' ${clause}`,
      [...p]
    );
    return rows[0] || {};
  }

  async revenueBySource(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'wt.created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT wt.transaction_type as source, COALESCE(SUM(wt.amount), 0) as total, COUNT(*) as count
       FROM wallet_transactions wt
       WHERE wt.direction = 'credit' AND wt.transaction_type IN ('payment','commission') ${clause}
       GROUP BY wt.transaction_type ORDER BY total DESC`,
      [...p]
    );
    return rows;
  }

  async revenueTimeline(params: DateParams & { groupBy?: 'day' | 'week' | 'month' }) {
    const group = params.groupBy === 'week' ? '%Y-W%u' : params.groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'wt.created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT DATE_FORMAT(wt.created_at, '${group}') as period,
         COALESCE(SUM(CASE WHEN wt.transaction_type IN ('payment','commission') THEN wt.amount ELSE 0 END), 0) as revenue,
         COUNT(DISTINCT CASE WHEN wt.transaction_type IN ('payment','commission') THEN wt.id END) as transactions
       FROM wallet_transactions wt
       WHERE wt.direction = 'credit' ${clause}
       GROUP BY period ORDER BY period`,
      [...p]
    );
    return rows;
  }

  async paymentMethodsBreakdown(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'paid_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT payment_method, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
       FROM payment_transactions
       WHERE payment_status IN ('paid','refunded') ${clause}
       GROUP BY payment_method ORDER BY total DESC`,
      [...p]
    );
    return rows;
  }

  async settlementSummary(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT settlement_status, COUNT(*) as count,
         COALESCE(SUM(gross_amount), 0) as gross, COALESCE(SUM(commission_amount), 0) as commission,
         COALESCE(SUM(net_amount), 0) as net
       FROM settlements WHERE 1=1 ${clause}
       GROUP BY settlement_status ORDER BY count DESC`,
      [...p]
    );
    return rows;
  }

  // ========================================================================
  // 2. BOOKING REPORTS
  // ========================================================================

  async bookingVolume(params: DateParams & { groupBy?: 'day' | 'week' | 'month' }) {
    const group = params.groupBy === 'week' ? '%Y-W%u' : params.groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT DATE_FORMAT(created_at, '${group}') as period,
         COUNT(*) as total, COALESCE(SUM(total_amount), 0) as revenue,
         SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
       FROM bookings WHERE booking_status NOT IN ('expired') ${clause}
       GROUP BY period ORDER BY period`,
      [...p]
    );
    return rows;
  }

  async bookingsByType(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT booking_type, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
       FROM bookings WHERE booking_status NOT IN ('cancelled','expired') ${clause}
       GROUP BY booking_type ORDER BY count DESC`,
      [...p]
    );
    return rows;
  }

  async bookingsBySport(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'b.created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT s.name as sport_name, COUNT(b.id) as count, COALESCE(SUM(b.total_amount), 0) as revenue
       FROM bookings b
       JOIN resources r ON r.id = b.resource_id
       JOIN sports s ON s.id = r.sport_id
       WHERE b.booking_status NOT IN ('cancelled','expired') ${clause}
       GROUP BY s.id, s.name ORDER BY count DESC`,
      [...p]
    );
    return rows;
  }

  async peakHoursAnalysis(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT HOUR(start_time) as hour, COUNT(*) as count
       FROM bookings WHERE booking_status NOT IN ('cancelled','expired') ${clause}
       GROUP BY hour ORDER BY hour`,
      [...p]
    );
    return rows;
  }

  async cancellationRate(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT
         COUNT(*) as total_bookings,
         SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
         ROUND(SUM(CASE WHEN booking_status = 'cancelled' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 2) as rate_pct
       FROM bookings WHERE booking_status NOT IN ('expired') ${clause}`,
      [...p]
    );
    return rows[0] || {};
  }

  // ========================================================================
  // 3. USER REPORTS
  // ========================================================================

  async userRegistrations(params: DateParams & { groupBy?: 'day' | 'week' | 'month' }) {
    const group = params.groupBy === 'week' ? '%Y-W%u' : params.groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT DATE_FORMAT(created_at, '${group}') as period, COUNT(*) as new_users
       FROM users WHERE deleted_at IS NULL ${clause}
       GROUP BY period ORDER BY period`,
      [...p]
    );
    return rows;
  }

  async userDemographics() {
    const [rows] = await this.pool.query<RowData>(
      `SELECT c.name as country_name, c.iso_code, COUNT(u.id) as users
       FROM users u JOIN countries c ON c.id = u.country_id
       WHERE u.deleted_at IS NULL GROUP BY c.id, c.name, c.iso_code ORDER BY users DESC`
    );
    return rows;
  }

  async userGenderDistribution() {
    const [rows] = await this.pool.query<RowData>(
      `SELECT gender, COUNT(*) as count FROM users WHERE deleted_at IS NULL GROUP BY gender`
    );
    return rows;
  }

  async activeUsers(params: DateParams & { groupBy?: 'day' | 'week' | 'month' }) {
    const group = params.groupBy === 'week' ? '%Y-W%u' : params.groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'last_activity_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT DATE_FORMAT(last_activity_at, '${group}') as period,
         COUNT(DISTINCT user_id) as active_users
       FROM user_sessions WHERE 1=1 ${clause}
       GROUP BY period ORDER BY period`,
      [...p]
    );
    return rows;
  }

  async userRolesDistribution() {
    const [rows] = await this.pool.query<RowData>(
      `SELECT r.name as role_name, COUNT(ur.user_id) as users
       FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.is_active = TRUE GROUP BY r.id, r.name ORDER BY users DESC`
    );
    return rows;
  }

  // ========================================================================
  // 4. ORGANISATION REPORTS
  // ========================================================================

  async topOrganisations(params: DateParams & { limit?: number }) {
    const limit = params.limit || 10;
    const [rows] = await this.pool.query<RowData>(
      `SELECT o.id, o.name, o.slug, ot.slug as type, COUNT(b.id) as bookings,
         COALESCE(SUM(b.total_amount), 0) as revenue
       FROM organisations o
       JOIN organisation_types ot ON ot.id = o.org_type_id
       LEFT JOIN bookings b ON b.organisation_id = o.id AND b.booking_status NOT IN ('cancelled','expired')
       WHERE o.deleted_at IS NULL
       GROUP BY o.id, o.name, o.slug, ot.slug
       ORDER BY revenue DESC LIMIT ?`,
      [limit]
    );
    return rows;
  }

  async orgTypeDistribution() {
    const [rows] = await this.pool.query<RowData>(
      `SELECT ot.slug, ot.name, COUNT(o.id) as organisations
       FROM organisation_types ot
       LEFT JOIN organisations o ON o.org_type_id = ot.id AND o.deleted_at IS NULL
       GROUP BY ot.id, ot.slug, ot.name ORDER BY organisations DESC`
    );
    return rows;
  }

  async subscriptionStatus(params: DateParams) {
    const [rows] = await this.pool.query<RowData>(
      `SELECT sp.plan_name, os.subscription_status, COUNT(*) as count
       FROM organisation_subscriptions os
       JOIN subscription_plans sp ON sp.id = os.plan_id
       GROUP BY sp.plan_name, os.subscription_status ORDER BY count DESC`
    );
    return rows;
  }

  // ========================================================================
  // 5. MARKETPLACE REPORTS
  // ========================================================================

  async marketplaceOverview(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'o.created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT COUNT(o.id) as total_orders,
         COALESCE(SUM(o.total), 0) as total_revenue,
         COALESCE(SUM(o.commission_amount), 0) as total_commission,
         COALESCE(SUM(o.discount_amount), 0) as total_discounts,
         COUNT(DISTINCT o.buyer_id) as unique_buyers,
         COUNT(DISTINCT oi.seller_id) as unique_sellers
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status NOT IN ('cancelled','refunded') ${clause}`,
      [...p]
    );
    return rows[0] || {};
  }

  async topProducts(params: DateParams & { limit?: number }) {
    const limit = params.limit || 10;
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'oi.created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT p.id, p.name, COUNT(oi.id) as sold, COALESCE(SUM(oi.total_price), 0) as revenue
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status NOT IN ('cancelled','refunded') ${clause}
       GROUP BY p.id, p.name ORDER BY revenue DESC LIMIT ?`,
      [...p, limit]
    );
    return rows;
  }

  async orderStatusDistribution(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(total), 0) as total
       FROM orders WHERE 1=1 ${clause}
       GROUP BY status ORDER BY count DESC`,
      [...p]
    );
    return rows;
  }

  // ========================================================================
  // 6. TOURNAMENT REPORTS
  // ========================================================================

  async tournamentOverview(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 't.created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT COUNT(t.id) as total_tournaments,
         SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
         COUNT(tr.id) as total_registrations,
         COALESCE(SUM(t.entry_fee), 0) as total_entry_fees,
         COALESCE(SUM(t.commission_rate * t.entry_fee / 100 * (SELECT COUNT(*) FROM tournament_registrations tr2 WHERE tr2.tournament_id = t.id)), 0) as estimated_commission
       FROM tournaments t
       LEFT JOIN tournament_registrations tr ON tr.tournament_id = t.id
       WHERE t.deleted_at IS NULL ${clause}`,
      [...p]
    );
    return rows[0] || {};
  }

  async tournamentParticipation(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 't.start_date');
    const [rows] = await this.pool.query<RowData>(
      `SELECT t.name, t.status, t.sport_id, s.name as sport_name,
         COUNT(tr.id) as participants, t.max_participants,
         ROUND(COUNT(tr.id) * 100.0 / NULLIF(t.max_participants, 0), 1) as fill_rate_pct
       FROM tournaments t
       LEFT JOIN sports s ON s.id = t.sport_id
       LEFT JOIN tournament_registrations tr ON tr.tournament_id = t.id
       WHERE t.deleted_at IS NULL ${clause.replace(/t\.start_date/g, 't.start_date')}
       GROUP BY t.id, t.name, t.status, t.sport_id, s.name, t.max_participants
       ORDER BY participants DESC`,
      [...p]
    );
    return rows;
  }

  // ========================================================================
  // 7. COACH REPORTS
  // ========================================================================

  async coachPerformance(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'cs.created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT u.full_name as coach_name, COUNT(cs.id) as sessions,
         COALESCE(SUM(cs.price), 0) as total_revenue,
         COALESCE(SUM(cs.coach_earnings), 0) as coach_earnings,
         COALESCE(SUM(cs.org_earnings), 0) as org_earnings,
         AVG(cr.rating) as avg_rating
       FROM coach_sessions cs
       JOIN coach_profiles cp ON cp.id = cs.coach_id
       JOIN users u ON u.id = cp.user_id
       LEFT JOIN coach_reviews cr ON cr.coach_id = cs.coach_id
       WHERE cs.status IN ('completed','confirmed') ${clause}
       GROUP BY cp.id, u.full_name ORDER BY sessions DESC`,
      [...p]
    );
    return rows;
  }

  // ========================================================================
  // 8. ADS REPORTS
  // ========================================================================

  async adsPerformance(params: DateParams) {
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'ac.created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT ac.name as campaign_name, ac.status,
         COUNT(DISTINCT ai.id) as impressions,
         COUNT(DISTINCT acl.id) as clicks,
         ROUND(COUNT(DISTINCT acl.id) * 100.0 / NULLIF(COUNT(DISTINCT ai.id), 0), 2) as ctr_pct,
         COALESCE(SUM(ai.cost), 0) as impression_cost,
         COALESCE(SUM(acl.cost), 0) as click_cost,
         COALESCE(SUM(ai.cost) + SUM(acl.cost), 0) as total_spend
       FROM ad_campaigns ac
       LEFT JOIN ad_impressions ai ON ai.campaign_id = ac.id
       LEFT JOIN ad_clicks acl ON acl.campaign_id = ac.id
       WHERE 1=1 ${clause}
       GROUP BY ac.id, ac.name, ac.status ORDER BY total_spend DESC`,
      [...p]
    );
    return rows;
  }

  async adsDailySpend(params: DateParams & { groupBy?: 'day' | 'month' }) {
    const group = params.groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'ai.served_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT DATE_FORMAT(ai.served_at, '${group}') as period,
         COUNT(DISTINCT ai.id) as impressions,
         COUNT(DISTINCT acl.id) as clicks,
         COALESCE(SUM(ai.cost) + SUM(acl.cost), 0) as spend
       FROM ad_impressions ai
       LEFT JOIN ad_clicks acl ON acl.impression_id = ai.id
       WHERE 1=1 ${clause}
       GROUP BY period ORDER BY period`,
      [...p]
    );
    return rows;
  }

  // ========================================================================
  // 9. AUDIT REPORTS
  // ========================================================================

  async auditActivity(params: DateParams & { action?: string; limit?: number }) {
    const limit = params.limit || 50;
    let sql = `SELECT al.action, al.entity_type, COUNT(*) as count, MAX(al.created_at) as last_at
       FROM audit_logs al WHERE 1=1`;
    const vals: any[] = [];
    if (params.action) { sql += ` AND al.action = ?`; vals.push(params.action); }
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'al.created_at');
    sql += ` ${clause} GROUP BY al.action, al.entity_type ORDER BY last_at DESC LIMIT ?`;
    vals.push(...p, limit);
    const [rows] = await this.pool.query<RowData>(sql, vals);
    return rows;
  }

  async topAuditEntities(params: DateParams & { limit?: number }) {
    const limit = params.limit || 20;
    const { clause, params: p } = dateClause(params.dateFrom, params.dateTo, 'created_at');
    const [rows] = await this.pool.query<RowData>(
      `SELECT entity_type, action, COUNT(*) as count
       FROM audit_logs WHERE 1=1 ${clause}
       GROUP BY entity_type, action ORDER BY count DESC LIMIT ?`,
      [...p, limit]
    );
    return rows;
  }
}

export const reportsRepository = new ReportsRepository();

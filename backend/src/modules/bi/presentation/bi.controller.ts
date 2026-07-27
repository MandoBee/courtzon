import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../../../database/mysql.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

function qs(req: FastifyRequest) {
  const q = req.query as Record<string, string | undefined>;
  return {
    dateFrom: q.dateFrom || undefined,
    dateTo: q.dateTo || undefined,
    kpiKey: q.kpiKey || undefined,
    organisationId: q.organisationId ? Number(q.organisationId) : undefined,
    branchId: q.branchId ? Number(q.branchId) : undefined,
    groupBy: q.groupBy || undefined,
    limit: q.limit ? Number(q.limit) : undefined,
    offset: q.offset ? Number(q.offset) : undefined,
  };
}

export async function getExecutiveDashboardHandler(_req: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();

  const [revenue30d] = await pool.query<RowData>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_transactions
     WHERE status = 'completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
  );
  const [revenue7d] = await pool.query<RowData>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_transactions
     WHERE status = 'completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
  );
  const [revenueToday] = await pool.query<RowData>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_transactions
     WHERE status = 'completed' AND DATE(created_at) = CURDATE()`,
  );

  const [bookings30d] = await pool.query<RowData>(
    `SELECT COUNT(*) AS total FROM bookings
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
  );
  const [bookings7d] = await pool.query<RowData>(
    `SELECT COUNT(*) AS total FROM bookings
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
  );
  const [bookingsToday] = await pool.query<RowData>(
    `SELECT COUNT(*) AS total FROM bookings
     WHERE DATE(created_at) = CURDATE()`,
  );

  const [activeUsers] = await pool.query<RowData>(
    `SELECT COUNT(*) AS total FROM users
     WHERE last_login_at IS NOT NULL AND last_login_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
  );

  const [activeOrgs] = await pool.query<RowData>(
    `SELECT COUNT(*) AS total FROM organisations WHERE is_active = 1`,
  );

  const [revenueTrend] = await pool.query<RowData>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COALESCE(SUM(amount), 0) AS total
     FROM payment_transactions
     WHERE status = 'completed' AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
     GROUP BY DATE_FORMAT(created_at, '%Y-%m')
     ORDER BY month ASC`,
  );

  const [bookingTrend] = await pool.query<RowData>(
    `SELECT DATE(created_at) AS date, COUNT(*) AS total
     FROM bookings
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
  );

  const [topOrgs] = await pool.query<RowData>(
    `SELECT o.id, o.name AS organisation_name, COALESCE(SUM(pt.amount), 0) AS revenue
     FROM organisations o
     LEFT JOIN payment_transactions pt ON pt.organisation_id = o.id AND pt.status = 'completed'
     GROUP BY o.id, o.name
     ORDER BY revenue DESC
     LIMIT 10`,
  );

  const [userGrowth] = await pool.query<RowData>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS total
     FROM users
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
     GROUP BY DATE_FORMAT(created_at, '%Y-%m')
     ORDER BY month ASC`,
  );

  return reply.send({
    data: {
      revenue: {
        last30d: Number(revenue30d[0]?.total ?? 0),
        last7d: Number(revenue7d[0]?.total ?? 0),
        today: Number(revenueToday[0]?.total ?? 0),
      },
      bookings: {
        last30d: Number(bookings30d[0]?.total ?? 0),
        last7d: Number(bookings7d[0]?.total ?? 0),
        today: Number(bookingsToday[0]?.total ?? 0),
      },
      activeUsers: Number(activeUsers[0]?.total ?? 0),
      activeOrganisations: Number(activeOrgs[0]?.total ?? 0),
      revenueTrend: revenueTrend.map((r: any) => ({ month: r.month, total: Number(r.total) })),
      bookingTrend: bookingTrend.map((r: any) => ({ date: r.date, total: Number(r.total) })),
      topOrgs: topOrgs.map((r: any) => ({ id: r.id, organisationName: r.organisation_name, revenue: Number(r.revenue) })),
      userGrowth: userGrowth.map((r: any) => ({ month: r.month, total: Number(r.total) })),
    },
  });
}

export async function getOrgDashboardHandler(req: FastifyRequest, reply: FastifyReply) {
  const { orgId } = req.params as { orgId: string };
  const pool = getPool();

  const [revenue30d] = await pool.query<RowData>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_transactions
     WHERE status = 'completed' AND organisation_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [orgId],
  );
  const [revenue7d] = await pool.query<RowData>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_transactions
     WHERE status = 'completed' AND organisation_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
    [orgId],
  );
  const [revenueToday] = await pool.query<RowData>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_transactions
     WHERE status = 'completed' AND organisation_id = ? AND DATE(created_at) = CURDATE()`,
    [orgId],
  );

  const [bookings30d] = await pool.query<RowData>(
    `SELECT COUNT(*) AS total FROM bookings
     WHERE organisation_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [orgId],
  );
  const [bookings7d] = await pool.query<RowData>(
    `SELECT COUNT(*) AS total FROM bookings
     WHERE organisation_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
    [orgId],
  );
  const [bookingsToday] = await pool.query<RowData>(
    `SELECT COUNT(*) AS total FROM bookings
     WHERE organisation_id = ? AND DATE(created_at) = CURDATE()`,
    [orgId],
  );

  const [revenueTrend] = await pool.query<RowData>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COALESCE(SUM(amount), 0) AS total
     FROM payment_transactions
     WHERE status = 'completed' AND organisation_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
     GROUP BY DATE_FORMAT(created_at, '%Y-%m')
     ORDER BY month ASC`,
    [orgId],
  );

  const [bookingTrend] = await pool.query<RowData>(
    `SELECT DATE(created_at) AS date, COUNT(*) AS total
     FROM bookings
     WHERE organisation_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [orgId],
  );

  const [userGrowth] = await pool.query<RowData>(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS total
     FROM users u
     JOIN organisations o ON o.owner_id = u.id
     WHERE o.id = ? AND u.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
     GROUP BY DATE_FORMAT(u.created_at, '%Y-%m')
     ORDER BY month ASC`,
    [orgId],
  );

  const [branches] = await pool.query<RowData>(
    `SELECT b.id, b.name,
       (SELECT COUNT(*) FROM bookings WHERE branch_id = b.id) AS total_bookings,
       (SELECT COALESCE(SUM(pt.amount), 0) FROM payment_transactions pt WHERE pt.branch_id = b.id AND pt.status = 'completed') AS revenue
     FROM branches b
     WHERE b.organisation_id = ?
     ORDER BY b.name`,
    [orgId],
  );

  const [coachUtilization] = await pool.query<RowData>(
    `SELECT c.id, CONCAT(u.full_name, ' ', u.last_name) AS coach_name,
       (SELECT COUNT(*) FROM coach_sessions cs WHERE cs.coach_id = c.id AND cs.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS total_sessions,
       30 AS available_days
     FROM coaches c
     JOIN users u ON u.id = c.user_id
     WHERE c.organisation_id = ?
     ORDER BY total_sessions DESC`,
    [orgId],
  );

  const [courtUtilization] = await pool.query<RowData>(
    `SELECT r.id, r.name,
       (SELECT COUNT(*) FROM bookings WHERE resource_id = r.id AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS total_bookings,
       (SELECT COUNT(*) FROM resource_time_slots rts WHERE rts.resource_id = r.id AND rts.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS available_slots
     FROM resources r
     WHERE r.organisation_id = ?
     ORDER BY r.name`,
    [orgId],
  );

  return reply.send({
    data: {
      revenue: {
        last30d: Number(revenue30d[0]?.total ?? 0),
        last7d: Number(revenue7d[0]?.total ?? 0),
        today: Number(revenueToday[0]?.total ?? 0),
      },
      bookings: {
        last30d: Number(bookings30d[0]?.total ?? 0),
        last7d: Number(bookings7d[0]?.total ?? 0),
        today: Number(bookingsToday[0]?.total ?? 0),
      },
      revenueTrend: revenueTrend.map((r: any) => ({ month: r.month, total: Number(r.total) })),
      bookingTrend: bookingTrend.map((r: any) => ({ date: r.date, total: Number(r.total) })),
      userGrowth: userGrowth.map((r: any) => ({ month: r.month, total: Number(r.total) })),
      branches: branches.map((r: any) => ({ id: r.id, name: r.name, totalBookings: Number(r.total_bookings), revenue: Number(r.revenue) })),
      coachUtilization: coachUtilization.map((r: any) => ({ id: r.id, coachName: r.coach_name, totalSessions: Number(r.total_sessions), availableDays: Number(r.available_days) })),
      courtUtilization: courtUtilization.map((r: any) => ({ id: r.id, name: r.name, totalBookings: Number(r.total_bookings), availableSlots: Number(r.available_slots) })),
    },
  });
}

export async function getKPISnapshotsHandler(req: FastifyRequest, reply: FastifyReply) {
  const f = qs(req);
  const pool = getPool();
  const conditions: string[] = [];
  const params: any[] = [];

  if (f.kpiKey) { conditions.push('kpi_key = ?'); params.push(f.kpiKey); }
  if (f.dateFrom) { conditions.push('period_start >= ?'); params.push(f.dateFrom); }
  if (f.dateTo) { conditions.push('period_end <= ?'); params.push(f.dateTo); }
  if (f.organisationId) { conditions.push('organisation_id = ?'); params.push(f.organisationId); }
  if (f.branchId) { conditions.push('branch_id = ?'); params.push(f.branchId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitClause = f.limit ? `LIMIT ${f.limit}` : '';
  const offsetClause = f.offset ? `OFFSET ${f.offset}` : '';

  const [rows] = await pool.query<RowData>(
    `SELECT * FROM kpi_snapshots ${where} ORDER BY recorded_at DESC ${limitClause} ${offsetClause}`,
    params,
  );

  const [countResult] = await pool.query<RowData>(
    `SELECT COUNT(*) AS total FROM kpi_snapshots ${where}`,
    params,
  );

  return reply.send({ data: rows, total: Number(countResult[0]?.total ?? 0) });
}

export async function exportReportHandler(req: FastifyRequest, reply: FastifyReply) {
  const { reportType } = req.params as { reportType: string };
  const f = qs(req);
  const pool = getPool();

  const reportMappings: Record<string, { sql: string; params: any[]; headers: string[] }> = {
    revenue: {
      sql: `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COALESCE(SUM(amount), 0) AS revenue
            FROM payment_transactions
            WHERE status = 'completed' ${f.dateFrom ? 'AND created_at >= ?' : ''} ${f.dateTo ? 'AND created_at <= ?' : ''}
            GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
            ORDER BY date ASC`,
      params: [f.dateFrom, f.dateTo].filter(Boolean),
      headers: ['Date', 'Revenue'],
    },
    bookings: {
      sql: `SELECT DATE(created_at) AS date, COUNT(*) AS bookings
            FROM bookings
            WHERE 1=1 ${f.dateFrom ? 'AND created_at >= ?' : ''} ${f.dateTo ? 'AND created_at <= ?' : ''}
            GROUP BY DATE(created_at)
            ORDER BY date ASC`,
      params: [f.dateFrom, f.dateTo].filter(Boolean),
      headers: ['Date', 'Bookings'],
    },
    users: {
      sql: `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS date, COUNT(*) AS registrations
            FROM users
            WHERE 1=1 ${f.dateFrom ? 'AND created_at >= ?' : ''} ${f.dateTo ? 'AND created_at <= ?' : ''}
            GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
            ORDER BY date ASC`,
      params: [f.dateFrom, f.dateTo].filter(Boolean),
      headers: ['Date', 'Registrations'],
    },
    organisations: {
      sql: `SELECT o.name, o.created_at, o.is_active, ot.slug AS org_type
            FROM organisations o
            JOIN organisation_types ot ON ot.id = o.org_type_id
            WHERE 1=1 ${f.dateFrom ? 'AND o.created_at >= ?' : ''} ${f.dateTo ? 'AND o.created_at <= ?' : ''}
            ORDER BY o.created_at DESC`,
      params: [f.dateFrom, f.dateTo].filter(Boolean),
      headers: ['Name', 'Created At', 'Active', 'Type'],
    },
  };

  const mapping = reportMappings[reportType];
  if (!mapping) {
    return reply.status(400).send({ error: 'INVALID_REPORT_TYPE', message: `Unknown report type: ${reportType}` });
  }

  const [rows] = await pool.query<RowData>(mapping.sql, mapping.params);

  const csvHeader = mapping.headers.join(',');
  const csvRows = rows.map((row: any) =>
    mapping.headers.map((h) => {
      const val = row[h.toLowerCase().replace(/\s+/g, '_')] ?? row[h.toLowerCase()] ?? '';
      const str = String(val);
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(','),
  );

  const csv = [csvHeader, ...csvRows].join('\r\n');

  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="${reportType}-report.csv"`);
  return reply.send(csv);
}

export async function getWebVitalsHandler(req: FastifyRequest, reply: FastifyReply) {
  const f = qs(req);
  const pool = getPool();
  const conditions: string[] = [];
  const params: any[] = [];

  if (f.dateFrom) { conditions.push('recorded_at >= ?'); params.push(f.dateFrom); }
  if (f.dateTo) { conditions.push('recorded_at <= ?'); params.push(f.dateTo); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitClause = f.limit ? `LIMIT ${f.limit}` : '';

  const [vitals] = await pool.query<RowData>(
    `SELECT DATE(recorded_at) AS date,
       AVG(lcp) AS avg_lcp, AVG(cls) AS avg_cls, AVG(fcp) AS avg_fcp,
       COUNT(*) AS sample_count
     FROM web_vitals_metrics ${where}
     GROUP BY DATE(recorded_at)
     ORDER BY date DESC
     ${limitClause}`,
    params,
  );

  return reply.send({
    data: vitals.map((r: any) => ({
      date: r.date,
      avgLcp: Number(r.avg_lcp),
      avgCls: Number(r.avg_cls),
      avgFcp: Number(r.avg_fcp),
      sampleCount: Number(r.sample_count),
    })),
  });
}

export async function getClientErrorsHandler(req: FastifyRequest, reply: FastifyReply) {
  const f = qs(req);
  const pool = getPool();
  const conditions: string[] = [];
  const params: any[] = [];

  if (f.dateFrom) { conditions.push('recorded_at >= ?'); params.push(f.dateFrom); }
  if (f.dateTo) { conditions.push('recorded_at <= ?'); params.push(f.dateTo); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitClause = f.limit ? `LIMIT ${f.limit}` : '';

  const [errors] = await pool.query<RowData>(
    `SELECT error_message, error_stack, error_type, COUNT(*) AS frequency,
       MIN(recorded_at) AS first_seen, MAX(recorded_at) AS last_seen
     FROM client_error_reports ${where}
     GROUP BY error_message, error_stack, error_type
     ORDER BY frequency DESC
     ${limitClause}`,
    params,
  );

  return reply.send({
    data: errors.map((r: any) => ({
      errorMessage: r.error_message,
      errorStack: r.error_stack,
      errorType: r.error_type,
      frequency: Number(r.frequency),
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
    })),
  });
}

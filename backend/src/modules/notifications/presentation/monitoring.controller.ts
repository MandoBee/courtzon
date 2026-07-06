import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../../../database/mysql.js';

export async function reportClientError(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const userId = (request as any).userId || null;

  const pool = getPool();
  await pool.execute(
    `INSERT INTO client_error_reports
     (user_id, error_type, error_message, stack_trace, component_stack, page_url, user_agent, viewport_size, platform, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      body.errorType || 'unknown',
      body.errorMessage || '',
      body.stackTrace || null,
      body.componentStack || null,
      body.pageUrl || null,
      request.headers['user-agent'] || null,
      body.viewportSize || null,
      body.platform || null,
      body.metadata ? JSON.stringify(body.metadata) : null,
    ],
  );

  return reply.send({ received: true });
}

export async function reportWebVitals(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const userId = (request as any).userId || null;
  const metrics = body.metrics || [];

  const pool = getPool();
  for (const m of metrics) {
    if (!m.name || m.value == null) continue;
    await pool.execute(
      `INSERT INTO web_vitals_metrics (metric_name, metric_value, metric_rating, page_url, user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [m.name, m.value, m.rating || null, body.pageUrl || null, userId],
    );
  }

  return reply.send({ received: true, count: metrics.length });
}

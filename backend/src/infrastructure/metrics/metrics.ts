import client from 'prom-client';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Prometheus metrics registry. Exposes default Node/process metrics plus
 * per-request HTTP metrics. Scraped by Prometheus at GET /metrics (see
 * monitoring/prometheus.yml job 'courtzon-backend').
 */
export const registry = new client.Registry();

registry.setDefaultLabels({ app: 'courtzon-backend' });
client.collectDefaultMetrics({ register: registry, prefix: 'courtzon_' });

export const httpRequestDuration = new client.Histogram({
  name: 'courtzon_http_request_duration_seconds',
  help: 'HTTP request duration in seconds, labelled by method/route/status.',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: 'courtzon_http_requests_total',
  help: 'Total number of HTTP requests, labelled by method/route/status.',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

export const aggregateVersionConflictsTotal = new client.Counter({
  name: 'courtzon_aggregate_version_conflicts_total',
  help: 'Total number of aggregate version conflicts',
  labelNames: ['aggregate_type'] as const,
  registers: [registry],
});

const METRICS_PATH = '/metrics';

/**
 * Wires per-request instrumentation and the scrape endpoint into the app.
 * The /metrics route is optionally protected: if METRICS_TOKEN is set, callers
 * must present it via `Authorization: Bearer <token>` or `?token=`. When unset
 * (typical for internal-network scraping over the Docker network) it is open.
 */
export function registerMetrics(app: FastifyInstance): void {
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    // Use the matched route template (not the raw URL) to avoid high-cardinality
    // labels from path params. Skip the scrape endpoint itself.
    const route = (request as any).routeOptions?.url ?? 'unknown';
    if (route === METRICS_PATH) return;
    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    };
    const seconds = (reply.elapsedTime ?? 0) / 1000;
    httpRequestDuration.observe(labels, seconds);
    httpRequestsTotal.inc(labels);
  });

  app.get(METRICS_PATH, async (request: FastifyRequest, reply: FastifyReply) => {
    const token = process.env.METRICS_TOKEN;
    if (token) {
      const header = request.headers['authorization'];
      const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
      const queryToken = (request.query as any)?.token;
      if (bearer !== token && queryToken !== token) {
        return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Invalid metrics token' });
      }
    }
    reply.header('Content-Type', registry.contentType);
    return reply.send(await registry.metrics());
  });
}

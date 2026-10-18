import client from 'prom-client';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createModuleLogger } from '../../shared/utils/logger.js';

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

const log = createModuleLogger('metrics');
let warnedMissingTokenInProd = false;

/** True in production — mirrors the `isProd` convention in `config/env.ts`. */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Wires per-request instrumentation and the scrape endpoint into the app.
 *
 * CZ-F26 — fail-closed protection for `GET /metrics`:
 *  - Production WITHOUT a configured token (`METRICS_TOKEN` missing/empty):
 *    the endpoint is treated as absent → 404 (never served unauthenticated).
 *  - A configured token: authentication is required through the
 *    `Authorization: Bearer <token>` header ONLY (query-string `?token=` is not
 *    supported — it leaks via proxies, access logs and browser history). Missing
 *    or invalid credentials → 401.
 *  - Development/test without a token: historical open behavior is preserved.
 * The token value is never logged.
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
    // `|| undefined` treats an empty string as "not configured".
    const token = process.env.METRICS_TOKEN || undefined;

    if (!token) {
      if (isProduction()) {
        // Fail closed: never expose metrics unauthenticated in production.
        if (!warnedMissingTokenInProd) {
          warnedMissingTokenInProd = true;
          log.warn('METRICS_TOKEN is not set in production — GET /metrics is disabled (404)');
        }
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Not Found' });
      }
      // Development/test: preserve the historical open scrape endpoint.
      reply.header('Content-Type', registry.contentType);
      return reply.send(await registry.metrics());
    }

    // A token is configured — require it via the Authorization: Bearer header.
    const header = request.headers['authorization'];
    const bearer = typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : undefined;
    if (bearer !== token) {
      return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Invalid metrics token' });
    }

    reply.header('Content-Type', registry.contentType);
    return reply.send(await registry.metrics());
  });
}

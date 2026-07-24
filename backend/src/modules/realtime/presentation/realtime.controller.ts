import type { FastifyRequest, FastifyReply } from 'fastify';
import { registry } from '../../../infrastructure/metrics/metrics.js';

export async function getSocketStatsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const metrics = await registry.getMetricsAsJSON();
  const socketMetrics: Record<string, any> = {};
  for (const m of metrics) {
    if (m.name?.startsWith('courtzon_socket_')) {
      socketMetrics[m.name] = m.values;
    }
  }
  return reply.send({ data: socketMetrics });
}

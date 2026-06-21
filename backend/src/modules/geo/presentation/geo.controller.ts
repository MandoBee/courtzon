import type { FastifyRequest, FastifyReply } from 'fastify';
import { detectCurrency } from '../application/geo.service.js';
import { getClientIp } from '../../../shared/utils/client-ip.js';

export async function getDetectedCurrencyHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { countryCode?: string };
  const countryCode = typeof query.countryCode === 'string' ? query.countryCode : undefined;

  const data = await detectCurrency({
    countryCode,
    clientIp: countryCode ? null : getClientIp(request),
  });

  return reply.send({ data });
}

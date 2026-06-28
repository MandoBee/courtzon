import type { FastifyRequest, FastifyReply } from 'fastify';
import { detectCurrency } from '../application/geo.service.js';
import { getClientIp, getAllIpSources } from '../../../shared/utils/client-ip.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('geo');

export async function getDetectedCurrencyHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { countryCode?: string };
  const countryCode = typeof query.countryCode === 'string' ? query.countryCode : undefined;

  const ipSources = getAllIpSources(request);
  const clientIp = getClientIp(request);

  const cfCountry = typeof request.headers['cf-ipcountry'] === 'string'
    ? request.headers['cf-ipcountry'].toUpperCase()
    : undefined;

  request.log.info({
    ipSources,
    cfCountry,
  }, 'Geo detection request');

  log.info({
    ipSources,
    cfCountry,
    explicitCountryCode: countryCode,
  }, 'Processing geo detection');

  const data = await detectCurrency({
    countryCode,
    clientIp,
    cfCountry,
  });

  request.log.info({
    countryCode: data.countryCode,
    currencyCode: data.currencyCode,
    source: data.source,
  }, 'Geo detection result');

  log.info({
    countryCode: data.countryCode,
    currencyCode: data.currencyCode,
    source: data.source,
  }, 'Geo detection complete');

  return reply.send({ data });
}

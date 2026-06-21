import type { FastifyInstance } from 'fastify';
import * as ctrl from './geo.controller.js';

export async function geoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/public/geo/currency', ctrl.getDetectedCurrencyHandler);
}

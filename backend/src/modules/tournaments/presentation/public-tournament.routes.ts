import type { FastifyInstance } from 'fastify';
import { listPublicTournamentsHandler, getPublicTournamentHandler } from './tournament.controller.js';

/**
 * G11.16 — Public / anonymous tournament discovery (NON-FINANCIAL).
 *
 * Routes live under `/public/` so the GLOBAL auth middleware's PUBLIC_PREFIXES
 * whitelist makes them reachable WITHOUT a token (it short-circuits before any
 * user resolution). No `requirePermission`, no RBAC — the surface is read-only,
 * is_public=1 only, and private tournaments behave as 404.
 */
export async function publicTournamentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/public/tournaments', listPublicTournamentsHandler);
  app.get('/public/tournaments/:id', getPublicTournamentHandler);
}
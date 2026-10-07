import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

// The public routes/controller graph transitively imports config/env (validated
// at import time) — seed the same test env the integration specs use. Nothing
// connects: pool/redis/queue clients are all created lazily.
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'courtzon2026';
  process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
});

import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';

/**
 * F-02 — tournament not-found error code.
 *
 * A nonexistent public tournament must 404 with the TOURNAMENT-specific code
 * `TOURNAMENT_NOT_FOUND` (the established registry key). It previously leaked
 * `ACADEMY_PROGRAM_NOT_FOUND` because four tournament lookup sites passed the
 * academy error code into `NotFoundError('Tournament', …)`.
 *
 * Proves:
 *   1. nonexistent public tournament → 404 + TOURNAMENT_NOT_FOUND;
 *   2. private / draft / cancelled public tournaments → same 404 (indistinguishable);
 *   3. the academy code is NEVER returned for a tournament lookup;
 *   4. authenticated/admin/org lookups (`getById`, `getByIdDetailed`) use the same code;
 *   5. a valid public tournament still resolves (200-equivalent);
 *   6. the HTTP response shape (app.ts AppError branch) is unchanged — no stack,
 *      no internal id, no redirect.
 */

const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  findByIdDetailed: vi.fn(),
  findMatchesDetailed: vi.fn(),
  getStandings: vi.fn(),
  // Step 4D — public GSK read-model projections.
  findGroups: vi.fn(),
  findStages: vi.fn(),
  findPrizesByTournament: vi.fn(),
  findSponsorsByTournament: vi.fn(),
  listPublic: vi.fn(),
}));

const pdRepo = vi.hoisted(() => ({
  getNextWaitingOrderByTournament: vi.fn(),
  createParticipant: vi.fn(),
  findParticipantByRegistration: vi.fn(),
}));

const mrRepo = vi.hoisted(() => ({
  findFormatById: vi.fn(),
  findRuleSetById: vi.fn(),
  resolveDefaultFormatForSport: vi.fn(),
  findActiveRuleSetForFormat: vi.fn(),
  listRuleSetsBySport: vi.fn(),
}));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const pool = vi.hoisted(() => ({
  execute: vi.fn(async () => [[]]),
  query: vi.fn(async () => [[]]),
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(),
}));
pool.getConnection = vi.fn(async () => pool);
const commission = vi.hoisted(() => ({ getCommissionRate: vi.fn() }));
const matchServiceMock = vi.hoisted(() => ({ createForTournament: vi.fn() }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdRepo }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({
  getCommissionRate: commission.getCommissionRate,
  getCurrentSubscription: vi.fn(async () => ({ exists: false, planName: null })),
}));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchServiceMock }));

const MISSING = 999999999;

function publicRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 77,
    public_id: 'pub-77',
    name: 'Open Cup',
    code: 'OC-1',
    format: 'knockout',
    status: 'registration_open',
    is_public: 1,
    deleted_at: null,
    ...overrides,
  } as any;
}

/** Mirrors the AppError branch of the global handler in `backend/src/app.ts`. */
function appErrorBody(error: any, requestId = 'req-1') {
  return {
    error: error.errorCode,
    message: error.message,
    code: error.code || undefined,
    meta: { requestId, timestamp: expect.any(String) },
    details: error.details,
  };
}

describe('F-02 — tournament not-found error code', () => {
  const svc = new TournamentService();

  beforeEach(() => {
    vi.clearAllMocks();
    repo.findMatchesDetailed.mockResolvedValue([]);
    repo.getStandings.mockResolvedValue([]);
    repo.findGroups.mockResolvedValue([]);
    repo.findStages.mockResolvedValue([]);
    repo.findPrizesByTournament.mockResolvedValue([]);
    repo.findSponsorsByTournament.mockResolvedValue([]);
  });

  it('1. a nonexistent public tournament rejects with 404 TOURNAMENT_NOT_FOUND', async () => {
    repo.findById.mockResolvedValue(null);
    const err: any = await svc.getPublicTournament(MISSING).catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe(ErrorCodes.TOURNAMENT_NOT_FOUND);
    expect(err.errorCode).toBe('NOT_FOUND');
    expect(err.message).toBe('Tournament not found');
    // Never the academy code, never an internal id in the message.
    expect(err.code).not.toBe(ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    expect(err.message).not.toContain(String(MISSING));
    expect(err.message).not.toContain('ACADEMY');
  });

  it('2a. a PRIVATE tournament is indistinguishable from a nonexistent one (404 TOURNAMENT_NOT_FOUND)', async () => {
    repo.findById.mockResolvedValue(publicRow({ is_public: 0 }));
    await expect(svc.getPublicTournament(77)).rejects.toMatchObject({
      statusCode: 404,
      code: ErrorCodes.TOURNAMENT_NOT_FOUND,
      errorCode: 'NOT_FOUND',
    });
  });

  it('2b. a public DRAFT / CANCELLED / ARCHIVED tournament → 404 TOURNAMENT_NOT_FOUND', async () => {
    for (const status of ['draft', 'cancelled', 'archived']) {
      repo.findById.mockResolvedValue(publicRow({ status }));
      const err: any = await svc.getPublicTournament(77).catch((e) => e);
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe(ErrorCodes.TOURNAMENT_NOT_FOUND);
      expect(err.code).not.toBe(ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
    }
  });

  it('3. a soft-deleted public tournament → 404 TOURNAMENT_NOT_FOUND', async () => {
    repo.findById.mockResolvedValue(publicRow({ deleted_at: new Date() }));
    await expect(svc.getPublicTournament(77)).rejects.toMatchObject({
      statusCode: 404,
      code: ErrorCodes.TOURNAMENT_NOT_FOUND,
    });
  });

  it('4. authenticated/admin lookup getById(nonexistent) → 404 TOURNAMENT_NOT_FOUND', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(svc.getById(MISSING)).rejects.toMatchObject({
      statusCode: 404,
      code: ErrorCodes.TOURNAMENT_NOT_FOUND,
      errorCode: 'NOT_FOUND',
    });
    const err: any = await svc.getById(MISSING).catch((e) => e);
    expect(err.code).not.toBe(ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
  });

  it('5. admin/org management lookup getByIdDetailed(nonexistent) → 404 TOURNAMENT_NOT_FOUND', async () => {
    repo.findByIdDetailed.mockResolvedValue(null);
    await expect(svc.getByIdDetailed(MISSING)).rejects.toMatchObject({
      statusCode: 404,
      code: ErrorCodes.TOURNAMENT_NOT_FOUND,
      errorCode: 'NOT_FOUND',
    });
    const err: any = await svc.getByIdDetailed(MISSING).catch((e) => e);
    expect(err.code).not.toBe(ErrorCodes.ACADEMY_PROGRAM_NOT_FOUND);
  });

  it('6. a valid public tournament still resolves successfully (200-equivalent)', async () => {
    repo.findById.mockResolvedValue(publicRow());
    repo.findByIdDetailed.mockResolvedValue(publicRow({ organisation_name: 'Org A' }));
    const d = await svc.getPublicTournament(77);
    expect(d.name).toBe('Open Cup');
    expect(Number(d.is_public)).toBe(1);
    expect(d.organisation).toBe('Org A');
  });

  it('7. the serialized error body keeps the existing app.ts shape (no stack, no id)', async () => {
    repo.findById.mockResolvedValue(null);
    const err: any = await svc.getPublicTournament(MISSING).catch((e) => e);
    const body = appErrorBody(err);
    expect(body).toEqual({
      error: 'NOT_FOUND',
      message: 'Tournament not found',
      code: ErrorCodes.TOURNAMENT_NOT_FOUND,
      meta: { requestId: 'req-1', timestamp: expect.any(String) },
      details: undefined,
    });
    expect(Object.keys(body).sort()).toEqual(['code', 'details', 'error', 'message', 'meta']);
    expect(JSON.stringify(body)).not.toContain('stack');
    expect(JSON.stringify(body)).not.toContain(String(MISSING));
  });
});

describe('F-02 — HTTP surface GET /public/tournaments/:id', () => {
  let app: any;

  beforeAll(async () => {
    const { publicTournamentRoutes } = await import('../presentation/public-tournament.routes.js');
    const fastifyMod = await import('fastify');
    const fastifyFactory = (fastifyMod as any).default ?? fastifyMod.fastify;
    app = fastifyFactory();
    // Mirrors the AppError branch of the global handler in `backend/src/app.ts`.
    app.setErrorHandler((error: any, _request: any, reply: any) => {
      if (error instanceof NotFoundError) {
        return reply.status(error.statusCode).send({
          error: error.errorCode,
          message: error.message,
          code: error.code || undefined,
          meta: { requestId: _request?.id, timestamp: new Date().toISOString() },
          details: error.details,
        });
      }
      return reply.status(error.statusCode ?? 500).send({ error: 'INTERNAL', message: 'boom' });
    });
    await app.register(publicTournamentRoutes);
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    repo.findMatchesDetailed.mockResolvedValue([]);
    repo.getStandings.mockResolvedValue([]);
    repo.findGroups.mockResolvedValue([]);
    repo.findStages.mockResolvedValue([]);
  });

  it('GET /public/tournaments/999999999 → 404 with TOURNAMENT_NOT_FOUND, no redirect, no leak', async () => {
    repo.findById.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/public/tournaments/999999999' });
    expect(res.statusCode).toBe(404);
    expect(res.headers.location).toBeUndefined();
    const body = res.json();
    expect(body.error).toBe('NOT_FOUND');
    expect(body.code).toBe(ErrorCodes.TOURNAMENT_NOT_FOUND);
    expect(body.code).not.toBe('ACADEMY_PROGRAM_NOT_FOUND');
    expect(body.message).toBe('Tournament not found');
    expect(res.body).not.toContain('999999999');
    expect(res.body).not.toContain('at ');
    expect(res.body).not.toContain('stack');
  });

  it('GET /public/tournaments/:id for a valid public tournament → 200 { data }', async () => {
    repo.findById.mockResolvedValue(publicRow());
    repo.findByIdDetailed.mockResolvedValue(publicRow({ organisation_name: 'Org A' }));
    const res = await app.inject({ method: 'GET', url: '/public/tournaments/77' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.name).toBe('Open Cup');
  });
});

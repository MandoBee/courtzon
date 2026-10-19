import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * CZ-F25 — the accounting `process-events` endpoint is a stub. It must return an
 * honest HTTP 501 instead of a fabricated HTTP 200 success (`eventsProcessed: 0`)
 * that falsely implied the work was performed.
 *
 * Fully mocked: no database, no Redis, no application bootstrap.
 */

const mocks = vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'test';
  process.env.DB_NAME = 'test';

  const conn = {
    execute: vi.fn(async () => [{}, []]),
    beginTransaction: vi.fn(async () => undefined),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined),
    release: vi.fn(),
  };
  const pool = { execute: vi.fn(async () => [[], []]), query: vi.fn(async () => [[], []]), getConnection: vi.fn(async () => conn) };
  const audit = { recordAudit: vi.fn() };
  const bus = { eventBusV2: { emit: vi.fn(), on: vi.fn(), subscribe: vi.fn(), getInMemoryHandlers: vi.fn(() => []) } };
  return { conn, pool, audit, bus };
});

vi.mock('../../audit-log/index.js', () => mocks.audit);
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => mocks.bus);
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => mocks.pool,
  createPool: vi.fn(),
  acquireConnection: vi.fn(),
}));

import * as ctrl from '../presentation/accounting.controller.js';

function makeReply() {
  const reply: any = { statusCode: 200, payload: undefined };
  reply.status = vi.fn((c: number) => { reply.statusCode = c; return reply; });
  reply.send = vi.fn((p: unknown) => { reply.payload = p; return reply; });
  return reply;
}

function makeRequest() {
  return { ip: '127.0.0.1', headers: {}, userId: 1 } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pool.execute.mockResolvedValue([[], []]);
  mocks.pool.getConnection.mockResolvedValue(mocks.conn);
});

describe('processPendingEventsHandler (CZ-F25) — no false success', () => {
  it('returns 501 NOT_IMPLEMENTED (not a 200 success)', async () => {
    const reply = makeReply();

    await ctrl.processPendingEventsHandler(makeRequest(), reply);

    expect(reply.status).toHaveBeenCalledWith(501);
    expect(reply.payload).toMatchObject({ error: 'NOT_IMPLEMENTED' });
    expect(typeof (reply.payload as any).message).toBe('string');
    expect((reply.payload as any).message).toMatch(/not implemented/i);
    expect(reply.send).toHaveBeenCalledTimes(1);
  });

  it('never reports a fabricated eventsProcessed count or a success envelope', async () => {
    const reply = makeReply();

    await ctrl.processPendingEventsHandler(makeRequest(), reply);

    expect(reply.payload).not.toHaveProperty('eventsProcessed');
    expect(JSON.stringify(reply.payload)).not.toContain('eventsProcessed');
    expect((reply.payload as any).data).toBeUndefined();
  });

  it('audits the not-implemented action and performs no DB work', async () => {
    const reply = makeReply();

    await ctrl.processPendingEventsHandler(makeRequest(), reply);

    expect(mocks.audit.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ACCOUNTING.PROCESS_EVENTS.NOT_IMPLEMENTED',
        entityType: 'event_to_journal',
        entityId: 0,
      }),
    );
    const auditArg = mocks.audit.recordAudit.mock.calls[0][0] as any;
    expect(auditArg.afterState).not.toHaveProperty('eventsProcessed');
    expect(mocks.pool.execute).not.toHaveBeenCalled();
    expect(mocks.pool.getConnection).not.toHaveBeenCalled();
  });
});

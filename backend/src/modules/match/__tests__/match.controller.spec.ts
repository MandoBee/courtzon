import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const executedSql: string[] = [];
const executedArgs: any[][] = [];

const pool = vi.hoisted(() => ({
  execute: vi.fn(async (sql: string, args: any[]) => {
    executedSql.push(String(sql));
    executedArgs.push(args ?? []);
    return [[]];
  }),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));

import { getMatchesHandler, getMyMatchesHandler, getMatchHandler } from '../presentation/match.controller.js';

function makeRequest(userId: number, query: Record<string, unknown> = {}, params: Record<string, unknown> = {}) {
  return { userId, query, params } as any;
}

function makeReply() {
  const send = vi.fn();
  return { send, status: vi.fn(() => ({ send })) } as any;
}

/** Replace the default no-rows mock with a row-shape-aware one. */
function mockRows(resolve: unknown[] | null, main: unknown[]) {
  pool.execute.mockImplementation(async (sql: string, args: any[]) => {
    const s = String(sql);
    executedSql.push(s);
    executedArgs.push(args ?? []);
    if (resolve !== null && s.includes('UNION SELECT id FROM matches')) return [resolve];
    if (s.includes('FROM matches m')) return [main];
    return [[]];
  });
}

describe('match list controllers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executedSql.length = 0;
    executedArgs.length = 0;
  });

  describe('getMatchesHandler (discover list)', () => {
    it('only returns open/full public matches that are still in the future', async () => {
      await getMatchesHandler(makeRequest(42, { visibility: 'public' }), makeReply());
      expect(executedSql).toHaveLength(1);
      const sql = executedSql[0];
      expect(sql).toContain("m.status IN ('open', 'full')");
      expect(sql).toContain("pmd.visibility = 'public'");
      expect(sql).toContain('bk.start_at_utc >= UTC_TIMESTAMP()');
    });

    it('exposes the authoritative result fields so the UI can render result states', async () => {
      await getMatchesHandler(makeRequest(42), makeReply());
      const sql = executedSql[0];
      expect(sql).toContain('as played_at,');
      expect(sql).toContain('as result_entry_open,');
      expect(sql).toContain('as result_status,');
      expect(sql).toContain("ORDER BY ms.id DESC LIMIT 1");
      expect(sql).toContain('bk.end_at_utc <= UTC_TIMESTAMP()');
    });

    it('decorates every row with a computed result_state', async () => {
      const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
      const rows = [{ id: 1, status: 'full', result_entry_open: 1, result_status: null, played_at: recent }];
      mockRows(null, rows);
      const reply = makeReply();
      await getMatchesHandler(makeRequest(42), reply);
      expect(reply.send).toHaveBeenCalledWith({ data: rows });
      expect((rows[0] as any).result_state).toBe('enter');
      expect((rows[0] as any).result_status).toBeUndefined();
    });
  });

  describe('getMyMatchesHandler (player-scoped list)', () => {
    it('returns matches where the user has any relationship regardless of status/time', async () => {
      await getMyMatchesHandler(makeRequest(55), makeReply());
      expect(executedSql).toHaveLength(1);
      const sql = executedSql[0];

      // broad accession: participant, invitation, or join request
      expect(sql).toContain('match_participants mp');
      expect(sql).toContain('WHERE mp.match_id = m.id AND mp.user_id = ?');
      expect(sql).toContain("join_requests jr2 WHERE jr2.match_id = m.id AND jr2.user_id = ?");
      expect(sql).toContain('i.match_id = m.id AND i.user_id = ?');
      expect(sql).toContain('OR EXISTS');

      // never excludes started/ended/cancelled matches — the Joined entry point
      // must survive the match start and History must see terminal records
      expect(sql).not.toContain("m.status IN ('open', 'full')");
      expect(sql).not.toContain('start_at_utc >= UTC_TIMESTAMP()');
      expect(sql).not.toContain("start_time') >= NOW()");

      // newest first
      expect(sql).toContain('ORDER BY COALESCE');

      // participant/join-request/invitation markers mirror the discover row shape
      expect(sql).toContain('bi.id as invitation_id, bi.status as invitation_status');
      expect(sql).toContain('jr.id as join_request_id, jr.status as join_request_status');
      expect(sql).toContain('is_participant');

      // server-authoritative result fields must be present for the Joined /
      // History result actions
      expect(sql).toContain('as played_at,');
      expect(sql).toContain('as result_entry_open,');
      expect(sql).toContain('as result_status,');
    });

    it('binds the acting user id to every slot (no scope drift)', async () => {
      await getMyMatchesHandler(makeRequest(55), makeReply());
      const args = executedArgs[0];
      expect(args).toHaveLength(6);
      expect(args.every((a) => a === 55)).toBe(true);
    });

    it("never exposes other players' identity data", async () => {
      await getMyMatchesHandler(makeRequest(7), makeReply());
      const sql = executedSql[0];

      // The list row must not include personal info of other participants —
      // only the acting user's scoped markers and a match-wide roster count.
      expect(sql).not.toContain('u.full_name');
      expect(sql).not.toContain('u.phone');
      expect(sql).not.toContain('u.avatar_url');
      expect(sql).toContain('participant_count');
    });
  });

  describe('getMatchHandler (detail)', () => {
    it('answers 404 with a stable error contract when the match lookup is empty', async () => {
      mockRows([{ id: 99 }], []);
      const reply = makeReply();
      await getMatchHandler(makeRequest(9, {}, { id: '999' }), reply);
      expect(reply.status).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith({ error: 'MATCH_NOT_FOUND', message: 'Match not found' });
    });

    it('uses the booking-end fallback inside played_at (no session row → scheduled end)', async () => {
      mockRows([{ id: 99 }], []);
      await getMatchHandler(makeRequest(9, {}, { id: '999' }), replyUnused());
      const sql = executedSql.find((s) => s.includes('FROM matches m'))!;
      expect(sql).toContain('COALESCE(ms.ended_at, ms.started_at)');
      expect(sql).toContain('ORDER BY ms.id DESC LIMIT 1');
      expect(sql).toContain('b.end_at_utc <= UTC_TIMESTAMP()');
      expect(sql).toContain('as result_status,');
      expect(sql).toContain('as result_entry_open');
      expect(sql).toContain('as played_at,');
    });

    it('uses the canonical users phone column in the participants payload (schema-drift guard)', async () => {
      mockRows([{ id: 99 }], []);
      await getMatchHandler(makeRequest(9, {}, { id: '999' }), replyUnused());
      const detail = executedSql.find((s) => s.includes('FROM matches m'))!;
      expect(detail).toContain('u.phone_number');
      expect(detail).not.toMatch(/u\.phone(?!_)/);
    });

    it('decorates the detail row with a computed result_state', async () => {
      const row = { id: 99, status: 'completed', result_entry_open: 1, result_status: 'pending_confirmation', played_at: '2026-01-02 10:00:00' };
      mockRows([{ id: 99 }], [row]);
      const reply = makeReply();
      await getMatchHandler(makeRequest(9, {}, { id: '999' }), reply);
      expect(reply.send).toHaveBeenCalledWith({ data: row });
      expect(row.result_state).toBe('pending');
      expect(row.result_status).toBeUndefined();
    });
  });
});

function replyUnused() {
  const send = vi.fn();
  return { send, status: vi.fn(() => ({ send })) } as any;
}
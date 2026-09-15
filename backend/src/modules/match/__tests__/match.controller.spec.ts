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

import { getMatchesHandler, getMyMatchesHandler } from '../presentation/match.controller.js';

function makeRequest(userId: number, query: Record<string, unknown> = {}) {
  return { userId, query, params: {} } as any;
}

function makeReply() {
  const send = vi.fn();
  return { send, status: vi.fn(() => ({ send })) } as any;
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
});
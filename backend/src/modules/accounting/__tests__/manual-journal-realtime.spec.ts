import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression coverage for the MANUAL journal realtime signal.
 *
 * Every journal entry — automatic (via postAccountingEvent, covered in
 * financial/__tests__/accounting-entry-event.spec.ts) or manual — must flow
 * through the same canonical General Ledger and announce `accounting:entry-recorded`
 * ONLY after the entry has durably committed, so every accounting view (Super
 * Admin + organisation, scoped) refreshes immediately and never shows stale GL
 * data. This spec verifies the manual path (createJournalEntryHandler, which is
 * also the delegate of the org manual journal POST) emits the identical signal
 * with the correct organisation scope.
 *
 * Room routing is covered in realtime/__tests__/socket-event-mapper.spec.ts;
 * frontend invalidation keys in frontend/src/realtime/useRealtimeCacheUpdates.test.ts.
 */

const callOrder: string[] = [];
const emitted: Array<{ name: string; payload: any }> = [];
let failCommit = false;

vi.mock('../../../database/mysql.js', () => {
  const pool = {
    execute: async (sql: string) => {
      if (sql.includes('accounting_periods')) return [[{ id: 7, status: 'open' }], []];
      if (sql.includes('MAX(source_id)')) return [[{ n: 99 }], []];
      if (sql.includes('FROM organisations')) return [[{ ok: 1 }], []]; // owner check passes
      return [[], []];
    },
    getConnection: async () => ({
      beginTransaction: async () => { callOrder.push('begin'); },
      execute: async (sql: string) => {
        if (sql.includes('MAX(source_id)')) return [[{ n: 99 }], []];
        if (sql.includes('INSERT INTO ledger_entries')) return [{ insertId: 101 }, []];
        if (sql.includes('INSERT INTO general_ledger')) return [{}, []];
        return [[], []];
      },
      commit: async () => {
        if (failCommit) throw new Error('commit failed');
        callOrder.push('commit');
      },
      rollback: async () => { callOrder.push('rollback'); },
      release: () => { callOrder.push('release'); },
    }),
  };
  return {
    getPool: () => pool,
    __setFailCommit: (v: boolean) => { failCommit = v; },
  };
});
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: {
    emit: vi.fn(async (name: string, payload: any) => {
      callOrder.push(`emit:${name}`);
      emitted.push({ name, payload });
    }),
    on: vi.fn(),
  },
}));
vi.mock('../../financial/application/coa-validator.service.js', () => ({
  coaValidator: {
    validatePostable: vi.fn(async () => undefined),
  },
}));
vi.mock('../../audit-log/index.js', () => ({
  recordAudit: vi.fn(async () => undefined),
}));

import { createJournalEntryHandler } from '../presentation/accounting.controller.js';
import { __setFailCommit } from '../../../database/mysql.js';

const reply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };

const BASE_BODY = {
  entryDate: '2026-08-14',
  description: 'Realtime unit test',
  entries: [
    { accountId: 11, debit: 100, credit: 0 },
    { accountId: 22, debit: 0, credit: 100 },
  ],
};

describe('createJournalEntryHandler → accounting:entry-recorded placement (manual journal)', () => {
  beforeEach(() => {
    callOrder.length = 0;
    emitted.length = 0;
    failCommit = false;
  });

  it('emits AFTER commit for an organisation-scoped manual journal, scoped to the org', async () => {
    const res: any = await createJournalEntryHandler(
      { body: { ...BASE_BODY, organisationId: 12 }, userId: 1, ip: '10.0.0.1', headers: {} } as any,
      reply as any,
    );
    expect(Array.isArray(res.data.ids)).toBe(true);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].name).toBe('accounting:entry-recorded');
    expect(emitted[0].payload).toEqual({
      eventType: 'manual_journal',
      sourceType: 'journal',
      sourceId: 99,
      organisationId: 12,
    });

    const commitIdx = callOrder.indexOf('commit');
    const emitIdx = callOrder.findIndex((c) => c.startsWith('emit:'));
    expect(commitIdx).toBeGreaterThan(-1);
    expect(emitIdx).toBeGreaterThan(commitIdx); // strictly post-COMMIT
  });

  it('emits with organisationId null for a platform-wide manual journal', async () => {
    await createJournalEntryHandler(
      { body: BASE_BODY, userId: 1, ip: '10.0.0.1', headers: {} } as any,
      reply as any,
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0].name).toBe('accounting:entry-recorded');
    expect(emitted[0].payload.organisationId).toBeNull();
  });

  it('does NOT emit when the transaction fails (rollback path)', async () => {
    __setFailCommit(true);
    await expect(
      createJournalEntryHandler(
        { body: { ...BASE_BODY, organisationId: 12 }, userId: 1, ip: '10.0.0.1', headers: {} } as any,
        reply as any,
      ),
    ).rejects.toThrow('commit failed');
    expect(emitted).toHaveLength(0);
    expect(callOrder).toContain('rollback');
    expect(callOrder).not.toContain('emit:accounting:entry-recorded');
  });
});
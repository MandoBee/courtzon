/**
 * G11.4 regression — `general_ledger.reference_type` is `VARCHAR(50)`.
 *
 * The GL projection composes the forensic key as `<source_type>_<event_type>`.
 * G11.4 introduced `tournament_registration_card_refund_settled`, which composes
 * to 53 characters. Before the width guard, MySQL rejected the INSERT with
 * ER_DATA_TOO_LONG and the ENTIRE (balanced, already-validated) refund journal
 * was silently lost — the money leg never reached the GL.
 *
 * This suite pins the guard's contract:
 *   1. every event type that already fits is byte-for-byte UNCHANGED, so no
 *      existing `general_ledger.reference_type` value is rewritten;
 *   2. an over-long composite falls back to the event type alone (the most
 *      specific part of the key) rather than failing the journal;
 *   3. even an over-long event type is bounded, so the INSERT can never throw;
 *   4. the row is actually written with the resolved value.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../database/mysql.js', () => ({
  getPool: vi.fn(() => ({ execute: vi.fn() })),
  closePool: vi.fn(),
}));

import { glProjectionService } from '../application/gl-projection.service.js';

type ExecArgs = [string, unknown[]];
const GL_REFERENCE_TYPE_MAX = 50;

/** Build a projection entry with the minimum viable shape. */
function entry(overrides: Partial<Parameters<typeof glProjectionService.projectEntries>[0][number]> = {}) {
  return {
    sourceType: 'tournament',
    sourceId: 4242,
    eventType: 'tournament_registration_card_payment',
    organisationId: null,
    chartAccountId: 1,
    side: 'debit' as const,
    amount: 100,
    description: 'test',
    recordedAt: '2026-09-28 10:00:00',
    ledgerEntryId: 9001,
    ...overrides,
  };
}

/** Project one entry and return the params actually sent to MySQL. */
async function projectOne(e: ReturnType<typeof entry>): Promise<Record<string, unknown>> {
  const execute = vi.fn().mockResolvedValue([{}]);
  await glProjectionService.projectEntries([e as any], 8751, { execute } as any);
  const [sql, params] = execute.mock.calls[0] as ExecArgs;
  expect(sql).toContain('INSERT INTO general_ledger');
  // VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1)
  //   → [0]=ledger_entry_id [1]=organisation_id [2]=period_id [3]=account_id
  //     [4]=entry_date [5]=debit [6]=credit  (balance is the literal 0)
  //     [7]=reference_type [8]=reference_id [9]=description
  return { referenceType: params[7], debit: params[5], credit: params[6], periodId: params[2] };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('G11.4 — GL projection reference_type width guard', () => {
  it('an event type that already fits keeps the exact composed key (no rewrite of existing data)', async () => {
    const { referenceType } = await projectOne(entry({
      eventType: 'tournament_registration_card_refund',
    }));
    expect(referenceType).toBe('tournament_tournament_registration_card_refund');
    expect(String(referenceType).length).toBeLessThanOrEqual(GL_REFERENCE_TYPE_MAX);
  });

  it('a composed key that exactly fills the column is untouched', async () => {
    // 'settlement' (10) + '_' (1) + a 39-char event type = exactly 50.
    const evt = 'a'.repeat(39);
    const { referenceType } = await projectOne(entry({ sourceType: 'settlement', eventType: evt }));
    expect(referenceType).toBe(`settlement_${evt}`);
    expect(String(referenceType).length).toBe(GL_REFERENCE_TYPE_MAX);
  });

  it('one character over the boundary already triggers the fallback', async () => {
    // 'settlement' + '_' + a 40-char event type = 51 → fallback.
    const { referenceType } = await projectOne(entry({ sourceType: 'settlement', eventType: 'a'.repeat(40) }));
    expect(referenceType).toBe('a'.repeat(40));
  });

  it('G11.4’s over-long composite falls back to the event type instead of failing the journal', async () => {
    const composed = 'tournament_tournament_registration_card_refund_settled';
    expect(composed.length).toBeGreaterThan(GL_REFERENCE_TYPE_MAX);   // the bug precondition
    const { referenceType } = await projectOne(entry({
      eventType: 'tournament_registration_card_refund_settled',
    }));
    expect(referenceType).toBe('tournament_registration_card_refund_settled');
    expect(String(referenceType).length).toBeLessThanOrEqual(GL_REFERENCE_TYPE_MAX);
    // The rest of the row is unaffected — only the forensic key is bounded.
    expect(String(referenceType)).toContain('settled');
  });

  it('even an over-long EVENT TYPE is bounded, so the INSERT can never throw ER_DATA_TOO_LONG', async () => {
    const huge = 'x'.repeat(120);
    const { referenceType } = await projectOne(entry({ sourceType: 'settlement', eventType: huge }));
    expect(String(referenceType).length).toBeLessThanOrEqual(GL_REFERENCE_TYPE_MAX);
    expect(referenceType).toBe(huge.slice(0, GL_REFERENCE_TYPE_MAX));
  });

  it('a missing event type still produces a valid key from the source type alone', async () => {
    const { referenceType } = await projectOne(entry({ eventType: null }));
    expect(referenceType).toBe('tournament');
  });

  it('an over-long SOURCE TYPE with no event type is bounded too', async () => {
    const { referenceType } = await projectOne(entry({ sourceType: 'y'.repeat(80), eventType: null }));
    expect(String(referenceType).length).toBeLessThanOrEqual(GL_REFERENCE_TYPE_MAX);
  });

  it('every debit and credit row of a multi-line journal gets a bounded key', async () => {
    const execute = vi.fn().mockResolvedValue([{}]);
    await glProjectionService.projectEntries([
      entry({ side: 'debit', eventType: 'tournament_registration_card_refund_settled' }),
      entry({ side: 'credit', eventType: 'tournament_registration_card_refund_settled', chartAccountId: 1300 }),
      entry({ side: 'credit', eventType: 'tournament_registration_card_refund_settled', chartAccountId: 13707 }),
    ], 8751, { execute } as any);
    expect(execute).toHaveBeenCalledTimes(3);
    for (const call of execute.mock.calls) {
      const params = (call as ExecArgs)[1];
      expect(String(params[7]).length).toBeLessThanOrEqual(GL_REFERENCE_TYPE_MAX);
    }
  });

  it('debit/credit amounts are projected unchanged alongside the bounded key', async () => {
    const { debit, credit, periodId } = await projectOne(entry({
      side: 'debit', amount: 1000, eventType: 'tournament_registration_card_refund_settled',
    }));
    expect(debit).toBe(1000);
    expect(credit).toBe(0);
    expect(periodId).toBe(8751);
  });
});

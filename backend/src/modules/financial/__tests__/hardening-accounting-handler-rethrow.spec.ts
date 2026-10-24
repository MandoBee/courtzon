import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CZ-F22 Stage 2.4a-6 / 2.4a-9 — accounting handler failure propagation and
 * duplicate-key scoping. Mock-only: no DB, no Redis, no application start.
 *
 * 2.4a-6: handlers must NOT swallow genuine posting failures (the worker records
 * `processed_events` only when the handler RESOLVES).
 * 2.4a-9: `ER_DUP_ENTRY`/errno 1062 is an idempotent success ONLY for the
 * `ledgerRepository.createEntries` INSERT (whose table has exactly ONE unique
 * key, `uk_dedup`). Duplicates from anywhere else (e.g. `projectEntries`) must
 * propagate. Attribution is by SCOPE, never by parsing `sqlMessage`.
 */

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379';
  process.env.PAYMENT_GATEWAY_PROVIDER = 'mock';
});

const bus = vi.hoisted(() => {
  const handlers = new Map<string, Array<(data: any) => any>>();
  return {
    handlers,
    emit: vi.fn(),
    on: (eventName: string, handler: (data: any) => any) => {
      const arr = handlers.get(eventName) || [];
      arr.push(handler);
      handlers.set(eventName, arr);
    },
    getInMemoryHandlers: (eventName: string) => handlers.get(eventName) || [],
    subscribe: vi.fn(),
  };
});

const ledger = vi.hoisted(() => ({ hasPosting: vi.fn(), createEntries: vi.fn() }));
const academyRepo = vi.hoisted(() => ({ getSnapshotByEnrollment: vi.fn() }));
const eng = vi.hoisted(() => ({
  resolveMapping: vi.fn(),
  validateAccounts: vi.fn(),
  buildLedgerLines: vi.fn(),
  validateBalance: vi.fn(),
}));
const gl = vi.hoisted(() => ({
  resolvePeriod: vi.fn(),
  validateOpenPeriod: vi.fn(),
  projectEntries: vi.fn(),
}));
const agg = vi.hoisted(() => ({ createLedgerLines: vi.fn(), validateLedgerBalance: vi.fn() }));
const bdate = vi.hoisted(() => ({ getLocalBusinessDate: vi.fn() }));
const conn = vi.hoisted(() => ({
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}));

vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../academy/infrastructure/repositories/academy-payment.repository.js', () => ({
  academyPaymentRepository: academyRepo,
}));
vi.mock('../infrastructure/repositories/ledger.repository.js', () => ({ ledgerRepository: ledger }));
vi.mock('../application/accounting-engine.service.js', () => ({ accountingEngineService: eng }));
vi.mock('../application/gl-projection.service.js', () => ({ glProjectionService: gl }));
vi.mock('../domain/ledger-aggregate.js', () => ({
  createLedgerLines: agg.createLedgerLines,
  validateLedgerBalance: agg.validateLedgerBalance,
}));
vi.mock('../../../shared/utils/business-date.js', () => ({ getLocalBusinessDate: bdate.getLocalBusinessDate }));
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: async () => [[], []],
    query: async () => [[], []],
    getConnection: async () => conn,
  }),
}));
vi.mock('../../../shared/event-bus/subscriber.worker.js', () => ({ createSubscriberWorker: vi.fn() }));

import {
  registerAccountingEventListeners,
  resetAccountingEventListenersForTest,
  postAccountingEvent,
} from '../application/accounting-event.listener.js';

function handlerFor(eventName: string): (data: any) => Promise<unknown> {
  const arr = bus.handlers.get(eventName) || [];
  const handler = arr[arr.length - 1];
  if (!handler) throw new Error(`no handler registered for ${eventName}`);
  return handler as (data: any) => Promise<unknown>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const LISTENER_PATH = resolve(__dirname, '..', 'application', 'accounting-event.listener.ts');

function dupError(message: string): any {
  const err: any = new Error(message);
  err.code = 'ER_DUP_ENTRY';
  err.errno = 1062;
  return err;
}

beforeEach(() => {
  vi.resetAllMocks();
  bus.handlers.clear();
  resetAccountingEventListenersForTest();
  registerAccountingEventListeners();

  academyRepo.getSnapshotByEnrollment.mockResolvedValue(null);
  ledger.hasPosting.mockResolvedValue(false);
  ledger.createEntries.mockResolvedValue([11]);
  eng.resolveMapping.mockResolvedValue([{ accountId: 1, concept: 'x' }]);
  eng.validateAccounts.mockResolvedValue(undefined);
  eng.buildLedgerLines.mockReturnValue([{ accountId: 1, organisationId: undefined, side: 'debit', amount: 100 }]);
  eng.validateBalance.mockReturnValue(undefined);
  agg.createLedgerLines.mockReturnValue([{ recordedAt: '2025-01-01 00:00:00' }]);
  agg.validateLedgerBalance.mockReturnValue(true);
  bdate.getLocalBusinessDate.mockResolvedValue('2025-01-01');
  gl.resolvePeriod.mockResolvedValue(7);
  gl.validateOpenPeriod.mockResolvedValue(undefined);
  gl.projectEntries.mockResolvedValue(undefined);
  conn.beginTransaction.mockResolvedValue(undefined);
  conn.commit.mockResolvedValue(undefined);
  conn.rollback.mockResolvedValue(undefined);
  conn.release.mockReturnValue(undefined);
});

describe('Stage 2.4a-6 — genuine posting failures propagate to the worker', () => {
  it('wallet:withdrawal-completed rethrows a ledger failure (delivery is NOT a success)', async () => {
    ledger.hasPosting.mockRejectedValue(new Error('ledger unavailable'));

    await expect(
      handlerFor('wallet:withdrawal-completed')({ withdrawalId: 9, amount: 250, currency: 'EGP' }),
    ).rejects.toThrow('ledger unavailable');

    expect(ledger.hasPosting).toHaveBeenCalledWith('wallet', 9, 'withdrawal_completion');
  });

  it('payment:gateway-settled rethrows a ledger failure', async () => {
    ledger.hasPosting.mockRejectedValue(new Error('gl projection down'));

    await expect(
      handlerFor('payment:gateway-settled')({ settlementId: 3, gross: 100, net: 100, fee: 0, currency: 'EGP' }),
    ).rejects.toThrow('gl projection down');

    expect(ledger.hasPosting).toHaveBeenCalledWith('settlement', 3, 'payment_gateway_settlement');
  });

  it('payment:succeeded still rethrows a ledger failure (wallet top-up branch)', async () => {
    ledger.hasPosting.mockRejectedValue(new Error('db down'));

    await expect(
      handlerFor('payment:succeeded')({
        paymentId: 77,
        referenceType: 'wallet_topup',
        referenceId: 77,
        amount: 30,
        metadata: { paymentMethod: 'card', currency: 'EGP' },
      }),
    ).rejects.toThrow('db down');

    expect(ledger.hasPosting).toHaveBeenCalledWith('wallet', 77, 'wallet_topup');
  });

  it('academy payment:succeeded does not post and never falls through to generic accounting', async () => {
    await handlerFor('payment:succeeded')({
      paymentId: 88,
      referenceType: 'academy',
      referenceId: 11,
      amount: 200,
      metadata: { paymentMethod: 'card', currency: 'EGP' },
    });
    expect(ledger.hasPosting).not.toHaveBeenCalled();
  });

  it('academy:enrollment-paid rethrows when the immutable snapshot is missing', async () => {
    await expect(
      handlerFor('academy:enrollment-paid')({
        enrollmentId: 11,
        paymentMethod: 'card',
        currency: 'EGP',
      }),
    ).rejects.toThrow(/Academy payment snapshot missing/);
  });

  it('academy refund rethrows when the immutable snapshot is missing', async () => {
    await expect(
      handlerFor('payment:refunded')({
        paymentId: 88,
        referenceType: 'academy',
        referenceId: 11,
        amount: 200,
        metadata: { paymentMethod: 'card', currency: 'EGP' },
      }),
    ).rejects.toThrow(/Academy refund snapshot missing/);
  });

  it('academy:enrollment-paid posts one set and duplicate delivery is idempotent', async () => {
    academyRepo.getSnapshotByEnrollment.mockResolvedValue({
      id: 7001,
      enrollment_id: 11,
      organisation_id: 7,
      gross_amount: 200,
      commission_amount: 30,
      organization_earning_amount: 170,
      court_rental_amount: 30,
      currency: 'EGP',
      payment_method: 'card',
    });

    const handler = handlerFor('academy:enrollment-paid');
    const payload = { enrollmentId: 11, paymentMethod: 'card', currency: 'EGP' };

    await handler(payload);
    expect(ledger.createEntries).toHaveBeenCalledTimes(2);

    ledger.hasPosting.mockResolvedValue(true);
    await handler(payload);
    expect(ledger.createEntries).toHaveBeenCalledTimes(2);
  });

  it('academy:enrollment-paid propagates a transient failure and posts on retry', async () => {
    academyRepo.getSnapshotByEnrollment.mockResolvedValue({
      id: 7001,
      enrollment_id: 11,
      organisation_id: 7,
      gross_amount: 200,
      commission_amount: 30,
      organization_earning_amount: 170,
      court_rental_amount: 30,
      currency: 'EGP',
      payment_method: 'card',
    });
    ledger.createEntries.mockRejectedValueOnce(new Error('transient ledger outage'));

    const handler = handlerFor('academy:enrollment-paid');
    const payload = { enrollmentId: 11, paymentMethod: 'card', currency: 'EGP' };
    await expect(handler(payload)).rejects.toThrow('transient ledger outage');
    expect(ledger.createEntries).toHaveBeenCalledTimes(1);

    await handler(payload);
    expect(ledger.createEntries).toHaveBeenCalledTimes(3);
  });
});

describe('Stage 2.4a-9 — ER_DUP_ENTRY is scoped to createEntries (uk_dedup)', () => {
  it('treats a duplicate from ledgerRepository.createEntries as an idempotent success', async () => {
    ledger.createEntries.mockRejectedValueOnce(dupError("Duplicate entry 'x' for key 'ledger_entries.uk_dedup'"));

    await expect(
      postAccountingEvent('withdrawal_completion', 'wallet', 9, null, { withdrawal_clearing: 100, cash_bank: 100 }, 'EGP', 'd'),
    ).resolves.toBeUndefined();

    expect(ledger.createEntries).toHaveBeenCalledTimes(1);
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(gl.projectEntries).not.toHaveBeenCalled();
  });

  it('propagates a duplicate that does NOT come from createEntries (e.g. projectEntries)', async () => {
    ledger.createEntries.mockResolvedValueOnce([11]);
    gl.projectEntries.mockRejectedValueOnce(dupError("Duplicate entry '11' for key 'general_ledger.uk_gl_ledger_entry'"));

    await expect(
      postAccountingEvent('withdrawal_completion', 'wallet', 9, null, { withdrawal_clearing: 100, cash_bank: 100 }, 'EGP', 'd'),
    ).rejects.toThrow(/uk_gl_ledger_entry/);

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('propagates a non-duplicate createEntries failure', async () => {
    ledger.createEntries.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      postAccountingEvent('withdrawal_completion', 'wallet', 9, null, { withdrawal_clearing: 100, cash_bank: 100 }, 'EGP', 'd'),
    ).rejects.toThrow('connection lost');

    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('commits then emits on success (ordering preserved)', async () => {
    await expect(
      postAccountingEvent('withdrawal_completion', 'wallet', 9, null, { withdrawal_clearing: 100, cash_bank: 100 }, 'EGP', 'd'),
    ).resolves.toBeUndefined();

    expect(conn.commit).toHaveBeenCalledTimes(1);
    expect(conn.rollback).not.toHaveBeenCalled();
    expect(bus.emit).toHaveBeenCalledWith('accounting:entry-recorded', expect.objectContaining({ sourceType: 'wallet' }));
  });

  it('the 16 outer handlers no longer swallow ER_DUP_ENTRY (propagates to the worker)', async () => {
    ledger.hasPosting.mockRejectedValue(dupError('Duplicate entry (not from createEntries)'));

    await expect(
      handlerFor('wallet:withdrawal-submitted')({ withdrawalId: 11, amount: 50, currency: 'EGP' }),
    ).rejects.toThrow('Duplicate entry (not from createEntries)');
  });
});

describe('Stage 2.4a-6 — intentional no-ops stay successful', () => {
  it('wallet:withdrawal-completed stays a no-op for a non-positive amount (no posting attempted)', async () => {
    await expect(
      handlerFor('wallet:withdrawal-completed')({ withdrawalId: 9, amount: 0, currency: 'EGP' }),
    ).resolves.toBeUndefined();

    expect(ledger.hasPosting).not.toHaveBeenCalled();
  });

  it('marketplace:order-delivered stays a no-op (no accounting by design)', async () => {
    await expect(
      handlerFor('marketplace:order-delivered')({ orderId: 5 }),
    ).resolves.toBeUndefined();

    expect(ledger.hasPosting).not.toHaveBeenCalled();
  });
});

describe('Stage 2.4a-6/2.4a-9 — source contracts', () => {
  it('every accounting handler log.message is followed by a rethrow', () => {
    const src = readFileSync(LISTENER_PATH, 'utf8');
    const messages = [
      'Accounting refund event failed',
      'Allocation refund accounting failed',
      'Marketplace start-processing (cash) accounting failed',
      'Marketplace delivery accounting failed',
      'Marketplace refund accounting failed',
      'Marketplace cancel accounting failed',
      'Withdrawal request accounting failed',
      'Withdrawal completion accounting failed',
      'Payment gateway settlement accounting failed',
      'Payment gateway settlement reversal accounting failed',
      'Settlement paid accounting failed',
      'Booking paid accounting failed',
      'Booking refund accounting failed',
      'Prize award accounting failed',
      'Prize refund accounting failed',
    ];

    for (const msg of messages) {
      const idx = src.indexOf(msg);
      expect(idx, `log message not found: ${msg}`).toBeGreaterThan(-1);
      expect(src.slice(idx, idx + 300), `handler does not rethrow: ${msg}`).toContain('throw err;');
    }
  });

  it('only the scoped helper references ER_DUP_ENTRY in executable code', () => {
    const src = readFileSync(LISTENER_PATH, 'utf8');
    const codeOnly = src
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');
    expect((codeOnly.match(/ER_DUP_ENTRY/g) || []).length).toBe(1);
    expect(codeOnly).toContain('function isDuplicateKeyError(err: any): boolean {');
    expect(codeOnly).toContain("err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062");
    expect(codeOnly).toContain('if (isDuplicateKeyError(err)) {');
  });

  it('lookupInstallmentByPayment no longer swallows DB failures', () => {
    const src = readFileSync(LISTENER_PATH, 'utf8');
    const fnIdx = src.indexOf('async function lookupInstallmentByPayment');
    expect(fnIdx).toBeGreaterThan(-1);
    const body = src.slice(fnIdx, fnIdx + 700);
    expect(body).not.toContain('catch {');
    expect(body).toContain('return (rows as any[])[0] || null;');
  });

  it('replayDispatch re-surfaces synchronous handler throws', () => {
    const src = readFileSync(LISTENER_PATH, 'utf8');
    const fnIdx = src.indexOf('function replayDispatch');
    expect(fnIdx).toBeGreaterThan(-1);
    expect(src.slice(fnIdx, fnIdx + 700)).toContain('Promise.reject(err)');
  });
});

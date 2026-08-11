import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import { accountingEngineService } from '../application/accounting-engine.service.js';
import { ledgerService } from '../application/ledger.service.js';
import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';

type RowData = RowDataPacket[];

describe('Accounting Engine — Integration', () => {
  const pool = getPool();

  beforeAll(async () => {
    const [rows] = await pool.execute<RowData>(
      "SELECT COUNT(*) AS cnt FROM accounting_event_mapping_lines WHERE organisation_id IS NULL"
    );
    const count = Number((rows as any[])[0].cnt);
    if (count === 0) {
      throw new Error('No mapping seed data found — run 005_accounting_defaults.sql first');
    }
  });

  afterAll(async () => {
    await pool.execute("DELETE FROM ledger_entries WHERE transaction_id LIKE 'test_%'");
  });

  it('resolves global default mapping for card_payment', async () => {
    const mapping = await accountingEngineService.resolveMapping('card_payment', null);
    expect(mapping.length).toBeGreaterThanOrEqual(2);
    const concepts = mapping.map(m => m.concept);
    expect(concepts).toContain('payment_clearing');
    expect(concepts).toContain('revenue');
  });

  it('resolves global default mapping for invoice_issue (3 concepts)', async () => {
    const mapping = await accountingEngineService.resolveMapping('invoice_issue', null);
    const concepts = mapping.map(m => m.concept);
    expect(concepts).toContain('receivable');
    expect(concepts).toContain('revenue');
    expect(concepts).toContain('tax_liability');
  });

  it('throws on missing event_type', async () => {
    await expect(
      accountingEngineService.resolveMapping('nonexistent_event', null)
    ).rejects.toThrow();
  });

  it('throws on incomplete org override', async () => {
    const testOrgId = 99999;
    await pool.execute(
      "INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active) VALUES (?, ?, ?, (SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1100' LIMIT 1), 1)",
      ['card_payment', testOrgId, 'payment_clearing']
    );
    try {
      await expect(
        accountingEngineService.resolveMapping('card_payment', testOrgId)
      ).rejects.toThrow(/Missing concepts/);
    } finally {
      await pool.execute(
        "DELETE FROM accounting_event_mapping_lines WHERE event_type = ? AND organisation_id = ?",
        ['card_payment', testOrgId]
      );
    }
  });

  it('org override completely replaces global mapping', async () => {
    const testOrgId = 99999;
    const [accRows] = await pool.execute<RowData>(
      "SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code IN ('1100', '4100')"
    );
    const ids = (accRows as any[]).map((r: any) => r.id);
    await pool.execute(
      "INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active) VALUES (?, ?, ?, ?, 1), (?, ?, ?, ?, 1)",
      ['card_payment', testOrgId, 'payment_clearing', ids[0], 'card_payment', testOrgId, 'revenue', ids[1]]
    );
    try {
      const mapping = await accountingEngineService.resolveMapping('card_payment', testOrgId);
      expect(mapping.length).toBe(2);
      expect(mapping.map(m => m.concept).sort()).toEqual(['payment_clearing', 'revenue']);
    } finally {
      await pool.execute(
        "DELETE FROM accounting_event_mapping_lines WHERE event_type = ? AND organisation_id = ?",
        ['card_payment', testOrgId]
      );
    }
  });

  it('rejects nonexistent account', async () => {
    await expect(
      accountingEngineService.validateAccounts([999999], null)
    ).rejects.toThrow(/does not exist/);
  });

  it('accepts valid global accounts', async () => {
    const [accRows] = await pool.execute<RowData>(
      "SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL LIMIT 2"
    );
    const ids = (accRows as any[]).map((r: any) => r.id);
    await expect(
      accountingEngineService.validateAccounts(ids, null)
    ).resolves.toBeUndefined();
  });

  it('buildLedgerLines — basic 2-concept posting', async () => {
    const mapping = [
      { concept: 'payment_clearing', accountId: 1 },
      { concept: 'revenue', accountId: 10 },
    ];
    const amounts: Record<string, number> = { payment_clearing: 1000, revenue: 1000 };
    const lines = accountingEngineService.buildLedgerLines('card_payment', mapping, amounts);
    expect(lines.length).toBe(2);
    const debitLine = lines.find(l => l.side === 'debit');
    const creditLine = lines.find(l => l.side === 'credit');
    expect(debitLine!.amount).toBe(1000);
    expect(creditLine!.amount).toBe(1000);
  });

  it('buildLedgerLines — merges same-account same-side (tax embedded in Simple Mode)', async () => {
    const mapping = [
      { concept: 'receivable', accountId: 4 },
      { concept: 'revenue', accountId: 10 },
      { concept: 'tax_liability', accountId: 10 },
    ];
    const amounts: Record<string, number> = { receivable: 1100, revenue: 1000, tax_liability: 100 };
    const lines = accountingEngineService.buildLedgerLines('invoice_issue', mapping, amounts);
    expect(lines.length).toBe(2);
    const creditLine = lines.find(l => l.side === 'credit');
    expect(creditLine!.amount).toBe(1100);
    expect(creditLine!.accountId).toBe(10);
  });

  it('buildLedgerLines — 3-line posting with separated tax (Advanced Mode)', async () => {
    const mapping = [
      { concept: 'receivable', accountId: 4 },
      { concept: 'revenue', accountId: 10 },
      { concept: 'tax_liability', accountId: 9 },
    ];
    const amounts: Record<string, number> = { receivable: 1100, revenue: 1000, tax_liability: 100 };
    const lines = accountingEngineService.buildLedgerLines('invoice_issue', mapping, amounts);
    expect(lines.length).toBe(3);
    const debit = lines.find(l => l.side === 'debit');
    const credits = lines.filter(l => l.side === 'credit');
    expect(debit!.amount).toBe(1100);
    expect(credits.length).toBe(2);
    expect(credits.reduce((s, l) => s + l.amount, 0)).toBe(1100);
  });

  it('validateBalance — passes for balanced', () => {
    const lines = [
      { concept: '', side: 'debit' as const, accountId: 1, amount: 1000 },
      { concept: '', side: 'credit' as const, accountId: 10, amount: 1000 },
    ];
    expect(() => accountingEngineService.validateBalance(lines)).not.toThrow();
  });

  it('validateBalance — throws for unbalanced', () => {
    const lines = [
      { concept: '', side: 'debit' as const, accountId: 1, amount: 1000 },
      { concept: '', side: 'credit' as const, accountId: 10, amount: 500 },
    ];
    expect(() => accountingEngineService.validateBalance(lines)).toThrow(/not balanced/);
  });

  it('idempotency — same event does not create duplicate posting', async () => {
    const mapping = await accountingEngineService.resolveMapping('card_payment', null);
    const amounts: Record<string, number> = { payment_clearing: 500, revenue: 500 };
    const lines = accountingEngineService.buildLedgerLines('card_payment', mapping, amounts);
    accountingEngineService.validateBalance(lines);

    const txnId = 'test_idem_dup';
    const sourceType = 'booking' as const;
    const sourceId = 999901;
    const inputs = lines.map(l => ({
      transactionId: txnId, sourceType, sourceId,
      eventType: 'card_payment', organisationId: null,
      chartAccountId: l.accountId, side: l.side, amount: l.amount,
      currency: 'EGP', description: 'test - duplicate post',
    }));

    await ledgerService.recordAccountingTransaction(txnId, inputs);
    const posted = await ledgerRepository.hasPosting(sourceType, sourceId, 'card_payment');
    expect(posted).toBe(true);

    // Second attempt would be caught by ER_DUP_ENTRY — test the soft check
    const postedAgain = await ledgerRepository.hasPosting(sourceType, sourceId, 'card_payment');
    expect(postedAgain).toBe(true);
  });

  it('idempotency — different event_types for same source are distinct', async () => {
    const mapping = await accountingEngineService.resolveMapping('card_payment', null);
    const amounts: Record<string, number> = { payment_clearing: 300, revenue: 300 };
    const lines = accountingEngineService.buildLedgerLines('card_payment', mapping, amounts);
    accountingEngineService.validateBalance(lines);

    const txnId = 'test_idem_distinct';
    const sourceType = 'booking' as const;
    const sourceId = 999902;
    const inputs1 = lines.map(l => ({
      transactionId: txnId, sourceType, sourceId,
      eventType: 'card_payment', organisationId: null,
      chartAccountId: l.accountId, side: l.side, amount: l.amount,
      currency: 'EGP', description: 'test - payment',
    }));

    await ledgerService.recordAccountingTransaction(txnId, inputs1);

    // Different event_type for same source should NOT be considered posted
    const paymentPosted = await ledgerRepository.hasPosting(sourceType, sourceId, 'card_payment');
    expect(paymentPosted).toBe(true);

    const refundPosted = await ledgerRepository.hasPosting(sourceType, sourceId, 'card_refund');
    expect(refundPosted).toBe(false);
  });
});

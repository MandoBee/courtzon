import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Step 11D — P1-3: Org Finance Transactions must be clearly labelled as
 * operational activity history, NOT the organisation's financial position.
 *
 * The screen reads the operational ledger (transaction_entries / transactions)
 * — a legitimate activity log. The authoritative financial position comes from
 * PositionService / financial_entitlements (Financial Position page).
 *
 * UI-only change: rename the tab to "Operational Transactions", add an
 * explanation distinguishing it from the financial position, and link to the
 * Financial Position page. No backend / data / accounting changes.
 */

const readFrontend = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');

describe('P1-3a: Org Finance Transactions clearly labelled as operational', () => {
  const src = () => readFrontend('./OrgFinancePage.tsx');

  it('names the tab "Operational Transactions"', () => {
    const s = src();
    expect(s).toContain('Operational Transactions');
  });

  it('explicitly states it is NOT the financial position', () => {
    const s = src();
    expect(s).toContain('not</strong> your financial position or balance');
  });

  it('explains it is day-to-day activity from the operational ledger', () => {
    const s = src();
    expect(s).toContain('day-to-day activity');
    expect(s).toContain('operational ledger');
  });

  it('links to the Financial Position page (authoritative source)', () => {
    const s = src();
    expect(s).toContain('/org/${orgId}/finance/position');
  });

  it('keeps the operational source fields (debit/credit/type)', () => {
    const s = src();
    expect(s).toContain('tx.side');
    expect(s).toContain('tx.amount');
    expect(s).toContain('getWalletTransactionLabel(tx)');
  });
});

describe('P1-3b: Financial Position remains the authoritative source, unchanged', () => {
  const src = () => readFrontend('./FinancialPositionPage.tsx');

  it('still reads from PositionService via the position endpoint', () => {
    const s = src();
    expect(s).toContain('/org/${orgId}/position');
    expect(s).toContain('data.position.net');
    expect(s).toContain('data.balances.available.amount');
  });

  it('position values are NOT computed from transactions', () => {
    const s = src();
    expect(s).not.toContain('/org/${orgId}/transactions');
  });
});

describe('P1-3c: No frontend financial calculation introduced', () => {
  const src = () => readFrontend('./OrgFinancePage.tsx');

  it('operational rows display backend debit/credit values, not recomputed balances', () => {
    const s = src();
    // The transactions tab shows per-row debit/credit from the backend — no
    // running balance / position is computed from them.
    expect(s).toContain('tx.side === \'debit\'');
    expect(s).not.toContain('runningBalance');
    expect(s).not.toContain('calculateBalance');
  });
});
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Step 11A — P0 financial UI fixes.
 *
 * P0-1: Admin finance screens must read the canonical general_ledger book
 *       (joined with chart_of_accounts), never the legacy ledger_entries
 *       table for financial reporting.
 * P0-2: Admin SellersPage must label gross delivered sales as "Gross Sales",
 *       never as "Revenue" (which implies earnings).
 */

const BACKEND = path.resolve(__dirname, '../../../../../backend');
const readBackend = (rel: string) => fs.readFileSync(path.join(BACKEND, rel), 'utf-8');
const readFrontend = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');

describe('P0-1a: Ledger repository reads canonical general_ledger', () => {
  const src = () => readBackend('src/modules/financial/infrastructure/repositories/ledger.repository.ts');

  it('findByDateRange reads FROM general_ledger JOIN chart_of_accounts', () => {
    const s = src();
    expect(s).toContain('FROM general_ledger gl');
    expect(s).toContain('JOIN chart_of_accounts coa ON coa.id = gl.account_id');
  });

  it('does NOT read ledger_entries for the date-range financial query', () => {
    const s = src();
    // findByDateRange must not SELECT * FROM ledger_entries
    expect(s).not.toContain("'SELECT * FROM ledger_entries WHERE recorded_at");
  });

  it('filters by COA account code / type, not the legacy account_type column', () => {
    const s = src();
    expect(s).toContain("coa.code = ?");
    expect(s).toContain("coa.type = ?");
  });

  it('getRevenueSummary groups from general_ledger + chart_of_accounts', () => {
    const s = src();
    expect(s).toContain('FROM general_ledger gl');
    expect(s).toContain('JOIN chart_of_accounts coa ON coa.id = gl.account_id');
  });
});

describe('P0-1b: Admin Ledger Viewer uses canonical GL + COA account display', () => {
  const src = () => readFrontend('../finance/LedgerViewerPage.tsx');

  it('labels the canonical source explicitly', () => {
    const s = src();
    expect(s).toContain('CourtZon General Ledger');
    expect(s).toContain('general_ledger + chart_of_accounts');
  });

  it('filters by COA account code and type, not legacy account_type enum', () => {
    const s = src();
    expect(s).toContain('accountCode');
    expect(s).toContain('revenue');
    expect(s).not.toContain('wallet_liability');
    expect(s).not.toContain('platform_revenue');
  });

  it('displays account_code + account_name', () => {
    const s = src();
    expect(s).toContain('e.account_code');
    expect(s).toContain('e.account_name');
  });
});

describe('P0-1c: Finance Dashboard / Report Center use COA wallet liability filter', () => {
  const dash = () => readFrontend('../finance/FinanceDashboardPage.tsx');
  const report = () => readFrontend('../finance/ReportCenterPage.tsx');

  it('dashboard wallet ledger deep-link uses accountCode=2100 not legacy wallet_liability', () => {
    const s = dash();
    expect(s).toContain('accountCode=2100');
    expect(s).not.toContain('accountType=wallet_liability');
  });

  it('dashboard identifies the canonical GL book', () => {
    const s = dash();
    expect(s).toContain('CourtZon General Ledger');
  });

  it('report center wallet entries filter by account_code 2100', () => {
    const s = report();
    expect(s).toContain("e.account_code === '2100'");
    expect(s).not.toContain("e.account_type === 'wallet_liability'");
  });

  it('report center wallet ledger deep-link uses accountCode=2100', () => {
    const s = report();
    expect(s).toContain('accountCode=2100');
  });
});

describe('P0-2: Admin SellersPage labels gross sales as "Gross Sales", not "Revenue"', () => {
  const src = () => readFrontend('../marketplace/SellersPage.tsx');

  it('table column header is "Gross Sales"', () => {
    const s = src();
    expect(s).toContain('>Gross Sales<');
    expect(s).not.toContain('>Revenue<');
  });

  it('detail label is "Gross Sales"', () => {
    const s = src();
    expect(s).toContain('Gross Sales');
    expect(s).not.toContain('">Revenue</span>');
  });
});
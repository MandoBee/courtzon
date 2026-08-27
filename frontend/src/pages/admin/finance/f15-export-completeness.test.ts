import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * F-15 — admin finance export completeness.
 *
 * The Report Center settlements tab previously exported the first-page
 * (limit 20) snapshot of /settlements loaded for the on-screen table, which is
 * an incomplete loaded-window export. It must now use the server-side
 * complete export endpoint (/unified-settlements/export), the same one the
 * dedicated Unified Settlement List page uses.
 */

const readFrontend = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');

describe('F-15: Report Center settlements export is server-side complete', () => {
  const report = () => readFrontend('../finance/ReportCenterPage.tsx');

  it('settlements tab uses the server-side ExportCsvButton to /unified-settlements/export', () => {
    const s = report();
    expect(s).toContain("tab === 'settlements'");
    expect(s).toContain('ExportCsvButton');
    expect(s).toContain('endpoint="/unified-settlements/export"');
  });

  it('settlements tab does NOT export the paginated first-page client snapshot', () => {
    const s = report();
    // The settlements branch must not pass settlementList to the client ExportButton.
    expect(s).not.toContain(": settlementList}");
  });

  it('revenue and wallet tabs keep the complete client-side ExportButton dataset', () => {
    const s = report();
    expect(s).toContain('<ExportButton data={tab === \'revenue\'');
  });

  it('uses the same settlements.view-permissioned endpoint as UnifiedSettlementListPage', () => {
    const settlementPage = readFrontend('../settlements/UnifiedSettlementListPage.tsx');
    const reportEndpoint = report().match(/endpoint="([^"]+)"/)?.[1];
    const unifiedEndpoint = settlementPage.match(/endpoint="([^"]+)"/)?.[1];
    expect(reportEndpoint).toBe('/unified-settlements/export');
    expect(unifiedEndpoint).toBe('/unified-settlements/export');
  });

  it('export passes raw backend rows, not newly computed financial totals', () => {
    const s = report();
    // The export dataset is the raw backend array (revenueAccounts / entries /
    // walletSummary), never a locally aggregated financial total. Any reduce()
    // in the file belongs to display KPI cards, not the export path.
    expect(s).toContain("data={tab === 'revenue' ? (revenueAccounts.length ? revenueAccounts : entries) : [walletSummary || {}]}");
  });
});

describe('F-15: Finance Dashboard export is a complete 30-day ledger', () => {
  const dash = () => readFrontend('../finance/FinanceDashboardPage.tsx');

  it('exports the full ledger array (not the slice(0,10) display window)', () => {
    const s = dash();
    // ExportButton receives the complete `ledger` array, while the table only
    // renders ledger.slice(0,10) for display.
    expect(s).toContain('data={Array.isArray(ledger) ? ledger : (summary?.byAccount || [])}');
    expect(s).toContain('ledger.slice(0, 10)');
  });
});
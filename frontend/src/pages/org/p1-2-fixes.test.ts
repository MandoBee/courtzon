import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Step 11C — P1-2: Clarify GL Net Income vs Position Earnings.
 *
 * Organisation accounting screens must clearly distinguish:
 *  - "GL Net Income (Accounting)" — the accounting/reporting view from a
 *    general-ledger slice (unchanged value).
 *  - "Position Earnings" / settlement position — the organisation's
 *    entitlement-based financial position (unchanged value).
 *
 * UI-only change: labels + contextual explanation. No financial calculations
 * introduced, no accounting data changed.
 */

const readFrontend = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');

describe('P1-2a: Org Accounting Dashboard distinguishes GL Net Income', () => {
  const src = () => readFrontend('./OrgAccountingDashboardPage.tsx');

  it('labels the GL-derived figure "GL Net Income (Accounting)"', () => {
    const s = src();
    expect(s).toContain('GL Net Income (Accounting)');
    expect(s).not.toContain("'Net Income (FY)'");
  });

  it('adds a contextual explanation distinguishing GL net income from settlement earnings', () => {
    const s = src();
    expect(s).toContain('GL Net Income is the accounting/reporting result derived from');
    expect(s).toContain('not your settlement earnings');
  });
});

describe('P1-2b: Org Financial Reports (income statement) labels GL Net Income', () => {
  const src = () => readFrontend('./OrgFinancialReportsPage.tsx');

  it('labels the income-statement net income "GL Net Income (Accounting)"', () => {
    const s = src();
    expect(s).toContain('GL Net Income (Accounting)');
    expect(s).not.toContain('>Net Income:</span>');
  });

  it('adds a clarification that it is not settlement earnings', () => {
    const s = src();
    expect(s).toContain('Not your settlement earnings');
  });
});

describe('P1-2c: Financial Position page labels entitlement-based earnings', () => {
  const src = () => readFrontend('./FinancialPositionPage.tsx');

  it('labels the entitlement earnings "Position Earnings (Settlement)"', () => {
    const s = src();
    expect(s).toContain('Position Earnings (Settlement)');
    expect(s).not.toContain('Your Earnings');
  });

  it('adds a clarification that position earnings differ from GL Net Income', () => {
    const s = src();
    expect(s).toContain('financial_position.position_vs_gl');
    expect(s).toContain('they are not the same as the GL Net Income');
  });
});

describe('P1-2d: No frontend financial calculation introduced', () => {
  it('position earnings are read from the PositionService value, not computed', () => {
    const s = readFrontend('./FinancialPositionPage.tsx');
    // Position values come directly from data.earnings / data.position (backend).
    expect(s).toContain('data.position.net');
    expect(s).toContain('earnings.courtzonCollected');
    expect(s).toContain('earnings.orgCollected');
    // No GL-based subtraction producing earnings in this page.
    expect(s).not.toContain('data.revenue -');
  });

  it('GL net income is read from the backend value, not recomputed', () => {
    const dashboard = readFrontend('./OrgAccountingDashboardPage.tsx');
    const report = readFrontend('./OrgFinancialReportsPage.tsx');
    expect(dashboard).toContain('s.net_income');
    expect(report).toContain('data?.net_income');
  });
});
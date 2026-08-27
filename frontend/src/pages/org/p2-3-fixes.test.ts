import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Step 12B — P2-3: Unified settlement amounts in Org Finance.
 *
 * The Org Finance settlement list previously showed legacy Gross / CourtZon
 * Fee / Org Net columns that are 0.00 for unified-created settlements
 * (settlements.gross_amount / courtzon_fee / organization_net are legacy and
 * unpopulated by the unified engine). Canonical values live on the same row:
 * final_amount, commission_amount, net_amount, courtzon_position,
 * organization_position.
 *
 * UI-only change: replace the misleading legacy columns with canonical values.
 * No frontend arithmetic (no final_amount − commission).
 */

const readFrontend = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');

describe('P2-3a: Org Finance settlement list uses canonical fields', () => {
  const src = () => readFrontend('./OrgFinancePage.tsx');

  it('labels the amount column "Settlement Amount" from canonical final_amount', () => {
    const s = src();
    expect(s).toContain('Settlement Amount');
    expect(s).toContain('s.final_amount || s.net_amount');
  });

  it('shows CourtZon Commission from canonical commission_amount', () => {
    const s = src();
    expect(s).toContain('CourtZon Commission');
    expect(s).toContain('s.commission_amount');
  });

  it('does NOT display misleading legacy Gross / CourtZon Fee / Org Net columns', () => {
    const s = src();
    expect(s).not.toContain('s.gross_amount');
    expect(s).not.toContain('s.courtzon_fee');
    expect(s).not.toContain('s.organization_net');
  });

  it('no frontend financial arithmetic (no final_amount − commission)', () => {
    const s = src();
    expect(s).not.toContain('final_amount - commission');
    expect(s).not.toContain('final_amount - Number(s.commission_amount');
    expect(s).not.toContain('finalAmount - Number');
  });
});

describe('P2-3b: Detail modal uses canonical settlement financials', () => {
  const src = () => readFrontend('./OrgFinancePage.tsx');

  it('shows Settlement Amount, CourtZon Commission and position fields', () => {
    const s = src();
    expect(s).toContain('Settlement Amount:');
    expect(s).toContain('CourtZon Commission:');
    expect(s).toContain('CourtZon Position:');
    expect(s).toContain('Organisation Position:');
  });

  it('does not show legacy Shipping / COD Fees / Online Nets in the detail header', () => {
    const s = src();
    expect(s).not.toContain('>Shipping:</span>');
    expect(s).not.toContain('>COD Fees:</span>');
    expect(s).not.toContain('>Online Nets:</span>');
  });

  it('keeps the canonical Linked Financial Entitlements table for source traceability', () => {
    const s = src();
    expect(s).toContain('Linked Financial Entitlements');
    expect(s).toContain('e.entitlement_type');
    expect(s).toContain('e.amount');
  });
});
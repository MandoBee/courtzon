import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('tax-resolution');
type RowData = RowDataPacket[];

export interface ResolvedTax {
  taxRateId: number | null;
  rate: number;
  type: 'percentage' | 'fixed';
  taxCategory: string;
}

/**
 * Resolve the active tax rate for an organization (org-specific first, then
 * global fallback). Shared canonical tax-rate resolution for all business
 * modules (booking, marketplace, invoices). No hard-coded rates.
 */
export async function resolveOrgTaxRate(organisationId: number | null): Promise<ResolvedTax | null> {
  const pool = getPool();
  const params: any[] = [];
  let orgClause = 'organisation_id IS NULL';
  if (organisationId != null) {
    orgClause = '(organisation_id = ? OR organisation_id IS NULL)';
    params.push(organisationId);
  }
  const [rows] = await pool.execute<RowData>(
    `SELECT id, rate, type, tax_category FROM tax_rates
     WHERE is_active = 1 AND ${orgClause}
     ORDER BY (organisation_id IS NOT NULL) DESC, id ASC
     LIMIT 1`,
    params,
  );
  if (!rows.length) return null;
  const r = rows[0] as any;
  return {
    taxRateId: r.id,
    rate: Number(r.rate),
    type: r.type,
    taxCategory: r.tax_category,
  };
}

export interface TaxCalcResult {
  taxRateId: number | null;
  taxRate: number;
  taxAmount: number;
  netAmount: number;
  grossAmount: number;
  treatment: 'taxable' | 'zero_rated' | 'exempt';
}

/**
 * Calculate tax for a net amount using the canonical rounding (matches
 * invoice/marketplace). Returns the full breakdown for snapshotting.
 */
export function calculateTax(
  netAmount: number,
  resolved: ResolvedTax | null,
  treatment: 'taxable' | 'zero_rated' | 'exempt' = 'taxable',
): TaxCalcResult {
  const rnd = (n: number) => Math.round(n * 100) / 100;
  if (!resolved || treatment === 'exempt' || treatment === 'zero_rated' || resolved.rate <= 0) {
    return {
      taxRateId: resolved?.taxRateId ?? null,
      taxRate: resolved?.rate ?? 0,
      taxAmount: 0,
      netAmount: rnd(netAmount),
      grossAmount: rnd(netAmount),
      treatment: resolved && resolved.rate <= 0 ? 'zero_rated' : treatment,
    };
  }
  let taxAmount: number;
  if (resolved.type === 'fixed') {
    taxAmount = rnd(resolved.rate);
  } else {
    taxAmount = rnd(netAmount * resolved.rate / 100);
  }
  return {
    taxRateId: resolved.taxRateId,
    taxRate: resolved.rate,
    taxAmount,
    netAmount: rnd(netAmount),
    grossAmount: rnd(netAmount + taxAmount),
    treatment: 'taxable',
  };
}

export const taxResolution = { resolveOrgTaxRate, calculateTax };

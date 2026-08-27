import { positionRepository, type OpenPositionRow } from '../infrastructure/repositories/position.repository.js';
import {
  glControlRepository,
} from '../infrastructure/repositories/gl-control.repository.js';
import { classifyAccountType } from '../domain/ledger-aggregate.js';

/**
 * Position Reconciliation — Phase 2 Step 1 (READ-ONLY).
 *
 * Compares, per organisation:
 *   • financial_entitlements open position   (SINGLE authoritative subledger)
 * vs
 *   • GL control-account position            (accounting mirror: 2200 / 1160,
 *     discovered dynamically from mapping concepts org_payable /
 *     merchant_payable / receivable_from_org)
 *
 * RULES:
 *   - zero difference  ⇒ reconciled
 *   - non-zero         ⇒ drift (reported; NEVER auto-adjusted)
 *   - pure SELECTs only — this service must never mutate either source
 *   - historical accounting records are never touched
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface OrgReconciliationReport {
  organisationId: number;
  entitlements: {
    payableToOrg: number;      // CourtZon owes org (collector=courtzon legs)
    receivableFromOrg: number; // Org owes CourtZon (collector=org legs)
    net: number;
    openCount: number;
  };
  gl: {
    accounts: Array<{ code: string; accountId: number; debits: number; credits: number; signedBalance: number }>;
    payableToOrg: number;      // credit-positive on liability-type control accounts
    receivableFromOrg: number; // debit-positive on asset-type control accounts
    net: number;
  };
  difference: number;
  direction: 'PAYABLE_TO_ORGANISATION' | 'RECEIVABLE_FROM_ORGANISATION' | 'SETTLED_UP';
  reconciled: boolean;
  sources: Array<{
    sourceType: string;
    sourceId: number;
    entitlementCount: number;
    contributionToNet: number;
    statuses: string[];
  }>;
}

export class ReconciliationService {
  /**
   * Signed entitlement contribution to the NET position for one row.
   * Mirrors unified-settlement-calc direction math:
   *   EARNING/ORG_ADJUSTMENT with collector='courtzon' → increases owed-to-org (+)
   *   COMMISSION/COURTZON_ADJUSTMENT with collector='org' → increases owed-by-org (−)
   * Everything else (e.g. collector='org' earnings) is not a cross-party obligation.
   */
  private static rowContribution(row: OpenPositionRow): number {
    const amount = Number(row.amount);
    const isPayableSide =
      (row.entitlement_type === 'ORGANIZATION_EARNING' || row.entitlement_type === 'ORGANIZATION_ADJUSTMENT')
      && row.collector === 'courtzon';
    const isReceivableSide =
      (row.entitlement_type === 'COURTZON_COMMISSION' || row.entitlement_type === 'COURTZON_ADJUSTMENT')
      && row.collector === 'org';
    if (isPayableSide) return round2(amount);
    if (isReceivableSide) return round2(-amount);
    return 0;
  }

  async reconcileOrganisation(orgId: number): Promise<OrgReconciliationReport> {
    // ── Entitlement side (authoritative) ──
    const openRows = await positionRepository.openPositions(orgId);
    const entPayable = round2(openRows
      .filter((r) => r.collector === 'courtzon'
        && (r.entitlement_type === 'ORGANIZATION_EARNING' || r.entitlement_type === 'ORGANIZATION_ADJUSTMENT'))
      .reduce((s, r) => s + Number(r.amount), 0));
    const entReceivable = round2(openRows
      .filter((r) => r.collector === 'org'
        && (r.entitlement_type === 'COURTZON_COMMISSION' || r.entitlement_type === 'COURTZON_ADJUSTMENT'))
      .reduce((s, r) => s + Number(r.amount), 0));
    const entNet = round2(entPayable - entReceivable);

    // ── GL side (mirror) ──
    const controlAccounts = await glControlRepository.resolveControlAccountIds();
    const totals = await glControlRepository.controlTotalsForOrg(orgId, controlAccounts.map((a) => a.id));

    // Liability control (2200-family): credit-positive = CourtZon owes org.
    // Asset control (1160-family): debit-positive = org owes CourtZon.
    // Direction comes from the account's semantic COA classification
    // (account_type: liability/asset), NOT from a code-prefix convention.
    // F-24: a future control account whose code does not start with "2"/"1"
    // is still classified correctly by its account_type.
    let glPayable = 0;
    let glReceivable = 0;
    const glAccounts = controlAccounts.map((acc) => {
      const t = totals.find((x) => x.accountId === acc.id);
      const debits = round2(t?.debits ?? 0);
      const credits = round2(t?.credits ?? 0);
      const isLiabilityControl = classifyAccountType(acc.account_type) === 'liability';
      if (isLiabilityControl) glPayable += round2(credits - debits);
      else glReceivable += round2(debits - credits);
      return {
        code: acc.code,
        accountId: acc.id,
        debits,
        credits,
        signedBalance: isLiabilityControl ? round2(credits - debits) : round2(debits - credits),
      };
    });
    const glNet = round2(glPayable - glReceivable);

    // ── Affected sources (open entitlements grouped by source) ──
    const bySource = new Map<string, {
      sourceType: string; sourceId: number; entitlementCount: number; contributionToNet: number; statuses: Set<string>;
    }>();
    for (const row of openRows) {
      const key = `${row.source_type}#${row.source_id}`;
      let entry = bySource.get(key);
      if (!entry) {
        entry = { sourceType: row.source_type, sourceId: Number(row.source_id), entitlementCount: 0, contributionToNet: 0, statuses: new Set() };
        bySource.set(key, entry);
      }
      entry.entitlementCount += 1;
      entry.contributionToNet = round2(entry.contributionToNet + ReconciliationService.rowContribution(row));
      entry.statuses.add(row.status);
    }

    const difference = round2(entNet - glNet);
    return {
      organisationId: orgId,
      entitlements: { payableToOrg: entPayable, receivableFromOrg: entReceivable, net: entNet, openCount: openRows.length },
      gl: {
        accounts: glAccounts,
        payableToOrg: round2(glPayable),
        receivableFromOrg: round2(glReceivable),
        net: glNet,
      },
      difference,
      direction: difference > 0 ? 'PAYABLE_TO_ORGANISATION' : difference < 0 ? 'RECEIVABLE_FROM_ORGANISATION' : 'SETTLED_UP',
      reconciled: Math.abs(difference) < 0.01,
      sources: [...bySource.values()].map((s) => ({ ...s, statuses: [...s.statuses] })),
    };
  }

  /** Union of organisations present on either side, reconciled individually. */
  async reconcileAll(opts?: { limit?: number }): Promise<{ summary: { totalOrgs: number; reconciled: number; drifted: number }; reports: OrgReconciliationReport[] }> {
    const controlAccounts = await glControlRepository.resolveControlAccountIds();
    const [entOrgs, glOrgs] = await Promise.all([
      positionRepository.openPositionsOrgIds(),
      glControlRepository.orgsWithControlActivity(controlAccounts.map((a) => a.id)),
    ]);
    const orgSet = new Set<number>([...entOrgs, ...glOrgs]);
    const limit = opts?.limit ?? 200;
    const reports: OrgReconciliationReport[] = [];
    for (const orgId of [...orgSet].sort((a, b) => a - b).slice(0, limit)) {
      reports.push(await this.reconcileOrganisation(orgId));
    }
    const drifted = reports.filter((r) => !r.reconciled).length;
    return { summary: { totalOrgs: reports.length, reconciled: reports.length - drifted, drifted }, reports };
  }
}

export const reconciliationService = new ReconciliationService();

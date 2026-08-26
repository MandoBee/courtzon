import { positionRepository, OPEN_POSITION_STATUSES } from '../infrastructure/repositories/position.repository.js';

/**
 * PositionService — Phase 2 Step 1.
 *
 * THE single application-level facade for organisation/seller financial
 * positions. Every consumer asking "what does this org owe / is it owed"
 * must go through this service.
 *
 * SINGLE AUTHORITY RULE: reads exclusively from `financial_entitlements`.
 * The GL (general_ledger) is CourtZon's accounting book — compared against
 * these positions by ReconciliationService, never treated as the source of
 * an organisation's position.
 *
 * Entitlement semantics (Model B):
 *   ORGANIZATION_EARNING     (+)  org's share of a revenue event
 *   COURTZON_COMMISSION      (+)  platform commission on a revenue event
 *   ORGANIZATION_ADJUSTMENT  (signed) correction to the org's position
 *   COURTZON_ADJUSTMENT      (signed) correction to CourtZon's position
 *   collector: 'courtzon' = platform collected the money;
 *              'org'      = the organisation collected it (cash/COD)
 *
 * Direction math mirrors unified-settlement-calc so settlement previews and
 * this facade can never disagree:
 *   owedToOrg  = Σ(EARNING + ORG_ADJUSTMENT)   with collector='courtzon'
 *   owedByOrg  = Σ(COMMISSION + CZ_ADJUSTMENT) with collector='org'
 *   net        = owedToOrg − owedByOrg   (>0 ⇒ payable to org, <0 ⇒ receivable)
 */

export type PositionDirection = 'PAYABLE_TO_ORGANISATION' | 'RECEIVABLE_FROM_ORGANISATION' | 'SETTLED_UP';

export interface BalanceBucket {
  amount: number;
  count: number;
}

export interface StatusBalances {
  pending: BalanceBucket;
  available: BalanceBucket;
  held: BalanceBucket;          // ON_HOLD without a settlement reservation (disputes)
  reserved: BalanceBucket;      // ON_HOLD reserved for a settlement
  settled: BalanceBucket;
}

export interface CollectorSplit {
  courtzonCollected: number;
  orgCollected: number;
}

export interface OpenPosition {
  owedToOrg: number;
  owedByOrg: number;
  net: number;
  direction: PositionDirection;
  openCount: number;
}

export interface OrganisationPositionSummary {
  organisationId: number;
  balances: StatusBalances;
  earnings: { open: number; lifetime: number } & CollectorSplit;
  commission: { open: number; lifetime: number } & CollectorSplit;
  adjustments: { organisationAdjustments: number; courtzonAdjustments: number };
  position: OpenPosition;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export class PositionService {
  /** Five status buckets (reserved split out of ON_HOLD). */
  async getStatusBalances(orgId: number): Promise<StatusBalances> {
    const rows = await positionRepository.statusBalances(orgId);
    const buckets: StatusBalances = {
      pending: { amount: 0, count: 0 },
      available: { amount: 0, count: 0 },
      held: { amount: 0, count: 0 },
      reserved: { amount: 0, count: 0 },
      settled: { amount: 0, count: 0 },
    };
    for (const r of rows) {
      const amount = round2(Number(r.total));
      const count = Number(r.cnt);
      if (r.status === 'PENDING') buckets.pending = { amount, count };
      else if (r.status === 'AVAILABLE') buckets.available = { amount, count };
      else if (r.status === 'ON_HOLD') {
        if (Number(r.isReserved) === 1) buckets.reserved = { amount, count };
        else buckets.held = { amount, count };
      } else if (r.status === 'SETTLED') buckets.settled = { amount, count };
    }
    return buckets;
  }

  /**
   * Signed totals per entitlement type × collector.
   * statuses defaults to OPEN positions only; pass undefined+flag for lifetime.
   */
  async getTypeCollectorBreakdown(orgId: number, opts?: { openOnly?: boolean }): Promise<Map<string, number>> {
    const statuses = opts?.openOnly ? OPEN_POSITION_STATUSES : undefined;
    const rows = await positionRepository.collectorBreakdown(orgId, statuses);
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.entitlementType}|${r.collector ?? ''}|${r.status}`;
      map.set(key, round2(Number(r.total)));
    }
    return map;
  }

  private static sumBreakdown(
    map: Map<string, number>,
    type: string,
    collector: 'courtzon' | 'org' | null,
  ): number {
    let total = 0;
    for (const [key, value] of map) {
      const [t, c] = key.split('|');
      if (t === type && (collector == null || c === collector)) total += value;
    }
    return round2(total);
  }

  private static sumAll(map: Map<string, number>, type: string): number {
    return round2([...map.entries()].filter(([k]) => k.startsWith(`${type}|`)).reduce((s, [, v]) => s + v, 0));
  }

  /** Open (unsettled / unreversed) receivable-payable position. */
  async getOpenPosition(orgId: number): Promise<OpenPosition> {
    const map = await this.getTypeCollectorBreakdown(orgId, { openOnly: true });
    const owedToOrg = round2(PositionService.sumBreakdown(map, 'ORGANIZATION_EARNING', 'courtzon')
      + PositionService.sumBreakdown(map, 'ORGANIZATION_ADJUSTMENT', 'courtzon'));
    const owedByOrg = round2(PositionService.sumBreakdown(map, 'COURTZON_COMMISSION', 'org')
      + PositionService.sumBreakdown(map, 'COURTZON_ADJUSTMENT', 'org'));
    const net = round2(owedToOrg - owedByOrg);
    const direction: PositionDirection =
      net > 0 ? 'PAYABLE_TO_ORGANISATION' : net < 0 ? 'RECEIVABLE_FROM_ORGANISATION' : 'SETTLED_UP';
    const openCount = await positionRepository.openPositionCount(orgId);
    return { owedToOrg, owedByOrg, net, direction, openCount };
  }

  /** Full canonical summary for one organisation/seller. */
  async getOrganisationPositionSummary(orgId: number): Promise<OrganisationPositionSummary> {
    const balances = await this.getStatusBalances(orgId);
    const openMap = await this.getTypeCollectorBreakdown(orgId, { openOnly: true });
    const lifeMap = await this.getTypeCollectorBreakdown(orgId);

    const position = await this.getOpenPosition(orgId);

    return {
      organisationId: orgId,
      balances,
      earnings: {
        open: round2(PositionService.sumAll(openMap, 'ORGANIZATION_EARNING')),
        lifetime: round2(PositionService.sumAll(lifeMap, 'ORGANIZATION_EARNING')),
        courtzonCollected: round2(PositionService.sumBreakdown(lifeMap, 'ORGANIZATION_EARNING', 'courtzon')),
        orgCollected: round2(PositionService.sumBreakdown(lifeMap, 'ORGANIZATION_EARNING', 'org')),
      },
      commission: {
        open: round2(PositionService.sumAll(openMap, 'COURTZON_COMMISSION')),
        lifetime: round2(PositionService.sumAll(lifeMap, 'COURTZON_COMMISSION')),
        courtzonCollected: round2(PositionService.sumBreakdown(lifeMap, 'COURTZON_COMMISSION', 'courtzon')),
        orgCollected: round2(PositionService.sumBreakdown(lifeMap, 'COURTZON_COMMISSION', 'org')),
      },
      adjustments: {
        organisationAdjustments: round2(PositionService.sumAll(lifeMap, 'ORGANIZATION_ADJUSTMENT')),
        courtzonAdjustments: round2(PositionService.sumAll(lifeMap, 'COURTZON_ADJUSTMENT')),
      },
      position,
    };
  }
}

export const positionService = new PositionService();

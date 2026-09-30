import { reportsRepository } from '../infrastructure/repositories/reports.repository.js';
import { tournamentFinancesService } from '../../financial/application/tournament-finances.service.js';

type Filters = { dateFrom?: string; dateTo?: string; groupBy?: 'day' | 'week' | 'month'; limit?: number; action?: string };

/**
 * G11 Phase 4 — LEDGER-BACKED tournament report aggregation.
 * Independently aggregates per-currency P&L buckets from the authoritative
 * posted ledger. Never mixes currencies; never uses synthetic entry_fee ×
 * commission_rate formulas.
 */
async function tournamentOverviewLedger(filters: Filters): Promise<Record<string, unknown>> {
  const rows = await reportsRepository.tournamentOverviewBase({ dateFrom: filters.dateFrom, dateTo: filters.dateTo });
  const totals: Record<string, number> = {
    total_tournaments: rows.length,
    completed: rows.filter((r: any) => r.status === 'completed').length,
    in_progress: rows.filter((r: any) => r.status === 'in_progress').length,
    total_registrations: rows.reduce((s: number, r: any) => s + Number(r.registrations ?? 0), 0),
  };
  const currencies: Record<string, { revenue: number; prizeExpense: number; commissionExpense: number; platformCommission: number; net: number; tournaments: number }> = {};
  for (const row of rows as any[]) {
    let report;
    try {
      report = await tournamentFinancesService.forTournament(Number(row.id));
    } catch {
      continue; // deleted/orphaned → skip (base query already filters).
    }
    const code = String(report.currency || row.currency || 'EGP');
    const b = (currencies[code] ??= {
      revenue: 0, prizeExpense: 0, commissionExpense: 0, platformCommission: 0, net: 0, tournaments: 0,
    });
    b.revenue += report.revenue.total;
    b.prizeExpense += report.expenses.cashPrizes;
    b.commissionExpense += report.expenses.commissionExpense;
    b.platformCommission += report.platform.commissionRevenue;
    b.net += report.net;
    b.tournaments += 1;
  }
  // Flat per-currency KPIs keep the generic KPI renderer meaningful; the
  // nested `currencies` object is programmatic (never numerically mixed).
  for (const [code, b] of Object.entries(currencies)) {
    totals[`${code}_revenue`] = Math.round((b.revenue + Number.EPSILON) * 100) / 100;
    totals[`${code}_expenses`] = Math.round(((b.prizeExpense + b.commissionExpense) + Number.EPSILON) * 100) / 100;
    totals[`${code}_net`] = Math.round((b.net + Number.EPSILON) * 100) / 100;
    totals[`${code}_commission`] = Math.round((b.platformCommission + Number.EPSILON) * 100) / 100;
  }
  return { ...totals, currencies };
}

export const reportsService = {
  // Financial
  financialSummary(f: Filters) { return reportsRepository.revenueSummary(f); },
  revenueBySource(f: Filters) { return reportsRepository.revenueBySource(f); },
  revenueTimeline(f: Filters) { return reportsRepository.revenueTimeline(f); },
  paymentMethods(f: Filters) { return reportsRepository.paymentMethodsBreakdown(f); },
  settlements(f: Filters) { return reportsRepository.settlementSummary(f); },

  // Bookings
  bookingVolume(f: Filters) { return reportsRepository.bookingVolume(f); },
  bookingsByType(f: Filters) { return reportsRepository.bookingsByType(f); },
  bookingsBySport(f: Filters) { return reportsRepository.bookingsBySport(f); },
  peakHours(f: Filters) { return reportsRepository.peakHoursAnalysis(f); },
  cancellationRate(f: Filters) { return reportsRepository.cancellationRate(f); },

  // Users
  userRegistrations(f: Filters) { return reportsRepository.userRegistrations(f); },
  userDemographics(f: Filters) { return reportsRepository.userDemographics(); },
  userGenderDistribution(f: Filters) { return reportsRepository.userGenderDistribution(); },
  activeUsers(f: Filters) { return reportsRepository.activeUsers(f); },
  userRoles(f: Filters) { return reportsRepository.userRolesDistribution(); },

  // Organisations
  topOrgs(f: Filters) { return reportsRepository.topOrganisations(f); },
  orgTypeDist(f: Filters) { return reportsRepository.orgTypeDistribution(); },
  subscriptionStatus(f: Filters) { return reportsRepository.subscriptionStatus(f); },

  // Marketplace
  marketplaceOverview(f: Filters) { return reportsRepository.marketplaceOverview(f); },
  topProducts(f: Filters) { return reportsRepository.topProducts(f); },
  orderStatusDist(f: Filters) { return reportsRepository.orderStatusDistribution(f); },

  // Tournaments
  tournamentOverview(f: Filters) { return tournamentOverviewLedger(f); },
  tournamentParticipation(f: Filters) { return reportsRepository.tournamentParticipation(f); },

  // Coaches
  coachPerformance(f: Filters) { return reportsRepository.coachPerformance(f); },

  // Ads
  adsPerformance(f: Filters) { return reportsRepository.adsPerformance(f); },
  adsDailySpend(f: Filters) { return reportsRepository.adsDailySpend(f as any); },

  // Audit
  auditActivity(f: Filters) { return reportsRepository.auditActivity(f); },
  topAuditEntities(f: Filters) { return reportsRepository.topAuditEntities(f); },
};

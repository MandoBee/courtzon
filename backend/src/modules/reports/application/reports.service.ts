import { reportsRepository } from '../infrastructure/repositories/reports.repository.js';

type Filters = { dateFrom?: string; dateTo?: string; groupBy?: 'day' | 'week' | 'month'; limit?: number; action?: string };

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
  tournamentOverview(f: Filters) { return reportsRepository.tournamentOverview(f); },
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

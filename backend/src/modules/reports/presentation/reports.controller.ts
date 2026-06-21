import type { FastifyRequest, FastifyReply } from 'fastify';
import { reportsService } from '../application/reports.service.js';

function filters(req: FastifyRequest) {
  const q = req.query as any;
  return {
    dateFrom: q.dateFrom || undefined,
    dateTo: q.dateTo || undefined,
    groupBy: q.groupBy || undefined,
    limit: q.limit ? Number(q.limit) : undefined,
    action: q.action || undefined,
  };
}

export async function financialSummary(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.financialSummary(filters(req)) });
}
export async function revenueBySource(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.revenueBySource(filters(req)) });
}
export async function revenueTimeline(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.revenueTimeline(filters(req)) });
}
export async function paymentMethods(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.paymentMethods(filters(req)) });
}
export async function settlements(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.settlements(filters(req)) });
}
export async function bookingVolume(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.bookingVolume(filters(req)) });
}
export async function bookingsByType(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.bookingsByType(filters(req)) });
}
export async function bookingsBySport(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.bookingsBySport(filters(req)) });
}
export async function peakHours(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.peakHours(filters(req)) });
}
export async function cancellationRate(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.cancellationRate(filters(req)) });
}
export async function userRegistrations(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.userRegistrations(filters(req)) });
}
export async function userDemographics(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.userDemographics(filters(req)) });
}
export async function userGenderDist(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.userGenderDistribution(filters(req)) });
}
export async function activeUsers(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.activeUsers(filters(req)) });
}
export async function userRoles(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.userRoles(filters(req)) });
}
export async function topOrgs(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.topOrgs(filters(req)) });
}
export async function orgTypeDist(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.orgTypeDist(filters(req)) });
}
export async function subscriptionStatus(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.subscriptionStatus(filters(req)) });
}
export async function marketplaceOverview(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.marketplaceOverview(filters(req)) });
}
export async function topProducts(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.topProducts(filters(req)) });
}
export async function orderStatusDist(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.orderStatusDist(filters(req)) });
}
export async function tournamentOverview(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.tournamentOverview(filters(req)) });
}
export async function tournamentParticipation(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.tournamentParticipation(filters(req)) });
}
export async function coachPerformance(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.coachPerformance(filters(req)) });
}
export async function adsPerformance(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.adsPerformance(filters(req)) });
}
export async function adsDailySpend(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.adsDailySpend(filters(req)) });
}
export async function auditActivity(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.auditActivity(filters(req)) });
}
export async function topAuditEntities(req: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await reportsService.topAuditEntities(filters(req)) });
}

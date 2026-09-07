import type { FastifyRequest, FastifyReply } from 'fastify';
import { CoachSearchSchema, BookSessionSchema, CoachAvailabilitySchema } from './scheduling.dto.js';
import { SchedulingEngine, type PricingFunction } from '../scheduling-engine.js';
import { CoachProvider } from '../providers/coach.provider.js';
import { CourtProvider } from '../providers/court.provider.js';
import { pricingEngine } from '../../booking/domain/pricing-engine.js';
import { activitiesRepository } from '../../activities/infrastructure/repositories/activities.repository.js';
import { resourceRepository } from '../../organisations/infrastructure/repositories/resource.repository.js';
import { schedulingBookingService } from '../application/scheduling-booking.service.js';
import { calculateCoachSessionPrice } from '../application/coach-pricing.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { recordAudit } from '../../audit-log/index.js';
import type { ResourceProvider } from '../types.js';

const log = createModuleLogger('scheduling');
const engine = new SchedulingEngine();

function buildPricingFunction(coachProfiles: Map<number, any>): PricingFunction {
  return async (resourceType, resourceId, startTime, endTime) => {
    if (resourceType === 'court') {
      const result = await pricingEngine.calculatePrice(resourceId, startTime, endTime);
      return result.totalPrice;
    }
    if (resourceType === 'coach') {
      // Coach session duration == court booking duration (same window).
      // Price = hourly rate prorated by the shared canonical helper. The rate is
      // read from the preloaded candidate profile — no per-coach DB query.
      const profile = coachProfiles.get(resourceId);
      const hourlyRate = profile ? Number(profile.hourly_rate ?? 0) : 0;
      if (!hourlyRate) return 0;
      return calculateCoachSessionPrice(hourlyRate, startTime, endTime);
    }
    return 0;
  };
}

const COACH_SESSION_CONFIG = {
  activityType: 'coach_session',
  requiredResources: [
    { resourceType: 'coach' },
    { resourceType: 'court' },
  ],
  crossConstraints: [
    { type: 'sport_match' as const, from: 'coach', to: 'court' },
    { type: 'location_match' as const, from: 'coach', to: 'court' },
  ],
};

async function discoverProviders(input: {
  coachId?: number;
  resourceId?: number;
  sportId?: number;
  branchId?: number;
}): Promise<{ providers: ResourceProvider[]; coachProfiles: Map<number, any> }> {
  const providers: ResourceProvider[] = [];
  const coachProfiles = new Map<number, any>();

  if (input.coachId && input.resourceId) {
    const profile = await activitiesRepository.findCoachById(input.coachId);
    if (profile) coachProfiles.set(input.coachId, profile);
    const loc = (await activitiesRepository.getCoachServiceLocationBranchIdsByCoachIds([input.coachId])).get(input.coachId) ?? [];
    providers.push(new CoachProvider(input.coachId, profile, loc), new CourtProvider(input.resourceId));
  } else if (input.coachId) {
    const profile = await activitiesRepository.findCoachById(input.coachId);
    if (profile) coachProfiles.set(input.coachId, profile);
    const loc = (await activitiesRepository.getCoachServiceLocationBranchIdsByCoachIds([input.coachId])).get(input.coachId) ?? [];
    providers.push(new CoachProvider(input.coachId, profile, loc));
    if (input.branchId) {
      const courts = await resourceRepository.findByBranch(input.branchId);
      for (const court of courts) {
        if (court.is_active) providers.push(new CourtProvider(court.id));
      }
    }
  } else if (input.resourceId) {
    const court = await resourceRepository.findById(input.resourceId);
    if (court) {
      providers.push(new CourtProvider(input.resourceId));
      // Flow B: Only coaches with explicit SERVICE ACCESS to this court's branch
      // (coach_service_locations) AND satisfying the branch's coach policy may be
      // returned as candidates. Both are factored in by listEligibleCoachesAtBranch.
      const eligible = await activitiesRepository.listEligibleCoachesAtBranch(
        court.branch_id,
        input.sportId,
      );
      const coachIds = (eligible as any[]).map((c) => Number(c.id));
      // Preload every candidate's profile + explicit service locations in 2
      // queries (instead of ~5 per coach) while keeping identical eligibility.
      for (const coach of eligible as any[]) coachProfiles.set(Number(coach.id), coach);
      const locMap = await activitiesRepository.getCoachServiceLocationBranchIdsByCoachIds(coachIds);
      for (const coach of eligible as any[]) {
        const cid = Number(coach.id);
        const loc = locMap.get(cid) ?? [];
        providers.push(new CoachProvider(cid, coach, loc));
      }
    }
  } else {
    const coaches = await activitiesRepository.findCoaches({
      sportId: input.sportId,
      isAvailable: true,
      page: 1,
      limit: 50,
    });
    const coachIds = (coaches as any[]).map((c) => Number(c.id));
    for (const coach of coaches as any[]) coachProfiles.set(Number(coach.id), coach);
    const locMap = await activitiesRepository.getCoachServiceLocationBranchIdsByCoachIds(coachIds);
    for (const coach of coaches as any[]) {
      const cid = Number(coach.id);
      const loc = locMap.get(cid) ?? [];
      providers.push(new CoachProvider(cid, coach, loc));
    }
  }

  return { providers, coachProfiles };
}

export async function searchCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const input = CoachSearchSchema.parse(request.body);
  const startMs = Date.now();

  log.info({ date: input.date, coachId: input.coachId, resourceId: input.resourceId, duration: input.durationMinutes }, 'Search requested');

  const providers = await discoverProviders(input);
  log.debug({ providerCount: providers.providers.length, types: providers.providers.map(p => p.resourceType) }, 'Providers discovered');

  const candidates = await engine.search(
    input as any,
    providers.providers,
    COACH_SESSION_CONFIG,
    buildPricingFunction(providers.coachProfiles),
  );

  const elapsedMs = Date.now() - startMs;
  log.info({ candidateCount: candidates.length, elapsedMs }, 'Search completed');

  return reply.send({ data: candidates });
}

export async function getCoachAvailabilityHandler(request: FastifyRequest, reply: FastifyReply) {
  const validated = CoachAvailabilitySchema.parse({
    coachId: Number((request.params as any).coachId),
    date: (request.query as any).date,
    dayOfWeek: Number((request.query as any).dayOfWeek),
  });

  log.debug({ coachId: validated.coachId, date: validated.date }, 'Availability requested');

  const provider = new CoachProvider(validated.coachId);
  const slots = await provider.getAvailableSlots(validated.date, validated.dayOfWeek);

  log.debug({ coachId: validated.coachId, slotCount: slots.length }, 'Availability returned');

  return reply.send({
    data: {
      coachId: validated.coachId,
      date: validated.date,
      dayOfWeek: validated.dayOfWeek,
      slots,
    },
  });
}

export async function bookSessionHandler(request: FastifyRequest, reply: FastifyReply) {
  const input = BookSessionSchema.parse(request.body);
  const userId = (request as any).userId;
  const startMs = Date.now();

  log.info({ userId, coachId: input.coachId, resourceId: input.resourceId, date: input.date, startTime: input.startTime, endTime: input.endTime }, 'Book session requested');

  const result = await schedulingBookingService.bookSession(input, userId);

  const elapsedMs = Date.now() - startMs;
  log.info({ bookingId: result.bookingId, sessionId: result.sessionId, status: result.status, elapsedMs }, 'Book session completed');

  // Emit notification event so the coach receives a booking notification
  eventBusV2.emit('coaching:session-scheduled', {
    sessionId: result.sessionId,
    coachId: input.coachId,
    userId,
    startTime: new Date(`${input.date}T${input.startTime}:00`),
  });

  recordAudit({
    actorId: userId,
    action: 'COACH.SESSION_BOOKED',
    entityType: 'coach_session',
    entityId: result.sessionId,
    afterState: { coachId: input.coachId, resourceId: input.resourceId, date: input.date, startTime: input.startTime, endTime: input.endTime },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send(result);
}

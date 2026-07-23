import type { FastifyRequest, FastifyReply } from 'fastify';
import { CoachSearchSchema, BookSessionSchema, CoachAvailabilitySchema } from './scheduling.dto.js';
import { SchedulingEngine, type PricingFunction } from '../scheduling-engine.js';
import { CoachProvider } from '../providers/coach.provider.js';
import { CourtProvider } from '../providers/court.provider.js';
import { pricingEngine } from '../../booking/domain/pricing-engine.js';
import { activitiesRepository } from '../../activities/infrastructure/repositories/activities.repository.js';
import { resourceRepository } from '../../organisations/infrastructure/repositories/resource.repository.js';
import { schedulingBookingService } from '../application/scheduling-booking.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { recordAudit } from '../../audit-log/index.js';
import type { ResourceProvider } from '../types.js';

const log = createModuleLogger('scheduling');
const engine = new SchedulingEngine();

function buildPricingFunction(): PricingFunction {
  return async (resourceType, resourceId, startTime, endTime) => {
    if (resourceType === 'court') {
      const result = await pricingEngine.calculatePrice(resourceId, startTime, endTime);
      return result.totalPrice;
    }
    if (resourceType === 'coach') {
      const profile = await activitiesRepository.findCoachById(resourceId);
      if (!profile?.hourly_rate) return 0;
      const hourlyRate = Number(profile.hourly_rate);
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      const hours = ((endH * 60 + endM) - (startH * 60 + startM)) / 60;
      return hourlyRate * hours;
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
}): Promise<ResourceProvider[]> {
  const providers: ResourceProvider[] = [];

  if (input.coachId && input.resourceId) {
    providers.push(new CoachProvider(input.coachId), new CourtProvider(input.resourceId));
  } else if (input.coachId) {
    providers.push(new CoachProvider(input.coachId));
    if (input.branchId) {
      const courts = await resourceRepository.findByBranch(input.branchId);
      for (const court of courts) {
        if (court.is_active) providers.push(new CourtProvider(court.id));
      }
    }
  } else if (input.resourceId) {
    providers.push(new CourtProvider(input.resourceId));
    const coaches = await activitiesRepository.findCoaches({
      sportId: input.sportId,
      isAvailable: true,
      page: 1,
      limit: 50,
    });
    for (const coach of coaches) {
      providers.push(new CoachProvider(coach.id));
    }
  } else {
    const coaches = await activitiesRepository.findCoaches({
      sportId: input.sportId,
      isAvailable: true,
      page: 1,
      limit: 50,
    });
    for (const coach of coaches) {
      providers.push(new CoachProvider(coach.id));
    }
  }

  return providers;
}

export async function searchCoachHandler(request: FastifyRequest, reply: FastifyReply) {
  const input = CoachSearchSchema.parse(request.body);
  const startMs = Date.now();

  log.info({ date: input.date, coachId: input.coachId, resourceId: input.resourceId, duration: input.durationMinutes }, 'Search requested');

  const providers = await discoverProviders(input);
  log.debug({ providerCount: providers.length, types: providers.map(p => p.resourceType) }, 'Providers discovered');

  const candidates = await engine.search(
    input as any,
    providers,
    COACH_SESSION_CONFIG,
    buildPricingFunction(),
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

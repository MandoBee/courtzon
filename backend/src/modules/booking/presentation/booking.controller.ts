import type { FastifyRequest, FastifyReply } from 'fastify';
import { bookingService } from '../application/booking.service.js';
import { CreateBookingSchema, CancelBookingSchema, BookingsQuerySchema, StartMatchmakingSchema } from './booking.dto.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { recordAudit } from '../../audit-log/index.js';
import { eventBus } from '../../../shared/event-bus/index.js';

export async function createBookingHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateBookingSchema.parse(request.body);
  const userId = (request as any).userId;
  const result = await bookingService.createBooking(body, userId);

  eventBus.emit('booking:created', {
    bookingId: result.id,
    userId,
    courtId: body.resourceId || 0,
    startTime: new Date(`${body.bookingDate}T${body.startTime}`),
    endTime: new Date(`${body.bookingDate}T${body.endTime}`),
  });

  return reply.status(201).send(result);
}

export async function getUserBookingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const query = BookingsQuerySchema.parse(request.query);
  const result = await bookingService.getUserBookings(
    userId, query.status, query.from, query.to, query.page, query.limit,
    query.sortBy, query.lat, query.lng
  );
  return reply.send(result);
}

export async function getOrganisationBookingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId } = request.params as any;
  const { date, status } = request.query as any;
  const bookings = await bookingService.getOrganisationBookings(Number(orgId), date, status);
  return reply.send({ data: bookings });
}

export async function getBookingHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const booking = await bookingService.getBooking(Number(id));
  const isOwner = booking.user_id === userId;
  const isAcceptedParticipant = await bookingService.isAcceptedParticipant(Number(id), userId);
  if (!isOwner && !isAcceptedParticipant) throw new ForbiddenError('You can only view your own bookings');
  return reply.send(booking);
}

export async function cancelBookingHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const body = CancelBookingSchema.parse(request.body);
  const booking = await bookingService.cancelBooking(Number(id), userId, body.reason);

  eventBus.emit('booking:cancelled', {
    bookingId: Number(id),
    userId,
    reason: body.reason,
  });

  return reply.send(booking);
}

export async function getResourceSlotsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { resourceId } = request.params as any;
  const { date } = request.query as any;
  const slots = await bookingService.getResourceSlots(Number(resourceId), date);
  return reply.send({ data: slots });
}

export async function checkInHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const booking = await bookingService.checkIn(Number(id), userId);
  return reply.send(booking);
}

export async function updateBookingStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { status } = request.body as any;
  const userId = (request as any).userId;
  await bookingService.updateBookingStatus(Number(id), status, userId);
  recordAudit({
    actorId: userId ?? null,
    action: 'BOOKING.UPDATE_STATUS',
    entityType: 'booking',
    entityId: Number(id),
    afterState: { status },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  if (status === 'confirmed') {
    eventBus.emit('booking:confirmed', {
      bookingId: Number(id),
      userId,
    });
  } else if (status === 'cancelled') {
    eventBus.emit('booking:cancelled', {
      bookingId: Number(id),
      userId,
      reason: undefined,
    });
  }

  return reply.send({ success: true });
}

export async function getAllBookingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { orgId, branchId, resourceId, resource, branch, orgName, date, status, paymentStatus, bookingType, page, limit } = request.query as any;
  const filters: any = {};
  if (orgId) filters.orgId = Number(orgId);
  if (branchId) filters.branchId = Number(branchId);
  if (resourceId) filters.resourceId = Number(resourceId);
  if (resource) filters.resource = resource;
  if (branch) filters.branch = branch;
  if (orgName) filters.orgName = orgName;
  if (date) filters.date = date;
  if (status) filters.status = status;
  if (paymentStatus) filters.paymentStatus = paymentStatus;
  if (bookingType) filters.bookingType = bookingType;
  if (page) filters.page = Number(page);
  if (limit) filters.limit = Number(limit);
  const { rows, total } = await bookingService.getAllBookings(filters);
  return reply.send({ data: rows, total, page: filters.page || 1, limit: filters.limit || 20 });
}

export async function updatePaymentStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { paymentStatus } = request.body as any;
  const userId = (request as any).userId;
  await bookingService.updatePaymentStatus(Number(id), paymentStatus, userId);
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'BOOKING.UPDATE_PAYMENT',
    entityType: 'booking',
    entityId: Number(id),
    afterState: { paymentStatus },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function startMatchmakingHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const body = StartMatchmakingSchema.parse(request.body);
  const result = await bookingService.startMatchmaking(Number(id), userId, body);
  return reply.send(result);
}

export async function getMatchmakingCandidatesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const result = await bookingService.getMatchmakingCandidates(Number(id), userId);
  return reply.send(result);
}

export async function applyToBookingHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const result = await bookingService.applyToBooking(Number(id), userId);
  return reply.send(result);
}

export async function cancelApplicationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { invitationId } = request.params as any;
  const userId = (request as any).userId;
  await bookingService.cancelApplication(Number(invitationId), userId);
  return reply.send({ success: true });
}

export async function respondToApplicantHandler(request: FastifyRequest, reply: FastifyReply) {
  const { invitationId } = request.params as any;
  const userId = (request as any).userId;
  const { action } = request.body as any;
  const result = await bookingService.respondToApplicant(Number(invitationId), userId, action);
  return reply.send(result);
}

export async function getPublicMatchesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const query = request.query as any;
  const matches = await bookingService.getPublicMatches(userId, {
    lat: query.lat ? Number(query.lat) : undefined,
    lng: query.lng ? Number(query.lng) : undefined,
    date: query.date || undefined,
  });
  return reply.send({ data: matches });
}

export async function getBookingApplicantsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const result = await bookingService.getBookingApplicants(Number(id), userId);
  return reply.send(result);
}

export async function fulfillBookingIntentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { intentId } = request.params as any;
  const result = await bookingService.fulfillBookingIntent(Number(intentId));
  return reply.send(result);
}

export async function getBookingIntentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { intentId } = request.params as any;
  const intent = await bookingService.getBookingIntent(Number(intentId));
  if (!intent) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Booking intent not found' });
  return reply.send(intent);
}

export async function cancelBookingIntentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { intentId } = request.params as any;
  const result = await bookingService.cancelBookingIntent(Number(intentId));
  return reply.send(result);
}

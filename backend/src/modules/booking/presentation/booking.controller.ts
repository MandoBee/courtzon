import type { FastifyRequest, FastifyReply } from 'fastify';
import { bookingService } from '../application/booking.service.js';
import { CreateBookingSchema, ConfirmBookingSchema, PrepareBookingSchema, CancelBookingSchema, BookingsQuerySchema, StartMatchmakingSchema } from './booking.dto.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { recordAudit } from '../../audit-log/index.js';

export async function createBookingHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const userId = (request as any).userId;

  if (body?.prepareId) {
    const validated = ConfirmBookingSchema.parse(body);
    const result = await bookingService.confirmBookingFromPrepare(validated, userId);
    recordAudit({
      actorId: userId ?? null,
      action: 'BOOKING.CREATE',
      entityType: 'booking',
      entityId: result.id,
      afterState: { prepareId: body.prepareId },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.status(201).send(result);
  }

  const validated = CreateBookingSchema.parse(body);
  const result = await bookingService.createBooking(validated, userId);

  recordAudit({
    actorId: userId ?? null,
    action: 'BOOKING.CREATE',
    entityType: 'booking',
    entityId: result.id,
    afterState: { resourceId: body.resourceId, date: body.date },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send(result);
}

export async function prepareBookingHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = PrepareBookingSchema.parse(request.body);
  const userId = (request as any).userId;
  const result = await bookingService.prepareGatewayBooking(body, userId);

  recordAudit({
    actorId: userId ?? null,
    action: 'BOOKING.PREPARE',
    entityType: 'booking_prepare',
    entityId: result.prepareId,
    afterState: { resourceId: body.resourceId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send(result);
}

export async function cancelPrepareHandler(request: FastifyRequest, reply: FastifyReply) {
  const { prepareId } = request.params as any;
  const userId = (request as any).userId;
  await bookingService.cancelPrepare(prepareId, userId);

  recordAudit({
    actorId: userId ?? null,
    action: 'BOOKING.CANCEL_PREPARE',
    entityType: 'booking_prepare',
    entityId: Number(prepareId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ success: true });
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

  recordAudit({
    actorId: userId ?? null,
    action: 'BOOKING.CANCEL',
    entityType: 'booking',
    entityId: Number(id),
    afterState: { reason: body.reason },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
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

  recordAudit({
    actorId: userId ?? null,
    action: 'BOOKING.CHECK_IN',
    entityType: 'booking',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

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

  return reply.send({ success: true });
}

export async function getAllBookingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { orgId, branchId, resourceId, resource, branch, orgName, date, status, paymentStatus, bookingType, page, limit } = request.query as any;
  const filters: any = {};
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
  // Require orgId unless super_admin/super-admin
  if (orgId) {
    filters.orgId = Number(orgId);
  } else {
    const { getPool } = await import('../../../database/mysql.js');
    const pool = getPool();
    const [adminRows] = await pool.execute<any[]>(
      `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND ur.is_active = TRUE
         AND r.slug IN ('super_admin', 'super-admin') LIMIT 1`,
      [userId],
    );
    if (adminRows.length === 0) {
      throw new ForbiddenError('Specify an orgId or use GET /organisations/:orgId/bookings');
    }
  }
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

  recordAudit({
    actorId: userId ?? null,
    action: 'BOOKING.START_MATCHMAKING',
    entityType: 'booking',
    entityId: Number(id),
    afterState: { criteria: body },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

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

  recordAudit({
    actorId: userId ?? null,
    action: 'BOOKING.APPLY',
    entityType: 'booking',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send(result);
}

export async function cancelApplicationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { invitationId } = request.params as any;
  const userId = (request as any).userId;
  await bookingService.cancelApplication(Number(invitationId), userId);

  recordAudit({
    actorId: userId ?? null,
    action: 'BOOKING.CANCEL_APPLICATION',
    entityType: 'booking_invitation',
    entityId: Number(invitationId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ success: true });
}

export async function respondToApplicantHandler(request: FastifyRequest, reply: FastifyReply) {
  const { invitationId } = request.params as any;
  const userId = (request as any).userId;
  const { action } = request.body as any;
  const result = await bookingService.respondToApplicant(Number(invitationId), userId, action);

  recordAudit({
    actorId: userId ?? null,
    action: 'BOOKING.RESPOND_APPLICANT',
    entityType: 'booking_invitation',
    entityId: Number(invitationId),
    afterState: { action },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send(result);
}

export async function getBookingApplicantsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const result = await bookingService.getBookingApplicants(Number(id), userId);
  return reply.send(result);
}

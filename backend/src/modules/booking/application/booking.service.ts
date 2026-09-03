import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { pricingEngine } from '../domain/pricing-engine.js';
import { commissionService } from '../../financial/application/commission.service.js';
import { transactionService } from '../../financial/application/transaction.service.js';
import { transactionRepository } from '../../financial/infrastructure/transaction.repository.js';
import { walletRepository } from '../../wallet/infrastructure/repositories/wallet.repository.js';
import { resourceRepository } from '../../organisations/infrastructure/repositories/resource.repository.js';
import { redisLock } from '../infrastructure/redis/redis-lock.js';
import { getRedisClient } from '../../../infrastructure/redis/redis.client.js';
import { getPool } from '../../../database/mysql.js';
import { TimeEngine } from '../../time/index.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../../shared/errors/app-error.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { generateUUID } from '../../../shared/utils/token.js';
import type { CreateBookingInput, PrepareBookingInput } from '../presentation/booking.dto.js';
import type mysql from 'mysql2/promise';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { isFeatureEnabled, setFeatureFlag } from '../../../shared/utils/feature-flags.js';
import { toMySqlDateTime } from '../../../shared/utils/mysql-date.js';
import { createBookingHandler, type CreateBookingPayload } from '../commands/create-booking.command.js';
import { confirmBookingHandler, type ConfirmBookingPayload } from '../commands/confirm-booking.command.js';
import { cancelBookingHandler, type CancelBookingPayload } from '../commands/cancel-booking.command.js';
import { completeBookingHandler, type CompleteBookingPayload } from '../commands/complete-booking.command.js';
import { expireBookingHandler } from '../commands/expire-booking.command.js';
import type { Command } from '../../../shared/command/command-base.js';
import { CancellationReason } from '../../../platform/shared/booking-types.js';

type RowData = mysql.RowDataPacket[];

async function executeBookingCommand(commandType: string, handler: any, payload: Record<string, unknown>, aggregateId: string): Promise<any> {
  const command: Command = {
    commandId: `${commandType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    commandType,
    aggregateType: 'booking',
    aggregateId,
    payload,
  };
  const result = await commandPipeline.execute(command, {
    validate: async () => handler.validate(command),
    execute: async (cmd, conn) => handler.execute(cmd, conn),
    events: (cmd, res) => handler.events!(cmd, res),
  });
  if (result.status === 'error') throw new Error(`${commandType} failed: ${result.message}`);
  return result.data;
}

const log = createModuleLogger('booking');

// ── Split a time range into individual slots of the given duration ──
// Used for booking_slots population and Redis locking.
function splitTimeRange(startTime: string, endTime: string, durationMinutes: number): { start: string; end: string }[] {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  let startMinutes = startH * 60 + startM;
  let endMinutes = endH * 60 + endM;
  if (endMinutes <= startMinutes) endMinutes += 1440;

  const slots: { start: string; end: string }[] = [];
  let current = startMinutes;
  while (current + durationMinutes <= endMinutes) {
    const slotStartH = Math.floor(current / 60) % 24;
    const slotStartM = current % 60;
    const slotEnd = current + durationMinutes;
    const slotEndH = Math.floor(slotEnd / 60) % 24;
    const slotEndM = slotEnd % 60;
    slots.push({
      start: `${String(slotStartH).padStart(2, '0')}:${String(slotStartM).padStart(2, '0')}`,
      end: `${String(slotEndH).padStart(2, '0')}:${String(slotEndM).padStart(2, '0')}`,
    });
    current = slotEnd;
  }
  return slots;
}

export class BookingService {
  async createBooking(input: CreateBookingInput, userId: number) {
    if (isFeatureEnabled('BOOKING_V2_CREATE')) {
      return this.createBookingV2(input, userId);
    }

    const pool = getPool();

    // Derive organisation_id from branch
    const [branchRows] = await pool.execute<RowData>(
      'SELECT id, organisation_id, timezone, opening_time, closing_time FROM branches WHERE id = ?', [input.branchId],
    );
    if (branchRows.length === 0) throw new NotFoundError('Branch');
    const branchData = branchRows[0] as any;
    const organisationId = branchData.organisation_id;
    const branchTz = branchData.timezone || 'Africa/Cairo';

    // Compute UTC timestamps and business date using TimeEngine
    let endDate = input.bookingDate;
    let endTime = input.endTime;
    if (endTime === '24:00') {
      const [y, m, d] = input.bookingDate.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      endDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
      endTime = '00:00';
    }
    const startAtUtc = TimeEngine.localToUtc(input.bookingDate, input.startTime, branchTz);
    const endAtUtc = TimeEngine.localToUtc(endDate, endTime, branchTz);
    const resource = await resourceRepository.findById(input.resourceId);
    const openingTime = resource?.opening_time || '08:00';
    const closingTime = resource?.closing_time || '22:00';
    const businessDate = TimeEngine.getBusinessDate(startAtUtc, openingTime, closingTime, branchTz);

    // Keep existing bump logic for backward compatibility (booking_date, booking_slots)
    let bookingDate = input.bookingDate;
    if (closingTime < openingTime && input.startTime < openingTime) {
      const [y, m, d] = input.bookingDate.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      bookingDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
    }

    // ── Multi-slot: generate individual slots from the time range ──
    const slotDuration = (resource as any)?.slot_duration || (resource as any)?.default_slot_duration || 60;
    const individualSlots = splitTimeRange(input.startTime, endTime, slotDuration);

    // Validate: slots must cover the requested range exactly (no gaps, aligned to grid)
    if (individualSlots.length === 0) {
      throw new ConflictError('Booking range does not cover any complete slot');
    }
    const firstSlot = individualSlots[0];
    const lastSlot = individualSlots[individualSlots.length - 1];
    if (firstSlot.start !== input.startTime || lastSlot.end !== endTime) {
      throw new ConflictError('Selected time range must be aligned to slot boundaries and cover connected slots only');
    }

    // Pre-compute pricing (idempotent, no lock needed)
    const pricing = await pricingEngine.calculatePrice(
      input.resourceId, input.startTime, endTime
    );

    let commissionAmount = 0;
    let clubAmount = pricing.totalPrice;
    try {
      const comm = await commissionService.calculate(input.branchId, 'booking', pricing.totalPrice);
      commissionAmount = comm.commissionAmount;
      clubAmount = comm.netAmount;
    } catch {
      // Commission lookup is non-fatal
    }

    // Booking tax snapshot (org-specific → global fallback)
    let taxRate = 0;
    let taxRateId: number | null = null;
    let taxAmount = 0;
    let taxTreatment: 'taxable' | 'zero_rated' | 'exempt' = 'taxable';
    try {
      const { taxResolution } = await import('../../financial/application/tax-resolution.service.js');
      const resolved = await taxResolution.resolveOrgTaxRate(organisationId);
      const taxCalc = taxResolution.calculateTax(clubAmount, resolved, 'taxable');
      taxRate = taxCalc.taxRate;
      taxRateId = taxCalc.taxRateId;
      taxAmount = taxCalc.taxAmount;
      taxTreatment = taxCalc.treatment;
    } catch {
      // Tax lookup is non-fatal; booking proceeds untaxed (zero-rated)
    }

    const paymentMethod = input.paymentMethod || 'wallet';
    const isGatewayOrWallet = paymentMethod !== 'cash' && paymentMethod !== 'cod';

    // Acquire distributed Redis locks for ALL slots to prevent concurrent bookings
    const lockOwner = `user:${userId}`;
    const lockSlots = individualSlots.map((s) => ({
      resourceId: input.resourceId,
      date: bookingDate,
      slotStart: s.start,
    }));
    const lockAcquired = await redisLock.acquireAll(lockSlots, lockOwner);
    if (!lockAcquired) {
      throw new ConflictError('One or more slots are currently being booked by another user. Please try again.');
    }

    try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (isGatewayOrWallet) {
        // Check slot availability for ALL individual slots
        const available = await bookingRepository.checkSlotAvailability(
          input.resourceId, bookingDate, individualSlots.map((s) => ({ start: s.start, end: s.end, date: bookingDate })), conn,
        );
      if (!available) throw new ConflictError('One or more slots are no longer available');

        // Create booking with pending_payment status + expires_at (3 min TTL)
        // The booking blocks availability immediately. Expiry worker auto-cancels if payment not confirmed.
        const expiresAt = toMySqlDateTime(new Date(Date.now() + 3 * 60 * 1000));
        const bookingId = await bookingRepository.create({
          userId, branchId: input.branchId, organisationId, resourceId: input.resourceId,
        bookingType: input.bookingType || 'public_match', bookingDate,
        startTime: input.startTime, endTime,
          totalAmount: pricing.totalPrice, commissionAmount, clubAmount,
          taxRate, taxRateId, taxAmount, taxTreatment, priceType: 'net',
          notes: input.notes, paymentMethod,
          bookingStatus: 'pending_payment', paymentStatus: 'pending',
          startAtUtc, endAtUtc, businessDate, expiresAt,
        }, conn);

        // Populate booking_slots for each individual slot
        for (const slot of individualSlots) {
          await conn.execute(
            `INSERT INTO booking_slots (booking_id, resource_id, booking_date, slot_start, slot_end, is_available)
             VALUES (?, ?, ?, ?, ?, FALSE)`,
            [bookingId, input.resourceId, bookingDate, slot.start, slot.end]
          );
        }

        await conn.commit();
        conn.release();

        // Charge payment gateway (outside transaction — may take time).
        const { paymentService } = await import('../../payment/application/payment.service.js');
        const [userRows] = await pool.execute<RowData>('SELECT full_name, email, full_phone FROM users WHERE id = ?', [userId]);
        const user = userRows[0] as any;

        let gwResult: Awaited<ReturnType<typeof paymentService.charge>>;
        try {
          gwResult = await paymentService.charge(userId, {
            referenceType: 'booking',
            referenceId: bookingId,
            amount: Math.round((pricing.totalPrice + taxAmount) * 100) / 100,
            currency: 'EGP',
            paymentMethod: (paymentMethod === 'online' ? 'card' : paymentMethod as 'wallet' | 'card' | 'bank_transfer'),
            returnUrl: input.returnUrl,
            customerName: user?.full_name,
            customerPhone: user?.full_phone,
            customerEmail: user?.email,
          });
        } catch (chargeErr: any) {
          log.error({ err: chargeErr, bookingId, userId, paymentMethod }, 'Payment charge threw exception — cancelling booking');
          await executeBookingCommand('CancelBooking', cancelBookingHandler, { bookingId, reason: CancellationReason.PAYMENT_SESSION_CREATION_FAILED, actorId: 0 }, String(bookingId));
          throw new ConflictError(chargeErr.message || 'Payment failed — booking rolled back');
        }

        if (!gwResult.success) {
          await executeBookingCommand('CancelBooking', cancelBookingHandler, { bookingId, reason: CancellationReason.PAYMENT_SESSION_CREATION_FAILED, actorId: 0 }, String(bookingId));
          throw new ConflictError((gwResult as any).errorMessage || 'Payment gateway rejected the transaction');
        }

        const paymentUrl = ('paymentUrl' in gwResult ? gwResult.paymentUrl : null) || null;
        const clientSecret = ('clientSecret' in gwResult ? gwResult.clientSecret : null) || null;
        const paymentId = ('paymentId' in gwResult ? gwResult.paymentId : null) || null;

        // Emit booking:created event
        eventBusV2.emit('booking:created', {
          bookingId,
          userId,
          courtId: input.resourceId || 0,
          resourceId: input.resourceId || 0,
          bookingDate,
          startTime: new Date(startAtUtc),
          endTime: new Date(endAtUtc),
          startAtUtc,
          endAtUtc,
          bookingType: input.bookingType || 'private_match',
          organisationId,
          branchId: input.branchId,
        });

        return { id: bookingId, bookingId, paymentUrl, clientSecret, paymentId };
      }

      // ── Cash / COD only (wallet and card routes through isGatewayOrWallet above) ──
      const bookingStatus = 'confirmed';
      const paymentStatus = 'pending';

      // Final availability check WITHIN the transaction for ALL slots
      const available = await bookingRepository.checkSlotAvailability(
        input.resourceId, bookingDate, individualSlots.map((s) => ({ start: s.start, end: s.end, date: bookingDate })), conn,
      );
      if (!available) throw new ConflictError('One or more slots are no longer available');

      const bookingId = await bookingRepository.create({
        userId, branchId: input.branchId, organisationId, resourceId: input.resourceId,
        bookingType: input.bookingType || 'public_match', bookingDate,
        startTime: input.startTime, endTime: input.endTime,
        totalAmount: pricing.totalPrice, commissionAmount, clubAmount,
        taxRate, taxRateId, taxAmount, taxTreatment, priceType: 'net',
        notes: input.notes, bookingStatus, paymentStatus, paymentMethod: 'cash',
        startAtUtc, endAtUtc, businessDate,
      }, conn);

      for (const slot of individualSlots) {
        await conn.execute(
          `INSERT INTO booking_slots (booking_id, resource_id, booking_date, slot_start, slot_end, is_available)
           VALUES (?, ?, ?, ?, ?, FALSE)`,
          [bookingId, input.resourceId, bookingDate, slot.start, slot.end]
        );
      }

      if (input.participants?.length) {
        for (const p of input.participants) {
          await conn.execute(
            `INSERT INTO booking_participants (booking_id, full_name, email, phone)
             VALUES (?, ?, ?, ?)`,
            [bookingId, null, null, p.phone || null]
          );
        }
      }

      // COD journal entries on the same connection (OPERATIONAL wallet-flow history)
      if (paymentMethod === 'cash' || paymentMethod === 'cod') {
        const [txnResult] = await conn.execute<mysql.ResultSetHeader>(
          `INSERT INTO transactions (type, source_type, source_id, currency_id, total_amount, status)
           VALUES ('booking_payment', 'booking', ?, 2, ?, 'completed')`,
          [bookingId, pricing.totalPrice]
        );
        await conn.execute(
          `INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, branch_id, organisation_id, description)
           VALUES (?, 'debit', 'user_wallet', ?, ?, 2, ?, ?, ?),
                   (?, 'credit', 'branch', ?, ?, 2, ?, ?, ?)`,
          [txnResult.insertId, userId, pricing.totalPrice, input.branchId, organisationId, `COD booking #${bookingId}`,
           txnResult.insertId, input.branchId, pricing.totalPrice, input.branchId, organisationId, `COD booking #${bookingId}`]
        );
        // Canonical accounting trigger for COD — booking economics must reach
        // ledger_entries → general_ledger via booking:paid (see accounting listener).
        eventBusV2.emit('booking:paid', {
          bookingId, organisationId,
          grossAmount: pricing.totalPrice, taxAmount, coachAmount: 0,
          organisationAmount: clubAmount, commissionAmount,
          paymentMethod: 'cod', currency: 'EGP',
          sourceId: bookingId,
        });
      }

      await conn.commit();

      const booking = await bookingRepository.findById(bookingId);

      if (booking) {
        const bookingType = input.bookingType || 'private_match';
        eventBusV2.emit('booking:created', {
          bookingId,
          userId,
          courtId: input.resourceId || 0,
          resourceId: input.resourceId || 0,
          bookingDate,
          startTime: new Date(startAtUtc),
          endTime: new Date(endAtUtc),
          startAtUtc,
          endAtUtc,
          bookingType,
          organisationId: booking.organisation_id || undefined,
          branchId: input.branchId || undefined,
        });

        eventBusV2.emit('booking:confirmed', {
          bookingId, userId, bookingType,
          organisationId: booking.organisation_id || undefined,
          branchId: input.branchId || undefined,
          resourceId: input.resourceId || undefined,
          courtId: input.resourceId || undefined,
          bookingDate,
          startTime: new Date(startAtUtc),
          endTime: new Date(endAtUtc),
          startAtUtc,
          endAtUtc,
        });

        const startDate = new Date(startAtUtc);
        const { scheduleBookingReminder } = await import('../../notifications/application/scheduler.service.js');
        scheduleBookingReminder(bookingId, userId, startDate).catch((e: any) =>
          log.error({ err: e, bookingId }, 'Failed to schedule booking reminder')
        );
      }

      return { ...booking, timezone: branchTz };
    } catch (err) {
      try { await conn.rollback(); } catch {}
      throw err;
    } finally {
      try { conn.release(); } catch {}
    }
    } finally {
      // Release all distributed Redis locks regardless of outcome
      await redisLock.releaseAll(lockSlots, lockOwner);
    }
  }

  async confirmBookingFromPrepare(input: { prepareId: string; paymentId?: number }, userId: number) {
    return this._createFromPrepare(input.prepareId, input.paymentId, userId);
  }

  async prepareGatewayBooking(input: PrepareBookingInput, userId: number) {
    const pool = getPool();

    // Derive organisation_id from branch
    const [branchRows] = await pool.execute<RowData>(
      'SELECT id, organisation_id, timezone, opening_time, closing_time FROM branches WHERE id = ?', [input.branchId],
    );
    if (branchRows.length === 0) throw new NotFoundError('Branch');
    const branchData = branchRows[0] as any;
    const organisationId = branchData.organisation_id;
    const branchTz = branchData.timezone || 'Africa/Cairo';

    // Normalise midnight crossing: "24:00" is not a valid local time.
    // Convert to "00:00" on the following calendar day.
    let endDate = input.bookingDate;
    let endTime = input.endTime;
    if (endTime === '24:00') {
      const [y, m, d] = input.bookingDate.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      endDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
      endTime = '00:00';
    }

    // Compute UTC timestamps and business date
    const startAtUtc = TimeEngine.localToUtc(input.bookingDate, input.startTime, branchTz);
    const endAtUtc = TimeEngine.localToUtc(endDate, endTime, branchTz);
    const resource = await resourceRepository.findById(input.resourceId);
    const openingTime = resource?.opening_time || '08:00';
    const closingTime = resource?.closing_time || '22:00';
    const businessDate = TimeEngine.getBusinessDate(startAtUtc, openingTime, closingTime, branchTz);

    let bookingDate = input.bookingDate;
    if (closingTime < openingTime && input.startTime < openingTime) {
      const [y, m, d] = input.bookingDate.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      bookingDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
    }

    // Multi-slot generation
    const slotDuration = (resource as any)?.slot_duration || (resource as any)?.default_slot_duration || 60;
    const individualSlots = splitTimeRange(input.startTime, endTime, slotDuration);
    if (individualSlots.length === 0) throw new ConflictError('Booking range does not cover any complete slot');
    const firstSlot = individualSlots[0];
    const lastSlot = individualSlots[individualSlots.length - 1];
    if (firstSlot.start !== input.startTime || lastSlot.end !== endTime) {
      throw new ConflictError('Selected time range must be aligned to slot boundaries and cover connected slots only');
    }

    // Pricing
    const pricing = await pricingEngine.calculatePrice(input.resourceId, input.startTime, endTime);
    // Economic snapshot (commission + org share + tax) — same helper as V2 create.
    const economics = await this.computeBookingEconomics(organisationId, input.branchId, pricing.totalPrice);
    const commissionAmount = economics.commissionAmount;
    const clubAmount = economics.clubAmount;

    // Redis lock with prepare TTL (10 min)
    const lockOwner = `user:${userId}`;
    const lockSlots = individualSlots.map((s) => ({
      resourceId: input.resourceId,
      date: bookingDate,
      slotStart: s.start,
    }));
    const lockAcquired = await redisLock.acquireAllForPrepare(lockSlots, lockOwner);
    if (!lockAcquired) {
      throw new ConflictError('One or more slots are currently being booked by another user. Please try again.');
    }

    try {
      // Check slot availability
      const available = await bookingRepository.checkSlotAvailability(
        input.resourceId, bookingDate, individualSlots.map((s) => ({ start: s.start, end: s.end, date: bookingDate })),
      );
      if (!available) throw new ConflictError('One or more slots are no longer available');

      // Create payment gateway session
      const { paymentService } = await import('../../payment/application/payment.service.js');
      const [userRows] = await pool.execute<RowData>('SELECT full_name, email, full_phone FROM users WHERE id = ?', [userId]);
      const user = userRows[0] as any;

      const prepareId = generateUUID();
      const gwResult = await (paymentService.createGatewayIntention as any)(userId, {
        referenceType: 'booking_prepare',
        referenceId: prepareId,
        amount: pricing.totalPrice,
        currency: 'EGP',
        paymentMethod: input.paymentMethod === 'online' ? 'card' : input.paymentMethod as 'card',
        returnUrl: input.returnUrl,
        customerName: user?.full_name,
        customerPhone: user?.full_phone,
        customerEmail: user?.email,
      });

      if (!gwResult.success) {
        throw new ConflictError((gwResult as any).errorMessage || 'Payment gateway rejected the transaction');
      }

      // Store prepare data in Redis
      const redis = getRedisClient();
      const prepareData = JSON.stringify({
        userId, organisationId, branchId: input.branchId, resourceId: input.resourceId,
        bookingType: input.bookingType || 'public_match', bookingDate,
        startTime: input.startTime, endTime,
        totalAmount: pricing.totalPrice, commissionAmount, clubAmount,
        taxRate: economics.taxRate, taxRateId: economics.taxRateId,
        taxAmount: economics.taxAmount, taxTreatment: economics.taxTreatment,
        notes: input.notes || null, paymentMethod: input.paymentMethod,
        startAtUtc, endAtUtc, businessDate,
        individualSlots,
        lockSlots,
        lockOwner,
        paymentId: gwResult.paymentId || null,
        timezone: branchTz,
      });
      await redis.set(`booking:prepare:${prepareId}`, prepareData, 'PX', 600000);

      return {
        prepareId,
        clientSecret: ('clientSecret' in gwResult ? gwResult.clientSecret : null) || null,
        paymentId: ('paymentId' in gwResult ? gwResult.paymentId : null) || null,
      };
    } catch (err) {
      await redisLock.releaseAll(lockSlots, lockOwner);
      throw err;
    }
  }

  async cancelPrepare(prepareId: string, userId: number) {
    const redis = getRedisClient();
    const raw = await redis.get(`booking:prepare:${prepareId}`);
    if (!raw) return;

    const data = JSON.parse(raw);
    if (data.userId !== userId) throw new ForbiddenError('Not your preparation');

    await redisLock.releaseAll(data.lockSlots, data.lockOwner);
    await redis.del(`booking:prepare:${prepareId}`);
  }

  async _createFromPrepare(prepareId: string, paymentId: number | undefined, userId: number) {
    const redis = getRedisClient();
    const raw = await redis.get(`booking:prepare:${prepareId}`);
    if (!raw) throw new NotFoundError('Booking preparation session expired or not found');

    const data = JSON.parse(raw);
    if (data.userId !== userId) throw new ForbiddenError('Not your preparation');

    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Final availability check within transaction
      const available = await bookingRepository.checkSlotAvailability(
        data.resourceId, data.bookingDate, data.individualSlots.map((s: any) => ({ start: s.start, end: s.end, date: data.bookingDate })), conn,
      );
      if (!available) throw new ConflictError('One or more slots are no longer available');

      // Group D: terminal booking history is NEVER deleted to free a slot.
      // A cancelled/expired/no_show booking remains permanently stored and may
      // coexist with a new booking reusing the same resource/date/start_time.
      // Availability is governed by the authoritative overlap check above
      // (terminal statuses are excluded), not by status-blind unique keys.

      // Create booking as pending_payment
      const bookingId = await bookingRepository.create({
        userId, branchId: data.branchId, organisationId: data.organisationId, resourceId: data.resourceId,
        bookingType: data.bookingType, bookingDate: data.bookingDate,
        startTime: data.startTime, endTime: data.endTime,
        totalAmount: data.totalAmount, commissionAmount: data.commissionAmount, clubAmount: data.clubAmount,
        taxRate: data.taxRate, taxRateId: data.taxRateId, taxAmount: data.taxAmount, taxTreatment: data.taxTreatment, priceType: 'net',
        notes: data.notes, paymentMethod: data.paymentMethod,
        bookingStatus: 'pending_payment', paymentStatus: 'pending',
        startAtUtc: data.startAtUtc, endAtUtc: data.endAtUtc, businessDate: data.businessDate,
      }, conn);

      // Populate booking_slots
      for (const slot of data.individualSlots) {
        await conn.execute(
          `INSERT INTO booking_slots (booking_id, resource_id, booking_date, slot_start, slot_end, is_available)
           VALUES (?, ?, ?, ?, ?, FALSE)`,
          [bookingId, data.resourceId, data.bookingDate, slot.start, slot.end],
        );
      }

      // Emit booking:created INSIDE transaction so in-memory handlers (notifications, socket) fire
      await eventBusV2.emit('booking:created', {
        bookingId, userId,
        courtId: data.resourceId,
        resourceId: data.resourceId,
        bookingDate: data.bookingDate,
        startTime: new Date(data.startAtUtc),
        endTime: new Date(data.endAtUtc),
        startAtUtc: data.startAtUtc,
        endAtUtc: data.endAtUtc,
        bookingType: data.bookingType,
        organisationId: data.organisationId,
        branchId: data.branchId,
      }, undefined, conn);

      await conn.commit();

      // Fire any after-commit hooks registered by eventBusV2.emit (manual commit path)
      const { flushAfterCommitHooks } = await import('../../../database/database.transaction.js');
      await flushAfterCommitHooks();

      // Link the payment transaction to this booking
      // createGatewayIntention stores with referenceType='booking_prepare' and booking_id=NULL
      // We use the paymentId stored in Redis during prepare to find the transaction
      const cachedPaymentId = data.paymentId;
      let paymentAlreadyPaid = false;
      if (cachedPaymentId) {
        const [linkResult] = await pool.execute<RowData>(
          `UPDATE payment_transactions SET booking_id = ?, reference_type = 'booking'
           WHERE id = ? AND reference_type = 'booking_prepare' AND booking_id IS NULL`,
          [bookingId, cachedPaymentId],
        );
        if ((linkResult as any).affectedRows > 0) {
          const [payRows] = await pool.execute<RowData>(
            `SELECT id, payment_status FROM payment_transactions WHERE id = ? LIMIT 1`,
            [cachedPaymentId],
          );
          if (payRows.length && (payRows[0] as any).payment_status === 'paid') {
            paymentAlreadyPaid = true;
          }
        }
      } else {
        // Fallback: find by reference_type + user + recent (no paymentId cached)
        const [linkResult] = await pool.execute<RowData>(
          `UPDATE payment_transactions SET booking_id = ?, reference_type = 'booking'
           WHERE user_id = ? AND reference_type = 'booking_prepare' AND booking_id IS NULL
           ORDER BY id DESC LIMIT 1`,
          [bookingId, userId],
        );
        if ((linkResult as any).affectedRows > 0) {
          // Check status of the row we just linked
          const [payRows] = await pool.execute<RowData>(
            `SELECT id, payment_status FROM payment_transactions WHERE booking_id = ? AND reference_type = 'booking' LIMIT 1`,
            [bookingId],
          );
          if (payRows.length && (payRows[0] as any).payment_status === 'paid') {
            paymentAlreadyPaid = true;
          }
        }
      }

      // If webhook already arrived and marked the payment as 'paid' before we linked it,
      // the listener never fired (wrong referenceType). Confirm now.
      if (paymentAlreadyPaid) {
        try {
          await executeBookingCommand('ConfirmBooking', confirmBookingHandler, {
            bookingId,
            actorId: userId,
          }, String(bookingId));
        } catch (confirmErr) {
          const { createModuleLogger } = await import('../../../shared/utils/logger.js');
          const log = createModuleLogger('BookingService');
          log.warn({ err: confirmErr, bookingId }, 'Auto-confirm after prepare failed (webhook may complete later)');
        }
      }

      const booking = await bookingRepository.findById(bookingId);
      return { ...booking, timezone: data.timezone || 'Africa/Cairo' };
    } catch (err) {
      try { await conn.rollback(); } catch {}
      throw err;
    } finally {
      try { conn.release(); } catch {}
      await redisLock.releaseAll(data.lockSlots, data.lockOwner);
      await redis.del(`booking:prepare:${prepareId}`);
    }
  }

  async getUserBookings(userId: number, status?: string, from?: string, to?: string, page = 1, limit = 20, sortBy?: string, lat?: number, lng?: number) {
    return bookingRepository.findByUser(userId, status, from, to, page, limit, sortBy, lat, lng);
  }

  async getOrganisationBookings(orgId: number, date?: string, status?: string) {
    return bookingRepository.findByOrganisation(orgId, date, status);
  }

  async getBooking(id: number) {
    const booking = await bookingRepository.findById(id);
    if (!booking) throw new NotFoundError('Booking');
    return booking;
  }

  async cancelBooking(id: number, userId: number, reason: string) {
    const booking = await bookingRepository.findById(id);
    if (!booking) throw new NotFoundError('Booking');
    if (booking.booking_status === 'cancelled' || booking.booking_status === 'cancelled_with_fee') {
      throw new ConflictError('Booking already cancelled');
    }
    if (booking.user_id !== userId) throw new ForbiddenError('You can only cancel your own bookings');

    const canCancel = await this._canUserCancel(booking);
    if (!canCancel) {
      throw new ConflictError('Cancellation window has passed. Please contact support.');
    }

    const isCOD = booking.payment_method === 'cash' || booking.payment_method === 'cod';
    const { feeAmount, refundAmount } = await this._calculateCancellationFee(booking);

    // Wrap the DB writes (status + cancellation record) in a transaction
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (isCOD) {
        const totalAmount = Number(booking.total_amount);
        const paymentStatus = refundAmount >= totalAmount ? 'refunded' : refundAmount > 0 ? 'partially_refunded' : 'penalty';
        await executeBookingCommand('CancelBooking', cancelBookingHandler, { bookingId: id, reason, actorId: userId }, String(id));
        await conn.commit();

        // Wallet refund and journal entries happen outside the transaction (non-fatal)
        if (paymentStatus === 'refunded') {
          await this._refundCODWallet(booking, totalAmount);
        } else if (paymentStatus === 'partially_refunded') {
          await this._refundCODWallet(booking, refundAmount);
        } else {
          await this._recordCODWalletTransaction(booking, 'penalty', `Booking #${booking.id} cancellation penalty`);
        }
      } else {
        await executeBookingCommand('CancelBooking', cancelBookingHandler, { bookingId: id, reason, actorId: userId }, String(id));
        await conn.commit();

        if (refundAmount > 0 && booking.payment_status === 'paid') {
          await this._processGatewayRefund(booking, refundAmount);
        }
      }
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return this.getBooking(id);
  }

  /**
   * Authorize an actor to mutate a booking's status/payment on behalf of the
   * booking's organisation. The organisation is resolved server-side from the
   * booking record (never from client input). Super-admins, the org owner, and
   * users with an org role-scope on that organisation are allowed. Everyone
   * else is denied with a non-revealing 404.
   */
  private async _assertCanManageBooking(id: number, actorId?: number): Promise<void> {
    if (!actorId) throw new NotFoundError('Booking');
    const booking = await bookingRepository.findById(id);
    if (!booking) throw new NotFoundError('Booking');
    const allowed = await bookingRepository.canAccessOrganisation(actorId, booking.organisation_id);
    if (!allowed) throw new NotFoundError('Booking');
  }

  async canAccessOrganisation(userId: number, orgId: number): Promise<boolean> {
    return bookingRepository.canAccessOrganisation(userId, orgId);
  }

  private async _canUserCancel(booking: any): Promise<boolean> {
    const pool = getPool();
    const [orgRows] = await pool.execute<RowData>(
      `SELECT cancellation_policy_level FROM organisations WHERE id = ?`,
      [booking.organisation_id]
    );
    if (!orgRows.length) return true;

    const org = orgRows[0] as any;
    const policyCol = org.cancellation_policy_level === 'branch'
      ? 'branch_id' : 'organisation_id';
    const policyId = org.cancellation_policy_level === 'branch'
      ? booking.branch_id : booking.organisation_id;

    const [polRows] = await pool.execute<RowData>(
      `SELECT MAX(cancellation_window_minutes) as max_window
       FROM cancellation_policies
       WHERE ${policyCol} = ? AND is_active = 1`,
      [policyId]
    );

    const maxWindow = (polRows[0] as any)?.max_window;
    if (!maxWindow) return true;

    const bookingStart = new Date(`${booking.booking_date}T${booking.start_time}`);
    const now = new Date();
    const minutesUntil = (bookingStart.getTime() - now.getTime()) / (1000 * 60);

    return minutesUntil >= maxWindow;
  }

  private async _calculateCancellationFee(booking: any): Promise<{ feeAmount: number; refundAmount: number }> {
    const pool = getPool();
    const [orgRows] = await pool.execute<RowData>(
      `SELECT cancellation_policy_level FROM organisations WHERE id = ?`,
      [booking.organisation_id]
    );

    let feeAmount = 0;
    // P3-9: the refund/fee base is the ACTUAL amount paid for the booking
    // (payment_transactions.amount), not an inferred total. V1 sync charges
    // total + tax; V2 / prepare charge total. Using the real captured amount
    // means a full V1 refund returns the tax that was actually collected,
    // while a V2 refund never returns tax that was never charged. Bookings
    // with no captured payment row (COD / legacy 'paid' rows) fall back to
    // total_amount, preserving existing behavior and the refund ceiling.
    const paidAmount = await this._resolveBookingPaidAmount(booking);
    const refundBase = paidAmount > 0 ? paidAmount : Number(booking.total_amount);

    const bookingStart = new Date(`${booking.booking_date}T${booking.start_time}`);
    const now = new Date();
    const hoursUntilBooking = (bookingStart.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (orgRows.length && hoursUntilBooking >= 0) {
      const org = orgRows[0] as any;
      const minutesUntil = hoursUntilBooking * 60;

      const policyCol = org.cancellation_policy_level === 'branch'
        ? 'branch_id' : 'organisation_id';
      const policyId = org.cancellation_policy_level === 'branch'
        ? booking.branch_id : booking.organisation_id;

      const [polRows] = await pool.execute<RowData>(
        `SELECT cancellation_window_minutes, refund_percent
         FROM cancellation_policies
         WHERE ${policyCol} = ? AND is_active = 1
         ORDER BY cancellation_window_minutes DESC`,
        [policyId]
      );

      const policies = polRows as any[];
      const matched = policies.find((p: any) => p.cancellation_window_minutes <= minutesUntil);

      if (matched) {
        const feePct = 100 - Number(matched.refund_percent || 100);
        feeAmount = refundBase * feePct / 100;
      } else if (policies.length > 0) {
        feeAmount = refundBase;
      }
    }

    return { feeAmount, refundAmount: Math.max(0, refundBase - feeAmount) };
  }

  private async _processRefund(booking: any, refundAmount: number, userId: number): Promise<void> {
    // Money movement is the gating step for a refund. Failures are propagated
    // (not swallowed): if the wallet credit cannot be persisted, the caller
    // must NOT advance booking:refunded / refunded_amount — that would be a
    // false refund (R2/W4). Previously the updateBalance result was ignored and
    // every failure was caught, silently posting refund accounting without
    // returning the money.
    if (refundAmount <= 0) return;

    const wallet = await walletRepository.findByUserId(userId);
    if (!wallet) {
      throw new Error(`Cannot refund booking #${booking.id}: user ${userId} has no wallet`);
    }
    const current = await walletRepository.lockAndGetBalance(wallet.id);
    if (!current) {
      throw new Error(`Cannot refund booking #${booking.id}: wallet ${wallet.id} is locked or missing`);
    }
    const newBalance = current.balance + refundAmount;
    const updated = await walletRepository.updateBalance(wallet.id, newBalance, current.version);
    if (!updated) {
      throw new Error(`Cannot refund booking #${booking.id}: concurrent wallet update — please retry`);
    }

    await transactionService.createRefund({
      userId,
      walletId: wallet.id,
      branchId: booking.branch_id,
      organisationId: booking.organisation_id,
      amount: refundAmount,
      sourceId: booking.id,
      description: `Booking #${booking.id} cancellation refund`,
    });

    eventBusV2.emit('wallet:transaction', {
      walletId: wallet.id,
      userId,
      amount: refundAmount,
      balance: newBalance,
      type: 'refund',
      description: `Booking #${booking.id} cancellation refund`,
    });
  }

  async isAcceptedParticipant(bookingId: number, userId: number): Promise<boolean> {
    return bookingRepository.isAcceptedParticipant(bookingId, userId);
  }

  async getAvailability(resourceId: number, date: string) {
    return bookingRepository.getAvailableSlots(resourceId, date);
  }

  async getResourceSlots(resourceId: number, date: string) {
    log.info({ resourceId, date }, 'getResourceSlots: input');

    const resource = await resourceRepository.findById(resourceId);
    if (!resource) throw new NotFoundError('Resource');
    const opening = resource.opening_time || '08:00';
    const closing = resource.closing_time || '22:00';
    const duration = resource.slot_duration || resource.default_slot_duration || 60;
    log.info({ resourceId, resourceName: resource.name, opening, closing, duration }, 'getResourceSlots: resource loaded');

    const pool = getPool();
    const [branchRows] = await pool.execute<RowData>(
      `SELECT id, timezone, name FROM branches WHERE id = ?`, [resource.branch_id]
    );
    const branch = branchRows[0] as any;
    const tz = branch?.timezone || 'Africa/Cairo';
    log.info({ branchId: resource.branch_id, branchName: branch?.name, tz }, 'getResourceSlots: branch loaded');

    // Generate slots using TimeEngine (DST-aware, Business Day based)
    const slots = TimeEngine.generateSlots(date, opening, closing, duration, tz);
    log.info({ slotCount: slots.length, firstSlot: slots[0]?.localStartTime, lastSlot: slots[slots.length - 1]?.localStartTime }, 'getResourceSlots: slots generated');

    // Query existing bookings for this business date (and previous day for overnight)
    const rawBookings = await bookingRepository.findBookingsByBusinessDate(resourceId, date);
    // TODO: Remove after backfill migration is confirmed complete on all environments.
    // Convert legacy bookings (start_at_utc IS NULL) by computing UTC from local times
    const existingBookings = rawBookings.map((b) => {
      if (b.startAtUtc && b.endAtUtc) return { startAtUtc: b.startAtUtc, endAtUtc: b.endAtUtc };
      // Legacy booking without UTC timestamps — compute from local date/time
      if (b.bookingDate && b.startTime && b.endTime) {
        try {
          const startUtc = TimeEngine.localToUtc(b.bookingDate, b.startTime, tz);
          const endUtc = TimeEngine.localToUtc(b.bookingDate, b.endTime, tz);
          return { startAtUtc: startUtc, endAtUtc: endUtc };
        } catch {
          // DST gap or invalid time — skip this booking
          return null;
        }
      }
      return null;
    }).filter((b): b is { startAtUtc: string; endAtUtc: string } => b !== null);
    log.info({ rawCount: rawBookings.length, convertedCount: existingBookings.length }, 'getResourceSlots: existing bookings fetched');

    // Resolve availability: expired (via UTC) + booked (via UTC overlap)
    const availableSlots = TimeEngine.resolveAvailability(slots, existingBookings);

    // Log slot statuses for debugging
    const statusCounts: Record<string, number> = {};
    for (const s of availableSlots) {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    }
    log.info({ statusCounts, slotsWithStatus: availableSlots.filter(s => s.status !== 'available').map(s => ({ time: s.localStartTime, status: s.status })) }, 'getResourceSlots: resolution complete');

    // Return in the expected API format (backward compatible + new UTC fields)
    return availableSlots.map(s => ({
      slot_start: s.localStartTime,
      slot_end: s.localEndTime,
      dayOffset: 0,
      status: s.status,
      startAtUtc: s.startAtUtc,
      endAtUtc: s.endAtUtc,
      businessDate: s.businessDate,
      utcOffsetMinutes: s.utcOffsetMinutes,
      dstOverlap: s.dstOverlap,
    }));
  }

  async checkIn(id: number, userId: number) {
    await bookingRepository.persistTransition(id, 'checked_in');

    // Realtime + notification: the booking's visible state changed. Emit the
    // canonical `booking:check-in` event so the socket publisher routes it to
    // the customer, organisation and resource rooms without a page refresh.
    try {
      const booking = await bookingRepository.findById(id);
      if (booking) {
        eventBusV2.emit('booking:check-in', {
          bookingId: id,
          userId,
          organisationId: booking.organisation_id || undefined,
          branchId: booking.branch_id || undefined,
          resourceId: booking.resource_id || undefined,
          courtId: booking.resource_id || undefined,
          bookingDate: booking.booking_date || undefined,
          startTime: booking.start_time || undefined,
          endTime: booking.end_time || undefined,
        });
      }
    } catch (err) {
      log.warn({ err, bookingId: id }, 'booking:check-in emit failed');
    }

    return this.getBooking(id);
  }

  async updateBookingStatus(id: number, status: string, actorId?: number) {
    await this._assertCanManageBooking(id, actorId);

    if (status === 'confirmed' && isFeatureEnabled('BOOKING_V2_CONFIRM')) {
      return this.confirmBookingV2(id);
    }

    if (status === 'completed') {
      if (isFeatureEnabled('BOOKING_V2_COMPLETE')) {
        return this.completeBookingV2(id);
      }

      const booking = await bookingRepository.findById(id);
      if (!booking) throw new NotFoundError('Booking');
      const isCOD = booking.payment_method === 'cash' || booking.payment_method === 'cod';
      if (isCOD) {
        await executeBookingCommand('CompleteBooking', completeBookingHandler, { bookingId: id }, String(id));
        await this._settleCODWallet(booking, 'payment', `COD booking #${booking.id} settled`);
      } else {
        await executeBookingCommand('CompleteBooking', completeBookingHandler, { bookingId: id }, String(id));
      }
      return;
    }

    if (status === 'confirmed') {
      const booking = await bookingRepository.findById(id);
      if (!booking) throw new NotFoundError('Booking');
      await executeBookingCommand('ConfirmBooking', confirmBookingHandler, { bookingId: id }, String(id));
      return;
    }

    if (status === 'cancelled' || status === 'no_show') {
      if (status === 'cancelled' && isFeatureEnabled('BOOKING_V2_CANCEL')) {
        await this.cancelBookingV2(id);
        return;
      }

      const booking = await bookingRepository.findById(id);
      if (!booking) throw new NotFoundError('Booking');
      if (booking.booking_status === 'cancelled' || booking.booking_status === 'no_show') {
        throw new ConflictError('Booking already cancelled/no-show');
      }

      const isCOD = booking.payment_method === 'cash' || booking.payment_method === 'cod';

      if (!isCOD && status === 'no_show') {
        await executeBookingCommand('CancelBooking', cancelBookingHandler, { bookingId: id, reason: CancellationReason.ADMIN_CANCELLED, actorId: actorId ?? booking.user_id }, String(id));
        this._emitBookingNoShow(id, booking, actorId ?? booking.user_id);
        return;
      }

      const { feeAmount, refundAmount } = await this._calculateCancellationFee(booking);
      const totalAmount = Number(booking.total_amount);
      const reason = CancellationReason.ADMIN_CANCELLED;
      const resolvedUserId = actorId ?? booking.user_id;

      if (isCOD) {
        let paymentStatus: string;
        if (status === 'no_show') {
          paymentStatus = 'penalty';
        } else {
          if (refundAmount >= totalAmount) {
            paymentStatus = 'refunded';
          } else if (refundAmount > 0) {
            paymentStatus = 'partially_refunded';
          } else {
            paymentStatus = 'penalty';
          }
        }

        if (status === 'cancelled') {
          await executeBookingCommand('CancelBooking', cancelBookingHandler, { bookingId: id, reason, actorId: resolvedUserId }, String(id));
        } else {
          await executeBookingCommand('CancelBooking', cancelBookingHandler, { bookingId: id, reason, actorId: resolvedUserId }, String(id));
        }

        if (status === 'no_show') {
          this._emitBookingNoShow(id, booking, resolvedUserId);
        }

        if (paymentStatus === 'refunded') {
          await this._refundCODWallet(booking, totalAmount);
        } else if (paymentStatus === 'partially_refunded') {
          await this._refundCODWallet(booking, refundAmount);
        } else if (paymentStatus === 'penalty') {
          await this._recordCODWalletTransaction(booking, 'penalty',
            `Booking #${booking.id} ${status === 'no_show' ? 'no-show penalty' : 'cancellation penalty'}`);
        }
      } else {
        await executeBookingCommand('CancelBooking', cancelBookingHandler, { bookingId: id, reason, actorId: resolvedUserId }, String(id));
        if (refundAmount > 0 && booking.payment_status === 'paid') {
          await this._processGatewayRefund(booking, refundAmount);
        }
      }
      return;
    }

    throw new ConflictError(`Unsupported status transition to '${status}'. Use the appropriate action endpoint.`);
  }

  private async _recordCODWalletEntry(booking: any, type: string, description: string): Promise<void> {
    // COD funds never enter user_wallets.balance — the "wallet" leg of the
    // operational double-entry is bookkeeping only. No wallet balance mutation,
    // no wallet_transactions row (W1: minting money for uncollected COD). No
    // live callers — retained for operational-ledger parity.
    try {
      const amount = Number(booking.total_amount);
      if (amount <= 0) return;
      await this._createCODDoubleEntry(booking, booking.user_id, amount, 'debit', 'credit', type, description);
    } catch (err) {
      log.error({ err, bookingId: booking.id }, 'COD entry operational write failed');
    }
  }

  private async _recordCODWalletTransaction(booking: any, type: string, description: string): Promise<void> {
    // COD penalties are recorded as the operational double-entry only — never a
    // wallet balance mutation or wallet_transactions row (W1). The wallet was
    // never debited for COD money, so a fictional wallet debit must not appear
    // in the user's wallet history.
    try {
      const amount = Number(booking.total_amount);
      if (amount <= 0) return;
      await this._createCODDoubleEntry(booking, booking.user_id, amount, 'debit', 'credit', type, description);
    } catch (err) {
      log.error({ err, bookingId: booking.id }, 'COD penalty operational write failed');
    }
  }

  private async _settleCODWallet(booking: any, type: string, description: string): Promise<void> {
    // COD funds never enter user_wallets.balance — settlements are recorded as
    // the operational double-entry paired with the create-time booking_payment
    // entry. Crediting balance here would mint money from nothing for cash the
    // org collected outside the platform (W1). No wallet balance mutation, no
    // wallet_transactions row.
    try {
      const amount = Number(booking.total_amount);
      if (amount <= 0) return;
      await this._createCODDoubleEntry(booking, booking.user_id, amount, 'credit', 'debit', type, description);
    } catch (err) {
      log.error({ err, bookingId: booking.id }, 'COD settle operational write failed');
    }
  }

  private async _refundCODWallet(booking: any, refundAmount: number): Promise<void> {
    // COD funds never entered user_wallets.balance — the wallet is not credited
    // for a COD refund (W1: minting money for uncollected cash). Only the
    // operational double-entry (paired with the create-time booking_payment
    // entry) and the canonical accounting reversal are recorded; the canonical
    // booking:refunded emit clamps to the remaining refundable amount.
    try {
      const amount = Number(refundAmount);
      if (amount <= 0) return;
      const cap = await this._computeRefundCap(booking);
      const moveAmount = Math.min(amount, cap);
      if (moveAmount <= 0) {
        log.warn({ bookingId: booking.id, amount }, 'No remaining refundable amount — skipping COD refund');
        return;
      }
      await this._createCODDoubleEntry(booking, booking.user_id, moveAmount, 'credit', 'debit', 'refund',
        `Booking #${booking.id} COD cancellation refund`);
      await this._emitBookingRefunded(booking, moveAmount);
    } catch (err) {
      // Refund accounting is non-fatal to the cancel operation, but must be
      // observable — a silent failure would report a "refunded" COD booking
      // with no accounting reversal.
      log.error({ err, bookingId: booking.id, amount: Number(refundAmount) }, 'COD refund accounting emit failed');
    }
  }

  private async _createCODDoubleEntry(booking: any, walletId: number, amount: number, walletSide: string, counterSide: string, type: string, description: string): Promise<void> {
    try {
      const pool = getPool();
      const currencyId = 2;
      const [txnResult] = await pool.execute<mysql.ResultSetHeader>(
        `INSERT INTO transactions (type, source_type, source_id, currency_id, total_amount, status)
         VALUES (?, 'booking', ?, ?, ?, 'completed')`,
        [type, booking.id, currencyId, amount]
      );
      const txnId = txnResult.insertId;

      await pool.execute(
        `INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, branch_id, organisation_id, description)
         VALUES (?, ?, 'user_wallet', ?, ?, ?, ?, ?, ?),
                (?, ?, 'platform_account', 1, ?, ?, ?, ?, ?)`,
        [
          txnId, walletSide, walletId, amount, currencyId, booking.branch_id, booking.organisation_id, description,
          txnId, counterSide, amount, currencyId, booking.branch_id, booking.organisation_id, description,
        ]
      );
    } catch {
      // non-fatal
    }
  }

  private async _emitBookingRefunded(booking: any, refundAmount: number): Promise<void> {
    if (refundAmount <= 0) return;
    const pool = getPool();

    // Over-refund guard: cumulative refunds must not exceed the original gross payable.
    const grossPayable = Number(booking.total_amount || 0) + Number(booking.tax_amount || 0);
    const [refundRows] = await pool.execute<RowData>(
      `SELECT COALESCE(refunded_amount, 0) AS refunded_amount FROM bookings WHERE id = ?`,
      [booking.id],
    );
    const alreadyRefunded = Number((refundRows as any[])[0]?.refunded_amount ?? 0);
    const remaining = grossPayable - alreadyRefunded;
    if (refundAmount > remaining + 0.001) {
      log.warn({ bookingId: booking.id, refundAmount, remaining }, 'Refund exceeds remaining refundable amount — clamping');
      refundAmount = Math.max(0, remaining);
    }
    if (refundAmount <= 0) return;

    // Update cumulative refunded amount (bounds repeated partial refunds).
    await pool.execute(
      `UPDATE bookings SET refunded_amount = refunded_amount + ? WHERE id = ?`,
      [refundAmount, booking.id],
    );

    // Emit canonical booking refund accounting event. The accounting listener
    // prorates the ORIGINAL snapshot economics (never current rates).
    eventBusV2.emit('booking:refunded', {
      bookingId: booking.id,
      userId: booking.user_id,
      organisationId: booking.organisation_id,
      refundAmount,
      currency: 'EGP',
    } as any);
  }

  /**
   * Emit the canonical `booking:no-show` realtime/notification event after a
   * no-show status transition. The underlying CancelBooking command already
   * emits `booking:cancelled` (state change); this dedicated event carries the
   * no-show semantics so the socket publisher routes `booking.no_show` and the
   * notification engine shows a no-show notification (both are subscribed but
   * were never emitted before).
   */
  private _emitBookingNoShow(bookingId: number, booking: any, actorId: number): void {
    try {
      eventBusV2.emit('booking:no-show', {
        bookingId,
        userId: booking?.user_id ?? actorId,
        organisationId: booking?.organisation_id || undefined,
        branchId: booking?.branch_id || undefined,
        resourceId: booking?.resource_id || undefined,
        courtId: booking?.resource_id || undefined,
        bookingDate: booking?.booking_date || undefined,
        startTime: booking?.start_time || undefined,
        endTime: booking?.end_time || undefined,
        reason: 'no_show',
      } as any);
    } catch (err) {
      log.warn({ err, bookingId }, 'booking:no-show emit failed');
    }
  }

  // Phase 2 Step 7: markBookingSettled removed — duplicate settlement authority.
  // Booking settlements MUST go through bookingSettlementService.settleBookingEconomics
  // which consumes financial_entitlements via the unified settlement engine.
  // org_settled_amount is now a read-through projection of entitlement SETTLED state.

  /**
   * Remaining refundable amount for a booking = gross payable (total + tax)
   * minus the cumulative refunds already recorded. The single source for
   * clamping money movement so a refund can never return more than what has
   * actually been captured.
   */
  private async _computeRefundCap(booking: any): Promise<number> {
    const grossPayable = Number(booking.total_amount || 0) + Number(booking.tax_amount || 0);
    const [refundRows] = await getPool().execute<RowData>(
      `SELECT COALESCE(refunded_amount, 0) AS refunded_amount FROM bookings WHERE id = ?`,
      [booking.id],
    );
    const alreadyRefunded = Number((refundRows as any[])[0]?.refunded_amount ?? 0);
    return Math.max(0, grossPayable - alreadyRefunded);
  }

  /**
   * P3-9: authoritative amount actually paid for a booking = the sum of its
   * captured payment transactions (status paid/refunded). V1 sync charges
   * total + tax; V2 / prepare charge total. Returns 0 when no captured payment
   * row exists (COD / legacy rows), in which case callers fall back to
   * total_amount so the refund ceiling is never inflated beyond what was paid.
   */
  private async _resolveBookingPaidAmount(booking: any): Promise<number> {
    const [rows] = await getPool().execute<RowData>(
      `SELECT COALESCE(SUM(amount), 0) AS paid
       FROM payment_transactions
       WHERE booking_id = ? AND payment_status IN ('paid', 'refunded')`,
      [booking.id],
    );
    return Number((rows[0] as any)?.paid ?? 0);
  }

  private async _processGatewayRefund(booking: any, refundAmount: number): Promise<void> {
    // Money movement MUST succeed before the canonical refund accounting
    // (booking:refunded) is allowed to advance. Previously every failure was
    // swallowed — a gateway/wallet refund could fail silently while
    // _emitBookingRefunded still posted a reversal and incremented
    // refunded_amount, producing a book entry with no actual money movement
    // (false refund, R2/W4). Now the credit must be verified first.
    const requested = Number(refundAmount);
    if (requested <= 0) return;

    // Money never refunded more than the remaining refundable gross, and never
    // more than the ACTUAL amount captured for the booking (P3-9 ceiling: the
    // paid amount is the source of truth — V1 charged total+tax, V2 charged
    // total, so the refund can never exceed what was really collected).
    const cap = await this._computeRefundCap(booking);
    const paidAmount = await this._resolveBookingPaidAmount(booking);
    const ceiling = paidAmount > 0 ? Math.min(cap, paidAmount) : cap;
    const moveAmount = Math.min(requested, ceiling);
    if (moveAmount <= 0) {
      log.warn({ bookingId: booking.id, requested }, 'No remaining refundable amount — skipping refund');
      return;
    }

    const { paymentService } = await import('../../payment/application/payment.service.js');
    const paymentMethod = booking.payment_method;
    if (paymentMethod === 'wallet') {
      await this._processRefund(booking, moveAmount, booking.user_id);
    } else {
      const [ptRows] = await getPool().execute<RowData>(
        `SELECT id FROM payment_transactions WHERE booking_id = ? ORDER BY id DESC LIMIT 1`,
        [booking.id]
      );
      if (!ptRows.length) {
        // No captured money record exists — nothing can be refunded. Do NOT
        // advance the refund accounting (a GL reversal without money movement
        // is a false refund). Log as error for manual review.
        log.error({ bookingId: booking.id, paymentMethod, amount: moveAmount }, 'Cannot refund booking: no payment_transactions record found');
        return;
      }
      const result = await (paymentService.refund as any)(
        (ptRows[0] as any).id,
        moveAmount,
        `Booking #${booking.id} cancellation refund`,
      );
      if (!result?.success) {
        throw new Error(`Payment gateway refund failed for booking #${booking.id}: ${(result as any)?.errorMessage || 'unknown error'}`);
      }
    }

    // Money moved — now advance the canonical refund accounting.
    await this._emitBookingRefunded(booking, moveAmount);
  }

  async updatePaymentStatus(id: number, paymentStatus: string, userId?: number) {
    await this._assertCanManageBooking(id, userId);

    const booking = await bookingRepository.findById(id);
    if (!booking) throw new NotFoundError('Booking');

    if (booking.payment_method !== 'cash' && booking.payment_method !== 'cod') {
      throw new ForbiddenError('Payment status can only be manually changed for cash-on-delivery bookings.');
    }

    await bookingRepository.persistPaymentStatus(id, paymentStatus);

    // ── COD economic recognition ──
    // COD cash is collected by the organization, not CourtZon. The strongest
    // real signal that the COD obligation was economically realized is this
    // manual payment-status confirmation. Recognize CourtZon's receivable
    // (commission + tax) ONLY now — never at booking creation. Idempotent via
    // the canonical accounting engine (booking_cod_payment posting identity).
    if (paymentStatus === 'paid' || paymentStatus === 'partially_refunded') {
      try {
        eventBusV2.emit('booking:paid', {
          bookingId: id,
          organisationId: booking.organisation_id,
          grossAmount: Number(booking.total_amount || 0),
          taxAmount: Number(booking.tax_amount || 0),
          coachAmount: 0,
          organisationAmount: Number(booking.club_amount || 0),
          commissionAmount: Number(booking.commission_amount || 0),
          paymentMethod: 'cod',
          currency: 'EGP',
          sourceId: id,
        });
      } catch (err) {
        log.warn({ err, bookingId: id }, 'COD accounting emit failed on payment status update');
      }
    }
  }

  async getAllBookings(filters?: { orgId?: number; branchId?: number; resourceId?: number; resource?: string; branch?: string; orgName?: string; date?: string; status?: string; paymentStatus?: string; bookingType?: string; page?: number; limit?: number }) {
    return bookingRepository.findAll(filters);
  }

  async startMatchmaking(bookingId: number, userId: number, criteria: {
    minAge?: number; maxAge?: number; targetGender?: string;
    targetLevelId?: number; maxPlayers?: number; deadline?: string; autoApply?: boolean;
  }) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) throw new NotFoundError('Booking');
    if (booking.user_id !== userId) throw new ForbiddenError('Only the booking owner can start matchmaking');
    if (booking.booking_status !== 'confirmed' && booking.booking_status !== 'pending') {
      throw new ConflictError('Matchmaking can only be started for active bookings');
    }

    if (criteria.deadline) {
      const bookingStart = new Date(`${String(booking.booking_date).split('T')[0]}T${booking.start_time}`);
      const deadline = new Date(criteria.deadline);
      if (deadline >= bookingStart) {
        throw new ConflictError('Deadline must be before the booking start time');
      }
    }

    const requestData = {
      bookingId,
      minAge: criteria.minAge,
      maxAge: criteria.maxAge,
      targetGender: criteria.targetGender || 'any',
      targetLevelId: criteria.targetLevelId,
      maxPlayers: criteria.maxPlayers || 2,
      deadline: criteria.deadline,
      autoApply: criteria.autoApply || false,
    };

    await bookingRepository.createMatchmakingRequest(requestData);

    const resourceSport = await this.getResourceSport(booking.resource_id);

    const players = await bookingRepository.findMatchingPlayers(bookingId, {
      sportId: resourceSport,
      minAge: criteria.minAge,
      maxAge: criteria.maxAge,
      targetGender: criteria.targetGender || 'any',
      targetLevelId: criteria.targetLevelId,
      excludeUserId: userId,
    });

    for (const player of players) {
      if (criteria.autoApply) {
        try {
          const invId = await bookingRepository.createInvitation(bookingId, player.id);
          await bookingRepository.updateInvitationStatus(invId, 'accepted');
          await bookingRepository.addParticipantFromInvitation(bookingId, player.id, player.full_name);
        } catch (e: any) {
          if (!e.message?.includes('already applied')) throw e;
        }
      }
    }

    return {
      matchedPlayers: players.length,
      autoApplied: criteria.autoApply ? players.length : 0,
    };
  }

  async getMatchmakingCandidates(bookingId: number, userId: number) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) throw new NotFoundError('Booking');
    if (booking.user_id !== userId) throw new ForbiddenError('Only the booking owner can view candidates');

    const request = await bookingRepository.findMatchmakingRequest(bookingId);
    if (!request) throw new NotFoundError('Matchmaking request');

    const resourceSport = await this.getResourceSport(booking.resource_id);

    return bookingRepository.findMatchingPlayers(bookingId, {
      sportId: resourceSport,
      minAge: request.min_age,
      maxAge: request.max_age,
      targetGender: request.target_gender,
      targetLevelId: request.target_level_id,
      excludeUserId: userId,
    });
  }

  async applyToBooking(bookingId: number, userId: number) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) throw new NotFoundError('Booking');
    if (booking.user_id === userId) throw new ForbiddenError('You cannot apply to your own booking');

    const eligible = await bookingRepository.findPublicMatches(userId, {});
    if (!eligible.some((m) => m.id === bookingId)) {
      throw new ForbiddenError('You do not meet the requirements for this match');
    }

    const request = await bookingRepository.findMatchmakingRequest(bookingId);
    if (!request || !request.is_active) throw new ConflictError('This booking is not accepting applications');
    if (request.deadline && new Date(request.deadline) < new Date()) {
      throw new ConflictError('The application deadline for this match has passed');
    }

    const accepted = await bookingRepository.countAcceptedPlayers(bookingId);
    if (accepted >= request.max_players) throw new ConflictError('This booking already has the maximum number of players');

    if (!request.auto_apply) {
      const invitationId = await bookingRepository.createInvitation(bookingId, userId);
      return { invitationId, status: 'pending' };
    }

    const invitationId = await bookingRepository.createInvitation(bookingId, userId);
    await bookingRepository.updateInvitationStatus(invitationId, 'accepted');
    await bookingRepository.addParticipantFromInvitation(bookingId, userId, booking.user_name || 'Player');

    return { invitationId, status: 'accepted' };
  }

  async cancelApplication(invitationId: number, userId: number) {
    const invitation = await bookingRepository.findInvitationById(invitationId);
    if (!invitation) throw new NotFoundError('Application');
    if (invitation.invited_user_id !== userId) throw new ForbiddenError('You can only cancel your own applications');

    await bookingRepository.updateInvitationStatus(invitationId, 'declined');
  }

  async getPublicMatches(userId: number, filters?: { lat?: number; lng?: number; date?: string }) {
    return bookingRepository.findPublicMatches(userId, filters);
  }

  async getBookingApplicants(bookingId: number, userId: number) {
    const booking = await bookingRepository.findById(bookingId);
    if (!booking) throw new NotFoundError('Booking');
    if (booking.user_id !== userId) throw new ForbiddenError('Only the booking owner can view applicants');

    const [applicants, joined] = await Promise.all([
      bookingRepository.findApplicants(bookingId),
      bookingRepository.findJoinedPlayers(bookingId),
    ]);

    return { applicants, joined };
  }

  async respondToApplicant(invitationId: number, userId: number, action: 'accepted' | 'declined') {
    const invitation = await bookingRepository.findInvitationById(invitationId);
    if (!invitation) throw new NotFoundError('Application');
    if (invitation.owner_id !== userId) throw new ForbiddenError('Only the booking owner can respond to applications');

    const request = await bookingRepository.findMatchmakingRequest(invitation.booking_id);

    await bookingRepository.updateInvitationStatus(invitationId, action);

    if (action === 'accepted') {
      const subjectUser = await this.getUserName(invitation.invited_user_id);
      await bookingRepository.addParticipantFromInvitation(invitation.booking_id, invitation.invited_user_id, subjectUser);

      if (request) {
        const accepted = await bookingRepository.countAcceptedPlayers(invitation.booking_id);
        if (accepted >= request.max_players) {
          const pendingIds = await bookingRepository.rejectAllPending(invitation.booking_id);
          for (const { userId: puid } of pendingIds) {
            eventBusV2.emit('booking:fully-booked', {
              bookingId: invitation.booking_id,
              userId: puid,
              resourceId: 0,
            });
          }
        }
      }
    } else {
      eventBusV2.emit('booking:application-declined', {
        bookingId: invitation.booking_id,
        userId: invitation.invited_user_id,
        ownerId: userId,
      });
    }

    return { status: action };
  }

  private async createBookingV2(input: CreateBookingInput, userId: number) {
    const pool = getPool();

    const [branchRows] = await pool.execute<RowData>(
      'SELECT id, organisation_id, timezone, opening_time, closing_time FROM branches WHERE id = ?', [input.branchId],
    );
    if (branchRows.length === 0) throw new NotFoundError('Branch');
    const branchData = branchRows[0] as any;
    const organisationId = branchData.organisation_id;
    const branchTz = branchData.timezone || 'Africa/Cairo';

    let endDate = input.bookingDate;
    let endTime = input.endTime;
    if (endTime === '24:00') {
      const [y, m, d] = input.bookingDate.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      endDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
      endTime = '00:00';
    }
    const startAtUtc = TimeEngine.localToUtc(input.bookingDate, input.startTime, branchTz);
    const endAtUtc = TimeEngine.localToUtc(endDate, endTime, branchTz);
    const resource = await resourceRepository.findById(input.resourceId);
    const openingTime = resource?.opening_time || '08:00';
    const closingTime = resource?.closing_time || '22:00';

    const pricing = await pricingEngine.calculatePrice(
      input.resourceId, input.startTime, endTime,
    );

    // ── Economic snapshot: commission + org share + tax ──
    // Computed once at booking time from the CURRENT subscription/tax config,
    // then persisted as an immutable snapshot. The accounting engine reads
    // this snapshot (never the live config) so historical postings never drift.
    const economics = await this.computeBookingEconomics(organisationId, input.branchId, pricing.totalPrice);

    const command: Command = {
      commandId: `create-booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      commandType: 'CreateBooking',
      aggregateType: 'booking',
      aggregateId: String(input.resourceId),
      payload: {
        userId,
        branchId: input.branchId,
        organisationId,
        resourceId: input.resourceId,
        bookingDate: input.bookingDate,
        startTime: input.startTime,
        endTime: input.endTime,
        totalAmount: pricing.totalPrice,
        commissionAmount: economics.commissionAmount,
        clubAmount: economics.clubAmount,
        taxRate: economics.taxRate,
        taxRateId: economics.taxRateId,
        taxAmount: economics.taxAmount,
        taxTreatment: economics.taxTreatment,
        priceType: 'net',
        startAtUtc,
        endAtUtc,
        bookingType: input.bookingType || 'standard',
        paymentMethod: input.paymentMethod,
        notes: input.notes,
      } satisfies CreateBookingPayload,
      actorId: userId,
    };

    const result = await commandPipeline.execute(command, {
      validate: async () => {},
      execute: async (cmd, conn) => createBookingHandler.execute(cmd, conn),
      events: (cmd, res) => createBookingHandler.events!(cmd, res),
    });

    if (result.status === 'error') {
      // Preserve the application conflict (409) surfaced by the create command
      // (availability conflict or uq_booking_slot duplicate) instead of turning
      // it into a generic 500.
      if ((result as any).code === 'CONFLICT') {
        throw new ConflictError((result as any).message);
      }
      throw new Error(`CreateBooking failed: ${result.message}`);
    }

    const bookingId = result.status === 'processed' ? result.data?.bookingId : 0;
    log.info({ bookingId }, 'booking.created_v2');

    if (!bookingId) return { bookingId: 0 };

    // ── Process payment for wallet (synchronous) ──
    if (input.paymentMethod === 'wallet') {
      log.info({ bookingId, userId, amount: pricing.totalPrice }, 'createBookingV2: processing wallet payment');
      try {
        const { paymentService } = await import('../../payment/application/payment.service.js');
        await paymentService.charge(userId, {
          referenceType: 'booking',
          referenceId: bookingId,
          amount: pricing.totalPrice,
          currency: 'EGP',
          paymentMethod: 'wallet',
        });
        log.info({ bookingId }, 'createBookingV2: wallet payment completed — booking will be confirmed by listener');
      } catch (chargeErr: any) {
        log.error({ err: chargeErr, bookingId }, 'createBookingV2: wallet payment failed — cancelling booking');
        await executeBookingCommand('CancelBooking', cancelBookingHandler, { bookingId, reason: CancellationReason.PAYMENT_SESSION_CREATION_FAILED, actorId: 0 }, String(bookingId));
        throw new ConflictError(chargeErr.message || 'Wallet payment failed');
      }
    }

    return { id: bookingId, bookingId };
  }

  /**
   * Compute the immutable booking economic snapshot: commission, org net share,
   * and tax. This is the single source of truth for booking economics used by
   * both the V2 create path and the gateway prepare path. Non-fatal on missing
   * subscription/tax config (falls back to zero commission / zero-rated).
   */
  private async computeBookingEconomics(organisationId: number, branchId: number, totalPrice: number) {
    let commissionAmount = 0;
    let clubAmount = totalPrice;
    try {
      const comm = await commissionService.calculate(branchId, 'booking', totalPrice);
      commissionAmount = comm.commissionAmount;
      clubAmount = comm.netAmount;
    } catch {
      // Commission lookup is non-fatal — proceed with zero commission.
    }

    let taxRate = 0;
    let taxRateId: number | null = null;
    let taxAmount = 0;
    let taxTreatment: 'taxable' | 'zero_rated' | 'exempt' = 'taxable';
    try {
      const { taxResolution } = await import('../../financial/application/tax-resolution.service.js');
      const resolved = await taxResolution.resolveOrgTaxRate(organisationId);
      const taxCalc = taxResolution.calculateTax(clubAmount, resolved, 'taxable');
      taxRate = taxCalc.taxRate;
      taxRateId = taxCalc.taxRateId;
      taxAmount = taxCalc.taxAmount;
      taxTreatment = taxCalc.treatment;
    } catch {
      // Tax lookup is non-fatal; booking proceeds untaxed (zero-rated).
    }

    return { commissionAmount, clubAmount, taxRate, taxRateId, taxAmount, taxTreatment };
  }

  private async confirmBookingV2(bookingId: number) {
    const command: Command = {
      commandId: `confirm-booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      commandType: 'ConfirmBooking',
      aggregateType: 'booking',
      aggregateId: String(bookingId),
      payload: { bookingId } satisfies ConfirmBookingPayload,
    };

    const result = await commandPipeline.execute(command, {
      validate: async () => {},
      execute: async (cmd, conn) => confirmBookingHandler.execute(cmd, conn),
      events: (cmd, res) => confirmBookingHandler.events!(cmd, res),
    });

    if (result.status === 'error') {
      throw new Error(`ConfirmBooking failed: ${result.message}`);
    }

    log.info({ bookingId }, 'booking.confirmed_v2');
  }

  private async cancelBookingV2(bookingId: number) {
    const command: Command = {
      commandId: `cancel-booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      commandType: 'CancelBooking',
      aggregateType: 'booking',
      aggregateId: String(bookingId),
      payload: { bookingId } satisfies CancelBookingPayload,
    };

    const result = await commandPipeline.execute(command, {
      validate: async () => {},
      execute: async (cmd, conn) => cancelBookingHandler.execute(cmd, conn),
      events: (cmd, res) => cancelBookingHandler.events!(cmd, res),
    });

    if (result.status === 'error') {
      throw new Error(`CancelBooking failed: ${result.message}`);
    }

    log.info({ bookingId }, 'booking.cancelled_v2');
  }

  private async completeBookingV2(bookingId: number) {
    const command: Command = {
      commandId: `complete-booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      commandType: 'CompleteBooking',
      aggregateType: 'booking',
      aggregateId: String(bookingId),
      payload: { bookingId } satisfies CompleteBookingPayload,
    };

    const result = await commandPipeline.execute(command, {
      validate: async () => {},
      execute: async (cmd, conn) => completeBookingHandler.execute(cmd, conn),
      events: (cmd, res) => completeBookingHandler.events!(cmd, res),
    });

    if (result.status === 'error') {
      throw new Error(`CompleteBooking failed: ${result.message}`);
    }

    log.info({ bookingId }, 'booking.completed_v2');
  }

  private async getResourceSport(resourceId: number): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      'SELECT sport_id FROM resources WHERE id = ?', [resourceId]
    );
    if (!rows.length || !rows[0].sport_id) throw new NotFoundError('Resource sport');
    return rows[0].sport_id;
  }

  private async getUserName(userId: number): Promise<string> {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      'SELECT full_name FROM users WHERE id = ?', [userId]
    );
    return rows.length ? rows[0].full_name : 'Player';
  }
}

export const bookingService = new BookingService();

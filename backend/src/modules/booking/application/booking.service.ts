import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { pricingEngine } from '../domain/pricing-engine.js';
import { commissionService } from '../../../shared/services/commission.service.js';
import { transactionService } from '../../financial/application/transaction.service.js';
import { transactionRepository } from '../../financial/infrastructure/transaction.repository.js';
import { walletRepository } from '../../wallet/infrastructure/repositories/wallet.repository.js';
import { resourceRepository } from '../../organisations/infrastructure/repositories/resource.repository.js';
import { redisLock } from '../infrastructure/redis/redis-lock.js';
import { getPool } from '../../../database/mysql.js';
import { TimeEngine } from '../../time/index.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../../shared/errors/app-error.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import type { CreateBookingInput } from '../presentation/booking.dto.js';
import type mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { eventBus } from '../../../shared/event-bus/index.js';
import {
  confirmBooking, cancelBooking, checkInBooking, noShowBooking, completeBooking,
} from '../../../platform/booking/BookingSaga.js';

type RowData = mysql.RowDataPacket[];

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
    const startAtUtc = TimeEngine.localToUtc(input.bookingDate, input.startTime, branchTz);
    const endAtUtc = TimeEngine.localToUtc(input.bookingDate, input.endTime, branchTz);
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
    const individualSlots = splitTimeRange(input.startTime, input.endTime, slotDuration);

    // Validate: slots must cover the requested range exactly (no gaps, aligned to grid)
    if (individualSlots.length === 0) {
      throw new ConflictError('Booking range does not cover any complete slot');
    }
    const firstSlot = individualSlots[0];
    const lastSlot = individualSlots[individualSlots.length - 1];
    if (firstSlot.start !== input.startTime || lastSlot.end !== input.endTime) {
      throw new ConflictError('Selected time range must be aligned to slot boundaries and cover connected slots only');
    }

    // Pre-compute pricing (idempotent, no lock needed)
    const pricing = await pricingEngine.calculatePrice(
      input.resourceId, input.startTime, input.endTime
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

    const paymentMethod = input.paymentMethod || 'wallet';
    const useWallet = paymentMethod === 'wallet';
    const isGateway = paymentMethod !== 'cash' && paymentMethod !== 'cod' && !useWallet;

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

      if (isGateway) {
        // Check slot availability for ALL individual slots
        const available = await bookingRepository.checkSlotAvailability(
          input.resourceId, bookingDate, individualSlots.map((s) => ({ start: s.start, end: s.end, date: bookingDate })), conn,
        );
        if (!available) throw new ConflictError('One or more slots are no longer available');

        // Create a booking_intent to temporarily reserve the slot.
        // The actual booking row is created only after payment is confirmed.
        const intentId = await bookingRepository.createIntent({
          userId, branchId: input.branchId, organisationId, resourceId: input.resourceId,
          bookingType: input.bookingType || 'public_match', bookingDate,
          startTime: input.startTime, endTime: input.endTime,
          totalAmount: pricing.totalPrice, commissionAmount, clubAmount,
          notes: input.notes, paymentMethod,
          participants: input.participants,
          matchmaking: input.matchmaking,
        });

        // Intent has expires_at = NOW() + 15 min by default.
        // checkSlotAvailability already excludes expired intents, so the slot
        // is automatically freed when the intent expires.
        await conn.commit();
        conn.release();

        // Charge payment gateway (outside transaction — may take time).
        const { paymentService } = await import('../../payment/application/payment.service.js');
        const [userRows] = await pool.execute<RowData>('SELECT full_name, email, full_phone FROM users WHERE id = ?', [userId]);
        const user = userRows[0] as any;
        const gwResult = await paymentService.charge(userId, {
          referenceType: 'booking_intent',
          referenceId: intentId,
          amount: pricing.totalPrice,
          currency: 'EGP',
          paymentMethod: (paymentMethod === 'online' ? 'card' : paymentMethod as 'wallet' | 'card' | 'bank_transfer'),
          returnUrl: input.returnUrl,
          customerName: user?.full_name,
          customerPhone: user?.full_phone,
          customerEmail: user?.email,
        });

        if (!gwResult.success) {
          // Mark the intent as cancelled so the slot is freed immediately
          // (expires_at will also free it eventually, but cancel proactively).
          await pool.execute(
            `UPDATE booking_intents SET intent_status = 'cancelled', failure_reason = ? WHERE id = ?`,
            [(gwResult as any).errorMessage || 'Payment gateway rejected', intentId]
          );
          throw new ConflictError((gwResult as any).errorMessage || 'Payment gateway rejected the transaction');
        }

        const paymentUrl = ('paymentUrl' in gwResult ? gwResult.paymentUrl : null) || null;
        const clientSecret = ('clientSecret' in gwResult ? gwResult.clientSecret : null) || null;
        const paymentId = ('paymentId' in gwResult ? gwResult.paymentId : null) || null;

        return { intentId, paymentUrl, clientSecret, paymentId };
      }

      let bookingStatus = 'pending';
      let paymentStatus = 'pending';
      let walletUpdated = false;
      let walletId: number | null = null;
      let walletState: { balance: number; version: number } | null = null;
      if (useWallet) {
        const wallet = await walletRepository.findByUserId(userId);
        if (wallet) {
          walletId = wallet.id;
          walletState = await walletRepository.lockAndGetBalance(walletId!, conn);
          if (walletState && walletState.balance >= pricing.totalPrice) {
            walletUpdated = true;
          }
        }
      }

      if (useWallet && walletUpdated) {
        bookingStatus = 'confirmed';
        paymentStatus = 'paid';
      } else if (paymentMethod === 'cash' || paymentMethod === 'cod') {
        bookingStatus = 'confirmed';
        paymentStatus = 'pending';
      }

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
        notes: input.notes, bookingStatus, paymentStatus, paymentMethod,
        startAtUtc, endAtUtc, businessDate,
      }, conn);

      // Populate booking_slots for each individual slot
      for (const slot of individualSlots) {
        await conn.execute(
          `INSERT INTO booking_slots (booking_id, resource_id, booking_date, slot_start, slot_end, is_available)
           VALUES (?, ?, ?, ?, ?, FALSE)`,
          [bookingId, input.resourceId, bookingDate, slot.start, slot.end]
        );
      }

      if (walletUpdated && walletId && walletState) {
        const newBalance = walletState.balance - pricing.totalPrice;
        await walletRepository.updateBalance(walletId, newBalance, walletState.version, conn);

        await transactionService.createBookingPayment({
          userId, walletId, branchId: input.branchId, organisationId,
          amount: pricing.totalPrice, commissionAmount,
          sourceId: bookingId, description: `Booking #${bookingId} wallet payment`,
        }, conn);
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

      // COD journal entries on the same connection
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
      }

      await conn.commit();

      let paymentUrl: string | null = null;
      let clientSecret: string | null = null;
      let paymentId: number | null = null;
      if (paymentMethod !== 'cash' && (!useWallet || !walletUpdated)) {
        try {
          const { paymentService } = await import('../../payment/application/payment.service.js');
          const [gwUserRows] = await pool.execute<RowData>('SELECT full_name, email, full_phone FROM users WHERE id = ?', [userId]);
          const gwUser = gwUserRows[0] as any;
          const gwResult = await paymentService.charge(userId, {
            referenceType: 'booking',
            referenceId: bookingId,
            amount: pricing.totalPrice,
            currency: 'EGP',
            paymentMethod: 'card',
            returnUrl: input.returnUrl,
            customerName: gwUser?.full_name,
            customerPhone: gwUser?.full_phone,
            customerEmail: gwUser?.email,
          });
          paymentUrl = ('paymentUrl' in gwResult ? gwResult.paymentUrl : null) || null;
          clientSecret = ('clientSecret' in gwResult ? gwResult.clientSecret : null) || null;
          paymentId = ('paymentId' in gwResult ? gwResult.paymentId : null) || null;
        } catch {
          // non-fatal
        }
      }

      const booking = await bookingRepository.findById(bookingId);

      if (booking) {
        const bookingType = input.bookingType || 'private_match';
        eventBus.emit('booking:created', {
          bookingId,
          userId,
          courtId: input.resourceId || 0,
          startTime: new Date(`${input.bookingDate}T${input.startTime}`),
          endTime: new Date(`${input.bookingDate}T${input.endTime}`),
          bookingType,
          organisationId: booking.organisation_id || undefined,
          branchId: input.branchId || undefined,
        });
      }

      if (bookingStatus === 'confirmed' && booking) {
        const bookingType = input.bookingType || 'private_match';
        if (process.env.LEGACY_REMINDER_ENABLED === 'true') {
          const startDate = new Date(`${String(booking.booking_date).split('T')[0]}T${booking.start_time}`);
          const { scheduleBookingReminder } = await import('../../notifications/application/scheduler.service.js');
          scheduleBookingReminder(bookingId, userId, startDate).catch((e: any) =>
            log.error({ err: e, bookingId }, 'Failed to schedule booking reminder')
          );
        } else {
          eventBus.emit('booking:confirmed', { bookingId, userId, bookingType });
        }
      }

      return { ...booking, paymentUrl, clientSecret, paymentId };
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

  async getUserBookings(userId: number, status?: string, from?: string, to?: string, page = 1, limit = 20, sortBy?: string, lat?: number, lng?: number) {
    return bookingRepository.findByUser(userId, status, from, to, page, limit, sortBy, lat, lng);
  }

  async getBookingIntent(intentId: number) {
    return bookingRepository.findIntent(intentId);
  }

  async fulfillBookingIntent(intentId: number) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [intentRows] = await conn.execute<RowData>(
        'SELECT * FROM booking_intents WHERE id = ? FOR UPDATE', [intentId]
      );
      const intent = intentRows[0] as any;
      if (!intent) throw new NotFoundError('Booking intent');

      if (intent.fulfilled_booking_id) {
        const bRows = await conn.execute<RowData>(
          'SELECT id, booking_status, payment_status FROM bookings WHERE id = ?', [intent.fulfilled_booking_id]
        );
        const existing = (bRows[0] as any[])[0];
        if (existing) {
          await conn.commit();
          return { success: true, booking: existing, isPaid: existing.payment_status === 'paid' };
        }
      }

      const [ptRows] = await conn.execute<RowData>(
        `SELECT id, payment_status, gateway_reference FROM payment_transactions
         WHERE booking_id = ? AND reference_type = 'booking_intent'
         ORDER BY id DESC LIMIT 1`,
        [intentId]
      );
      const pt = ptRows[0] as any;

      let isPaid = pt?.payment_status === 'paid';

      if (!isPaid && pt) {
        try {
          const { paymentGateway } = await import('../../../shared/services/gateway/gateway-factory.js');
          const status = await paymentGateway.getTransactionStatus(pt.gateway_reference);
          if (status.status === 'paid') {
            isPaid = true;
            const { confirmPayment } = await import('../../../platform/payment/PaymentSaga.js');
            await confirmPayment(pt.id, {
              gatewayReference: pt.gateway_reference || '',
              paidAmount: intent.total_amount || 0,
            }, conn).catch(() => {});
          }
        } catch {
          // non-fatal
        }
      }

      const bookingStatus = isPaid ? 'confirmed' : 'pending';
      const paymentStatus = isPaid ? 'paid' : 'pending';

      // Compute UTC timestamps and business date from intent data
      const [brRow] = await conn.execute<RowData>(
        'SELECT timezone, opening_time, closing_time FROM branches WHERE id = ?', [intent.branch_id]
      );
      const brData = brRow[0] as any || {};
      const intentTz = brData.timezone || 'Africa/Cairo';
      const intentOpening = brData.opening_time || '08:00';
      const intentClosing = brData.closing_time || '22:00';
      const intentBookingDate = intent.booking_date instanceof Date
        ? intent.booking_date.toISOString().slice(0, 10)
        : String(intent.booking_date).slice(0, 10);
      const intentStart = intent.start_time instanceof Date
        ? `${String(intent.start_time.getUTCHours()).padStart(2, '0')}:${String(intent.start_time.getUTCMinutes()).padStart(2, '0')}`
        : String(intent.start_time).slice(0, 5);
      const intentEnd = intent.end_time instanceof Date
        ? `${String(intent.end_time.getUTCHours()).padStart(2, '0')}:${String(intent.end_time.getUTCMinutes()).padStart(2, '0')}`
        : String(intent.end_time).slice(0, 5);
      const intentStartUtc = TimeEngine.localToUtc(intentBookingDate, intentStart, intentTz);
      const intentEndUtc = TimeEngine.localToUtc(intentBookingDate, intentEnd, intentTz);
      const intentBusinessDate = TimeEngine.getBusinessDate(intentStartUtc, intentOpening, intentClosing, intentTz);

      const [createResult] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
          booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc,
          total_amount, commission_amount, club_amount,
          booking_status, payment_status, notes, payment_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), intent.user_id, intent.organisation_id, intent.branch_id, intent.resource_id,
         intent.booking_type, intent.booking_date, intentBusinessDate, intent.start_time, intent.end_time,
         intentStartUtc, intentEndUtc,
         intent.total_amount, intent.commission_amount, intent.club_amount,
         bookingStatus, paymentStatus, intent.notes, intent.payment_method]
      );
      const bookingId = createResult.insertId;

      if (pt) {
        await conn.execute(
          'UPDATE payment_transactions SET booking_id = ?, reference_type = ? WHERE id = ?',
          [bookingId, 'booking', pt.id]
        );
      }

      await conn.execute(
        'UPDATE booking_intents SET fulfilled_booking_id = ?, intent_status = ?, fulfilled_at = NOW() WHERE id = ?',
        [bookingId, 'fulfilled', intentId]
      );

      // Populate booking_slots for each individual slot in the intent range
      const intentResource = await resourceRepository.findById(intent.resource_id);
      const intentSlotDuration = (intentResource as any)?.slot_duration || (intentResource as any)?.default_slot_duration || 60;
      const intentSlots = splitTimeRange(intentStart, intentEnd, intentSlotDuration);
      for (const slot of intentSlots) {
        await conn.execute(
          `INSERT INTO booking_slots (booking_id, resource_id, booking_date, slot_start, slot_end, is_available)
           VALUES (?, ?, ?, ?, ?, FALSE)`,
          [bookingId, intent.resource_id, intent.booking_date, slot.start, slot.end]
        );
      }

      await conn.commit();

      const booking = await bookingRepository.findById(bookingId);

      if (booking) {
        eventBus.emit('booking:created', {
          bookingId,
          userId: intent.user_id,
          courtId: intent.resource_id || 0,
          startTime: new Date(`${String(intent.booking_date).split('T')[0]}T${intent.start_time}`),
          endTime: new Date(`${String(intent.booking_date).split('T')[0]}T${intent.end_time}`),
          bookingType: intent.booking_type,
          organisationId: intent.organisation_id || undefined,
          branchId: intent.branch_id || undefined,
        });
      }

      if (bookingStatus === 'confirmed' && booking) {
        if (process.env.LEGACY_REMINDER_ENABLED === 'true') {
          const startDate = new Date(`${String(intent.booking_date).split('T')[0]}T${intent.start_time}`);
          const { scheduleBookingReminder } = await import('../../notifications/application/scheduler.service.js');
          scheduleBookingReminder(bookingId, intent.user_id, startDate).catch((e: any) =>
            log.error({ err: e, bookingId }, 'Failed to schedule booking reminder')
          );
        } else {
          eventBus.emit('booking:confirmed', { bookingId, userId: intent.user_id, bookingType: intent.booking_type });
        }
      }

      return { success: true, booking, isPaid };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async cancelBookingIntent(intentId: number) {
    const intent = await bookingRepository.findIntent(intentId);
    if (!intent) throw new NotFoundError('Booking intent');
    await bookingRepository.updateIntentStatus(intentId, 'cancelled', 'User cancelled payment');
    return { success: true };
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
        await cancelBooking(id, userId, reason, feeAmount, conn, paymentStatus);
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
        await cancelBooking(id, userId, reason, feeAmount, conn);
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
    const totalAmount = Number(booking.total_amount);

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
        feeAmount = totalAmount * feePct / 100;
      } else if (policies.length > 0) {
        feeAmount = totalAmount;
      }
    }

    return { feeAmount, refundAmount: totalAmount - feeAmount };
  }

  private async _processRefund(booking: any, refundAmount: number, userId: number): Promise<void> {
    try {
      const wallet = await walletRepository.findByUserId(userId);
      if (wallet) {
        const current = await walletRepository.lockAndGetBalance(wallet.id);
        if (current) {
          await walletRepository.updateBalance(wallet.id, current.balance + refundAmount, current.version);

          await transactionService.createRefund({
            userId,
            walletId: wallet.id,
            branchId: booking.branch_id,
            organisationId: booking.organisation_id,
            amount: refundAmount,
            sourceId: booking.id,
            description: `Booking #${booking.id} cancellation refund`,
          });
        }
      }
    } catch {
      // Wallet refund is best-effort
    }
  }

  async isAcceptedParticipant(bookingId: number, userId: number): Promise<boolean> {
    return bookingRepository.isAcceptedParticipant(bookingId, userId);
  }

  async getAvailability(resourceId: number, date: string) {
    return bookingRepository.getAvailableSlots(resourceId, date);
  }

  async getResourceSlots(resourceId: number, date: string) {
    const resource = await resourceRepository.findById(resourceId);
    if (!resource) throw new NotFoundError('Resource');
    const opening = resource.opening_time || '08:00';
    const closing = resource.closing_time || '22:00';
    const duration = resource.slot_duration || resource.default_slot_duration || 60;

    const pool = getPool();
    const [branchRows] = await pool.execute<RowData>(
      `SELECT timezone FROM branches WHERE id = ?`, [resource.branch_id]
    );
    const tz = (branchRows[0] as any)?.timezone || 'Africa/Cairo';

    // Generate slots using TimeEngine (DST-aware, Business Day based)
    const slots = TimeEngine.generateSlots(date, opening, closing, duration, tz);

    // Query existing bookings for this business date
    const existingBookings = await bookingRepository.findBookingsByBusinessDate(resourceId, date);

    // Resolve availability: expired (via UTC) + booked (via UTC overlap)
    const availableSlots = TimeEngine.resolveAvailability(slots, existingBookings);

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
    await checkInBooking(id);
    return this.getBooking(id);
  }

  async updateBookingStatus(id: number, status: string, actorId?: number) {
    if (status === 'completed') {
      const booking = await bookingRepository.findById(id);
      if (!booking) throw new NotFoundError('Booking');
      const isCOD = booking.payment_method === 'cash' || booking.payment_method === 'cod';
      if (isCOD) {
        await completeBooking(id, 'paid');
        await this._settleCODWallet(booking, 'payment', `COD booking #${booking.id} settled`);
      } else {
        await completeBooking(id);
      }
      return;
    }

    if (status === 'pending') {
      const booking = await bookingRepository.findById(id);
      if (!booking) throw new NotFoundError('Booking');
      const isCOD = booking.payment_method === 'cash' || booking.payment_method === 'cod';
      if (isCOD) {
        await bookingRepository.updateStatusAndPayment(id, 'pending', 'pending');
      } else {
        await bookingRepository.updateStatus(id, 'pending');
      }
      return;
    }

    if (status === 'confirmed') {
      const booking = await bookingRepository.findById(id);
      if (!booking) throw new NotFoundError('Booking');
      await confirmBooking(id, {
        paymentStatus: booking.payment_status === 'paid' ? 'paid' : 'pending',
        paymentMethod: booking.payment_method || 'card',
      });
      return;
    }

    if (status === 'cancelled' || status === 'no_show') {
      const booking = await bookingRepository.findById(id);
      if (!booking) throw new NotFoundError('Booking');
      if (booking.booking_status === 'cancelled' || booking.booking_status === 'no_show') {
        throw new ConflictError('Booking already cancelled/no-show');
      }

      const isCOD = booking.payment_method === 'cash' || booking.payment_method === 'cod';

      if (!isCOD && status === 'no_show') {
        await noShowBooking(id, actorId ?? booking.user_id, 'No-show by admin/staff');
        return;
      }

      const { feeAmount, refundAmount } = await this._calculateCancellationFee(booking);
      const totalAmount = Number(booking.total_amount);
      const reason = `Status changed to ${status} by admin/staff`;
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
          await cancelBooking(id, resolvedUserId, reason, feeAmount, undefined, paymentStatus);
        } else {
          await noShowBooking(id, resolvedUserId, reason, undefined, paymentStatus, feeAmount);
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
        await cancelBooking(id, resolvedUserId, reason, feeAmount);
        if (refundAmount > 0 && booking.payment_status === 'paid') {
          await this._processGatewayRefund(booking, refundAmount);
        }
      }
      return;
    }

    await bookingRepository.updateStatus(id, status);
  }

  private async _recordCODWalletEntry(booking: any, type: string, description: string): Promise<void> {
    try {
      const wallet = await walletRepository.findByUserId(booking.user_id);
      if (!wallet) return;
      const amount = Number(booking.total_amount);
      const current = await walletRepository.lockAndGetBalance(wallet.id);
      if (!current) return;
      const newBalance = current.balance - amount;
      await walletRepository.updateBalance(wallet.id, newBalance, current.version);
      await walletRepository.createTransaction({
        walletId: wallet.id,
        type,
        amount,
        direction: 'debit',
        referenceType: 'booking',
        referenceId: booking.id,
        description,
      });
      await this._createCODDoubleEntry(booking, wallet.id, amount, 'debit', 'credit', type, description);
    } catch {
      // non-fatal
    }
  }

  private async _recordCODWalletTransaction(booking: any, type: string, description: string): Promise<void> {
    try {
      const wallet = await walletRepository.findByUserId(booking.user_id);
      if (!wallet) return;
      const amount = Number(booking.total_amount);
      await walletRepository.createTransaction({
        walletId: wallet.id,
        type,
        amount,
        direction: 'debit',
        referenceType: 'booking',
        referenceId: booking.id,
        description,
      });
      await this._createCODDoubleEntry(booking, wallet.id, amount, 'debit', 'credit', type, description);
    } catch {
      // non-fatal
    }
  }

  private async _settleCODWallet(booking: any, type: string, description: string): Promise<void> {
    try {
      const wallet = await walletRepository.findByUserId(booking.user_id);
      if (!wallet) return;
      const amount = Number(booking.total_amount);
      const current = await walletRepository.lockAndGetBalance(wallet.id);
      if (!current) return;
      const newBalance = current.balance + amount;
      await walletRepository.updateBalance(wallet.id, newBalance, current.version);
      await walletRepository.createTransaction({
        walletId: wallet.id,
        type,
        amount,
        direction: 'credit',
        referenceType: 'booking',
        referenceId: booking.id,
        description,
      });
      await this._createCODDoubleEntry(booking, wallet.id, amount, 'credit', 'debit', type, description);
    } catch {
      // non-fatal
    }
  }

  private async _refundCODWallet(booking: any, refundAmount: number): Promise<void> {
    try {
      const wallet = await walletRepository.findByUserId(booking.user_id);
      if (!wallet) return;
      const current = await walletRepository.lockAndGetBalance(wallet.id);
      if (!current) return;
      const newBalance = current.balance + refundAmount;
      await walletRepository.updateBalance(wallet.id, newBalance, current.version);
      await walletRepository.createTransaction({
        walletId: wallet.id,
        type: 'refund',
        amount: refundAmount,
        direction: 'credit',
        referenceType: 'booking',
        referenceId: booking.id,
        description: `Booking #${booking.id} COD cancellation refund`,
      });
      await this._createCODDoubleEntry(booking, wallet.id, refundAmount, 'credit', 'debit', 'refund',
        `Booking #${booking.id} COD cancellation refund`);
    } catch {
      // non-fatal
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

  private async _processGatewayRefund(booking: any, refundAmount: number): Promise<void> {
    try {
      const { paymentService } = await import('../../payment/application/payment.service.js');
      const paymentMethod = booking.payment_method;
      if (paymentMethod === 'wallet') {
        await this._processRefund(booking, refundAmount, booking.user_id);
      } else {
        const [ptRows] = await getPool().execute<RowData>(
          `SELECT id FROM payment_transactions WHERE booking_id = ? ORDER BY id DESC LIMIT 1`,
          [booking.id]
        );
        if (ptRows.length) {
          await paymentService.refund((ptRows[0] as any).id, refundAmount, `Booking #${booking.id} cancellation refund`);
        }
      }
    } catch {
      // gateway refund is best-effort
    }
  }

  async updatePaymentStatus(id: number, paymentStatus: string, userId?: number) {
    const booking = await bookingRepository.findById(id);
    if (!booking) throw new NotFoundError('Booking');

    if (booking.payment_method !== 'cash' && booking.payment_method !== 'cod') {
      const isAdmin = userId ? await bookingRepository.userHasRole(userId, 'super_admin') : false;
      if (!isAdmin) {
        throw new ForbiddenError('Payment status can only be manually changed for cash-on-delivery bookings.');
      }
    }

    await bookingRepository.updatePaymentStatus(id, paymentStatus);
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
            eventBus.emit('booking:fully-booked', {
              bookingId: invitation.booking_id,
              userId: puid,
              resourceId: 0,
            });
          }
        }
      }
    } else {
      eventBus.emit('booking:application-declined', {
        bookingId: invitation.booking_id,
        userId: invitation.invited_user_id,
        ownerId: userId,
      });
    }

    return { status: action };
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

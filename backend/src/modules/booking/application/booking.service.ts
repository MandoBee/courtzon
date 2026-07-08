import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { pricingEngine } from '../domain/pricing-engine.js';
import { commissionService } from '../../../shared/services/commission.service.js';
import { transactionService } from '../../financial/application/transaction.service.js';
import { transactionRepository } from '../../financial/infrastructure/transaction.repository.js';
import { walletRepository } from '../../wallet/infrastructure/repositories/wallet.repository.js';
import { resourceRepository } from '../../organisations/infrastructure/repositories/resource.repository.js';
import { slotGenerator } from '../domain/slot-generator.js';
import { redisLock } from '../infrastructure/redis/redis-lock.js';
import { getPool } from '../../../database/mysql.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../../shared/errors/app-error.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import type { CreateBookingInput } from '../presentation/booking.dto.js';
import type mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { eventBus } from '../../../shared/event-bus/index.js';

type RowData = mysql.RowDataPacket[];

const log = createModuleLogger('booking');

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export class BookingService {
  async createBooking(input: CreateBookingInput, userId: number) {
    const pool = getPool();

    // Derive organisation_id from branch
    const [branchRows] = await pool.execute<RowData>(
      'SELECT id, organisation_id FROM branches WHERE id = ?', [input.branchId],
    );
    if (branchRows.length === 0) throw new NotFoundError('Branch');
    const organisationId = (branchRows[0] as any).organisation_id;

    // Compute actual booking date (after-midnight slots belong to next calendar day)
    const resource = await resourceRepository.findById(input.resourceId);
    const openingTime = resource?.opening_time || '08:00';
    const closingTime = resource?.closing_time || '22:00';
    let bookingDate = input.bookingDate;
    if (closingTime < openingTime && input.startTime < openingTime) {
      bookingDate = addDays(input.bookingDate, 1);
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

    // Acquire distributed Redis lock for the slot to prevent concurrent bookings
    const lockOwner = `user:${userId}`;
    const lockAcquired = await redisLock.acquire(input.resourceId, bookingDate, input.startTime, lockOwner);
    if (!lockAcquired) {
      throw new Error('This slot is currently being booked by another user. Please try again.');
    }

    try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (isGateway) {
        // Check slot availability.
        const startSlot = { start: input.startTime, end: input.endTime, date: bookingDate };
        const available = await bookingRepository.checkSlotAvailability(
          input.resourceId, bookingDate, [startSlot], conn,
        );
        if (!available) throw new ConflictError('This slot is no longer available');

        // Create booking as pending/pending (like marketplace creates a pending order).
        const bookingId = await bookingRepository.create({
          userId, branchId: input.branchId, organisationId, resourceId: input.resourceId,
          bookingType: input.bookingType || 'public_match', bookingDate,
          startTime: input.startTime, endTime: input.endTime,
          totalAmount: pricing.totalPrice, commissionAmount, clubAmount,
          notes: input.notes, bookingStatus: 'pending', paymentStatus: 'pending',
          paymentMethod,
        }, conn);

        if (input.participants?.length) {
          for (const p of input.participants) {
            await conn.execute(
              `INSERT INTO booking_participants (booking_id, full_name, email, phone)
               VALUES (?, ?, ?, ?)`,
              [bookingId, null, null, p.phone || null]
            );
          }
        }

        await conn.commit();
        conn.release();

        // Charge payment gateway (outside transaction — may take time).
        const { paymentService } = await import('../../payment/application/payment.service.js');
        const gwResult = await paymentService.charge(userId, {
          referenceType: 'booking',
          referenceId: bookingId,
          amount: pricing.totalPrice,
          currency: 'EGP',
          paymentMethod: (paymentMethod === 'online' ? 'card' : paymentMethod as 'wallet' | 'card' | 'bank_transfer'),
          returnUrl: input.returnUrl,
        });

        if (!gwResult.success) {
          throw new ConflictError((gwResult as any).errorMessage || 'Payment gateway rejected the transaction');
        }

        const paymentUrl = ('paymentUrl' in gwResult ? gwResult.paymentUrl : null) || null;
        const clientSecret = ('clientSecret' in gwResult ? gwResult.clientSecret : null) || null;
        const paymentId = ('paymentId' in gwResult ? gwResult.paymentId : null) || null;

        const booking = await bookingRepository.findById(bookingId);

        // Matchmaking (non-fatal)
        if (booking && input.bookingType === 'public_match') {
          const mm = input.matchmaking || { targetGender: 'any', maxPlayers: 2, autoApply: false };
          try {
            await bookingRepository.createMatchmakingRequest({
              bookingId,
              minAge: mm.minAge,
              maxAge: mm.maxAge,
              targetGender: mm.targetGender || 'any',
              targetLevelId: mm.targetLevelId,
              maxPlayers: mm.maxPlayers || 2,
              deadline: mm.deadline,
              autoApply: mm.autoApply || false,
            });

            const resourceSport = await this.getResourceSport(booking.resource_id);

            const players = await bookingRepository.findMatchingPlayers(bookingId, {
              sportId: resourceSport,
              minAge: mm.minAge,
              maxAge: mm.maxAge,
              targetGender: mm.targetGender || 'any',
              targetLevelId: mm.targetLevelId,
              excludeUserId: userId,
            }            );

            if (players.length === 0) {
              log.info(`Matchmaking: No matching players found for booking ${bookingId}`);
            }

            if (mm.autoApply) {
              for (const player of players) {
                try {
                  const invId = await bookingRepository.createInvitation(bookingId, player.id);
                  await bookingRepository.updateInvitationStatus(invId, 'accepted');
                  await bookingRepository.addParticipantFromInvitation(bookingId, player.id, player.full_name);
                } catch (e: any) {
                  if (!e.message?.includes('already applied')) throw e;
                }
              }
            } else {
              for (const player of players) {
                try {
                  await bookingRepository.createInvitation(bookingId, player.id);
                  eventBus.emit('match:invitation' as any, {
                    userId: player.id,
                    bookingId,
                    senderId: userId,
                    actions: [
                      { label: 'Join Match', actionKey: 'join_match', routePattern: `/bookings/${bookingId}/join`, icon: 'users' },
                      { label: 'Decline', actionKey: 'decline_match', routePattern: `/bookings/${bookingId}/decline`, icon: 'x' },
                    ],
                  });
                } catch (e: any) {
                  if (!e.message?.includes('already applied')) throw e;
                }
              }
            }

            log.info(`Matchmaking: Created booking ${bookingId} with ${players.length} matched players`);
          } catch (mmErr) {
            log.error({ err: mmErr }, `Matchmaking start failed for booking ${bookingId}`);
          }
        }

        return { ...booking, paymentUrl, clientSecret, paymentId };
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

      // Final availability check WITHIN the transaction (FOR UPDATE semantics via UNIQUE constraint)
      const startSlot = { start: input.startTime, end: input.endTime, date: bookingDate };
      const available = await bookingRepository.checkSlotAvailability(
        input.resourceId, bookingDate, [startSlot], conn,
      );
      if (!available) throw new ConflictError('Slot is already booked');

      const bookingId = await bookingRepository.create({
        userId, branchId: input.branchId, organisationId, resourceId: input.resourceId,
        bookingType: input.bookingType || 'public_match', bookingDate,
        startTime: input.startTime, endTime: input.endTime,
        totalAmount: pricing.totalPrice, commissionAmount, clubAmount,
        notes: input.notes, bookingStatus, paymentStatus, paymentMethod,
      }, conn);

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
           VALUES ('due', 'booking', ?, 2, ?, 'completed')`,
          [bookingId, pricing.totalPrice]
        );
        await conn.execute(
          `INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, branch_id, organisation_id, description)
           VALUES (?, 'debit', 'due_from_customer', ?, ?, 2, ?, ?, ?),
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
          const gwResult = await paymentService.charge(userId, {
            referenceType: 'booking',
            referenceId: bookingId,
            amount: pricing.totalPrice,
            currency: 'EGP',
            paymentMethod: 'card',
            returnUrl: input.returnUrl,
          });
          paymentUrl = ('paymentUrl' in gwResult ? gwResult.paymentUrl : null) || null;
          clientSecret = ('clientSecret' in gwResult ? gwResult.clientSecret : null) || null;
          paymentId = ('paymentId' in gwResult ? gwResult.paymentId : null) || null;
        } catch {
          // non-fatal
        }
      }

      const booking = await bookingRepository.findById(bookingId);

      if (booking && input.bookingType === 'public_match') {
        const mm = input.matchmaking || { targetGender: 'any', maxPlayers: 2, autoApply: false };
        try {
          await bookingRepository.createMatchmakingRequest({
            bookingId,
            minAge: mm.minAge,
            maxAge: mm.maxAge,
            targetGender: mm.targetGender || 'any',
            targetLevelId: mm.targetLevelId,
            maxPlayers: mm.maxPlayers || 2,
            deadline: mm.deadline,
            autoApply: mm.autoApply || false,
          });

          const resourceSport = await this.getResourceSport(booking.resource_id);

          const players = await bookingRepository.findMatchingPlayers(bookingId, {
            sportId: resourceSport,
            minAge: mm.minAge,
            maxAge: mm.maxAge,
            targetGender: mm.targetGender || 'any',
            targetLevelId: mm.targetLevelId,
            excludeUserId: userId,
          });

          if (players.length === 0) {
            log.info(`Matchmaking: No matching players found for booking ${bookingId}`);
          }

          for (const player of players) {
            try {
              const invId = await bookingRepository.createInvitation(bookingId, player.id);
              if (mm.autoApply) {
                await bookingRepository.updateInvitationStatus(invId, 'accepted');
                await bookingRepository.addParticipantFromInvitation(bookingId, player.id, player.full_name);
              } else {
                eventBus.emit('match:invitation' as any, {
                  userId: player.id,
                  bookingId,
                  senderId: userId,
                  actions: [
                    { label: 'Join Match', actionKey: 'join_match', routePattern: `/bookings/${bookingId}/join`, icon: 'users' },
                    { label: 'Decline', actionKey: 'decline_match', routePattern: `/bookings/${bookingId}/decline`, icon: 'x' },
                  ],
                });
              }
            } catch (e: any) {
              if (!e.message?.includes('already applied')) throw e;
            }
          }

          log.info(`Matchmaking: Created booking ${bookingId} with ${players.length} matched players`);
        } catch (mmErr) {
          log.error({ err: mmErr }, `Matchmaking start failed for booking ${bookingId}`);
        }
      }

      if (booking) {
        eventBus.emit('booking:created', {
          bookingId,
          userId,
          courtId: input.resourceId || 0,
          startTime: new Date(`${input.bookingDate}T${input.startTime}`),
          endTime: new Date(`${input.bookingDate}T${input.endTime}`),
          organisationId: booking.organisation_id || undefined,
          branchId: input.branchId || undefined,
        });
      }

      if (bookingStatus === 'confirmed' && booking) {
        const startDate = new Date(`${String(booking.booking_date).split('T')[0]}T${booking.start_time}`);
        const { scheduleBookingReminder } = await import('../../notifications/application/scheduler.service.js');
        scheduleBookingReminder(bookingId, userId, startDate).catch((e: any) =>
          log.error({ err: e, bookingId }, 'Failed to schedule booking reminder')
        );
      }

      return { ...booking, paymentUrl, clientSecret, paymentId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    } finally {
      // Release the distributed Redis lock regardless of outcome
      await redisLock.release(input.resourceId, bookingDate, input.startTime, lockOwner);
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
            await conn.execute(
              'UPDATE payment_transactions SET payment_status = ? WHERE id = ?',
              ['paid', pt.id]
            );
          }
        } catch {
          // non-fatal
        }
      }

      const bookingStatus = isPaid ? 'confirmed' : 'pending';
      const paymentStatus = isPaid ? 'paid' : 'pending';

      const [createResult] = await conn.execute<mysql.ResultSetHeader>(
        `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
          booking_date, start_time, end_time, total_amount, commission_amount, club_amount,
          booking_status, payment_status, notes, payment_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), intent.user_id, intent.organisation_id, intent.branch_id, intent.resource_id,
         intent.booking_type, intent.booking_date, intent.start_time, intent.end_time,
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

      await conn.commit();

      const booking = await bookingRepository.findById(bookingId);

      if (intent.matchmaking && booking && intent.booking_type === 'public_match') {
        try {
          const mm = typeof intent.matchmaking === 'string' ? JSON.parse(intent.matchmaking) : intent.matchmaking;
          await bookingRepository.createMatchmakingRequest({
            bookingId,
            minAge: mm.minAge,
            maxAge: mm.maxAge,
            targetGender: mm.targetGender || 'any',
            targetLevelId: mm.targetLevelId,
            maxPlayers: mm.maxPlayers || 2,
            deadline: mm.deadline,
            autoApply: mm.autoApply || false,
          });
        } catch {
          // non-fatal
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
      throw new Error('Booking already cancelled');
    }
    if (booking.user_id !== userId) throw new ForbiddenError('You can only cancel your own bookings');

    const canCancel = await this._canUserCancel(booking);
    if (!canCancel) {
      throw new Error('Cancellation window has passed. Please contact support.');
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
        await bookingRepository.cancelWithRefund(id, userId, reason, feeAmount, paymentStatus, conn);
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
        await bookingRepository.createCancellationRecord(id, userId, reason, feeAmount, conn);
        await conn.execute('UPDATE bookings SET booking_status = ? WHERE id = ?', ['cancelled', id]);
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

    eventBus.emit('booking:cancelled', {
      bookingId: id,
      userId,
      reason: reason || undefined,
      organisationId: booking.organisation_id || undefined,
    });

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
    const allSlots = slotGenerator.generate(opening, closing, duration);

    const pool = getPool();
    const [branchRows] = await pool.execute<RowData>(
      `SELECT timezone FROM branches WHERE id = ?`, [resource.branch_id]
    );
    const tz = (branchRows[0] as any)?.timezone || 'Africa/Cairo';

    const nowStr = new Date().toLocaleString('en-US', { timeZone: tz });
    const nowMs = new Date(nowStr).getTime();

    const nextDate = addDays(date, 1);
    const bookings = await bookingRepository.findBookingsForResourceDate(resourceId, date);
    const nextDayBookings = allSlots.some(s => s.dayOffset > 0)
      ? await bookingRepository.findBookingsForResourceDate(resourceId, nextDate)
      : [];

    return allSlots
      .filter((slot) => {
        const slotDate = slot.dayOffset > 0 ? nextDate : date;
        const slotMs = new Date(`${slotDate}T${slot.start}:00`).getTime();
        return slotMs > nowMs;
      })
      .map((slot) => {
        const relevantBookings = slot.dayOffset > 0 ? nextDayBookings : bookings;
        const isBooked = relevantBookings.some((b: any) => {
          const bStart = b.start_time.slice(0, 5);
          const bEnd = b.end_time.slice(0, 5);
          return slot.start >= bStart && slot.start < bEnd;
        });
        return {
          slot_start: slot.start,
          slot_end: slot.end,
          dayOffset: slot.dayOffset,
          status: isBooked ? 'booked' : 'available',
        };
      });
  }

  async checkIn(id: number, userId: number) {
    const booking = await bookingRepository.findById(id);
    if (!booking) throw new NotFoundError('Booking');
    if (booking.booking_status !== 'confirmed') throw new Error('Only confirmed bookings can be checked in');
    await bookingRepository.checkIn(id);
    eventBus.emit('booking:check-in', {
      bookingId: id,
      userId,
      organisationId: booking.organisation_id || undefined,
    });
    return this.getBooking(id);
  }

  async updateBookingStatus(id: number, status: string, actorId?: number) {
    if (status === 'completed') {
      const booking = await bookingRepository.findById(id);
      if (!booking) throw new NotFoundError('Booking');
      const isCOD = booking.payment_method === 'cash' || booking.payment_method === 'cod';
      if (isCOD) {
        await bookingRepository.updateStatusAndPayment(id, 'completed', 'paid');
        await this._settleCODWallet(booking, 'payment', `COD booking #${booking.id} settled`);
      } else {
        await bookingRepository.updateStatus(id, 'completed');
      }
      eventBus.emit('booking:completed', {
        bookingId: id,
        userId: booking.user_id,
        organisationId: booking.organisation_id || undefined,
      });
      return;
    }

    if (status === 'pending' || status === 'confirmed') {
      const booking = await bookingRepository.findById(id);
      if (!booking) throw new NotFoundError('Booking');
      const isCOD = booking.payment_method === 'cash' || booking.payment_method === 'cod';
      if (isCOD) {
        await bookingRepository.updateStatusAndPayment(id, status, 'pending');
      } else {
        await bookingRepository.updateStatus(id, status);
      }
      if (status === 'confirmed') {
        eventBus.emit('booking:confirmed', {
          bookingId: id,
          userId: booking.user_id,
          organisationId: booking.organisation_id || undefined,
          branchId: booking.branch_id || undefined,
        });
      }
      return;
    }

    if (status === 'cancelled' || status === 'no_show') {
      const booking = await bookingRepository.findById(id);
      if (!booking) throw new NotFoundError('Booking');
      if (booking.booking_status === 'cancelled' || booking.booking_status === 'no_show') {
        throw new Error('Booking already cancelled/no-show');
      }

      const isCOD = booking.payment_method === 'cash' || booking.payment_method === 'cod';

      if (!isCOD && status === 'no_show') {
        await bookingRepository.updateStatus(id, 'no_show');
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
          await bookingRepository.cancelWithRefund(id, resolvedUserId, reason, feeAmount, paymentStatus);
        } else {
          await bookingRepository.markNoShowWithRefund(id, resolvedUserId, reason, feeAmount, paymentStatus);
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
        await bookingRepository.updateStatus(id, 'cancelled');
        await bookingRepository.createCancellationRecord(id, resolvedUserId, reason, feeAmount);
        if (refundAmount > 0 && booking.payment_status === 'paid') {
          await this._processGatewayRefund(booking, refundAmount);
        }
      }

      if (status === 'no_show') {
        eventBus.emit('booking:no-show', {
          bookingId: id,
          userId: booking.user_id,
          organisationId: booking.organisation_id || undefined,
        });
      } else {
        eventBus.emit('booking:cancelled', {
          bookingId: id,
          userId: booking.user_id,
          reason,
          organisationId: booking.organisation_id || undefined,
        });
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
      throw new Error('Matchmaking can only be started for active bookings');
    }

    if (criteria.deadline) {
      const bookingStart = new Date(`${String(booking.booking_date).split('T')[0]}T${booking.start_time}`);
      const deadline = new Date(criteria.deadline);
      if (deadline >= bookingStart) {
        throw new Error('Deadline must be before the booking start time');
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
    if (!request) throw new Error('No matchmaking request found for this booking');

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
    if (!request || !request.is_active) throw new Error('This booking is not accepting applications');
    if (request.deadline && new Date(request.deadline) < new Date()) {
      throw new Error('The application deadline for this match has passed');
    }

    const accepted = await bookingRepository.countAcceptedPlayers(bookingId);
    if (accepted >= request.max_players) throw new Error('This booking already has the maximum number of players');

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
    if (!rows.length || !rows[0].sport_id) throw new Error('Resource has no sport assigned');
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

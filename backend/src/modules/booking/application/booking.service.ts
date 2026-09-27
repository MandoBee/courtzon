import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { pricingEngine, PricingEngine } from '../domain/pricing-engine.js';
import { commissionService } from '../../financial/application/commission.service.js';
import { transactionService } from '../../financial/application/transaction.service.js';
import { transactionRepository } from '../../financial/infrastructure/transaction.repository.js';
import { walletRepository } from '../../wallet/infrastructure/repositories/wallet.repository.js';
import { resourceRepository } from '../../organisations/infrastructure/repositories/resource.repository.js';
import { redisLock } from '../infrastructure/redis/redis-lock.js';
import { getRedisClient } from '../../../infrastructure/redis/redis.client.js';
import { getPool } from '../../../database/mysql.js';
import { withTransaction, runProvidedTransaction } from '../../../database/database.transaction.js';
import { TimeEngine } from '../../time/index.js';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { BookingWindowPolicy } from '../domain/booking-window.policy.js';
import { rbacRepository } from '../../rbac/infrastructure/repositories/rbac.repository.js';
import { bookingSeriesRepository, weekdayNumbersToSet, weekdaySetToNumbers } from '../infrastructure/repositories/booking-series.repository.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { generateUUID } from '../../../shared/utils/token.js';
import type { CreateBookingInput, PrepareBookingInput, RecurringSeriesInput, RecurringCreateInput, RecurrenceResolution } from '../presentation/booking.dto.js';
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
import { noShowBookingHandler, type NoShowBookingPayload } from '../commands/no-show-booking.command.js';
import type { Command } from '../../../shared/command/command-base.js';
import { CancellationReason } from '../../../platform/shared/booking-types.js';

type RowData = mysql.RowDataPacket[];

/**
 * A rejected command surfaces as { status:'error', code, message } from the
 * command pipeline. Rebuild the original AppError so invalid lifecycle
 * transitions return the appropriate 4xx instead of being wrapped into a
 * generic Error that the global handler maps to 500.
 */
function throwCommandError(result: { code?: string; message?: string }): never {
  if (result.code === 'FORBIDDEN') throw new ForbiddenError(result.message || 'Forbidden');
  if (result.code === 'VALIDATION_ERROR') throw new ConflictError(result.message || 'Invalid command');
  throw new ConflictError(result.message || 'Command rejected');
}

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
  if (result.status === 'error') throwCommandError(result);
  return result.data;
}

const log = createModuleLogger('booking');

/**
 * R5-B — lazy accessor for `recurring-payment.service`. `recurring-payment`
 * pulls the DB pool (and therefore env) at module load; loading it through a
 * dynamic import here keeps unit specs that mock the DB layer (and import this
 * module) free of an env `process.exit`. Mirrors the existing lazy-import
 * convention used for `booking.service` inside `recurring-payment.service`.
 */
let seriesPaymentModule: typeof import('./recurring-payment.service.js') | undefined;
async function loadSeriesPaymentFor(seriesId: number) {
  seriesPaymentModule ??= await import('./recurring-payment.service.js');
  return seriesPaymentModule.loadSeriesPayment(seriesId);
}

/** R2 — Human-readable occurrence date for conflict messages (DD Mon YYYY). */
function occurrenceLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1] || m} ${y}`;
}

/** R3 — Bounded duration in minutes between two HH:mm local times (overnight-safe). */
function minutesBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e <= s) e += 1440;
  return e - s;
}

/** R3 — Format an HH:mm from total minutes (mod 24h). */
function timeFromMinutes(total: number): string {
  const m = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

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
  /**
   * Authoritative matchmaking-deadline guard.
   *
   * The deadline must be strictly before the ACTUAL booking start instant
   * (`start_at_utc`, computed by TimeEngine.localToUtc() with the branch
   * timezone). We never reconstruct the start from
   * `new Date(bookingDate + 'T' + startTime)` — that parses in the
   * server/container timezone and is wrong for non-UTC branches (the whole
   * point of the Business-Day fix). Both operands here are true instants, so
   * the comparison is timezone-independent.
   */
  private assertMatchmakingDeadlineBeforeStart(deadline: string | undefined, startAtUtc: string | undefined | null): void {
    if (!deadline || !startAtUtc) return;
    // startAtUtc may be an ISO string ("2026-09-14T21:00:00.000Z") or a MySQL
    // DATETIME literal ("2026-09-14 21:00:00") — the pool stores UTC (timezone
    // '+00:00'), so a space-separated literal must be interpreted as UTC, not
    // the server/host local timezone.
    const normalizedStart = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(startAtUtc)
      ? `${startAtUtc.replace(' ', 'T')}Z`
      : startAtUtc;
    const dl = new Date(deadline).getTime();
    const st = new Date(normalizedStart).getTime();
    if (Number.isNaN(dl) || Number.isNaN(st)) return;
    if (dl >= st) {
      throw new ConflictError('Deadline must be before the booking start time');
    }
  }

  /**
   * R1 — Can this user create bookings outside the 7-day player window?
   *
   * The player advance-booking window is bypassed ONLY when the user holds one
   * of the following EXISTING authorities (no new permission is introduced):
   *   - the `super_admin` / `super-admin` role, OR
   *   - the `admin.bookings.update-status` permission, OR
   *   - the `org.bookings.manage` permission.
   *
   * The decision is resolved from the user's DB roles/permissions — never from
   * the request body or any client-supplied state. Bypassing the window keeps
   * ALL normal availability, resource, pricing, booking, payment, locking and
   * ownership rules intact; only the date-window restriction is lifted.
   */
  async canBypassPlayerBookingWindow(userId: number): Promise<boolean> {
    if (!userId) return false;
    const [roles, permissionKeys] = await Promise.all([
      rbacRepository.getUserRoles(userId),
      rbacRepository.getUserPermissionKeys(userId),
    ]);
    const isSuperAdmin = roles.some(
      (r: any) => r.role_slug === 'super_admin' || r.role_slug === 'super-admin',
    );
    if (isSuperAdmin) return true;
    return permissionKeys.includes('admin.bookings.update-status')
      || permissionKeys.includes('org.bookings.manage');
  }

  /**
   * R1 — Server-side player booking-window guard (authoritative).
   *
   * For non-bypass users, the requested booking calendar date must fall within
   * the branch-local 7-day window (today .. today + 6). The window is computed
   * in the branch IANA timezone (calendar-date based, DST-safe). Applies BEFORE
   * pricing, availability checks, Redis locks, booking-row inserts and payment
   * gateway charges — an out-of-window request is rejected early and never
   * creates any workflow state.
   *
   * The "now" used for the window is `TimeEngine.now()` so tests can freeze the
   * clock deterministically via TimeEngine.setClock(new FakeClock(...)).
   */
  private async assertPlayerBookingWindow(input: CreateBookingInput, branchTz: string, userId: number): Promise<void> {
    if (await this.canBypassPlayerBookingWindow(userId)) return;
    const verdict = BookingWindowPolicy.evaluate({
      bookingDate: input.bookingDate,
      timezone: branchTz,
    });
    if (verdict.reason === 'INVALID_TIMEZONE' || verdict.reason === 'INVALID_DATE') {
      throw new ForbiddenError('Players can book only within the next 7 days', ErrorCodes.BOOKING_OUTSIDE_WINDOW);
    }
    if (!verdict.allowed) {
      throw new ForbiddenError(
        `Players can book only within the next 7 days (${verdict.minDate} to ${verdict.maxDate})`,
        ErrorCodes.BOOKING_OUTSIDE_WINDOW,
      );
    }
  }

  /**
   * Resolve the authoritative coach-session fee for booking_type='coach_session'.
   *
   * SECURITY: the client can never supply the coach amount. The coach is
   * resolved server-side from coachId, validated against the canonical coach
   * eligibility rules (approved status, availability, explicit service location,
   * branch coach policy/agreement, sport compatibility) and priced via the
   * shared canonical calculateCoachSessionPrice (hourly rate × court booking
   * duration). Non-coach bookings return 0 (court-only behavior unchanged).
   */
  private async resolveCoachSessionAmount(input: CreateBookingInput, courtSportId: number | null | undefined, endTime: string): Promise<number> {
    if (input.bookingType !== 'coach_session') return 0;
    if (!input.coachId) {
      throw new ValidationError('coachId is required for coach_session bookings');
    }
    const [{ activitiesRepository }, { calculateCoachSessionPrice }] = await Promise.all([
      import('../../activities/infrastructure/repositories/activities.repository.js'),
      import('../../scheduling/application/coach-pricing.js'),
    ]);
    const coach = await activitiesRepository.findCoachById(input.coachId);
    if (!coach) {
      throw new NotFoundError('Coach not found');
    }
    // Approved status + availability + service location + branch policy +
    // agreement are enforced by the canonical isCoachEligibleAtBranch below.
    const courtSport = courtSportId ? Number(courtSportId) : null;
    if (!courtSport) {
      throw new ForbiddenError('Court has no sport configured — coach booking unavailable');
    }
    let coachSports: number[] = [];
    if (coach.sports) {
      try {
        const raw = typeof coach.sports === 'string' ? JSON.parse(coach.sports) : coach.sports;
        coachSports = Array.isArray(raw) ? raw.map((n: any) => Number(n)).filter((n) => Number.isInteger(n) && n > 0) : [];
      } catch { coachSports = []; }
    }
    if (coachSports.length === 0 || !coachSports.includes(courtSport)) {
      throw new ForbiddenError('Coach does not support the sport of the selected court');
    }
    // Canonical service-location + branch policy (+ agreement when contract_required).
    const eligibility = await activitiesRepository.isCoachEligibleAtBranch(input.coachId, input.branchId);
    if (!eligibility.eligible) {
      throw new ForbiddenError(eligibility.reason || 'Coach is not eligible to provide coaching services at this branch');
    }
    const hourlyRate = coach.hourly_rate ? Number(coach.hourly_rate) : 0;
    return calculateCoachSessionPrice(hourlyRate, input.startTime, endTime);
  }

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

    // R1 — server-side player booking-window guard (authoritative).
    // Rejects an out-of-window date BEFORE pricing, availability, locks,
    // booking-row inserts or payment gateway charges. Administrative bypass is
    // decided server-side from the caller's authority (never the request body).
    await this.assertPlayerBookingWindow(input, branchTz, userId);

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

    // Authoritative deadline guard against the branch-timezone start instant.
    this.assertMatchmakingDeadlineBeforeStart(input.matchmaking?.deadline, startAtUtc);

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

    // Coach session fee (booking_type='coach_session' only). The coach fee is
    // ALWAYS computed server-side via the canonical pricing helper — the client
    // can never influence it. It is added to the court total so the player is
    // charged the combined amount and the accounting events receive the correct
    // coach economics. Non-coach bookings keep coachAmount = 0 (unchanged).
    const coachAmount = await this.resolveCoachSessionAmount(input, resource?.sport_id, endTime);
    const bookingTotal = Math.round((pricing.totalPrice + coachAmount) * 100) / 100;

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

    const paymentMethod = input.paymentMethod || 'card';
    // PHASE 1 (temporary) — wallet is not an active booking payment method.
    if ((paymentMethod as string) === 'wallet') {
      throw new ConflictError('Wallet is temporarily unavailable as a payment method. Please use Card or Cash.');
    }
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
          totalAmount: bookingTotal, commissionAmount, clubAmount,
          coachAmount,
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
            amount: Math.round((bookingTotal + taxAmount) * 100) / 100,
            currency: 'EGP',
            paymentMethod: (paymentMethod === 'online' ? 'card' : paymentMethod as 'card' | 'bank_transfer'),
            returnUrl: input.returnUrl,
            customerName: user?.full_name,
            customerPhone: user?.full_phone,
            customerEmail: user?.email,
          });
        } catch (chargeErr: any) {
          log.error({ err: chargeErr, bookingId, userId, paymentMethod }, 'Payment charge threw exception — cancelling booking');
          await executeBookingCommand('CancelBooking', cancelBookingHandler, { bookingId, reason: CancellationReason.PAYMENT_SESSION_CREATION_FAILED, actorId: 0 }, String(bookingId!));
          throw new ConflictError(chargeErr.message || 'Payment failed — booking rolled back');
        }

        if (!gwResult.success) {
          await executeBookingCommand('CancelBooking', cancelBookingHandler, { bookingId, reason: CancellationReason.PAYMENT_SESSION_CREATION_FAILED, actorId: 0 }, String(bookingId!));
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

        return { id: bookingId, bookingId, paymentUrl, clientSecret, paymentId, total_amount: bookingTotal, coach_amount: coachAmount };
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
        totalAmount: bookingTotal, commissionAmount, clubAmount,
        coachAmount,
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
      // The canonical booking:paid emit is intentionally deferred until AFTER
      // conn.commit() below (S11 hardening): a pre-commit emit would let the
      // realtime socket/notification handlers fire for a booking that could still
      // be rolled back. Preserving the exact payload.
      let codPaidPayload: Record<string, unknown> | null = null;
      if (paymentMethod === 'cash' || paymentMethod === 'cod') {
        const [txnResult] = await conn.execute<mysql.ResultSetHeader>(
          `INSERT INTO transactions (type, source_type, source_id, currency_id, total_amount, status)
           VALUES ('booking_payment', 'booking', ?, 2, ?, 'completed')`,
          [bookingId, bookingTotal]
        );
        await conn.execute(
          `INSERT INTO transaction_entries (transaction_id, side, entity_type, entity_id, amount, currency_id, branch_id, organisation_id, description)
           VALUES (?, 'debit', 'user_wallet', ?, ?, 2, ?, ?, ?),
                   (?, 'credit', 'branch', ?, ?, 2, ?, ?, ?)`,
          [txnResult.insertId, userId, bookingTotal, input.branchId, organisationId, `COD booking #${bookingId}`,
           txnResult.insertId, input.branchId, bookingTotal, input.branchId, organisationId, `COD booking #${bookingId}`]
        );
        // Canonical accounting trigger for COD — booking economics must reach
        // ledger_entries → general_ledger via booking:paid (see accounting listener).
        // Emitted after commit below so the event never fires for a rolled-back booking.
        codPaidPayload = {
          bookingId, userId,
          organisationId,
          grossAmount: bookingTotal, taxAmount, coachAmount,
          organisationAmount: clubAmount, commissionAmount,
          paymentMethod: 'cod', currency: 'EGP',
          sourceId: bookingId,
        };
      }

      await conn.commit();

      // S11 hardening: booking:paid for COD/cash is emitted ONLY after commit.
      // If commit failed the catch below rolls back and this line is never reached.
      if (codPaidPayload) {
        eventBusV2.emit('booking:paid', codPaidPayload as any);
      }

      const booking = await bookingRepository.findById(bookingId!);

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

    // R1 — same server-side player booking-window guard for the card "prepare"
    // flow. Rejected BEFORE the gateway intention is charged / any prepare
    // session lock is acquired. Administrative bypass is server-side only.
    await this.assertPlayerBookingWindow(input, branchTz, userId);

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

    // Authoritative deadline guard against the branch-timezone start instant.
    this.assertMatchmakingDeadlineBeforeStart(input.matchmaking?.deadline, startAtUtc);

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

    // Local payment row id created by createGatewayIntention on gateway success.
    // Used by the catch to best-effort expire an orphaned pending payment row.
    let localPaymentId: number | null = null;

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
      // booking_prepare has NO numeric reference — referenceId stays undefined so
      // the UUID is never written to payment_transactions.reference_id (bigint).
      // The payment row is later relinked to the booking via booking_id; the
      // gateway_reference (stored by createGatewayIntention) drives webhook lookup.
      // The prepareId UUID is passed as the gateway idempotencyKey so Paymob's
      // special_reference/merchant_order_id becomes `booking_prepare_<prepareId>_<ts>`
      // — a parseable, stable correlation token (never `booking_prepare_undefined_*`).
      const gwResult = await (paymentService.createGatewayIntention as any)(userId, {
        referenceType: 'booking_prepare',
        referenceId: undefined,
        idempotencyKey: prepareId,
        amount: pricing.totalPrice,
        currency: 'EGP',
        paymentMethod: input.paymentMethod === 'online' ? 'card' : input.paymentMethod as 'card',
        returnUrl: input.returnUrl,
        customerName: user?.full_name,
        customerPhone: user?.full_phone,
        customerEmail: user?.email,
      });

      // The local payment_transactions row (created by createGatewayIntention on
      // gateway success) is tracked so a later local failure can mark it expired
      // (best-effort local protection). The external gateway abstraction exposes
      // NO cancel/void/expire for an intention — a late webhook on an expired
      // local row is safely ignored (FINAL_STATES) without double-processing.
      if (gwResult.success) {
        localPaymentId = ('paymentId' in gwResult ? Number(gwResult.paymentId) : null) || null;
      }

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
        matchmaking: input.matchmaking || null,
      });
      await redis.set(`booking:prepare:${prepareId}`, prepareData, 'PX', 600000);

      return {
        prepareId,
        clientSecret: ('clientSecret' in gwResult ? gwResult.clientSecret : null) || null,
        paymentId: ('paymentId' in gwResult ? gwResult.paymentId : null) || null,
      };
    } catch (err) {
      await redisLock.releaseAll(lockSlots, lockOwner);
      // Best-effort local protection for an orphaned gateway intention: if the
      // gateway intention was created (local payment row exists) but a later step
      // failed, mark the local row expired so a late webhook is idempotently
      // skipped. This NEVER hides the original error and NEVER touches the gateway.
      if (localPaymentId != null) {
        try {
          const { paymentRepository } = await import('../../payment/infrastructure/repositories/payment.repository.js');
          await paymentRepository.expirePayment(localPaymentId);
          log.warn({ err, paymentId: localPaymentId }, 'prepareGatewayBooking: local payment row expired after gateway success + local failure (gateway intention has no cancel/void API)');
        } catch (cleanupErr: any) {
          log.error({ cleanupErr, paymentId: localPaymentId, originalErr: err }, 'prepareGatewayBooking: local payment expiry cleanup failed');
        }
      }
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
    // R1 — re-validate the player booking window at confirm time. The prepare
    // session may have been created within the window and confirmed later (e.g.
    // a player prepared on day 6 and returns on day 12). Resolve the branch
    // timezone and apply the same authoritative guard before any booking row is
    // inserted. Administrative bypass is resolved server-side.
    if (data.branchId) {
      const [branchRows] = await pool.execute<RowData>('SELECT timezone FROM branches WHERE id = ?', [data.branchId]);
      const branchTz = (branchRows[0] as any)?.timezone || 'Africa/Cairo';
      await this.assertPlayerBookingWindow(
        { bookingDate: data.bookingDate, branchId: data.branchId, resourceId: data.resourceId, bookingType: data.bookingType, startTime: data.startTime, endTime: data.endTime } as CreateBookingInput,
        branchTz,
        userId,
      );
    }
    let bookingId: number | undefined;
    const conn = await pool.getConnection();
    try {
      // Group 6 — manual connection transactions run inside the ALS transaction
      // context: `booking:created` and its derived `match:available` realtime
      // event are delivered ONLY after commit (never on rollback).
      await runProvidedTransaction(conn, async () => {

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
      const expiresAt = toMySqlDateTime(new Date(Date.now() + 10 * 60 * 1000));
      bookingId = await bookingRepository.create({
        userId, branchId: data.branchId, organisationId: data.organisationId, resourceId: data.resourceId,
        bookingType: data.bookingType, bookingDate: data.bookingDate,
        startTime: data.startTime, endTime: data.endTime,
        totalAmount: data.totalAmount, commissionAmount: data.commissionAmount, clubAmount: data.clubAmount,
        taxRate: data.taxRate, taxRateId: data.taxRateId, taxAmount: data.taxAmount, taxTreatment: data.taxTreatment, priceType: 'net',
        notes: data.notes, paymentMethod: data.paymentMethod,
        bookingStatus: 'pending_payment', paymentStatus: 'pending',
        startAtUtc: data.startAtUtc, endAtUtc: data.endAtUtc, businessDate: data.businessDate,
        expiresAt,
      }, conn);

      // Populate booking_slots
      for (const slot of data.individualSlots) {
        await conn.execute(
          `INSERT INTO booking_slots (booking_id, resource_id, booking_date, slot_start, slot_end, is_available)
           VALUES (?, ?, ?, ?, ?, FALSE)`,
          [bookingId, data.resourceId, data.bookingDate, slot.start, slot.end],
        );
      }

      // Persist matchmaking criteria for a public match — the prepare (card)
      // flow previously dropped them (they were only stored in the gateway
      // prepare payload, never on the booking), so the created match silently
      // defaulted to 2 players / no age criteria.
      if (data.bookingType === 'public_match' && data.matchmaking) {
        await bookingRepository.createMatchmakingRequest({
          bookingId,
          minAge: data.matchmaking.minAge,
          maxAge: data.matchmaking.maxAge,
          targetGender: data.matchmaking.targetGender || 'any',
          targetLevelId: data.matchmaking.targetLevelId,
          maxPlayers: data.matchmaking.maxPlayers || 2,
          deadline: data.matchmaking.deadline,
          autoApply: data.matchmaking.autoApply || false,
        }, conn);
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

      });

      // Link the payment transaction to this booking
      // createGatewayIntention stores with referenceType='booking_prepare' and booking_id=NULL
      // We use the paymentId stored in Redis during prepare to find the transaction
      const cachedPaymentId = data.paymentId;
      let paymentAlreadyPaid = false;
      if (cachedPaymentId) {
        const [linkResult] = await pool.execute<RowData>(
          `UPDATE payment_transactions SET booking_id = ?, reference_type = 'booking'
           WHERE id = ? AND reference_type = 'booking_prepare' AND booking_id IS NULL`,
          [bookingId!, cachedPaymentId],
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
          [bookingId!, userId],
        );
        if ((linkResult as any).affectedRows > 0) {
          // Check status of the row we just linked
          const [payRows] = await pool.execute<RowData>(
            `SELECT id, payment_status FROM payment_transactions WHERE booking_id = ? AND reference_type = 'booking' LIMIT 1`,
            [bookingId!],
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
          }, String(bookingId!));
        } catch (confirmErr) {
          const { createModuleLogger } = await import('../../../shared/utils/logger.js');
          const log = createModuleLogger('BookingService');
          log.warn({ err: confirmErr, bookingId }, 'Auto-confirm after prepare failed (webhook may complete later)');
        }
      }

      const booking = await bookingRepository.findById(bookingId!);
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
    // R4 — canonical cancellation remains owner-first, with ONE narrow addition:
    // a responsible user (the R3 recurring authority) may cancel an occurrence
    // booking that belongs to a recurring series (series management). This is
    // NOT a general staff override — a non-owner is only allowed for series
    // occurrences. Players still cancel their own bookings exactly as before.
    if (booking.user_id !== userId) {
      const isResponsible = await this.canBypassPlayerBookingWindow(userId);
      if (!isResponsible || !booking.series_id) {
        throw new ForbiddenError('You can only cancel your own bookings');
      }
    }

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
   * System-initiated compensation for a failed coach-booking saga (court booked,
   * coach-session creation/linking failed). It is the CANONICAL compensation
   * path used by the scheduling engine:
   *
   *   1. Cancels the booking via the canonical CancelBooking command (bypassing
   *      the user-facing cancellation window — this is a system compensation).
   *   2. Refunds ONLY if money actually moved. "Money moved" is decided from the
   *      AUTHORITATIVE persisted state — payment_transactions paid, or a
   *      wallet_transactions debit — NEVER from a premature booking.payment_status
   *      read (the wallet charge is synchronous but the confirm can land later).
   *   3. Uses the canonical wallet/gateway/COD refund paths, which:
   *        - verify the refund operation result (throw on failure — never a
   *          false "refunded"),
   *        - emit `booking:refunded` exactly once via _emitBookingRefunded
   *          (over-refund guard + refunded_amount increment → idempotent),
   *        - reverse accounting through the existing listener.
   *   4. Is idempotent against already-cancelled bookings (returns a no-op).
   *
   * Returns the actual outcome so callers never claim a refund that did not
   * happen. Throws on refund failure (surfaced, never swallowed).
   */
  async compensateFailedBooking(bookingId: number, reason: string): Promise<{ cancelled: boolean; refunded: boolean; refundAmount: number }> {
    const booking = await bookingRepository.findById(bookingId!);
    if (!booking) throw new NotFoundError('Booking');
    if (['cancelled', 'cancelled_with_fee'].includes(booking.booking_status)) {
      log.info({ bookingId }, 'compensation: booking already cancelled — no-op');
      return { cancelled: false, refunded: false, refundAmount: 0 };
    }

    return this._cancelAndFullRefund(booking, reason || CancellationReason.COMPENSATION, booking.user_id);
  }

  /**
   * Authorized service-provider / coach-initiated cancellation of a linked
   * booking with a FULL refund (AUD-003 G2-E2 Group 2).
   *
   * The coach is NOT the booking owner, so the canonical player path
   * (`cancelBooking`) is inapplicable (it requires the caller to BE the
   * booking's user and enforces the player cancellation window/fee). This is
   * the small service-level abstraction for "authorized provider cancels with
   * a full refund":
   *
   *   - bypasses ONLY the player cancellation window/fee restriction;
   *   - preserves EVERY existing payment/refund/accounting/idempotency guard
   *     (money-moved check, refunded_amount cap, `_emitBookingRefunded` once,
   *     no manual accounting entries, no manual wallet writes);
   *   - is idempotent against already-cancelled bookings (no-op, no refund).
   *
   * Callers MUST establish provider authorization first (e.g. the coach is the
   * session coach via G2-C object-level authorization). It never weakens
   * booking ownership — the coach is not treated as the booking owner, it only
   * authorizes the full-refund cancellation of the linked booking.
   */
  async cancelBookingByProvider(bookingId: number, actorId: number, reason: string): Promise<{ cancelled: boolean; refunded: boolean; refundAmount: number }> {
    const booking = await bookingRepository.findById(bookingId!);
    if (!booking) throw new NotFoundError('Booking');
    if (['cancelled', 'cancelled_with_fee'].includes(booking.booking_status)) {
      log.info({ bookingId }, 'provider cancel: booking already cancelled — no-op');
      return { cancelled: false, refunded: false, refundAmount: 0 };
    }

    return this._cancelAndFullRefund(booking, reason || CancellationReason.PROVIDER_CANCELLED, actorId);
  }

  /**
   * Shared core of the full-refund cancellation paths (coach / saga
   * compensation): cancels the booking via the canonical CancelBooking command,
   * then refunds ONLY if money actually moved, always through the canonical
   * wallet/gateway/COD refund machinery (`_processGatewayRefund` /
   * `_refundCODWallet` → `_emitBookingRefunded` exactly once). Never performs
   * accounting entries directly.
   */
  private async _cancelAndFullRefund(booking: any, reason: string, actorId: number): Promise<{ cancelled: boolean; refunded: boolean; refundAmount: number }> {
    // 1. Cancel the booking (canonical state transition).
    await executeBookingCommand(
      'CancelBooking', cancelBookingHandler,
      { bookingId: booking.id, reason, actorId },
      String(booking.id),
    );

    // 2. Refund only if money actually moved.
    const total = Number(booking.total_amount || 0);
    const isCOD = booking.payment_method === 'cash' || booking.payment_method === 'cod';
    if (isCOD) {
      // COD money is org-collected (never in the wallet); the canonical COD
      // refund reverses the recognition + operational entries (W1 — no wallet
      // balance mutation). Idempotent via the refunded_amount cap.
      await this._refundCODWallet(booking, total);
      return { cancelled: true, refunded: true, refundAmount: total };
    }

    const moneyMoved = await this._moneyMovedForBooking(booking);
    if (!moneyMoved) {
      log.info({ bookingId: booking.id }, 'full refund: no money moved — booking cancelled without refund');
      return { cancelled: true, refunded: false, refundAmount: 0 };
    }

    // Money moved — canonical wallet/gateway refund + booking:refunded once.
    await this._processGatewayRefund(booking, total);
    return { cancelled: true, refunded: true, refundAmount: total };
  }

  /**
   * Authoritative "did money actually move for this booking" check. Considers
   * (a) the amount actually captured in payment_transactions (paid/refunded),
   * and (b) a wallet_transactions DEBIT row for the booking — the wallet debit
   * is synchronous while the confirm (payment_status -> paid) can land later,
   * so booking.payment_status alone is NOT a safe signal for compensation.
   */
  private async _moneyMovedForBooking(booking: any): Promise<boolean> {
    const paid = await this._resolveBookingPaidAmount(booking);
    if (paid > 0) return true;
    const [rows] = await getPool().execute<RowData>(
      `SELECT 1 FROM wallet_transactions
       WHERE reference_type = 'booking' AND reference_id = ? AND direction = 'debit' LIMIT 1`,
      [booking.id],
    );
    return rows.length > 0;
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

    const bookingStart = await this._parseBookingStartDate(booking);
    const now = new Date();
    const minutesUntil = (bookingStart.getTime() - now.getTime()) / (1000 * 60);

    return minutesUntil >= maxWindow;
  }

  /**
   * Build the booking's start instant as a UTC Date.
   *
   * Precedence:
   *  1. `start_at_utc` — the authoritative absolute instant written by the
   *     booking pipeline via `TimeEngine.localToUtc(..., branchTz)` for all V2
   *     bookings (migrations 024/025). DST-safe by construction.
   *  2. Legacy rows without `start_at_utc` — the venue-local
   *     `booking_date + start_time` is converted to UTC in the BRANCH timezone
   *     via TimeEngine (DST-aware). Previously the date part was normalized to
   *     UTC while the time part was parsed as server-local (UTC in the
   *     container), producing a start instant shifted by the branch's offset.
   *
   * Falls back to an Invalid Date when the booking has no usable date/time or
   * the local→UTC conversion fails, which callers treat as "no policy
   * applicable" (their existing conservative behavior).
   */
  private async _parseBookingStartDate(booking: any): Promise<Date> {
    const utc = booking?.start_at_utc;
    if (utc != null) {
      const d = utc instanceof Date ? utc : new Date(utc);
      if (!isNaN(d.getTime())) return d;
    }

    const datePart = booking?.booking_date instanceof Date
      ? booking.booking_date.toISOString().slice(0, 10)
      : String(booking?.booking_date || '').slice(0, 10);
    const timePart = String(booking?.start_time || '00:00:00').slice(0, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart) || !/^\d{2}:\d{2}/.test(timePart)) {
      return new Date(NaN);
    }

    try {
      const tz = await this._resolveBookingTimezone(booking?.branch_id);
      return new Date(TimeEngine.localToUtc(datePart, timePart, tz));
    } catch {
      return new Date(NaN);
    }
  }

  private async _resolveBookingTimezone(branchId: number | null | undefined): Promise<string> {
    if (branchId == null) return 'Africa/Cairo';
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT timezone FROM branches WHERE id = ?', [branchId]
    );
    return (rows[0] as any)?.timezone || 'Africa/Cairo';
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

    const bookingStart = await this._parseBookingStartDate(booking);
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

  private async _processRefund(booking: any, refundAmount: number, userId: number, paymentTransactionId: number | null, conn: mysql.PoolConnection): Promise<boolean> {
    // Money movement is the gating step for a refund. Failures are propagated
    // (not swallowed): if the wallet credit cannot be persisted, the caller
    // must NOT advance booking:refunded / refunded_amount — that would be a
    // false refund (R2/W4). Previously the updateBalance result was ignored and
    // every failure was caught, silently posting refund accounting without
    // returning the money.
    if (refundAmount <= 0) return false;

    // Idempotency anchor (same pattern as marketplace order_refund / complaint
    // refund / PaymentService payment_refund): a successful booking wallet
    // refund writes a single unique (booking_refund, <payment_transactions.id>)
    // wallet_transactions row. If it already exists the credit completed on a
    // previous attempt — skip the re-credit and return `false` so the caller
    // does NOT advance refunded_amount again (money for this payment has
    // already moved; the prior operation advanced it atomically).
    // uq_wallet_txn_ref (reference_type, reference_id) is the DB backstop; the
    // caller's booking-row FOR UPDATE serializes concurrent refunds.
    // When no payment_transactions row exists (legacy/edge wallet booking) the
    // atomic booking-row transaction still prevents double movement via the cap,
    // so no anchor is required.
    if (paymentTransactionId != null) {
      const existingRefunds = await walletRepository.findTransactionsByReference('booking_refund', paymentTransactionId, conn);
      if (existingRefunds.length > 0) {
        log.info({ bookingId: booking.id, paymentTransactionId }, 'Booking wallet refund already credited — idempotent skip');
        return false;
      }
    }

    const wallet = await walletRepository.findByUserId(userId);
    if (!wallet) {
      throw new Error(`Cannot refund booking #${booking.id}: user ${userId} has no wallet`);
    }
    const current = await walletRepository.lockAndGetBalance(wallet.id, conn);
    if (!current) {
      throw new Error(`Cannot refund booking #${booking.id}: wallet ${wallet.id} is locked or missing`);
    }
    const newBalance = current.balance + refundAmount;
    const updated = await walletRepository.updateBalance(wallet.id, newBalance, current.version, conn);
    if (!updated) {
      throw new Error(`Cannot refund booking #${booking.id}: concurrent wallet update — please retry`);
    }

    if (paymentTransactionId != null) {
      await walletRepository.createTransaction({
        walletId: wallet.id,
        type: 'refund',
        amount: refundAmount,
        direction: 'credit',
        referenceType: 'booking_refund',
        referenceId: paymentTransactionId,
        description: `Booking #${booking.id} cancellation refund`,
      }, conn);
    }

    await transactionService.createRefund({
      userId,
      walletId: wallet.id,
      branchId: booking.branch_id,
      organisationId: booking.organisation_id,
      amount: refundAmount,
      sourceId: booking.id,
      description: `Booking #${booking.id} cancellation refund`,
    }, conn);

    eventBusV2.emit('wallet:transaction', {
      walletId: wallet.id,
      userId,
      amount: refundAmount,
      balance: newBalance,
      type: 'refund',
      description: `Booking #${booking.id} cancellation refund`,
    }, undefined, conn);

    return true;
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
          // Overnight booking (end before start, e.g. 23:00 → 00:00) ends on
          // the NEXT calendar day in UTC. Without the bump, localToUtc(bookingDate,
          // '00:00') resolves to midnight at the START of the day and produces an
          // inverted window that never overlaps the 23:00 slot.
          let endDate = b.bookingDate;
          if (b.endTime < b.startTime) {
            const [y, m, d] = b.bookingDate.split('-').map(Number);
            const next = new Date(Date.UTC(y, m - 1, d + 1));
            endDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
          }
          const startUtc = TimeEngine.localToUtc(b.bookingDate, b.startTime, tz);
          const endUtc = TimeEngine.localToUtc(endDate, b.endTime, tz);
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

  /**
   * R1 — Authoritative player booking window for the resource availability
   * response (window is always BRANCH-local; never browser/server-local).
   *
   * Returns { timezone, minDate, maxDate } where maxDate is null when the user
   * holds the administrative bypass (super_admin / admin.bookings.update-status
   * / org.bookings.manage) — the frontend then does not cap the date picker for
   * those users. This is a small non-DB response field on the existing slots
   * endpoint; no new database column is introduced.
   */
  async getResourceBookingWindow(resourceId: number, userId?: number): Promise<{ timezone: string; minDate: string; maxDate: string | null }> {
    const resource = await resourceRepository.findById(resourceId);
    if (!resource) throw new NotFoundError('Resource');
    const pool = getPool();
    const [branchRows] = await pool.execute<RowData>(
      `SELECT timezone FROM branches WHERE id = ?`, [resource.branch_id]
    );
    const tz = (branchRows[0] as any)?.timezone || 'Africa/Cairo';
    const window = BookingWindowPolicy.getWindow({ timezone: tz });
    const bypassed = userId ? await this.canBypassPlayerBookingWindow(userId) : false;
    return {
      timezone: tz,
      minDate: window.minDate,
      maxDate: bypassed ? null : window.maxDate,
    };
  }

  /**
   * R2 — Canonical recurring booking core.
   *
   * DESIGN NOTE (revisited against the R2 stop-conditions):
   * R2 cannot reuse `bookingService.createBooking()` per occurrence because the
   * canonical service ALWAYS engages financial behavior (card → gateway charge,
   * cash → booking_payment transaction + `booking:paid` → accounting entries),
   * which R2 must not create. Calling it repeatedly would therefore violate the
   * "no payment/accounting rows" rule, and adding a payment-less mode to the
   * closed R1 createBooking signature would modify closed behavior.
   *
   * Instead each occurrence is created through the SAME canonical primitives the
   * project already uses for non-financial canonical bookings (the sanctioned
   * courtReservationService pattern): bookingRepository.checkSlotAvailability
   * (resources FOR UPDATE serialization + bookings/academy-hold overlap count),
   * bookingRepository.create() (the canonical bookings table), booking_slots
   * footprint rows, pricingEngine.calculatePrice() + computeBookingEconomics()
   * (same snapshot logic as createBookingV2), and the canonical `booking:created`
   * event. This is NOT a second booking/occupancy engine — every occurrence is
   * a normal `bookings` row that fully participates in the existing occupancy,
   * cancellation, settlement and query machinery.
   *
   * The whole series is created in ONE transaction (all-or-nothing): if any
   * occurrence conflicts with an existing individual booking, the entire series
   * rolls back and no partial series is left behind. No skip/override/force/
   * alternative policy is invented — that is R3 territory.
   */
  static readonly MAX_SERIES_OCCURRENCES = 366;

  private static fmtDate(v: any): string {
    if (!v) return '';
    if (v instanceof Date) {
      const d = v;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return String(v).slice(0, 10);
  }

  private static fmtTime(v: any): string {
    if (!v) return '';
    if (v instanceof Date) {
      return v.toISOString().slice(11, 16);
    }
    return String(v).slice(0, 5);
  }

  /** R3 — branch-local calendar date N days ahead (Date.UTC-safe arithmetic). */
  static addCalendarDays(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1, d + days));
    return [
      String(target.getUTCFullYear()).padStart(4, '0'),
      String(target.getUTCMonth() + 1).padStart(2, '0'),
      String(target.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  /**
   * R3 — Day-8 rule: recurring series may contain only dates >= branch-local
   * today + 7 calendar days. Players book today..today+6 (R1); recurring
   * reservations start on Day 8.
   */
  static async day8SeriesMinDate(branchTz: string): Promise<string> {
    const todayLocal = TimeEngine.utcToLocalDate(TimeEngine.now(), branchTz);
    return BookingService.addCalendarDays(todayLocal, 7);
  }

  /**
   * R2 — Side-effect-free preview: generated deterministic occurrence list for
   * a weekly recurrence definition. No bookings, no reservations, no locks,
   * no payment calls. The branch IANA timezone is resolved read-only.
   */
  async previewRecurringSeries(input: RecurringSeriesInput) {
    const pool = getPool();
    const [branchRows] = await pool.execute<RowData>(
      'SELECT id, organisation_id, timezone FROM branches WHERE id = ?', [input.branchId],
    );
    if (branchRows.length === 0) throw new NotFoundError('Branch');
    const organisationId = Number((branchRows[0] as any).organisation_id);
    const branchTz = (branchRows[0] as any).timezone || 'Africa/Cairo';

    const resource = await resourceRepository.findById(input.resourceId);
    if (!resource) throw new NotFoundError('Resource');
    if (Number(resource.branch_id) !== Number(input.branchId)) {
      throw new ForbiddenError('Resource does not belong to the selected branch');
    }

    const occurrences = TimeEngine.generateWeeklyOccurrences({
      startDate: input.startDate,
      endDate: input.endDate,
      weekdays: input.weekdays,
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: branchTz,
    });

    if (occurrences.length > BookingService.MAX_SERIES_OCCURRENCES) {
      throw new ConflictError(`Recurring series exceeds the maximum of ${BookingService.MAX_SERIES_OCCURRENCES} occurrences`);
    }

    // R3 — Day-8 rule + authoritative conflict matrix.
    const minSeriesDate = await BookingService.day8SeriesMinDate(branchTz);
    const violating = occurrences.filter((o) => o.date < minSeriesDate).map((o) => o.date);

    // R5-A — Canonical per-occurrence pricing. Every occurrence is priced on
    // its OWN branch-local date, so a Monday+Thursday series prices each
    // occurrence with its own weekday pricing. Side-effect free (reads only).
    const priced = await this.priceRecurringOccurrences(
      organisationId,
      input.branchId,
      branchTz,
      occurrences.map((o: any) => ({
        date: o.date,
        startTime: o.startTime,
        endTime: o.endTime,
        courtId: input.resourceId,
      })),
    );
    const seriesTotal = PricingEngine.sumOccurrenceTotals(priced.map((p) => p.totalAmount));

    const matrix: any[] = [];
    for (let i = 0; i < occurrences.length; i++) {
      const occ = occurrences[i];
      const pricing = priced[i];
      const available = await bookingRepository.checkSlotAvailability(
        input.resourceId, occ.date,
        [{ start: occ.startTime, end: occ.endTime, date: occ.date }],
      );
      if (available) {
        matrix.push({
          ...this.occurrenceBase(occ),
          status: 'available',
          conflictReason: null,
          alternativeCourts: [],
          alternativeTimes: [],
          hasAlternative: false,
          pricing: this.occurrencePricing(pricing),
        });
        continue;
      }
      // Conflict → alternatives (courts first; times only when no court works).
      const altCourts = (await this.findAlternativeCourts(input.branchId, resource, occ.date, occ.startTime, occ.endTime))
        .map((c) => ({ courtId: c.id, name: c.name, sportName: c.sport_name || null }));
      const altTimes = altCourts.length ? [] : await this.findAlternativeTimes(resource, occ.date, occ.startTime, occ.endTime);
      matrix.push({
        ...this.occurrenceBase(occ),
        status: 'conflict',
        conflictReason: 'An existing booking overlaps this requested court and time.',
        alternativeCourts: altCourts,
        alternativeTimes: altTimes,
        hasAlternative: altCourts.length > 0 || altTimes.length > 0,
        pricing: this.occurrencePricing(pricing),
      });
    }

    return {
      timezone: branchTz,
      count: occurrences.length,
      allowedStartDate: minSeriesDate,
      containsBeforeDay8: violating.length > 0,
      violatingDates: violating,
      occurrences: matrix,
      // R5-A — authoritative series total (sum of the per-occurrence canonical
      // prices above). Recomputed on final creation; never client-supplied.
      seriesTotal,
      first: occurrences[0] ? { date: occurrences[0].date, startTime: occurrences[0].startTime, endTime: occurrences[0].endTime } : null,
      last: occurrences[occurrences.length - 1] ? { date: occurrences[occurrences.length - 1].date, startTime: occurrences[occurrences.length - 1].startTime, endTime: occurrences[occurrences.length - 1].endTime } : null,
    };
  }

  /**
   * R5-A — canonical price + economic snapshot for every occurrence.
   *
   * Each occurrence goes through the SAME canonical pricing engine and the
   * SAME `computeBookingEconomics()` helper the single-booking path uses, with
   * the occurrence's OWN local date as the pricing date. Nothing is priced
   * "for the series" — the series total is only ever the sum of these.
   *
   * Read-only (no bookings, locks, payments or accounting).
   */
  private async priceRecurringOccurrences(
    organisationId: number,
    branchId: number,
    branchTz: string,
    slots: Array<{ date: string; startTime: string; endTime: string; courtId: number }>,
  ) {
    // Canonical pricing is a pure function of (court, weekday, window), so a
    // weekly series repeats the same price per weekday. Memoising keeps the
    // per-occurrence cost constant without changing any result.
    const priceCache = new Map<string, { totalPrice: number; standardAmount: number; peakAmount: number; peakMultiplier: number; dayOfWeek: number }>();
    const econCache = new Map<number, any>();
    const results: any[] = [];

    for (const slot of slots) {
      const dayOfWeek = TimeEngine.getLocalDayOfWeekFromDate(slot.date);
      const key = `${slot.courtId}|${dayOfWeek}|${slot.startTime}|${slot.endTime}`;
      let priced = priceCache.get(key);
      if (!priced) {
        const p = await pricingEngine.calculatePrice(slot.courtId, slot.startTime, slot.endTime, {
          date: slot.date,
          timezone: branchTz,
        });
        priced = {
          totalPrice: p.totalPrice,
          standardAmount: p.standardAmount,
          peakAmount: p.peakAmount,
          peakMultiplier: p.peakMultiplier,
          dayOfWeek: p.dayOfWeek,
        };
        priceCache.set(key, priced);
      }

      // Canonical occurrence amount — the SAME 2dp rule the single-booking path
      // applies to `totalAmount` (Math.round(n * 100) / 100).
      const totalAmount = Math.round(priced.totalPrice * 100) / 100;
      let economics = econCache.get(totalAmount);
      if (!economics) {
        economics = await this.computeBookingEconomics(organisationId, branchId, totalAmount);
        econCache.set(totalAmount, economics);
      }

      results.push({
        date: slot.date,
        pricingDate: slot.date,
        weekday: dayOfWeek,
        dayOfWeek: priced.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        courtId: slot.courtId,
        totalPrice: priced.totalPrice,
        standardAmount: priced.standardAmount,
        peakAmount: priced.peakAmount,
        peakMultiplier: priced.peakMultiplier,
        totalAmount,
        ...economics,
      });
    }

    return results;
  }

  /** R5-A — the per-occurrence pricing payload exposed on the preview matrix. */
  private occurrencePricing(p: any) {
    return {
      date: p.date,
      weekday: p.weekday,
      dayOfWeek: p.dayOfWeek,
      startTime: p.startTime,
      endTime: p.endTime,
      totalPrice: p.totalPrice,
      standardAmount: p.standardAmount,
      peakAmount: p.peakAmount,
      peakMultiplier: p.peakMultiplier,
      totalAmount: p.totalAmount,
      commissionAmount: p.commissionAmount,
      clubAmount: p.clubAmount,
      taxRate: p.taxRate,
      taxRateId: p.taxRateId,
      taxAmount: p.taxAmount,
      taxTreatment: p.taxTreatment,
    };
  }

  private occurrenceBase(occ: any) {
    return {
      date: occ.date,
      weekday: occ.weekday,
      startTime: occ.startTime,
      endTime: occ.endTime,
      occurrenceKey: occ.date,
      startAtUtc: occ.startAtUtc,
      endAtUtc: occ.endAtUtc,
    };
  }

  /**
   * R3 — Create a recurring series for ONE PLAYER (owned by the player) on
   * behalf of the responsible admin (operator), applying the admin's confirmed
   * resolution plan with a final authoritative TOCTOU re-check.
   *
   * Ownership model (audit result): `bookings.user_id` is the ONLY canonical
   * owner/beneficiary field → it is set to the PLAYER. `booking_series.created_by`
   * is the OPERATOR (admin). The Audit Log records operator + player + series
   * + the resolution plan. No new ownership field is created.
   *
   * Day-8 rule: every occurrence must be >= branch-local today + 7 calendar
   * days; the series is rejected (never truncated/moved) otherwise.
   *
   * TOCTOU: between preview and confirm another booking may appear. The final
   * confirm re-evaluates authoritative availability for EVERY planned
   * occurrence (both before and inside the transaction). If an occurrence now
   * conflicts, the whole series is rejected and the affected occurrence(s) are
   * surfaced so the admin can re-resolve — nothing is silently created.
   */
  async createRecurringSeries(input: RecurringSeriesInput & { playerUserId: number; idempotencyKey?: string; resolutions?: RecurrenceResolution[] }, userId: number) {
    // 1. Authorization — existing responsible-user authorities only.
    if (!(await this.canBypassPlayerBookingWindow(userId))) {
      throw new ForbiddenError('Only authorised responsible users can create recurring reservations');
    }

    // 2. Branch → organisation + timezone (identical resolution to createBooking).
    const pool = getPool();
    const [branchRows] = await pool.execute<RowData>(
      'SELECT id, organisation_id, timezone FROM branches WHERE id = ?', [input.branchId],
    );
    if (branchRows.length === 0) throw new NotFoundError('Branch');
    const organisationId = Number((branchRows[0] as any).organisation_id);
    const branchTz = (branchRows[0] as any).timezone || 'Africa/Cairo';

    // 3. Tenant/branch isolation — the resource must actually belong to the branch.
    const resource = await resourceRepository.findById(input.resourceId);
    if (!resource) throw new NotFoundError('Resource');
    if (Number(resource.branch_id) !== Number(input.branchId)) {
      throw new ForbiddenError('Resource does not belong to the selected branch');
    }

    // 4. Validate recurrence definition + generate deterministic occurrences (pure).
    const occurrences = TimeEngine.generateWeeklyOccurrences({
      startDate: input.startDate,
      endDate: input.endDate,
      weekdays: input.weekdays,
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: branchTz,
    });
    if (occurrences.length === 0) {
      throw new ConflictError('The recurrence definition produces no occurrences');
    }
    if (occurrences.length > BookingService.MAX_SERIES_OCCURRENCES) {
      throw new ConflictError(`Recurring series exceeds the maximum of ${BookingService.MAX_SERIES_OCCURRENCES} occurrences`);
    }

    // 5. Day-8 rule — hard rejection, never truncate/move.
    const minSeriesDate = await BookingService.day8SeriesMinDate(branchTz);
    const day8Violations = occurrences.filter((o) => o.date < minSeriesDate).map((o) => o.date);
    if (day8Violations.length) {
      throw new ConflictError(
        `Recurring bookings can only start from Day 8 onward (branch-local ${minSeriesDate} or later). ` +
        `The earliest allowed date is ${minSeriesDate}; violating occurrence(s): ${day8Violations.join(', ')}`,
      );
    }

    // 6. Player (beneficiary) must exist. Operator = userId; beneficiary = player.
    const [pRows] = await pool.execute<RowData>(
      'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [input.playerUserId],
    );
    if (pRows.length === 0) throw new NotFoundError('Player');

    // 6b. Whole-series idempotency (BEFORE any availability re-check so a
    //     retry of an already-created series returns it instead of seeing its
    //     own occurrence bookings as conflicts).
    if (input.idempotencyKey) {
      const existing = await bookingSeriesRepository.findByIdempotencyKey(input.idempotencyKey);
      if (existing) {
        return this.describeRecurringSeries(existing.id);
      }
    }

    // 7. Admin resolution plan → the FINAL explicit plan.
    const resMap = new Map<string, RecurrenceResolution>((input.resolutions || []).map((r) => [r.occurrenceDate, r]));
    const planned = await this.buildPlannedOccurrences(occurrences, resMap, input, resource, organisationId, input.branchId, branchTz, userId);
    if (planned.length === 0) {
      throw new ConflictError('No occurrences selected for the recurring series — series not created');
    }

    // 8. R5-A — canonical per-occurrence pricing + economic snapshot.
    //    Every PLANNED occurrence is priced on its OWN branch-local date and
    //    its actual (possibly alternative) court/time, through the SAME
    //    canonical pricing engine + computeBookingEconomics() used by
    //    createBookingV2. The series total is ONLY ever the sum of these —
    //    nothing is priced "for the series" and no client total is trusted
    //    (the recurring schema carries no client price field at all).
    const pricedByDate = new Map<string, any>(
      (await this.priceRecurringOccurrences(
        organisationId,
        input.branchId,
        branchTz,
        planned.map((p) => ({
          date: p.date,
          startTime: p.startTime,
          endTime: p.endTime,
          courtId: p.courtId,
        })),
      )).map((p) => [p.date, p]),
    );

    // 9. TOCTOU re-check (pre-transaction): surface any now-conflicting
    //    occurrence for re-resolution instead of silently creating.
    const toctouConflicts: string[] = [];
    for (const p of planned) {
      const ok = await bookingRepository.checkSlotAvailability(
        p.courtId, p.date, [{ start: p.startTime, end: p.endTime, date: p.date }],
      );
      if (!ok) toctouConflicts.push(`${p.date} (court ${p.courtId})`);
    }
    if (toctouConflicts.length) {
      throw new ConflictError(`Availability changed since the preview — please resolve again: ${toctouConflicts.join(', ')}`);
    }

    // 10. Transactional creation — ONE commit for the series + ALL planned occurrences.
    const publicId = generateUUID();
    const conn = await pool.getConnection();
    const resourceById = await this.resourceMapForPlanned(planned, resource, input.branchId);
    try {
      const seriesId = await runProvidedTransaction(conn, async () => {
        const newSeriesId = await bookingSeriesRepository.create({
          publicId,
          organisationId,
          branchId: input.branchId,
          resourceId: input.resourceId,
          createdBy: userId, // OPERATOR (auditable)
          weekdays: weekdayNumbersToSet(input.weekdays),
          startDate: input.startDate,
          endDate: input.endDate,
          startTime: input.startTime,
          endTime: input.endTime,
          timezone: branchTz,
          status: 'active',
          idempotencyKey: input.idempotencyKey || null,
        }, conn);

        for (const occ of planned) {
          const court = resourceById.get(Number(occ.courtId));
          if (!court) throw new ConflictError(`Alternative court ${occ.courtId} no longer available for ${occ.date}`);

          // R5-A — authoritative per-occurrence price/economics computed in
          // step 8 from this occurrence's own local date + actual court/time.
          const occPricing = pricedByDate.get(occ.date);
          if (!occPricing) throw new ConflictError(`Pricing could not be resolved for occurrence ${occ.date}`);

          // Occurrence-level idempotency pre-check (hard guarantee: the unique
          // key uk_booking_series_occurrence below).
          const [dupRows] = await conn.execute<RowData>(
            'SELECT id FROM bookings WHERE series_id = ? AND booking_date = ? AND start_time = ? LIMIT 1',
            [newSeriesId, occ.date, occ.startTime],
          );
          if (dupRows.length) continue;

          // FINAL authoritative availability check inside the transaction
          // (resource FOR UPDATE serialization) — existing bookings are never
          // overwritten and a TOCTOU conflict rolls back the WHOLE series.
          const available = await bookingRepository.checkSlotAvailability(
            occ.courtId, occ.date,
            [{ start: occ.startTime, end: occ.endTime, date: occ.date }],
            conn,
          );
          if (!available) {
            throw new ConflictError(`Occurrence on ${occurrenceLabel(occ.date)} (court ${occ.courtId}) conflicted during final confirmation — please resolve again`);
          }

          const startAtUtc = TimeEngine.localToUtc(occ.date, occ.startTime, branchTz);
          const endDate = occ.endTime <= occ.startTime
            ? BookingService.addCalendarDays(occ.date, 1)
            : occ.date;
          const endAtUtc = TimeEngine.localToUtc(endDate, occ.endTime, branchTz);
          const openingTime = court.opening_time || '08:00';
          const closingTime = court.closing_time || '22:00';
          const businessDate = TimeEngine.getBusinessDate(startAtUtc, openingTime, closingTime, branchTz);

          const bookingId = await bookingRepository.create({
            userId: input.playerUserId, // OWNER / BENEFICIARY = the player
            branchId: input.branchId,
            organisationId,
            resourceId: occ.courtId,
            bookingType: 'private_match',
            bookingDate: occ.date,
            startTime: occ.startTime,
            endTime: occ.endTime,
            // R5-A — this occurrence's OWN canonical price/economics snapshot
            // (priced on occ.date's weekday), never a series-wide constant.
            totalAmount: occPricing.totalAmount,
            commissionAmount: occPricing.commissionAmount,
            clubAmount: occPricing.clubAmount,
            coachAmount: 0,
            taxRate: occPricing.taxRate,
            taxRateId: occPricing.taxRateId,
            taxAmount: occPricing.taxAmount,
            taxTreatment: occPricing.taxTreatment,
            priceType: 'net',
            notes: JSON.stringify({ referenceType: 'booking_series', seriesId: newSeriesId, operatorId: userId, playerId: input.playerUserId }),
            bookingStatus: 'pending',
            paymentStatus: 'pending',
            startAtUtc,
            endAtUtc,
            businessDate,
            seriesId: newSeriesId,
          }, conn);

          // Canonical booking_slots footprint (is_available FALSE).
          const slotDuration = (court as any)?.slot_duration || (court as any)?.default_slot_duration || 60;
          const segs = splitTimeRange(occ.startTime, occ.endTime, slotDuration);
          for (const seg of segs) {
            await conn.execute(
              `INSERT INTO booking_slots (booking_id, resource_id, booking_date, slot_start, slot_end, is_available)
               VALUES (?, ?, ?, ?, ?, FALSE)`,
              [bookingId, occ.courtId, occ.date, seg.start, seg.end],
            );
          }

          // Canonical event (player is the beneficiary → notify the player).
          await eventBusV2.emit('booking:created', {
            bookingId,
            userId: input.playerUserId,
            courtId: occ.courtId || 0,
            resourceId: occ.courtId || 0,
            bookingDate: occ.date,
            startTime: new Date(startAtUtc),
            endTime: new Date(endAtUtc),
            startAtUtc,
            endAtUtc,
            bookingType: 'private_match',
            organisationId,
            branchId: input.branchId,
          }, undefined, conn);
        }

        return newSeriesId;
      });

      log.info({ seriesId, occurrences: planned.length, operator: userId, player: input.playerUserId }, 'recurring.series_created');
      return this.describeRecurringSeries(seriesId);
    } finally {
      conn.release();
    }
  }

  /**
   * Build the FINAL explicit occurrence plan from the admin's resolutions.
   * Validated: resolutions must reference generated occurrence dates; alternate
   * courts must be compatible and belong to the branch; alternate times stay on
   * the SAME date/court with the SAME duration within branch hours.
   */
  private async buildPlannedOccurrences(
    occurrences: any[],
    resMap: Map<string, RecurrenceResolution>,
    input: RecurringSeriesInput,
    requestedResource: any,
    organisationId: number,
    branchId: number,
    branchTz: string,
    operatorUserId: number,
  ) {
    const planned: Array<{ date: string; weekday: number; courtId: number; startTime: string; endTime: string; requestedCourt: number }> = [];
    const branchCourts = await resourceRepository.findByBranch(branchId);
    const branchCourtById = new Map(branchCourts.map((c: any) => [Number(c.id), c]));
    const duration = minutesBetween(input.startTime, input.endTime);
    const opening = requestedResource?.opening_time || '08:00';
    const closing = requestedResource?.closing_time || '22:00';

    for (const occ of occurrences) {
      const res = resMap.get(occ.date);
      // No resolution, or "book" with no overrides → keep the requested slot.
      let courtId = input.resourceId;
      let startTime = occ.startTime;
      let endTime = occ.endTime;
      if (res) {
        if (res.action === 'skip') continue;
        if (res.courtId) {
          const court = branchCourtById.get(Number(res.courtId));
          if (!court) throw new ValidationError(`Unknown alternative court ${res.courtId} for ${occ.date}`);
          if (Number(court.branch_id) !== Number(branchId)) throw new ForbiddenError(`Alternative court ${res.courtId} does not belong to the branch`);
          courtId = Number(res.courtId);
        }
        if (res.startTime && res.endTime) {
          // Same DAY + same COURT + same DURATION only — never another date/weekday.
          const d = minutesBetween(res.startTime, res.endTime);
          if (d !== duration) throw new ValidationError(`Alternative time for ${occ.date} must preserve the ${input.startTime}–${input.endTime} duration`);
          if (res.startTime < opening || res.endTime > closing) throw new ValidationError(`Alternative time for ${occ.date} is outside branch operating hours (${opening}–${closing})`);
          startTime = res.startTime;
          endTime = res.endTime;
        }
      }
      planned.push({ date: occ.date, weekday: occ.weekday, courtId, startTime, endTime, requestedCourt: input.resourceId });
    }
    return planned;
  }

  private async resourceMapForPlanned(planned: Array<{ courtId: number }>, defaultResource: any, branchId: number): Promise<Map<number, any>> {
    const map = new Map<number, any>([[Number(defaultResource.id), defaultResource]]);
    const ids = [...new Set(planned.map((p) => Number(p.courtId)).filter((id) => id !== Number(defaultResource.id)))];
    if (ids.length) {
      const courts = await resourceRepository.findByBranch(branchId);
      for (const c of courts) map.set(Number(c.id), c);
    }
    return map;
  }

  /**
   * R3 — Alternative court search for a conflicting occurrence.
   * Reuses the canonical availability rules (checkSlotAvailability, resource
   * status, branch, sport compatibility, operating hours). Same date/time only;
   * never returns another date or weekday. Nothing is chosen automatically.
   */
  private async findAlternativeCourts(
    branchId: number,
    requested: any,
    date: string,
    startTime: string,
    endTime: string,
  ) {
    const courts = await resourceRepository.findByBranch(branchId);
    const compatible: any[] = [];
    for (const c of courts) {
      if (Number(c.id) === Number(requested.id)) continue;
      if (Number(c.is_active) !== 1) continue;
      if (c.deleted_at) continue;
      // Same sport when the requested court has one; otherwise same resource type.
      if (requested.sport_id) {
        if (Number(c.sport_id) !== Number(requested.sport_id)) continue;
      } else if (Number(c.resource_type_id) !== Number(requested.resource_type_id)) {
        continue;
      }
      // Operating hours must accommodate the requested window.
      const open = (c.opening_time || '08:00').slice(0, 5);
      const close = (c.closing_time || '22:00').slice(0, 5);
      // Overnight courts (close < open) cannot host an assumption-free same-day window.
      if (close < open && close !== '00:00') continue;
      if (startTime < open || endTime > (close === '00:00' ? '24:00' : close)) continue;
      const ok = await bookingRepository.checkSlotAvailability(
        Number(c.id), date,
        [{ start: startTime, end: endTime, date }],
      );
      if (ok) compatible.push(c);
    }
    return compatible;
  }

  /**
   * R3 — Same-day, same-court alternative times for a conflicting occurrence.
   * Only offered when no alternative court exists. The requested DURATION is
   * preserved, times stay within branch operating hours on the same date, and
   * candidates respect the court's slot-duration grid. No other date/weekday.
   */
  private async findAlternativeTimes(
    resource: any,
    date: string,
    startTime: string,
    endTime: string,
  ) {
    const opening = (resource.opening_time || '08:00').slice(0, 5);
    const closing = (resource.closing_time || '22:00').slice(0, 5);
    const slot = Number(resource.slot_duration || resource.default_slot_duration || 60);
    const duration = minutesBetween(startTime, endTime);
    const requested = `${startTime}-${endTime}`;
    const openMin = minutesBetween('00:00', opening);
    const closeMin = closing === '00:00' ? 1440 : minutesBetween('00:00', closing);
    const results: { startTime: string; endTime: string }[] = [];
    for (let t = openMin; t + duration <= closeMin; t += slot) {
      const candStart = timeFromMinutes(t);
      const candEnd = timeFromMinutes(t + duration);
      if (`${candStart}-${candEnd}` === requested) continue;
      const ok = await bookingRepository.checkSlotAvailability(
        Number(resource.id), date,
        [{ start: candStart, end: candEnd, date }],
      );
      if (ok) results.push({ startTime: candStart, endTime: candEnd });
    }
    return results;
  }

  /**
   * R3 — Player picker for the responsible-user recurring flow (existing RBAC
   * authorities only; no new permission). Returns active player accounts
   * matching name/email/phone.
   */
  async searchRecurringPlayers(search: string, limit = 20): Promise<any> {
    const { listUsers } = rbacRepository;
    const result = await listUsers(1, Math.min(Math.max(limit, 1), 50), {
      search: search || undefined,
      status: 'active',
    });
    return {
      data: (result.data || []).map((u: any) => ({
        userId: Number(u.id),
        fullName: u.full_name || '',
        email: u.email || '',
        phone: u.full_phone || u.phone_number || '',
      })),
    };
  }

  /** R2 — Read a series + every generated occurrence booking. */
  async describeRecurringSeries(seriesId: number) {
    const series = await bookingSeriesRepository.findById(seriesId);
    if (!series) throw new NotFoundError('Recurring series');
    const bookings = await bookingRepository.findBySeries(series.id);
    // R5-A — authoritative series total: the exact sum of the PERSISTED
    // per-occurrence canonical totals (never a client-supplied value). The
    // single payment in R5-B must consume this server-side number.
    const seriesTotal = PricingEngine.sumOccurrenceTotals(
      bookings.map((b: any) => Number(b.total_amount || 0)),
    );
    return {
      seriesId: series.id,
      publicId: series.publicId,
      organisationId: series.organisationId,
      branchId: series.branchId,
      resourceId: series.resourceId,
      createdBy: series.createdBy,
      recurrenceType: series.recurrenceType,
      weekdays: weekdaySetToNumbers(series.weekdays),
      startDate: BookingService.fmtDate(series.startDate),
      endDate: BookingService.fmtDate(series.endDate),
      startTime: series.startTime,
      endTime: series.endTime,
      timezone: series.timezone,
      status: series.status,
      // Player BENEFICIARY is derived from the occurrence bookings (the only
      // canonical owner field). Operator stays on booking_series.created_by.
      playerUserId: bookings.length ? Number((bookings[0] as any).user_id) : null,
      occurrenceCount: bookings.length,
      seriesTotal,
      // R5-B — read-only state of the ONE series payment (never creates one).
      // The frontend renders pending/success/failure from this; the amount shown
      // is always the authoritative seriesTotal above.
      payment: await loadSeriesPaymentFor(series.id),
      occurrences: bookings.map((b: any) => ({
        bookingId: Number(b.id),
        date: BookingService.fmtDate(b.booking_date),
        weekday: TimeEngine.getLocalDayOfWeekFromDate(BookingService.fmtDate(b.booking_date)),
        startTime: BookingService.fmtTime(b.start_time),
        endTime: BookingService.fmtTime(b.end_time),
        status: b.booking_status,
        // R5-A — the occurrence's own canonical price + economics snapshot.
        totalAmount: Number(b.total_amount || 0),
        commissionAmount: Number(b.commission_amount || 0),
        clubAmount: Number(b.club_amount || 0),
        taxAmount: Number(b.tax_amount || 0),
        taxRate: Number(b.tax_rate || 0),
        taxTreatment: b.tax_treatment ?? null,
      })),
    };
  }

  /**
   * R2 — List series. Callers must be platform admins or hold access to the
   * organisation (resolved from branch/org). Tenant isolation enforced.
   */
  async listRecurringSeries(input: { organisationId?: number; branchId?: number }, userId: number) {
    const [{ isPlatformAdmin }, { canAccessOrganisation }] = await Promise.all([
      import('../../../shared/middleware/org-access.js'),
      import('../../../shared/middleware/org-access.js'),
    ]);
    // Resolve the org when only a branch is provided.
    let orgId = input.organisationId;
    if (!orgId && input.branchId) {
      const pool = getPool();
      const [bRows] = await pool.execute<RowData>(
        'SELECT organisation_id FROM branches WHERE id = ?', [input.branchId],
      );
      if (bRows.length) orgId = Number((bRows[0] as any).organisation_id);
    }
    if (orgId) {
      if (!(await isPlatformAdmin(userId)) && !(await canAccessOrganisation(userId, orgId))) {
        throw new ForbiddenError('Not authorized to view these recurring reservations');
      }
    } else if (!(await isPlatformAdmin(userId))) {
      // No organisation filter: only platform admins may list globally.
      throw new ForbiddenError('An organisation filter is required');
    }
    const rows = await bookingSeriesRepository.listByOrg(orgId ?? null, input.branchId);
    return {
      data: rows.map((s) => ({
        seriesId: s.id,
        publicId: s.publicId,
        organisationId: s.organisationId,
        branchId: s.branchId,
        resourceId: s.resourceId,
        createdBy: s.createdBy,
        recurrenceType: s.recurrenceType,
        weekdays: weekdaySetToNumbers(s.weekdays),
        startDate: BookingService.fmtDate(s.startDate),
        endDate: BookingService.fmtDate(s.endDate),
        startTime: s.startTime,
        endTime: s.endTime,
        timezone: s.timezone,
        status: s.status,
      })),
    };
  }

  /**
   * R4 — Recurring series lifecycle cancellation.
   *
   * Cancels ONLY the FUTURE, not-yet-terminal occurrences of the series, each
   * through the CANONICAL single-booking cancellation path (CancelBooking
   * command → `booking:cancelled` → canonical player notification + realtime +
   * admin invalidation). Past / completed / already-cancelled / skipped
   * occurrences and unrelated bookings are NEVER rewritten. No rescheduling
   * (no date/weekday/court changes), no replacement bookings, no payment or
   * accounting. The series row itself transitions active → cancelled.
   */
  async cancelRecurringSeries(seriesId: number, actorId: number, reason = 'recurring_series_cancelled') {
    // Authorization — the SAME responsible-user model as R3 recurring creation.
    if (!(await this.canBypassPlayerBookingWindow(actorId))) {
      throw new ForbiddenError('Only authorised responsible users can cancel recurring series');
    }

    const series = await bookingSeriesRepository.findById(seriesId);
    if (!series) throw new NotFoundError('Recurring series');

    const occurrences = await bookingRepository.findBySeries(seriesId);
    const nowMs = new Date(TimeEngine.now()).getTime();
    const TERMINAL = new Set(['cancelled', 'expired', 'no_show', 'completed']);

    const cancelledIds: number[] = [];
    const skipped: Array<{ bookingId: number; reason: string }> = [];

    for (const occ of occurrences) {
      const bookingId = Number(occ.id);
      const rawStart = occ.start_at_utc;
      const startMs = rawStart ? new Date(rawStart instanceof Date ? rawStart.toISOString() : String(rawStart).replace(' ', 'T') + 'Z').getTime() : null;
      const isFuture = startMs != null && startMs > nowMs;
      const isTerminal = TERMINAL.has(occ.booking_status);
      if (!isFuture) { skipped.push({ bookingId, reason: 'past_or_not_yet_started' }); continue; }
      if (isTerminal) { skipped.push({ bookingId, reason: `already_${occ.booking_status}` }); continue; }
      try {
        // Canonical cancellation (owner guard extended ONLY for series-owned
        // occurrences to the responsible operator).
        await this.cancelBooking(bookingId, actorId, reason);
        cancelledIds.push(bookingId);
      } catch (err: any) {
        skipped.push({ bookingId, reason: (err as any)?.message || 'cancellation_failed' });
      }
    }

    // Series lifecycle change only for an ACTIVE series with cancelled occurrences.
    const becameCancelled = series.status === 'active' && cancelledIds.length > 0;
    if (becameCancelled) {
      await bookingSeriesRepository.updateStatus(seriesId, 'cancelled');
      // ONE clearly-named series event (committed already — autocommit here) so
      // admin surfaces refresh the series list. Route: admin/org/branch rooms
      // only — never a player socket (per canonical realtime conventions).
      eventBusV2.emit('recurring:series-cancelled', {
        seriesId,
        organisationId: series.organisationId,
        branchId: series.branchId,
        playerUserId: occurrences.length ? Number(occurrences[0].user_id) : null,
        cancelledIds,
        cancelledCount: cancelledIds.length,
      });
    }

    log.info({ seriesId, operator: actorId, cancelled: cancelledIds.length, skipped: skipped.length }, 'recurring.series_cancelled');

    return {
      seriesId,
      status: becameCancelled ? 'cancelled' : series.status,
      cancelledIds,
      cancelledCount: cancelledIds.length,
      skipped,
      playerUserId: occurrences.length ? Number(occurrences[0].user_id) : null,
    };
  }

  async checkIn(id: number, userId: number) {
    // Authorization: the booking owner (player) or an authorized organisation
    // staff member (who has the `bookings.check-in` permission via the route
    // gate) may check in. Anyone else — including another player — is denied,
    // closing the previous IDOR where any permission-holder could check in any
    // booking by id.
    const booking = await bookingRepository.findById(id);
    if (!booking) throw new NotFoundError('Booking');
    const isOwner = Number(booking.user_id) === Number(userId);
    const isOrgStaff = await bookingRepository.canAccessOrganisation(userId, booking.organisation_id);
    if (!isOwner && !isOrgStaff) {
      throw new ForbiddenError('Not authorized to check in this booking');
    }

    await bookingRepository.persistTransition(id, 'checked_in');

    // Realtime + notification: the booking's visible state changed. Emit the
    // canonical `booking:check-in` event so the socket publisher routes it to
    // the customer, organisation and resource rooms without a page refresh.
    try {
      if (booking) {
        eventBusV2.emit('booking:check-in', {
          bookingId: id,
          userId: booking.user_id,
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

    if (status === 'no_show') {
      const booking = await bookingRepository.findById(id);
      if (!booking) throw new NotFoundError('Booking');
      if (booking.booking_status === 'no_show') {
        throw new ConflictError('Booking already no-show');
      }

      // Dedicated no-show lifecycle transition (confirmed/checked_in → no_show).
      // Emits ONLY booking:no-show — never booking:cancelled, so a no-show can
      // never degrade into a cancellation state or produce a duplicate cancelled
      // event/notification (BUG 1 + BUG 2).
      await executeBookingCommand('NoShowBooking', noShowBookingHandler, { bookingId: id }, String(id));

      // Preserve the existing COD no-show penalty operational accounting.
      if (booking.payment_method === 'cash' || booking.payment_method === 'cod') {
        await this._recordCODWalletTransaction(booking, 'penalty', `Booking #${booking.id} no-show penalty`);
      }
      return;
    }

    if (status === 'cancelled') {
      const booking = await bookingRepository.findById(id);
      if (!booking) throw new NotFoundError('Booking');
      if (booking.booking_status === 'cancelled' || booking.booking_status === 'no_show') {
        throw new ConflictError('Booking already cancelled/no-show');
      }

      const isCOD = booking.payment_method === 'cash' || booking.payment_method === 'cod';
      const { feeAmount, refundAmount } = await this._calculateCancellationFee(booking);
      const totalAmount = Number(booking.total_amount);
      const reason = CancellationReason.ADMIN_CANCELLED;
      const resolvedUserId = actorId ?? booking.user_id;

      if (isCOD) {
        const paymentStatus = refundAmount >= totalAmount ? 'refunded' : refundAmount > 0 ? 'partially_refunded' : 'penalty';

        // The V2 cancel path must run the SAME canonical financial lifecycle as
        // legacy: the cancel transition first, then the COD refund/penalty
        // accounting (BUG 5). The accounting is idempotent (booking:refunded
        // posting identity) so running it here cannot double-post.
        if (isFeatureEnabled('BOOKING_V2_CANCEL')) {
          await this.cancelBookingV2(id);
        } else {
          await executeBookingCommand('CancelBooking', cancelBookingHandler, { bookingId: id, reason, actorId: resolvedUserId }, String(id));
        }

        if (paymentStatus === 'refunded') {
          await this._refundCODWallet(booking, totalAmount);
        } else if (paymentStatus === 'partially_refunded') {
          await this._refundCODWallet(booking, refundAmount);
        } else if (paymentStatus === 'penalty') {
          await this._recordCODWalletTransaction(booking, 'penalty', `Booking #${booking.id} cancellation penalty`);
        }
      } else {
        if (isFeatureEnabled('BOOKING_V2_CANCEL')) {
          await this.cancelBookingV2(id);
        } else {
          await executeBookingCommand('CancelBooking', cancelBookingHandler, { bookingId: id, reason, actorId: resolvedUserId }, String(id));
        }
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

  private async _emitBookingRefunded(booking: any, refundAmount: number, conn?: mysql.PoolConnection): Promise<void> {
    if (refundAmount <= 0) return;
    const db = conn ?? getPool();

    // Over-refund guard: cumulative refunds must not exceed the original gross payable.
    const grossPayable = Number(booking.total_amount || 0) + Number(booking.tax_amount || 0);
    const [refundRows] = await db.execute<RowData>(
      `SELECT COALESCE(refunded_amount, 0) AS refunded_amount FROM bookings WHERE id = ?${conn ? ' FOR UPDATE' : ''}`,
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
    await db.execute(
      `UPDATE bookings SET refunded_amount = refunded_amount + ? WHERE id = ?`,
      [refundAmount, booking.id],
    );

    // Emit canonical booking refund accounting event. The accounting listener
    // prorates the ORIGINAL snapshot economics (never current rates). When a
    // conn is supplied (refund runs inside a transaction) the event is emitted
    // post-commit so a rolled-back refund can never produce a phantom realtime
    // / accounting signal.
    eventBusV2.emit('booking:refunded', {
      bookingId: booking.id,
      userId: booking.user_id,
      organisationId: booking.organisation_id,
      refundAmount,
      currency: 'EGP',
    } as any, undefined, conn);
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

    // PHASE 0 — Booking refund idempotency/concurrency hardening.
    // The WHOLE refund (cap computation → money movement → refunded_amount
    // update) runs inside ONE transaction that holds the booking row FOR
    // UPDATE. Concurrent/duplicate refund requests for the same booking block
    // on the booking row and re-compute the cap against the UPDATED
    // refunded_amount after the first commits → money can never move twice and
    // partial refunds always respect the remaining refundable amount.
    await withTransaction(async (conn) => {
      // Re-read the booking under the lock so the cap is authoritative.
      const [brows] = await conn.execute<RowData>(
        `SELECT id, refunded_amount, total_amount, tax_amount, payment_method, payment_status, user_id, organisation_id, branch_id
         FROM bookings WHERE id = ? FOR UPDATE`,
        [booking.id],
      );
      if (!brows.length) {
        log.error({ bookingId: booking.id }, 'Booking not found for refund — skipping');
        return;
      }
      const locked = brows[0] as any;

      // Money never refunded more than the remaining refundable gross, and never
      // more than the ACTUAL amount captured for the booking (P3-9 ceiling: the
      // paid amount is the source of truth — V1 charged total+tax, V2 charged
      // total, so the refund can never exceed what was really collected).
      const grossPayable = Number(locked.total_amount || 0) + Number(locked.tax_amount || 0);
      const alreadyRefunded = Number(locked.refunded_amount || 0);
      const cap = Math.max(0, grossPayable - alreadyRefunded);
      const paidAmount = await this._resolveBookingPaidAmount(booking);
      const ceiling = paidAmount > 0 ? Math.min(cap, paidAmount) : cap;
      const moveAmount = Math.min(requested, ceiling);
      if (moveAmount <= 0) {
        log.warn({ bookingId: booking.id, requested }, 'No remaining refundable amount — skipping refund');
        return;
      }

      const { paymentService } = await import('../../payment/application/payment.service.js');
      const [ptRows] = await conn.execute<RowData>(
        `SELECT id FROM payment_transactions WHERE booking_id = ? ORDER BY id DESC LIMIT 1`,
        [booking.id],
      );
      const paymentTransactionId = ptRows.length ? Number((ptRows[0] as any).id) : null;
      const paymentMethod = locked.payment_method;

      // Money moved?
      let moneyMoved = true;
      if (paymentMethod === 'wallet') {
        // Wallet refunds do NOT require a payment_transactions row (legacy/edge
        // wallet bookings credit the wallet directly). The anchor is written
        // only when a payment row exists.
        moneyMoved = await this._processRefund(booking, moveAmount, Number(locked.user_id), paymentTransactionId, conn);
      } else {
        if (paymentTransactionId == null) {
          // No captured money record exists — nothing can be refunded. Do NOT
          // advance the refund accounting (a GL reversal without money movement
          // is a false refund). Log as error for manual review.
          log.error({ bookingId: booking.id, paymentMethod, amount: moveAmount }, 'Cannot refund booking: no payment_transactions record found');
          return;
        }
        const result = await (paymentService.refund as any)(
          paymentTransactionId,
          moveAmount,
          `Booking #${booking.id} cancellation refund`,
        );
        if (!result?.success) {
          throw new Error(`Payment gateway refund failed for booking #${booking.id}: ${(result as any)?.errorMessage || 'unknown error'}`);
        }
      }

      // Idempotent skip: a prior operation already credited the wallet and
      // advanced refunded_amount atomically — do NOT advance it a second time.
      if (!moneyMoved) return;

      // Money moved — now advance the canonical refund accounting atomically
      // with the money movement (same transaction). booking:refunded is emitted
      // post-commit, so a rolled-back refund can never emit a phantom event.
      await this._emitBookingRefunded({ ...booking, ...locked }, moveAmount, conn);
    });
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
          userId: booking.user_id,
          organisationId: booking.organisation_id,
          grossAmount: Number(booking.total_amount || 0),
          taxAmount: Number(booking.tax_amount || 0),
          // Use the persisted server-computed coach amount (0 for court-only
          // bookings) so COD coach_session economics carry the real coach fee.
          coachAmount: Number(booking.coach_amount || 0),
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
    const booking = await bookingRepository.findById(bookingId!);
    if (!booking) throw new NotFoundError('Booking');
    if (booking.user_id !== userId) throw new ForbiddenError('Only the booking owner can start matchmaking');
    if (booking.booking_status !== 'confirmed' && booking.booking_status !== 'pending') {
      throw new ConflictError('Matchmaking can only be started for active bookings');
    }

    if (criteria.deadline) {
      // Authoritative: compare against the persisted branch-timezone start
      // instant (start_at_utc) — never reconstruct with server-local parsing.
      this.assertMatchmakingDeadlineBeforeStart(criteria.deadline, booking.start_at_utc);
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
    const booking = await bookingRepository.findById(bookingId!);
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
    const booking = await bookingRepository.findById(bookingId!);
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
    const booking = await bookingRepository.findById(bookingId!);
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

    // PHASE 1 (temporary) — wallet is not an active booking payment method.
    if ((input.paymentMethod as string) === 'wallet') {
      throw new ConflictError('Wallet is temporarily unavailable as a payment method. Please use Card or Cash.');
    }

    const [branchRows] = await pool.execute<RowData>(
      'SELECT id, organisation_id, timezone, opening_time, closing_time FROM branches WHERE id = ?', [input.branchId],
    );
    if (branchRows.length === 0) throw new NotFoundError('Branch');
    const branchData = branchRows[0] as any;
    const organisationId = branchData.organisation_id;
    const branchTz = branchData.timezone || 'Africa/Cairo';

    // R1 — server-side player booking-window guard (authoritative). Same rule
    // as the V1 path: reject before pricing/availability/locks/booking row/
    // any payment workflow state is acquired.
    await this.assertPlayerBookingWindow(input, branchTz, userId);

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
    // Business Day parity with the V1/prepare paths: derive the authoritative
    // operating day from the actual start instant + resource hours + branch tz,
    // NOT by copying booking_date (which is the user-facing calendar date and
    // can differ for overnight after-midnight slots).
    const businessDate = TimeEngine.getBusinessDate(startAtUtc, openingTime, closingTime, branchTz);

    // Authoritative deadline guard against the branch-timezone start instant.
    this.assertMatchmakingDeadlineBeforeStart(input.matchmaking?.deadline, startAtUtc);

    const pricing = await pricingEngine.calculatePrice(
      input.resourceId, input.startTime, endTime,
    );

    // Coach session fee (coach_session bookings only) — combined into the total.
    // Server-computed via the canonical pricing helper; never client-supplied.
    const coachAmount = await this.resolveCoachSessionAmount(input, resource?.sport_id, endTime);
    const bookingTotal = Math.round((pricing.totalPrice + coachAmount) * 100) / 100;

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
        businessDate,
        startTime: input.startTime,
        endTime: input.endTime,
        totalAmount: bookingTotal,
        coachAmount,
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

    if (!bookingId) return { bookingId: 0, total_amount: 0, coach_amount: 0 };

    // Persist matchmaking criteria for a public match at creation time (cash
    // path). Previously these were only stored when the owner later called
    // startMatchmaking, so a public-match booking created without that call
    // silently defaulted to 2 players / no age criteria.
    if ((input.bookingType || 'public_match') === 'public_match' && input.matchmaking) {
      await bookingRepository.createMatchmakingRequest({
        bookingId,
        minAge: input.matchmaking.minAge,
        maxAge: input.matchmaking.maxAge,
        targetGender: input.matchmaking.targetGender || 'any',
        targetLevelId: input.matchmaking.targetLevelId,
        maxPlayers: input.matchmaking.maxPlayers || 2,
        deadline: input.matchmaking.deadline,
        autoApply: input.matchmaking.autoApply || false,
      });
    }

    // CASH/COD — cash is collected immediately at the court. Confirm the booking
    // and emit booking:paid so the COD accounting lifecycle (same as V1 cash and
    // the marketplace cash model) posts and booking:confirmed creates the public
    // match. Without this, a V2 cash booking stayed `pending` forever (no
    // accounting, no match, no realtime).
    if (input.paymentMethod === 'cash' || input.paymentMethod === 'cod') {
      try {
        await this.confirmBookingV2(bookingId);
      } catch (confirmErr: any) {
        log.error({ err: confirmErr, bookingId }, 'createBookingV2: cash confirm failed');
      }
      eventBusV2.emit('booking:paid', {
        bookingId, userId,
        organisationId,
        grossAmount: bookingTotal,
        taxAmount: economics.taxAmount,
        coachAmount,
        organisationAmount: economics.clubAmount,
        commissionAmount: economics.commissionAmount,
        paymentMethod: input.paymentMethod,
        currency: 'EGP',
        sourceId: bookingId,
      } as any);
    }

    // PHASE 1 — wallet is rejected earlier; only card/gateway and cash/COD reach here.
    return { id: bookingId, bookingId, total_amount: bookingTotal, coach_amount: coachAmount };
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
      throwCommandError(result);
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

    if (result.status === 'error') throwCommandError(result);

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
      throwCommandError(result);
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

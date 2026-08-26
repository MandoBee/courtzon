import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { postAccountingEvent } from './accounting-event.listener.js';
import { financialEntitlementService } from './financial-entitlement.service.js';
import { unifiedSettlementService } from '../../settlement/application/unified-settlement.service.js';

const log = createModuleLogger('booking-settlement');
type RowData = RowDataPacket[];

const round2 = (n: number) => Math.round(n * 100) / 100;

export type EligibilityStatus = 'NOT_ELIGIBLE' | 'ELIGIBLE' | 'PARTIALLY_SETTLED' | 'SETTLED';

export interface BookingEconomics {
  bookingId: number;
  organisationId: number | null;
  bookingStatus: string;
  paymentStatus: string;
  bookingDate: string;
  startTime: string;
  coachAmount: number;
  orgAmount: number;
  refundedAmount: number;
  coachSettled: number;
  orgSettled: number;
  coachRecovered: number;
  orgRecovered: number;
  coachCollected: number;
  orgCollected: number;
  coachSettleable: number;
  orgSettleable: number;
  coachOutstandingRecovery: number;
  orgOutstandingRecovery: number;
  eligibility: EligibilityStatus;
  eligibilityReason: string;
}

/**
 * Booking settlement + recovery collection service.
 *
 * Reuses the EXISTING canonical accounting engine (postAccountingEvent →
 * AccountingEngineService → ledger_entries → general_ledger). Does NOT create
 * a second settlement engine and does NOT write to financial_journal_entries.
 *
 * Eligibility: a booking is settlement-eligible when its service obligation
 * has been fulfilled (booking_status = 'completed' or 'checked_in') and its
 * payment has been collected (payment_status = 'paid' or 'partially_refunded').
 * Future bookings, cancelled, expired, and no_show bookings are NOT eligible.
 */
class BookingSettlementService {
  private pool = getPool();

  /**
   * Determine a booking's settlement eligibility + full economics.
   * Eligibility is DERIVED, not persisted (single source of truth).
   */
  async getEconomics(bookingId: number): Promise<BookingEconomics | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT id, organisation_id, booking_status, payment_status, booking_date, start_time,
              coach_amount, club_amount, refunded_amount, total_amount, tax_amount,
              coach_settled_amount, org_settled_amount,
              coach_recovered_amount, org_recovered_amount,
              coach_recovery_collected, org_recovery_collected
       FROM bookings WHERE id = ?`,
      [bookingId],
    );
    if (!rows.length) return null;
    const b = rows[0] as any;

    const coachAmount = Number(b.coach_amount || 0);
    const orgAmount = Number(b.club_amount || 0);
    const refunded = Number(b.refunded_amount || 0);
    const grossPayable = Number(b.total_amount || 0) + Number(b.tax_amount || 0);
    const coachSettled = Number(b.coach_settled_amount || 0);
    const orgSettled = Number(b.org_settled_amount || 0);
    const coachRecovered = Number(b.coach_recovered_amount || 0);
    const orgRecovered = Number(b.org_recovered_amount || 0);
    const coachCollected = Number(b.coach_recovery_collected || 0);
    const orgCollected = Number(b.org_recovery_collected || 0);

    const ratio = grossPayable > 0 ? Math.min(refunded / grossPayable, 1) : 0;
    const coachRefunded = Math.round(coachAmount * ratio * 100) / 100;
    const orgRefunded = Math.round(orgAmount * ratio * 100) / 100;

    const coachSettleable = Math.max(0, Math.round((coachAmount - coachSettled - coachRefunded) * 100) / 100);
    const orgSettleable = Math.max(0, Math.round((orgAmount - orgSettled - orgRefunded) * 100) / 100);
    const coachOutstandingRecovery = Math.max(0, Math.round((coachRecovered - coachCollected) * 100) / 100);
    const orgOutstandingRecovery = Math.max(0, Math.round((orgRecovered - orgCollected) * 100) / 100);

    const { status, reason } = this.deriveEligibility(b, coachSettleable, orgSettleable);

    return {
      bookingId,
      organisationId: b.organisation_id ?? null,
      bookingStatus: b.booking_status,
      paymentStatus: b.payment_status || '',
      bookingDate: String(b.booking_date || ''),
      startTime: String(b.start_time || ''),
      coachAmount, orgAmount, refundedAmount: refunded,
      coachSettled, orgSettled, coachRecovered, orgRecovered, coachCollected, orgCollected,
      coachSettleable, orgSettleable, coachOutstandingRecovery, orgOutstandingRecovery,
      eligibility: status,
      eligibilityReason: reason,
    };
  }

  /**
   * List eligible (and partially settled) bookings for settlement review.
   */
  async listEligible(organisationId: number | null, page: number, limit: number): Promise<{ data: BookingEconomics[]; total: number }> {
    const where: string[] = [
      `booking_status IN ('completed', 'checked_in')`,
      `payment_status IN ('paid', 'partially_refunded')`,
      `(coach_amount > coach_settled_amount OR club_amount > org_settled_amount)`,
    ];
    const params: any[] = [];
    if (organisationId != null) { where.push('organisation_id = ?'); params.push(organisationId); }

    const [countRows] = await this.pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM bookings WHERE ${where.join(' AND ')}`, params,
    );
    const total = Number((countRows as any[])[0].cnt || 0);

    const offset = (page - 1) * limit;
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 20));
    const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
    const [rows] = await this.pool.execute<RowData>(
      `SELECT id FROM bookings WHERE ${where.join(' AND ')} ORDER BY booking_date DESC, start_time DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params,
    );

    const data: BookingEconomics[] = [];
    for (const r of rows as any[]) {
      const econ = await this.getEconomics(r.id);
      if (econ) data.push(econ);
    }
    return { data, total };
  }

  /**
   * Settle eligible booking economics (coach + org) atomically, auto-offsetting
   * any outstanding recovery receivable for the SAME party.
   *
   * MODEL B (Phase 2 Step 2): the ORG leg consumes AVAILABLE
   * financial_entitlements through the unified settlement engine — the single
   * authoritative position subledger. `bookings.org_settled_amount` is a
   * READ-THROUGH PROJECTION written only here, after entitlements are SETTLED.
   * Complaint-held (ON_HOLD, dispute) and reserved entitlements can never be
   * consumed; CASH/COD bookings (collector='org') have no cross-party payable.
   * The COACH leg keeps its operational mechanics (coaches are providers, not
   * organisations — no entitlement type exists for them yet).
   */
  async settleBookingEconomics(
    bookingId: number,
    coachAmount: number,
    orgAmount: number,
    actorId: number,
  ): Promise<{
    coachSettled: number; orgSettled: number; coachOffset: number; orgOffset: number; coachCash: number; orgCash: number;
    settlementId?: number; batchCode?: string;
  }> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute<RowData>(
        `SELECT organisation_id, coach_amount, club_amount, refunded_amount, total_amount, tax_amount,
                coach_settled_amount, org_settled_amount,
                coach_recovered_amount, org_recovered_amount,
                coach_recovery_collected, org_recovery_collected
         FROM bookings WHERE id = ? FOR UPDATE`,
        [bookingId],
      );
      if (!rows.length) {
        await conn.rollback();
        throw new Error(`Booking ${bookingId} not found`);
      }
      const b = rows[0] as any;
      const organisationId = b.organisation_id ?? null;

      const settleable = this.computeSettleableLocked(b);
      const coachSettle = Math.min(Math.max(coachAmount, 0), settleable.coachSettleable);

      // ── ORG leg (Model B): consume AVAILABLE payable entitlements ──
      let orgSettle = 0;
      let orgOffset = 0;
      let orgCash = 0;
      let settlementId: number | undefined;
      let batchCode: string | undefined;
      if (organisationId != null && orgAmount > 0) {
        const sourceEnts = await financialEntitlementService.getEntitlementsBySourceIds('booking', [bookingId]);
        const payable = sourceEnts
          .filter((e: any) => e.status === 'AVAILABLE'
            && e.collector === 'courtzon'
            && (e.entitlement_type === 'ORGANIZATION_EARNING' || e.entitlement_type === 'ORGANIZATION_ADJUSTMENT'))
          .sort((x: any, y: any) => Number(y.amount) - Number(x.amount)); // largest-first

        let available = 0;
        for (const p of payable) available = Math.round((available + Number(p.amount)) * 100) / 100;

        const legacyCap = settleable.orgSettleable;
        const target = round2(Math.min(Math.max(orgAmount, 0), legacyCap, available));

        // Greedy full-row selection ≤ target (partial consumption impossible —
        // an entitlement settles whole or stays open).
        const selectedIds: number[] = [];
        let running = 0;
        for (const p of payable) {
          const amt = Number(p.amount);
          if (round2(running + amt) <= target + 1e-9) {
            selectedIds.push(p.id);
            running = round2(running + amt);
          }
        }

        if (selectedIds.length > 0) {
          // Recovery offset preserved: collect outstanding org recovery first,
          // so net cash equals the legacy combined entry.
          const orgRecovered = Number(b.org_recovered_amount || 0);
          const orgCollected = Number(b.org_recovery_collected || 0);
          const orgOutstanding = Math.max(0, Math.round((orgRecovered - orgCollected) * 100) / 100);
          orgOffset = Math.min(running, orgOutstanding);
          orgCash = round2(running - orgOffset);

          const settlement = await unifiedSettlementService.create({
            orgId: organisationId,
            selectedEntitlementIds: selectedIds,
            requestedBy: actorId,
            requestedByRole: 'admin',
            notes: `Booking #${bookingId} org settlement`,
          });

          await unifiedSettlementService.recordPayment(settlement.settlement.id, {
            paidBy: actorId,
            paymentMethod: 'settlement',
            paymentReference: `booking:${bookingId}`,
          });

          if (orgOffset > 0) {
            await postAccountingEvent(
              'booking_recovery_collection', 'booking', bookingId, organisationId,
              { cash_bank: orgOffset, recovery_receivable: orgOffset },
              'EGP',
              `Booking #${bookingId} org recovery offset collection`,
              conn,
            );
            await conn.execute(
              `UPDATE bookings SET org_recovery_collected = LEAST(org_recovered_amount, org_recovery_collected + ?) WHERE id = ?`,
              [orgOffset, bookingId],
            );
          }

          // Read-through projection of the authoritative settled position.
          await conn.execute(
            `UPDATE bookings SET org_settled_amount = LEAST(club_amount, org_settled_amount + ?) WHERE id = ?`,
            [running, bookingId],
          );

          // Traceability audit row referencing the unified batch.
          await conn.execute(
            `INSERT INTO booking_settlements (booking_id, organisation_id, settlement_type, amount, status, batch_reference, created_by, created_at)
             VALUES (?, ?, 'org', ?, 'settled', ?, ?, ?)`,
            [bookingId, organisationId, running, settlement.settlement.batch_code ?? `unified_${settlement.settlement.id}`, actorId, new Date().toISOString().slice(0, 19).replace('T', ' ')],
          );

          orgSettle = running;
          settlementId = settlement.settlement.id;
          batchCode = (settlement.settlement as any).batch_code ?? undefined;
        }
      }
      

      // Recovery offsets for the COACH party (legacy mechanics).
      const coachRecovered = Number(b.coach_recovered_amount || 0);
      const coachCollected = Number(b.coach_recovery_collected || 0);
      const coachOutstanding = Math.max(0, Math.round((coachRecovered - coachCollected) * 100) / 100);
      const coachOffset = Math.min(coachSettle, coachOutstanding);
      const coachCash = round2(coachSettle - coachOffset);

      if (coachSettle <= 0 && orgSettle <= 0) {
        await conn.rollback();
        return { coachSettled: 0, orgSettled: 0, coachOffset: 0, orgOffset: 0, coachCash: 0, orgCash: 0 };
      }

      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const batchRef = `bs_${bookingId}_${Date.now()}`;

      // Coach settlement accounting (with or without recovery offset).
      if (coachSettle > 0) {
        if (coachOffset > 0) {
          await postAccountingEvent(
            'booking_coach_settlement_offset', 'booking', bookingId, organisationId,
            { coach_payable: coachSettle, cash_bank: coachCash, coach_recovery_receivable: coachOffset },
            'EGP',
            `Booking #${bookingId} coach settlement (recovery offset ${coachOffset})`,
            conn,
          );
        } else {
          await postAccountingEvent(
            'booking_coach_settlement', 'booking', bookingId, organisationId,
            { coach_payable: coachSettle, cash_bank: coachSettle },
            'EGP',
            `Booking #${bookingId} coach settlement`,
            conn,
          );
        }
      }

      // Org settlement accounting is handled by the unified settlement engine
      // above (settlement:paid → GL settlement_paid clearing entry). No direct
      // booking_org_settlement posting anymore — single authority.

      // Update settled amounts (bounded).
      if (coachSettle > 0) {
        await conn.execute(
          `UPDATE bookings SET coach_settled_amount = LEAST(coach_amount, coach_settled_amount + ?) WHERE id = ?`,
          [coachSettle, bookingId],
        );
      }
      // org_settled_amount projection already synced inside the Model B org leg.
      // Update recovery collected when offset applied (bounded).
      if (coachOffset > 0) {
        await conn.execute(
          `UPDATE bookings SET coach_recovery_collected = LEAST(coach_recovered_amount, coach_recovery_collected + ?) WHERE id = ?`,
          [coachOffset, bookingId],
        );
      }

      // Traceability records.
      if (coachSettle > 0) {
        await conn.execute(
          `INSERT INTO booking_settlements (booking_id, organisation_id, settlement_type, amount, status, batch_reference, created_by, created_at)
           VALUES (?, ?, 'coach', ?, 'settled', ?, ?, ?)`,
          [bookingId, organisationId, coachSettle, batchRef, actorId, now],
        );
      }

      await conn.commit();
      return { coachSettled: coachSettle, orgSettled: orgSettle, coachOffset, orgOffset, coachCash, orgCash, settlementId, batchCode };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Collect outstanding recovery against a booking party (coach/org).
   * Bounded by outstanding = recovered - collected.
   */
  async collectBookingRecovery(
    bookingId: number,
    party: 'coach' | 'org',
    amount: number,
    actorId: number,
  ): Promise<{ collected: number }> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute<RowData>(
        `SELECT organisation_id, coach_recovered_amount, org_recovered_amount,
                coach_recovery_collected, org_recovery_collected
         FROM bookings WHERE id = ? FOR UPDATE`,
        [bookingId],
      );
      if (!rows.length) {
        await conn.rollback();
        throw new Error(`Booking ${bookingId} not found`);
      }
      const b = rows[0] as any;
      const organisationId = b.organisation_id ?? null;

      const recovered = party === 'coach' ? Number(b.coach_recovered_amount || 0) : Number(b.org_recovered_amount || 0);
      const collected = party === 'coach' ? Number(b.coach_recovery_collected || 0) : Number(b.org_recovery_collected || 0);
      const outstanding = Math.max(0, Math.round((recovered - collected) * 100) / 100);
      const collectAmount = Math.min(Math.max(amount, 0), outstanding);

      if (collectAmount <= 0) {
        await conn.rollback();
        return { collected: 0 };
      }

      await postAccountingEvent(
        'booking_recovery_collection', 'booking', bookingId, organisationId,
        { cash_bank: collectAmount, recovery_receivable: collectAmount },
        'EGP',
        `Booking #${bookingId} ${party} recovery collection`,
        conn,
      );

      const col = party === 'coach'
        ? `UPDATE bookings SET coach_recovery_collected = coach_recovery_collected + ? WHERE id = ?`
        : `UPDATE bookings SET org_recovery_collected = org_recovery_collected + ? WHERE id = ?`;
      await conn.execute(col, [collectAmount, bookingId]);

      await conn.commit();
      return { collected: collectAmount };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  private deriveEligibility(b: any, coachSettleable: number, orgSettleable: number): { status: EligibilityStatus; reason: string } {
    const status = b.booking_status;
    const payment = b.payment_status || '';

    if (status === 'cancelled' || status === 'expired' || status === 'no_show') {
      return { status: 'NOT_ELIGIBLE', reason: `booking_status is ${status}` };
    }
    if (status !== 'completed' && status !== 'checked_in') {
      return { status: 'NOT_ELIGIBLE', reason: `booking not yet fulfilled (status ${status})` };
    }
    if (payment !== 'paid' && payment !== 'partially_refunded') {
      return { status: 'NOT_ELIGIBLE', reason: `payment not collected (status ${payment})` };
    }

    const hasSettleable = coachSettleable > 0 || orgSettleable > 0;
    const hasSettled = Number(b.coach_settled_amount || 0) > 0 || Number(b.org_settled_amount || 0) > 0;

    if (!hasSettleable && hasSettled) {
      return { status: 'SETTLED', reason: 'all settleable economics already settled' };
    }
    if (!hasSettleable && !hasSettled) {
      return { status: 'NOT_ELIGIBLE', reason: 'no settleable economics (fully refunded)' };
    }
    if (hasSettled) {
      return { status: 'PARTIALLY_SETTLED', reason: 'partially settled; remaining settleable exists' };
    }
    return { status: 'ELIGIBLE', reason: 'settleable economics available' };
  }

  private computeSettleableLocked(b: any): { coachSettleable: number; orgSettleable: number } {
    const coachAmount = Number(b.coach_amount || 0);
    const orgAmount = Number(b.club_amount || 0);
    const refunded = Number(b.refunded_amount || 0);
    const grossPayable = Number(b.total_amount || 0) + Number(b.tax_amount || 0);
    const coachSettled = Number(b.coach_settled_amount || 0);
    const orgSettled = Number(b.org_settled_amount || 0);

    const ratio = grossPayable > 0 ? Math.min(refunded / grossPayable, 1) : 0;
    const coachRefunded = Math.round(coachAmount * ratio * 100) / 100;
    const orgRefunded = Math.round(orgAmount * ratio * 100) / 100;

    return {
      coachSettleable: Math.max(0, Math.round((coachAmount - coachSettled - coachRefunded) * 100) / 100),
      orgSettleable: Math.max(0, Math.round((orgAmount - orgSettled - orgRefunded) * 100) / 100),
    };
  }
}

export const bookingSettlementService = new BookingSettlementService();

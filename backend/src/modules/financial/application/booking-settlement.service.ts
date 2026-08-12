import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { postAccountingEvent } from './accounting-event.listener.js';

const log = createModuleLogger('booking-settlement');
type RowData = RowDataPacket[];

/**
 * Booking settlement + recovery collection service.
 *
 * Reuses the EXISTING canonical accounting engine (postAccountingEvent →
 * AccountingEngineService → ledger_entries → general_ledger). Does NOT create
 * a second settlement engine and does NOT write to financial_journal_entries.
 *
 * Settlement eligibility: booking economics are settleable up to
 *   original component - refunded component - already settled component.
 * Never settles negative amounts.
 */
class BookingSettlementService {
  private pool = getPool();

  /**
   * Compute settleable amounts for a booking's coach + org economics.
   * settleable = original - alreadySettled - alreadyRefundedProrated.
   */
  async getSettleable(bookingId: number): Promise<{
    coachSettleable: number;
    orgSettleable: number;
    coachSettled: number;
    orgSettled: number;
    coachRecovered: number;
    orgRecovered: number;
    coachCollected: number;
    orgCollected: number;
  } | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT coach_amount, club_amount, refunded_amount, total_amount, tax_amount,
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

    // Refund ratio prorates the refunded economics against original components.
    const ratio = grossPayable > 0 ? Math.min(refunded / grossPayable, 1) : 0;
    const coachRefunded = Math.round(coachAmount * ratio * 100) / 100;
    const orgRefunded = Math.round(orgAmount * ratio * 100) / 100;

    const coachSettleable = Math.max(0, Math.round((coachAmount - coachSettled - coachRefunded) * 100) / 100);
    const orgSettleable = Math.max(0, Math.round((orgAmount - orgSettled - orgRefunded) * 100) / 100);

    return {
      coachSettleable,
      orgSettleable,
      coachSettled,
      orgSettled,
      coachRecovered,
      orgRecovered,
      coachCollected,
      orgCollected,
    };
  }

  /**
   * Settle eligible booking economics (coach + org) atomically.
   * Posts canonical accounting for the settled portions, updates settled
   * amounts, and records booking_settlements traceability rows.
   */
  async settleBookingEconomics(
    bookingId: number,
    coachAmount: number,
    orgAmount: number,
    actorId: number,
  ): Promise<{ coachSettled: number; orgSettled: number }> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      // Lock the booking row for concurrency safety.
      const [rows] = await conn.execute<RowData>(
        `SELECT organisation_id, coach_amount, club_amount, refunded_amount, total_amount, tax_amount,
                coach_settled_amount, org_settled_amount
         FROM bookings WHERE id = ? FOR UPDATE`,
        [bookingId],
      );
      if (!rows.length) {
        await conn.rollback();
        throw new Error(`Booking ${bookingId} not found`);
      }
      const b = rows[0] as any;
      const organisationId = b.organisation_id ?? null;

      const settleable = await this.computeSettleableLocked(b);
      const coachSettle = Math.min(Math.max(coachAmount, 0), settleable.coachSettleable);
      const orgSettle = Math.min(Math.max(orgAmount, 0), settleable.orgSettleable);

      if (coachSettle <= 0 && orgSettle <= 0) {
        await conn.rollback();
        return { coachSettled: 0, orgSettled: 0 };
      }

      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const batchRef = `bs_${bookingId}_${Date.now()}`;

      // Coach settlement accounting: clear coach_payable against cash (within outer tx).
      if (coachSettle > 0) {
        await postAccountingEvent(
          'booking_coach_settlement', 'booking', bookingId, organisationId,
          { coach_payable: coachSettle, cash_bank: coachSettle },
          'EGP',
          `Booking #${bookingId} coach settlement`,
          conn,
        );
      }

      // Org settlement accounting: clear org_payable against cash (within outer tx).
      if (orgSettle > 0) {
        await postAccountingEvent(
          'booking_org_settlement', 'booking', bookingId, organisationId,
          { org_payable: orgSettle, cash_bank: orgSettle },
          'EGP',
          `Booking #${bookingId} org settlement`,
          conn,
        );
      }

      // Update settled amounts atomically (bounded).
      await conn.execute(
        `UPDATE bookings SET coach_settled_amount = LEAST(coach_amount, coach_settled_amount + ?) WHERE id = ?`,
        [coachSettle, bookingId],
      );
      await conn.execute(
        `UPDATE bookings SET org_settled_amount = LEAST(club_amount, org_settled_amount + ?) WHERE id = ?`,
        [orgSettle, bookingId],
      );

      // Traceability records.
      if (coachSettle > 0) {
        await conn.execute(
          `INSERT INTO booking_settlements (booking_id, organisation_id, settlement_type, amount, status, batch_reference, created_by, created_at)
           VALUES (?, ?, 'coach', ?, 'settled', ?, ?, ?)`,
          [bookingId, organisationId, coachSettle, batchRef, actorId, now],
        );
      }
      if (orgSettle > 0) {
        await conn.execute(
          `INSERT INTO booking_settlements (booking_id, organisation_id, settlement_type, amount, status, batch_reference, created_by, created_at)
           VALUES (?, ?, 'org', ?, 'settled', ?, ?, ?)`,
          [bookingId, organisationId, orgSettle, batchRef, actorId, now],
        );
      }

      await conn.commit();
      return { coachSettled: coachSettle, orgSettled: orgSettle };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Collect outstanding recovery against a booking party (coach/org).
   * Collection is bounded by: outstanding = recovered - collected.
   * Posts canonical accounting (cash against recovery_receivable).
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

      // Canonical recovery collection accounting (within outer tx).
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

  private async computeSettleableLocked(b: any): Promise<{ coachSettleable: number; orgSettleable: number }> {
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

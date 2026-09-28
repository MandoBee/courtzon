import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { paymentGateway } from '../../../shared/services/gateway/gateway-factory.js';
import type { Pool } from 'mysql2/promise';


const log = createModuleLogger('reconciliation');

type CheckStatus = 'PASS' | 'INFO' | 'WARNING' | 'CRITICAL';

interface ReconciliationIssue {
  type: string;
  status: CheckStatus;
  entityType: string;
  entityId: number;
  detail: string;
  recommendation: string;
  autoFixable: boolean;
}

interface ReconciliationRun {
  id: string;
  startedAt: Date;
  endedAt?: Date;
  itemsChecked: number;
  issuesFound: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  autoFixed: number;
  issues: ReconciliationIssue[];
}

async function getGatewayTransactionStatus(gatewayRef: string): Promise<{ status: string; amount: number } | null> {
  try {
    const result = await (paymentGateway as any).getTransactionStatus(gatewayRef);
    if (!result) return null;
    const status = result.success === true || result.status === 'paid' || result.status === 'success' ? 'paid' : 'failed';
    return { status, amount: Number(result.amount_cents || result.amount || 0) / 100 };
  } catch {
    return null;
  }
}

export class ReconciliationService {
  async run(options: { dateFrom?: string; dateTo?: string; limit?: number; autoFix?: boolean } = {}): Promise<ReconciliationRun> {
    const pool = getPool();
    const run: ReconciliationRun = {
      id: `recon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: new Date(),
      itemsChecked: 0,
      issuesFound: 0,
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0,
      autoFixed: 0,
      issues: [],
    };

    const dateFilter = options.dateFrom ? `AND pt.created_at >= ${pool.escape(options.dateFrom)}` : '';
    const dateFilter2 = options.dateTo ? `AND pt.created_at <= ${pool.escape(options.dateTo)}` : '';
    const limit = options.limit ? `LIMIT ${options.limit}` : '';

    // ── 1. Check 1: Gateway paid → local pending ───────────────────────
    const [pendingPayments] = await pool.execute<any[]>(
      `SELECT pt.*
       FROM payment_transactions pt
       WHERE pt.payment_status IN ('created', 'pending', 'processing')
       AND pt.gateway_provider != 'wallet'
       AND pt.gateway_reference != ''
       AND pt.created_at > NOW() - INTERVAL 7 DAY
       ${dateFilter} ${dateFilter2}
       ${limit}`
    );
    run.itemsChecked += pendingPayments.length;

    for (const pt of pendingPayments) {
      const gatewayStatus = await getGatewayTransactionStatus(pt.gateway_reference);
      if (gatewayStatus === null) continue;
      if (gatewayStatus.status === 'paid') {
        run.issues.push({
          type: 'gateway_paid_local_pending',
          status: 'CRITICAL',
          entityType: 'payment_transaction',
          entityId: pt.id,
          detail: `Gateway reports PAID (${gatewayStatus.amount}) but local status is ${pt.payment_status}. Gateway ref: ${pt.gateway_reference}`,
          recommendation: 'Run recoverPayment() to sync gateway status to local',
          autoFixable: true,
        });
        run.criticalCount++;
      }
    }

    // ── 2. Check 2: Local paid → booking not confirmed ─────────────────
    const [paidNotConfirmed] = await pool.execute<any[]>(
      `SELECT pt.*, b.booking_status, b.id as booking_id
       FROM payment_transactions pt
       JOIN bookings b ON b.id = pt.reference_id AND pt.reference_type = 'booking'
       WHERE pt.payment_status = 'paid'
       AND b.booking_status NOT IN ('confirmed', 'completed', 'checked_in')
       AND pt.created_at > NOW() - INTERVAL 7 DAY
       ${dateFilter} ${dateFilter2}
       ${limit}`
    );
    run.itemsChecked += paidNotConfirmed.length;

    for (const row of paidNotConfirmed) {
      run.issues.push({
        type: 'paid_booking_not_confirmed',
        status: 'WARNING',
        entityType: 'booking',
        entityId: row.booking_id,
        detail: `Payment ${row.id} is PAID but booking ${row.booking_id} status is ${row.booking_status}`,
        recommendation: 'Check if booking confirmation webhook was missed. Run confirmBooking()',
        autoFixable: false,
      });
      run.warningCount++;
    }

    // ── 3. Check 3: Wallet deducted → payment not completed ────────────
    const [walletDeductions] = await pool.execute<any[]>(
      `SELECT wt.*, pt.payment_status
       FROM wallet_transactions wt
       LEFT JOIN payment_transactions pt ON pt.id = wt.reference_id
       WHERE wt.transaction_type = 'payment'
       AND (pt.payment_status IS NULL OR pt.payment_status NOT IN ('paid', 'refunded'))
       AND wt.created_at > NOW() - INTERVAL 7 DAY
       ${dateFilter} ${dateFilter2}
       ${limit}`
    );
    run.itemsChecked += walletDeductions.length;

    for (const wd of walletDeductions) {
      run.issues.push({
        type: 'wallet_deducted_payment_not_complete',
        status: 'CRITICAL',
        entityType: 'wallet_transaction',
        entityId: wd.id,
        detail: `Wallet deducted ${wd.amount} but payment status is ${wd.payment_status || 'MISSING'}`,
        recommendation: 'Manual investigation required — wallet and payment are out of sync',
        autoFixable: false,
      });
      run.criticalCount++;
    }

    // ── 4. Check 4: Paid payment → no linked booking/intent/order ──────
    const [orphanPayments] = await pool.execute<any[]>(
      `SELECT pt.*
       FROM payment_transactions pt
       WHERE pt.payment_status = 'paid'
       AND pt.reference_type IS NULL
       AND pt.reference_id IS NULL
       AND pt.created_at > NOW() - INTERVAL 7 DAY
       ${dateFilter} ${dateFilter2}
       ${limit}`
    );
    run.itemsChecked += orphanPayments.length;

    for (const op of orphanPayments) {
      run.issues.push({
        type: 'orphan_payment',
        status: 'WARNING',
        entityType: 'payment_transaction',
        entityId: op.id,
        detail: `Payment ${op.id} is PAID but has no linked booking, intent, or order`,
        recommendation: 'Investigate source of payment. Manual refund if no service was delivered.',
        autoFixable: false,
      });
      run.warningCount++;
    }

    // ── 5. Check 5: Booking confirmed → no paid payment ───────────────
    // R5-C3-A — recurring-series awareness. A series occurrence is paid either
    //   (a) by the parent's ONE `booking_series` payment (reference_type=
    //       'booking_series', reference_id=series.id, booking_id=NULL), or
    //   (b) by an R5-C4 series CASH confirmation — Cash creates NO
    //       payment_transactions row; the canonical signal is the occurrence's
    //       own payment_status='paid' after the operator's confirmation.
    // Standalone bookings (series_id IS NULL) keep the EXACT existing behavior.
    // A series occurrence is only excluded when the series is actually paid
    // (a paid booking_series payment exists, OR at least one confirmed
    // occurrence carries payment_status='paid'); otherwise it is still reported.
    const [bookingNoPayment] = await pool.execute<any[]>(
      `SELECT b.*, pt.payment_status
       FROM bookings b
       LEFT JOIN payment_transactions pt ON pt.reference_id = b.id AND pt.reference_type = 'booking'
       WHERE b.booking_status = 'confirmed'
       AND (pt.payment_status IS NULL OR pt.payment_status NOT IN ('paid', 'refunded'))
       AND b.created_at > NOW() - INTERVAL 7 DAY
       AND (
         b.series_id IS NULL
         OR NOT (
           EXISTS (
             SELECT 1 FROM payment_transactions pt_series
             WHERE pt_series.reference_type = 'booking_series'
               AND pt_series.reference_id = b.series_id
               AND pt_series.payment_status = 'paid'
           )
           OR EXISTS (
             SELECT 1 FROM bookings b2
             WHERE b2.series_id = b.series_id
               AND b2.booking_status = 'confirmed'
               AND b2.payment_status = 'paid'
           )
         )
       )
       ${dateFilter} ${dateFilter2}
       ${limit}`
    );
    run.itemsChecked += bookingNoPayment.length;

    for (const bn of bookingNoPayment) {
      run.issues.push({
        type: 'booking_confirmed_no_payment',
        status: 'INFO',
        entityType: 'booking',
        entityId: bn.id,
        detail: `Booking ${bn.id} is CONFIRMED but has no PAID payment. Payment status: ${bn.payment_status || 'NONE'}`,
        recommendation: 'For COD bookings this is normal. For card/wallet, verify payment was processed.',
        autoFixable: false,
      });
      run.infoCount++;
    }

    // ── 5b. G11.4 — TOURNAMENT registration ↔ payment ↔ settlement checks ──
    // STRICTLY REPORT-ONLY. None of these is `autoFixable`, so the existing
    // autoFix block below is untouched and can never act on them: a financial
    // ledger discrepancy is a human decision, never an automated repair.
    const tournamentChecks = await this.runTournamentChecks(pool, dateFilter, dateFilter2, limit);
    for (const issue of tournamentChecks.issues) {
      run.issues.push(issue);
      if (issue.status === 'CRITICAL') run.criticalCount++;
      else if (issue.status === 'WARNING') run.warningCount++;
      else run.infoCount++;
    }
    run.itemsChecked += tournamentChecks.itemsChecked;

    // ── 6. Auto-fix: gateway_paid_local_pending ────────────────────────
    if (options.autoFix) {
      for (const issue of run.issues) {
        if (!issue.autoFixable) continue;
        try {
          const recovMod = await import('./payment.service.js');
          const gatewayRef = issue.detail.match(/Gateway ref: (\S+)/)?.[1];
          if (gatewayRef) { await recovMod.paymentService.recoverPayment(gatewayRef, 0); run.autoFixed++;
            issue.detail += ' [AUTO-FIXED]';
          }
        } catch (err) {
          log.error({ err, entityId: issue.entityId }, 'Auto-fix failed');
        }
      }
    }

    run.endedAt = new Date();
    run.issuesFound = run.issues.length;

    // ── 7. Audit log ──────────────────────────────────────────────────
    try {
      const { recordAudit } = await import('../../audit-log/index.js');
      recordAudit({
        actorId: 0,
        action: 'RECONCILIATION.RUN',
        entityType: 'payment',
        afterState: {
          runId: run.id,
          itemsChecked: run.itemsChecked,
          issuesFound: run.issuesFound,
          criticalCount: run.criticalCount,
          warningCount: run.warningCount,
          infoCount: run.infoCount,
          autoFixed: run.autoFixed,
        },
      });
    } catch { /* non-fatal */ }

    log.info({
      runId: run.id,
      itemsChecked: run.itemsChecked,
      issuesFound: run.issuesFound,
      criticalCount: run.criticalCount,
      autoFixed: run.autoFixed,
      durationMs: run.endedAt.getTime() - run.startedAt.getTime(),
    }, 'Reconciliation run completed');

    return run;
  }

  /**
   * G11.4 — six REPORT-ONLY tournament checks that complete the
   * registration ↔ payment ↔ gateway-settlement triangle.
   *
   * G11.1 recognised the money, G11.3 refundable it, and G11.4 made it
   * settleable, but none of those steps guarantees the three sides still agree.
   * These checks surface the disagreement instead of silently reconciling it.
   * Every issue is `autoFixable: false`, so the existing autoFix block ignores
   * them by construction.
   */
  private async runTournamentChecks(
    pool: Pool,
    dateFilter: string,
    dateFilter2: string,
    limit: string,
  ): Promise<{ issues: ReconciliationIssue[]; itemsChecked: number }> {
    const issues: ReconciliationIssue[] = [];
    let itemsChecked = 0;
    const push = (
      type: string,
      status: CheckStatus,
      entityType: string,
      entityId: number,
      detail: string,
      recommendation: string,
    ) => issues.push({ type, status, entityType, entityId, detail, recommendation, autoFixable: false });

    // 5b-1. Registration paid without a valid paid payment.
    const [paidNoPayment] = await pool.execute<any[]>(
      `SELECT tr.id AS registration_id, tr.tournament_id, tr.payment_status
       FROM tournament_registrations tr
       WHERE tr.payment_status = 'paid'
         AND NOT EXISTS (
           SELECT 1 FROM payment_transactions pt
           WHERE pt.reference_type = 'tournament'
             AND pt.reference_id = tr.id
             AND pt.payment_status IN ('paid', 'refunded')
         )
       ORDER BY tr.id DESC ${limit}`,
    );
    itemsChecked += (paidNoPayment as any[]).length;
    for (const r of paidNoPayment as any[]) {
      push(
        'tournament_registration_paid_without_payment',
        'CRITICAL',
        'tournament_registration',
        Number(r.registration_id),
        `Registration ${r.registration_id} (tournament ${r.tournament_id}) is PAID but no paid/refunded tournament payment exists`,
        'Either the payment row is missing (reconcile with the gateway) or the registration was marked paid in error.',
      );
    }

    // 5b-2. Tournament payment paid but its registration is not paid.
    const [paymentNoRegistration] = await pool.execute<any[]>(
      `SELECT pt.id AS payment_id, pt.reference_id AS registration_id, tr.payment_status
       FROM payment_transactions pt
       LEFT JOIN tournament_registrations tr ON tr.id = pt.reference_id
       WHERE pt.reference_type = 'tournament'
         AND pt.payment_status = 'paid'
         AND (tr.id IS NULL OR tr.payment_status <> 'paid')
       ORDER BY pt.id DESC ${limit}`,
    );
    itemsChecked += (paymentNoRegistration as any[]).length;
    for (const r of paymentNoRegistration as any[]) {
      push(
        'tournament_payment_paid_registration_not_paid',
        'CRITICAL',
        'payment_transaction',
        Number(r.payment_id),
        `Tournament payment ${r.payment_id} is PAID but registration ${r.registration_id ?? 'MISSING'} is ${r.payment_status ?? 'MISSING'}`,
        'The payment:succeeded listener did not finish. Re-run registration marking, or refund the payment if the registration is gone.',
      );
    }

    // 5b-3. Refunded tournament payment whose registration is still 'paid'.
    const [refundedStillPaid] = await pool.execute<any[]>(
      `SELECT pt.id AS payment_id, pt.reference_id AS registration_id, tr.payment_status
       FROM payment_transactions pt
       JOIN tournament_registrations tr ON tr.id = pt.reference_id
       WHERE pt.reference_type = 'tournament'
         AND pt.payment_status = 'refunded'
         AND tr.payment_status = 'paid'
       ORDER BY pt.id DESC ${limit}`,
    );
    itemsChecked += (refundedStillPaid as any[]).length;
    for (const r of refundedStillPaid as any[]) {
      push(
        'tournament_refunded_payment_registration_still_paid',
        'CRITICAL',
        'tournament_registration',
        Number(r.registration_id),
        `Registration ${r.registration_id} is still PAID although its payment ${r.payment_id} is REFUNDED`,
        'The refund executed but the registration state was not updated — the player appears entitled to a slot they no longer paid for.',
      );
    }

    // 5b-4. Gateway-settled tournament payment with no settlement history line.
    // Reads the DURABLE history (not payment.gateway_settlement_id, which a
    // dismantle clears) so it also catches a partially dismantled batch.
    const [settledNoHistory] = await pool.execute<any[]>(
      `SELECT pt.id AS payment_id, pt.reference_id AS registration_id, pt.gateway_settlement_id
       FROM payment_transactions pt
       WHERE pt.reference_type = 'tournament'
         AND pt.gateway_settlement_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM gateway_settlement_transactions gst
           WHERE gst.payment_transaction_id = pt.id
         )
       ORDER BY pt.id DESC ${limit}`,
    );
    itemsChecked += (settledNoHistory as any[]).length;
    for (const r of settledNoHistory as any[]) {
      push(
        'tournament_settled_payment_missing_lineage',
        'CRITICAL',
        'payment_transaction',
        Number(r.payment_id),
        `Tournament payment ${r.payment_id} (registration ${r.registration_id}) points at gateway settlement ${r.gateway_settlement_id} but has NO settlement line at all`,
        'The batch cannot be reconciled or reversed for this payment. Re-create the line from the gateway statement or clear the linkage.',
      );
    }

    // 5b-5. Refund-after-settlement with an inconsistent bank / clearing state.
    // The settled refund must have left 1100 untouched and 1120 debited; the
    // unsettled one must have credited 1100 and never touched 1120.
    const [refundBankClearing] = await pool.execute<any[]>(
      `SELECT pt.id AS payment_id, pt.reference_id AS registration_id, pt.amount,
              COALESCE(SUM(CASE WHEN c.code = '1100' THEN gl.credit - gl.debit ELSE 0 END), 0) AS clearing_net,
              COALESCE(SUM(CASE WHEN c.code = '1120' THEN gl.debit - gl.credit ELSE 0 END), 0) AS bank_debit
       FROM payment_transactions pt
       JOIN ledger_entries le
         ON le.source_type = 'tournament'
        AND le.source_id = pt.id
        AND le.event_type = 'tournament_registration_card_refund_settled'
       JOIN general_ledger gl ON gl.ledger_entry_id = le.id
       JOIN chart_of_accounts c ON c.id = gl.account_id
       WHERE pt.reference_type = 'tournament'
       GROUP BY pt.id, pt.reference_id, pt.amount
       ORDER BY pt.id DESC ${limit}`,
    );
    itemsChecked += (refundBankClearing as any[]).length;
    for (const r of refundBankClearing as any[]) {
      const clearingNet = Math.round(Number(r.clearing_net) * 100) / 100;
      const bankDebit = Math.round(Number(r.bank_debit) * 100) / 100;
      const gross = Math.round(Number(r.amount) * 100) / 100;
      if (bankDebit === gross && clearingNet === 0) continue;
      push(
        'tournament_settled_refund_bank_clearing_inconsistent',
        'CRITICAL',
        'payment_transaction',
        Number(r.payment_id),
        `Tournament payment ${r.payment_id} (registration ${r.registration_id}, ${gross}) has a settled refund but bank debit is ${bankDebit} and 1100 net movement is ${clearingNet} (expected ${gross} and 0)`,
        'The settled refund must debit 1120 by the gross and never touch 1100. Investigate the journal before any further settlement.',
      );
    }

    // 5b-6. Settlement line / payment mismatch for a tournament payment.
    const [lineMismatch] = await pool.execute<any[]>(
      `SELECT pt.id AS payment_id, pt.reference_id AS registration_id, pt.gateway_settlement_id,
              gst.id AS line_id, gst.gateway_settlement_id AS line_settlement_id,
              gst.active_payment_transaction_id
       FROM payment_transactions pt
       JOIN gateway_settlement_transactions gst ON gst.payment_transaction_id = pt.id
       WHERE pt.reference_type = 'tournament'
         AND pt.gateway_settlement_id IS NOT NULL
         AND (gst.gateway_settlement_id <> pt.gateway_settlement_id
              OR gst.active_payment_transaction_id IS NULL)
       ORDER BY pt.id DESC ${limit}`,
    );
    itemsChecked += (lineMismatch as any[]).length;
    for (const r of lineMismatch as any[]) {
      push(
        'tournament_settlement_line_payment_mismatch',
        'CRITICAL',
        'payment_transaction',
        Number(r.payment_id),
        `Tournament payment ${r.payment_id} (registration ${r.registration_id}) points at settlement ${r.gateway_settlement_id} but its line ${r.line_id} is in batch ${r.line_settlement_id} and is ${r.active_payment_transaction_id === null ? 'RELEASED' : 'active'}`,
        'The batch and the payment disagree. Run the gateway settlement reconciliation for the full picture before acting.',
      );
    }

    return { issues, itemsChecked };
  }

  async getHistory(limit = 20): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.query<any[]>(
      `SELECT * FROM audit_logs
       WHERE action = 'RECONCILIATION.RUN'
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  }
}

export const reconciliationService = new ReconciliationService();

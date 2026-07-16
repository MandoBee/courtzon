import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { paymentGateway } from '../../../shared/services/gateway/gateway-factory.js';


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
      `SELECT pt.*, bi.intent_status
       FROM payment_transactions pt
       LEFT JOIN booking_intents bi ON bi.id = pt.reference_id AND pt.reference_type = 'booking_intent'
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
       WHERE wt.type = 'payment'
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
    const [bookingNoPayment] = await pool.execute<any[]>(
      `SELECT b.*, pt.payment_status
       FROM bookings b
       LEFT JOIN payment_transactions pt ON pt.reference_id = b.id AND pt.reference_type = 'booking'
       WHERE b.booking_status = 'confirmed'
       AND (pt.payment_status IS NULL OR pt.payment_status NOT IN ('paid', 'refunded'))
       AND b.created_at > NOW() - INTERVAL 7 DAY
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

  async getHistory(limit = 20): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
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

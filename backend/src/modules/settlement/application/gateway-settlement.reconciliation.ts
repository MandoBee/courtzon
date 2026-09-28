import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { recordAudit } from '../../audit-log/index.js';
import type { Pool } from 'mysql2/promise';

const log = createModuleLogger('gateway-settlement-reconciliation');

const round2 = (n: number) => Math.round(Number(n ?? 0) * 100) / 100;

export type GatewaySettlementCheckSeverity = 'CRITICAL' | 'WARNING';

export interface GatewaySettlementCheck {
  /** Stable machine-readable check id. */
  key: string;
  label: string;
  description: string;
  severity: GatewaySettlementCheckSeverity;
  /** Rows the check inspected. */
  itemsChecked: number;
  /** Discrepancies found (0 = clean). */
  issuesFound: number;
  /** Every discrepancy is reported, capped for response size. */
  issues: Array<{
    severity: GatewaySettlementCheckSeverity;
    entityType: 'gateway_settlement' | 'gateway_settlement_transaction' | 'payment_transaction';
    entityId: number;
    detail: string;
    recommendation: string;
  }>;
}

export interface GatewaySettlementReconciliationReport {
  runId: string;
  startedAt: Date;
  endedAt: Date;
  /** Always false — this service is STRICTLY report-only. */
  autoFixAvailable: false;
  readOnly: true;
  checks: GatewaySettlementCheck[];
  summary: {
    checksRun: number;
    itemsChecked: number;
    issuesFound: number;
    criticalCount: number;
    warningCount: number;
    clean: boolean;
  };
}

const MAX_ISSUES_PER_CHECK = 200;

function emptyCheck(
  key: string,
  label: string,
  description: string,
  severity: GatewaySettlementCheckSeverity,
): GatewaySettlementCheck {
  return { key, label, description, severity, itemsChecked: 0, issuesFound: 0, issues: [] };
}

/**
 * G11.4 — GATEWAY SETTLEMENT RECONCILIATION (REPORT-ONLY, NO autoFix).
 *
 * Verifies the internal consistency of the gateway settlement ledger — the layer
 * that moves customer money out of 1100 Payment Clearing into 1120 Cash/Bank.
 *
 * The INVARIANT it protects: a batch HEADER always equals the sum of its own
 * ACTIVE lines, and an ACTIVE line is always mutually consistent with the
 * payment_transactions row it settles. G11.4 introduced a payment-scoped
 * dismantle (a refunded payment is released from its batch without reversing the
 * batch), so both sides can now drift and drift is INVISIBLE to the batch
 * detail screen. This report is how an operator sees it.
 *
 * Deliberate design constraints:
 *   - READ-ONLY. Only SELECTs; it never mutates a settlement, a payment, a line
 *     or the GL, and it exposes NO autoFix — a financial ledger discrepancy is a
 *     human decision, never an automated repair.
 *   - NO duplication of the existing `autoFix` block in the payment
 *     reconciliation service; that block is untouched and still only handles
 *     `gateway_paid_local_pending`.
 *   - Severities are limited to CRITICAL (the ledger contradicts itself) and
 *     WARNING (an expected-but-suspicious business state).
 */
export class GatewaySettlementReconciliationService {
  async run(options: { limit?: number } = {}): Promise<GatewaySettlementReconciliationReport> {
    const pool = getPool();
    const startedAt = new Date();
    const runId = `gs-recon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const limit = Math.max(1, Math.floor(Number(options.limit) || 500));

    const checks: GatewaySettlementCheck[] = [
      await this.checkHeaderTotalsVsActiveLines(pool, limit),
      await this.checkTransactionCountVsActiveLines(pool, limit),
      await this.checkActiveLineOwnership(pool, limit),
      await this.checkPaymentLinkageConsistency(pool, limit),
      await this.checkRefundedPaymentStillActive(pool, limit),
      await this.checkLinePaymentSettlementMismatch(pool, limit),
      await this.checkRefundedTournamentStillMarkedSettled(pool, limit),
      await this.checkTournamentNotSettledAfterDrawLock(pool, limit),
      await this.checkDuplicateActiveOwnership(pool, limit),
    ];

    let itemsChecked = 0;
    let issuesFound = 0;
    let criticalCount = 0;
    let warningCount = 0;
    for (const c of checks) {
      itemsChecked += c.itemsChecked;
      issuesFound += c.issuesFound;
      if (c.severity === 'CRITICAL') criticalCount += c.issuesFound;
      else warningCount += c.issuesFound;
    }

    const report: GatewaySettlementReconciliationReport = {
      runId,
      startedAt,
      endedAt: new Date(),
      autoFixAvailable: false,
      readOnly: true,
      checks,
      summary: {
        checksRun: checks.length,
        itemsChecked,
        issuesFound,
        criticalCount,
        warningCount,
        clean: issuesFound === 0,
      },
    };

    // Audit the RUN (existing convention: same shape as RECONCILIATION.RUN).
    try {
      await recordAudit({
        actorId: 0,
        action: 'GATEWAY_SETTLEMENT.RECONCILIATION',
        entityType: 'gateway_settlement',
        afterState: {
          runId,
          checksRun: report.summary.checksRun,
          itemsChecked,
          issuesFound,
          criticalCount,
          warningCount,
          readOnly: true,
        },
      });
    } catch (err) {
      log.error({ err, runId }, 'Failed to audit gateway settlement reconciliation run');
    }

    // Audit every DISCREPANCY individually so the drift is traceable per entity.
    for (const check of checks) {
      if (check.issuesFound === 0) continue;
      try {
        await recordAudit({
          actorId: 0,
          action: 'GATEWAY_SETTLEMENT.RECONCILIATION_DISCREPANCY',
          entityType: check.key,
          afterState: {
            runId,
            check: check.key,
            severity: check.severity,
            issuesFound: check.issuesFound,
            sample: check.issues.slice(0, 10).map((i) => ({
              entityType: i.entityType,
              entityId: i.entityId,
              detail: i.detail,
            })),
          },
        });
      } catch (err) {
        log.error({ err, runId, check: check.key }, 'Failed to audit gateway settlement reconciliation discrepancy');
      }
    }

    log.info({ runId, itemsChecked, issuesFound, criticalCount, warningCount }, 'Gateway settlement reconciliation completed');
    return report;
  }

  // ── 1. Header monetary totals vs the sum of the batch's ACTIVE lines ──
  private async checkHeaderTotalsVsActiveLines(pool: Pool, limit: number): Promise<GatewaySettlementCheck> {
    const check = emptyCheck(
      'header_totals_vs_active_lines',
      'Batch header totals vs active lines',
      'gateway_settlements.gross_amount / gateway_fee_amount / net_amount must equal the sum of the batch ACTIVE settlement lines. Released (dismantled) lines are excluded because they were already deducted.',
      'CRITICAL',
    );
    const [rows] = await pool.execute<any[]>(
      `SELECT gs.id, gs.batch_code, gs.gross_amount, gs.gateway_fee_amount, gs.net_amount,
              COALESCE(agg.active_gross, 0) AS active_gross,
              COALESCE(agg.active_fee, 0)   AS active_fee,
              COALESCE(agg.active_net, 0)   AS active_net
       FROM gateway_settlements gs
       LEFT JOIN (
         SELECT gateway_settlement_id,
                SUM(gross_amount)       AS active_gross,
                SUM(gateway_fee_amount) AS active_fee,
                SUM(net_amount)         AS active_net
         FROM gateway_settlement_transactions
         WHERE active_payment_transaction_id IS NOT NULL
         GROUP BY gateway_settlement_id
       ) agg ON agg.gateway_settlement_id = gs.id
       WHERE gs.settlement_status = 'completed'
       ORDER BY gs.id DESC
       LIMIT ${limit}`,
      // limit is an already-validated safe integer (Math.max/Math.floor); MySQL rejects a
        // parameterised LIMIT in a prepared statement, so it is inlined.
    );
    check.itemsChecked = (rows as any[]).length;

    for (const r of rows as any[]) {
      const dGross = round2(r.gross_amount) - round2(r.active_gross);
      const dFee = round2(r.gateway_fee_amount) - round2(r.active_fee);
      const dNet = round2(r.net_amount) - round2(r.active_net);
      if (Math.abs(dGross) < 0.01 && Math.abs(dFee) < 0.01 && Math.abs(dNet) < 0.01) continue;
      check.issuesFound++;
      if (check.issues.length < MAX_ISSUES_PER_CHECK) {
        check.issues.push({
          severity: 'CRITICAL',
          entityType: 'gateway_settlement',
          entityId: Number(r.id),
          detail: `Batch ${r.id} (${r.batch_code}) header is gross ${round2(r.gross_amount)} / fee ${round2(r.gateway_fee_amount)} / net ${round2(r.net_amount)} but its ACTIVE lines sum to ${round2(r.active_gross)} / ${round2(r.active_fee)} / ${round2(r.active_net)} (delta ${dGross} / ${dFee} / ${dNet})`,
          recommendation: 'Do NOT auto-correct. Compare gateway_settlement_transactions for this batch against the gateway bank statement, then decide whether the header or a line is wrong.',
        });
      }
    }
    return check;
  }

  // ── 2. transaction_count vs the number of ACTIVE lines ──
  private async checkTransactionCountVsActiveLines(pool: Pool, limit: number): Promise<GatewaySettlementCheck> {
    const check = emptyCheck(
      'transaction_count_vs_active_lines',
      'transaction_count vs active line count',
      'gateway_settlements.transaction_count must equal the number of ACTIVE lines. A dismantle decrements both together, so a mismatch means an incomplete dismantle or a manual edit.',
      'CRITICAL',
    );
    const [rows] = await pool.execute<any[]>(
      `SELECT gs.id, gs.batch_code, gs.transaction_count,
              (SELECT COUNT(*) FROM gateway_settlement_transactions gst
                WHERE gst.gateway_settlement_id = gs.id
                  AND gst.active_payment_transaction_id IS NOT NULL) AS active_lines
       FROM gateway_settlements gs
       WHERE gs.settlement_status = 'completed'
       ORDER BY gs.id DESC
       LIMIT ${limit}`,
      // limit is an already-validated safe integer (Math.max/Math.floor); MySQL rejects a
        // parameterised LIMIT in a prepared statement, so it is inlined.
    );
    check.itemsChecked = (rows as any[]).length;
    for (const r of rows as any[]) {
      if (Number(r.transaction_count) === Number(r.active_lines)) continue;
      check.issuesFound++;
      if (check.issues.length < MAX_ISSUES_PER_CHECK) {
        check.issues.push({
          severity: 'CRITICAL',
          entityType: 'gateway_settlement',
          entityId: Number(r.id),
          detail: `Batch ${r.id} (${r.batch_code}) stores transaction_count ${r.transaction_count} but has ${r.active_lines} ACTIVE lines`,
          recommendation: 'Inspect the batch lines and the dismantling audit trail; correct the header only after confirming the gateway statement.',
        });
      }
    }
    return check;
  }

  // ── 3. An ACTIVE line must be active FOR ITS OWN payment ──
  private async checkActiveLineOwnership(pool: Pool, limit: number): Promise<GatewaySettlementCheck> {
    const check = emptyCheck(
      'active_line_ownership',
      'Active line ownership',
      'active_payment_transaction_id must equal the line payment_transaction_id. A mismatch means the partial-unique key is owned by a different payment than the line settles, so reversing/releasing the line would affect the wrong payment.',
      'CRITICAL',
    );
    const [rows] = await pool.execute<any[]>(
      `SELECT id, gateway_settlement_id, payment_transaction_id, active_payment_transaction_id
       FROM gateway_settlement_transactions
       WHERE active_payment_transaction_id IS NOT NULL
         AND active_payment_transaction_id <> payment_transaction_id
       ORDER BY id DESC
       LIMIT ${limit}`,
      // limit is an already-validated safe integer (Math.max/Math.floor); MySQL rejects a
        // parameterised LIMIT in a prepared statement, so it is inlined.
    );
    check.itemsChecked = (rows as any[]).length;
    for (const r of rows as any[]) {
      check.issuesFound++;
      if (check.issues.length < MAX_ISSUES_PER_CHECK) {
        check.issues.push({
          severity: 'CRITICAL',
          entityType: 'gateway_settlement_transaction',
          entityId: Number(r.id),
          detail: `Line ${r.id} (batch ${r.gateway_settlement_id}) settles payment ${r.payment_transaction_id} but holds active_payment_transaction_id ${r.active_payment_transaction_id}`,
          recommendation: 'Manual data repair required — the active pointer contradicts the settled payment.',
        });
      }
    }
    return check;
  }

  // ── 4. payment.gateway_settlement_id must match an ACTIVE line ──
  private async checkPaymentLinkageConsistency(pool: Pool, limit: number): Promise<GatewaySettlementCheck> {
    const check = emptyCheck(
      'payment_settlement_linkage',
      'Payment ↔ settlement linkage',
      'A payment marked gateway-settled must own an ACTIVE line in exactly the batch it points at. A missing/released active line means the payment is presented as settled while the batch no longer accounts for it.',
      'CRITICAL',
    );
    const [rows] = await pool.execute<any[]>(
      `SELECT pt.id AS payment_id, pt.payment_status, pt.gateway_settlement_id, pt.gateway_settled_at
       FROM payment_transactions pt
       WHERE pt.gateway_settlement_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM gateway_settlement_transactions gst
           WHERE gst.payment_transaction_id = pt.id
             AND gst.gateway_settlement_id = pt.gateway_settlement_id
             AND gst.active_payment_transaction_id IS NOT NULL
         )
       ORDER BY pt.id DESC
       LIMIT ${limit}`,
      // limit is an already-validated safe integer (Math.max/Math.floor); MySQL rejects a
        // parameterised LIMIT in a prepared statement, so it is inlined.
    );
    check.itemsChecked = (rows as any[]).length;
    for (const r of rows as any[]) {
      check.issuesFound++;
      if (check.issues.length < MAX_ISSUES_PER_CHECK) {
        check.issues.push({
          severity: 'CRITICAL',
          entityType: 'payment_transaction',
          entityId: Number(r.payment_id),
          detail: `Payment ${r.payment_id} (status ${r.payment_status}) is marked settled in batch ${r.gateway_settlement_id} at ${r.gateway_settled_at} but owns NO active settlement line there`,
          recommendation: 'The batch no longer accounts for this payment. Re-settle it or clear the linkage — never both — and re-check the affected tournament entitlement.',
        });
      }
    }
    return check;
  }

  // ── 5. A refunded payment must never remain an ACTIVE line ──
  private async checkRefundedPaymentStillActive(pool: Pool, limit: number): Promise<GatewaySettlementCheck> {
    const check = emptyCheck(
      'refunded_payment_still_active',
      'Refunded payment still active in a batch',
      'A refunded payment must not hold an ACTIVE settlement line. Its money has already left CourtZon, so the batch would keep double-counting it and a later reversal would un-settle a dead payment.',
      'CRITICAL',
    );
    const [rows] = await pool.execute<any[]>(
      `SELECT gst.id AS line_id, gst.gateway_settlement_id, gst.payment_transaction_id, pt.payment_status
       FROM gateway_settlement_transactions gst
       JOIN payment_transactions pt ON pt.id = gst.payment_transaction_id
       WHERE gst.active_payment_transaction_id IS NOT NULL
         AND pt.payment_status = 'refunded'
       ORDER BY gst.id DESC
       LIMIT ${limit}`,
      // limit is an already-validated safe integer (Math.max/Math.floor); MySQL rejects a
        // parameterised LIMIT in a prepared statement, so it is inlined.
    );
    check.itemsChecked = (rows as any[]).length;
    for (const r of rows as any[]) {
      check.issuesFound++;
      if (check.issues.length < MAX_ISSUES_PER_CHECK) {
        check.issues.push({
          severity: 'CRITICAL',
          entityType: 'gateway_settlement_transaction',
          entityId: Number(r.line_id),
          detail: `Line ${r.line_id} (batch ${r.gateway_settlement_id}) is still ACTIVE for payment ${r.payment_transaction_id}, which is REFUNDED`,
          recommendation: 'Run the payment-scoped settlement dismantle for this payment (the G11.4 refund path does this) or reverse the batch.',
        });
      }
    }
    return check;
  }

  // ── 6. An ACTIVE line must agree with the payment's own settlement pointer ──
  private async checkLinePaymentSettlementMismatch(pool: Pool, limit: number): Promise<GatewaySettlementCheck> {
    const check = emptyCheck(
      'line_payment_settlement_mismatch',
      'Line ↔ payment settlement pointer mismatch',
      'An ACTIVE line requires its payment to point back at the same batch. A NULL or different gateway_settlement_id means the payment is simultaneously counted in a batch and marked un-settled.',
      'CRITICAL',
    );
    const [rows] = await pool.execute<any[]>(
      `SELECT gst.id AS line_id, gst.gateway_settlement_id, gst.payment_transaction_id,
              pt.gateway_settlement_id AS payment_settlement_id, pt.payment_status
       FROM gateway_settlement_transactions gst
       JOIN payment_transactions pt ON pt.id = gst.payment_transaction_id
       WHERE gst.active_payment_transaction_id IS NOT NULL
         AND (pt.gateway_settlement_id IS NULL OR pt.gateway_settlement_id <> gst.gateway_settlement_id)
       ORDER BY gst.id DESC
       LIMIT ${limit}`,
      // limit is an already-validated safe integer (Math.max/Math.floor); MySQL rejects a
        // parameterised LIMIT in a prepared statement, so it is inlined.
    );
    check.itemsChecked = (rows as any[]).length;
    for (const r of rows as any[]) {
      check.issuesFound++;
      if (check.issues.length < MAX_ISSUES_PER_CHECK) {
        check.issues.push({
          severity: 'CRITICAL',
          entityType: 'gateway_settlement_transaction',
          entityId: Number(r.line_id),
          detail: `Line ${r.line_id} is ACTIVE in batch ${r.gateway_settlement_id} but payment ${r.payment_transaction_id} points at ${r.payment_settlement_id ?? 'NULL'} (status ${r.payment_status})`,
          recommendation: 'Deterministic dismantle: the line and the payment pointer must be released/re-linked together. Verify the refund path audit before acting.',
        });
      }
    }
    return check;
  }

  // ── 7. A refunded TOURNAMENT payment must never still be gateway-settled ──
  private async checkRefundedTournamentStillMarkedSettled(pool: Pool, limit: number): Promise<GatewaySettlementCheck> {
    const check = emptyCheck(
      'refunded_tournament_still_settled',
      'Refunded tournament payment still gateway-settled',
      'A refunded tournament registration payment must have been detached from its gateway settlement. If it is still linked, the batch would reverse a payment that was already paid out of the bank.',
      'CRITICAL',
    );
    const [rows] = await pool.execute<any[]>(
      `SELECT pt.id AS payment_id, pt.reference_id AS registration_id, pt.gateway_settlement_id, pt.gateway_settled_at
       FROM payment_transactions pt
       WHERE pt.reference_type = 'tournament'
         AND pt.payment_status = 'refunded'
         AND pt.gateway_settlement_id IS NOT NULL
       ORDER BY pt.id DESC
       LIMIT ${limit}`,
      // limit is an already-validated safe integer (Math.max/Math.floor); MySQL rejects a
        // parameterised LIMIT in a prepared statement, so it is inlined.
    );
    check.itemsChecked = (rows as any[]).length;
    for (const r of rows as any[]) {
      check.issuesFound++;
      if (check.issues.length < MAX_ISSUES_PER_CHECK) {
        check.issues.push({
          severity: 'CRITICAL',
          entityType: 'payment_transaction',
          entityId: Number(r.payment_id),
          detail: `Tournament payment ${r.payment_id} (registration ${r.registration_id}) is REFUNDED but still linked to gateway settlement ${r.gateway_settlement_id} (settled at ${r.gateway_settled_at})`,
          recommendation: 'Re-run the tournament refund payment-scoped dismantle; until then the batch is overstated by this payment.',
        });
      }
    }
    return check;
  }

  // ── 8. Tournament CARD payment stuck un-settled after the draw is locked ──
  private async checkTournamentNotSettledAfterDrawLock(pool: Pool, limit: number): Promise<GatewaySettlementCheck> {
    const check = emptyCheck(
      'tournament_payment_unsettled_after_draw_lock',
      'Tournament payment not gateway-settled after draw lock',
      'Once the current draw is LOCKED, tournament refunds are closed (G11.3), so a CARD payment that is still not gateway-settled can never release its entitlement and the organisation is stuck waiting for a settlement that was never recorded.',
      'WARNING',
    );
    const [rows] = await pool.execute<any[]>(
      `SELECT pt.id AS payment_id, pt.reference_id AS registration_id, pt.amount, pt.currency, pt.gateway_reference
       FROM payment_transactions pt
       WHERE pt.reference_type = 'tournament'
         AND pt.payment_status = 'paid'
         AND pt.payment_method IN ('card', 'online')
         AND pt.gateway_settlement_id IS NULL
         AND EXISTS (
           SELECT 1
           FROM tournament_registrations tr
           JOIN tournament_draws d ON d.tournament_id = tr.tournament_id AND d.is_current = 1
           WHERE tr.id = pt.reference_id AND d.status = 'locked'
         )
       ORDER BY pt.id DESC
       LIMIT ${limit}`,
      // limit is an already-validated safe integer (Math.max/Math.floor); MySQL rejects a
        // parameterised LIMIT in a prepared statement, so it is inlined.
    );
    check.itemsChecked = (rows as any[]).length;
    for (const r of rows as any[]) {
      check.issuesFound++;
      if (check.issues.length < MAX_ISSUES_PER_CHECK) {
        check.issues.push({
          severity: 'WARNING',
          entityType: 'payment_transaction',
          entityId: Number(r.payment_id),
          detail: `Tournament payment ${r.payment_id} (registration ${r.registration_id}, ${r.amount} ${r.currency}, gateway ref ${r.gateway_reference ?? 'none'}) is PAID but not gateway-settled although the current draw is LOCKED`,
          recommendation: 'Record the missing gateway settlement in "Receive Gateway Settlement", or confirm with the gateway that the funds already arrived in the bank.',
        });
      }
    }
    return check;
  }

  // ── 9. A payment must own at most ONE active settlement line ──
  private async checkDuplicateActiveOwnership(pool: Pool, limit: number): Promise<GatewaySettlementCheck> {
    const check = emptyCheck(
      'duplicate_active_settlement_ownership',
      'Duplicate active settlement ownership',
      'A payment may be settled by at most one ACTIVE line. The uk_gst_active_payment unique key prevents this, so a hit means the index was bypassed (manual import, dump restore) and the money is counted twice.',
      'CRITICAL',
    );
    const [rows] = await pool.execute<any[]>(
      `SELECT active_payment_transaction_id AS payment_id, COUNT(*) AS line_count,
              GROUP_CONCAT(id ORDER BY id) AS line_ids,
              GROUP_CONCAT(gateway_settlement_id ORDER BY id) AS settlement_ids
       FROM gateway_settlement_transactions
       WHERE active_payment_transaction_id IS NOT NULL
       GROUP BY active_payment_transaction_id
       HAVING COUNT(*) > 1
       ORDER BY line_count DESC
       LIMIT ${limit}`,
      // limit is an already-validated safe integer (Math.max/Math.floor); MySQL rejects a
        // parameterised LIMIT in a prepared statement, so it is inlined.
    );
    check.itemsChecked = (rows as any[]).length;
    for (const r of rows as any[]) {
      check.issuesFound++;
      if (check.issues.length < MAX_ISSUES_PER_CHECK) {
        check.issues.push({
          severity: 'CRITICAL',
          entityType: 'payment_transaction',
          entityId: Number(r.payment_id),
          detail: `Payment ${r.payment_id} is an ACTIVE line of ${r.line_count} settlements (lines ${r.line_ids} in batches ${r.settlement_ids})`,
          recommendation: 'CRITICAL duplication. Keep exactly one line active and release the others; then re-run this reconciliation.',
        });
      }
    }
    return check;
  }
}

export const gatewaySettlementReconciliationService = new GatewaySettlementReconciliationService();

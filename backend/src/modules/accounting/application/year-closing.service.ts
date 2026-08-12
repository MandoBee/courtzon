import type mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import { accountingEngineService } from '../../financial/application/accounting-engine.service.js';
import { ledgerRepository } from '../../financial/infrastructure/repositories/ledger.repository.js';
import { glProjectionService } from '../../financial/application/gl-projection.service.js';
import { coaValidator } from '../../financial/application/coa-validator.service.js';
import { calculateFiscalYearNetIncome, type FiscalYearBalance } from './year-close.netincome.js';
import { createLedgerLines, validateLedgerBalance, type LedgerLineInput, type EntrySide } from '../../financial/domain/ledger-aggregate.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('year-closing');
type RowData = RowDataPacket[];

export class YearClosingService {
  private pool = getPool();

  async previewClose(fiscalYear: number, organisationId: number | null): Promise<any> {
    const netIncome = await calculateFiscalYearNetIncome(fiscalYear, organisationId);
    const periods = await this.validatePeriods(fiscalYear, organisationId, false);
    const reMapping = await accountingEngineService.resolveMapping('year_close', organisationId);
    const reAccountId = reMapping[0]?.accountId;
    await coaValidator.validatePostable(reAccountId, 'Year Close Preview');

    const reAcct = await this.getAccount(reAccountId);
    return {
      fiscalYear,
      organisationId,
      netIncome: netIncome.netIncome,
      totalRevenue: netIncome.totalRevenue,
      totalExpense: netIncome.totalExpense,
      affectedAccounts: netIncome.accounts.length,
      accountBreakdown: netIncome.accounts,
      retainedEarningsAccount: { id: reAccountId, code: reAcct?.code, name: reAcct?.name },
      periodsStatus: periods,
      estimatedClosingLines: netIncome.accounts.length + 1,
    };
  }

  async closeYear(fiscalYear: number, organisationId: number | null, userId: number): Promise<any> {
    await this.validatePeriods(fiscalYear, organisationId, true);
    const ni = await calculateFiscalYearNetIncome(fiscalYear, organisationId);
    const reMapping = await accountingEngineService.resolveMapping('year_close', organisationId);
    const reAccountId = reMapping[0]?.accountId;
    await coaValidator.validatePostable(reAccountId, 'Year Close');
    const periodId = await this.resolvePeriod12(fiscalYear, organisationId);

    // Build closing lines with cycle ID (placeholder, set after cycle creation)
    const closingLines: LedgerLineInput[] = [];
    let drTotal = 0, crTotal = 0;

    const makeLine = (acctId: number, side: EntrySide, amount: number, desc: string): LedgerLineInput => ({
      transactionId: '', sourceType: 'year_close', sourceId: 0,
      eventType: 'year_close', organisationId, chartAccountId: acctId,
      side, amount, currency: 'EGP', description: desc, periodId,
      referenceId: String(acctId),
    } as LedgerLineInput);

    for (const acct of ni.accounts) {
      await coaValidator.validatePostable(acct.accountId, 'Year Close');
      const absBalance = Math.abs(acct.balance);

      if (acct.type === 'revenue') {
        closingLines.push(makeLine(acct.accountId, 'debit', absBalance, `Close ${acct.code} ${acct.name}`));
        drTotal += absBalance;
      } else if (acct.type === 'contra_revenue') {
        closingLines.push(makeLine(acct.accountId, 'credit', absBalance, `Close ${acct.code} ${acct.name}`));
        crTotal += absBalance;
      } else if (acct.type === 'expense') {
        closingLines.push(makeLine(acct.accountId, 'credit', absBalance, `Close ${acct.code} ${acct.name}`));
        crTotal += absBalance;
      } else if (acct.type === 'contra_expense') {
        closingLines.push(makeLine(acct.accountId, 'debit', absBalance, `Close ${acct.code} ${acct.name}`));
        drTotal += absBalance;
      }
    }

    // Retained Earnings balancing line
    const diff = drTotal - crTotal;
    if (Math.abs(diff) > 0.001) {
      const reSide: 'debit' | 'credit' = diff > 0 ? 'credit' : 'debit';
      closingLines.push(makeLine(reAccountId, reSide, Math.abs(diff), 'Net income → Retained Earnings'));
    }

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      // Create year_closings
      const [ycResult] = await conn.execute(
        `INSERT INTO year_closings (organisation_id, fiscal_year, net_income, retained_earnings_account_id, status, created_by)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
        [organisationId, fiscalYear, ni.netIncome, reAccountId, userId],
      );
      const ycId = (ycResult as any).insertId;

      // Create close cycle
      const [cycResult] = await conn.execute(
        `INSERT INTO year_close_cycles (year_closings_id, cycle_number, net_income, entry_count, status)
         VALUES (?, 1, ?, ?, 'pending')`,
        [ycId, ni.netIncome, closingLines.length],
      );
      const cycleId = (cycResult as any).insertId;

      // Update sourceId on all lines to the cycle ID
      for (const line of closingLines) {
        line.sourceId = cycleId;
        line.transactionId = `year_close_${cycleId}_${line.chartAccountId}_${Date.now()}`;
      }

      // Post closing entries if any
      let leIds: number[] = [];
      if (closingLines.length > 0) {
        const entries = createLedgerLines(closingLines);
        if (!validateLedgerBalance(entries)) throw new Error('Closing entries not balanced');
        leIds = await ledgerRepository.createEntries(entries, conn);

        const projectable = entries.map((e, i) => ({
          sourceType: 'year_close', sourceId: cycleId, eventType: 'year_close',
          organisationId: e.organisationId ?? null,
          chartAccountId: e.chartAccountId ?? null,
          side: e.side, amount: e.amount,
          description: e.description, recordedAt: e.recordedAt,
          ledgerEntryId: leIds[i],
        }));
        await glProjectionService.projectEntries(projectable, periodId, conn);
      }

      // Lock all 12 periods
      await conn.execute(
        `UPDATE accounting_periods SET status = 'locked' WHERE fiscal_year = ? AND (organisation_id = ? OR (? IS NULL AND organisation_id IS NULL))`,
        [fiscalYear, organisationId, organisationId],
      );

      // Mark completed
      await conn.execute(
        `UPDATE year_closings SET status = 'completed' WHERE id = ?`, [ycId],
      );
      await conn.execute(
        `UPDATE year_close_cycles SET status = 'completed', entry_count = ? WHERE id = ?`,
        [leIds.length, cycleId],
      );

      await conn.commit();

      recordAudit({
        actorId: userId, action: 'ACCOUNTING.YEAR_CLOSE',
        entityType: 'year_closings', entityId: ycId,
        afterState: { fiscalYear, organisationId, netIncome: ni.netIncome, entryCount: leIds.length },
      });

      return {
        yearClosingsId: ycId,
        cycleId,
        fiscalYear,
        netIncome: ni.netIncome,
        entryCount: leIds.length,
        periodsLocked: 12,
        status: 'completed',
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async reopenYear(fiscalYear: number, organisationId: number | null, userId: number, reason: string): Promise<any> {
    const [existing] = await this.pool.execute<RowData>(
      `SELECT * FROM year_closings WHERE fiscal_year = ? AND (organisation_id = ? OR (? IS NULL AND organisation_id IS NULL)) AND status = 'completed'`,
      [fiscalYear, organisationId, organisationId],
    );
    if (!existing.length) throw new Error('No completed year close found for this fiscal year');

    const yc = (existing as any[])[0];

    // Get the last completed close cycle
    const [cycles] = await this.pool.execute<RowData>(
      `SELECT * FROM year_close_cycles WHERE year_closings_id = ? AND status = 'completed' ORDER BY cycle_number DESC LIMIT 1`,
      [yc.id],
    );
    if (!cycles.length) throw new Error('No completed close cycle found');

    const lastCycle = (cycles as any[])[0];

    // Get original closing entries
    const [entries] = await this.pool.execute<RowData>(
      `SELECT le.* FROM ledger_entries le
       WHERE le.source_type = 'year_close' AND le.source_id = ? AND le.event_type = 'year_close'
       ORDER BY le.id`,
      [lastCycle.id],
    );

    if (!entries.length) throw new Error('No closing ledger entries found');

    // Build reversal lines
    const reversalLines: LedgerLineInput[] = [];
    const periodId = await this.resolvePeriod12(fiscalYear, organisationId);

    for (const e of entries as any[]) {
      const reverseSide = e.side === 'debit' ? 'credit' : 'debit' as EntrySide;
      reversalLines.push(this.makeLine(
        periodId, yc.organisation_id ?? null,
        e.chart_account_id, reverseSide,
        Number(e.amount),
        `REVERSAL: ${e.description}`,
      ));
    }

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      // Open period 12
      await conn.execute(
        `UPDATE accounting_periods SET status = 'open', closed_at = NULL, closed_by = NULL WHERE fiscal_year = ? AND period_number = 12 AND (organisation_id = ? OR (? IS NULL AND organisation_id IS NULL))`,
        [fiscalYear, organisationId, organisationId],
      );

      // Create reversal cycle
      const nextCycle = Number(lastCycle.cycle_number) + 1;
      const [cycResult] = await conn.execute(
        `INSERT INTO year_close_cycles (year_closings_id, cycle_number, net_income, entry_count, status)
         VALUES (?, ?, 0, ?, 'pending')`,
        [yc.id, nextCycle, reversalLines.length],
      );
      const cycleId = (cycResult as any).insertId;

      // Post reversal entries
      const revEntries = createLedgerLines(reversalLines);
      const leIds = await ledgerRepository.createEntries(revEntries, conn);

      const recordedAt = revEntries[0]?.recordedAt || new Date().toISOString().slice(0, 19).replace('T', ' ');
      const projectable = revEntries.map((re, i) => ({
        sourceType: 'year_close_reopen', sourceId: cycleId, eventType: 'year_close_reopen',
        organisationId: re.organisationId ?? null,
        chartAccountId: re.chartAccountId ?? null,
        side: re.side, amount: re.amount,
        description: re.description, recordedAt: re.recordedAt,
        ledgerEntryId: leIds[i],
      }));
      await glProjectionService.projectEntries(projectable, periodId, conn);

      // Mark last cycle reversed
      await conn.execute(
        `UPDATE year_close_cycles SET status = 'reversed' WHERE id = ?`, [lastCycle.id],
      );
      await conn.execute(
        `UPDATE year_close_cycles SET status = 'completed', entry_count = ? WHERE id = ?`,
        [leIds.length, cycleId],
      );

      // Mark year_closings reopened
      await conn.execute(
        `UPDATE year_closings SET status = 'reopened', reopened_at = NOW(), reopened_by = ?, reopen_reason = ?, reversal_entry_count = ? WHERE id = ?`,
        [userId, reason, leIds.length, yc.id],
      );

      await conn.commit();

      recordAudit({
        actorId: userId, action: 'ACCOUNTING.YEAR_CLOSE.REOPEN',
        entityType: 'year_closings', entityId: yc.id,
        afterState: { fiscalYear, organisationId, reason, reversalEntryCount: leIds.length },
      });

      return { yearClosingsId: yc.id, cycleId, reversalEntryCount: leIds.length, status: 'reopened' };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getHistory(organisationId: number | null): Promise<any[]> {
    const where = organisationId != null ? 'yc.organisation_id = ?' : 'yc.organisation_id IS NULL';
    const params: any[] = organisationId != null ? [organisationId] : [];
    const [rows] = await this.pool.execute<RowData>(
      `SELECT yc.*, (SELECT COUNT(*) FROM year_close_cycles WHERE year_closings_id = yc.id) AS cycle_count
       FROM year_closings yc WHERE ${where} ORDER BY yc.fiscal_year DESC`,
      params,
    );
    return rows;
  }

  private async validatePeriods(fiscalYear: number, organisationId: number | null, requireOpen12: boolean): Promise<string> {
    const orgWhere = organisationId != null ? 'organisation_id = ?' : 'organisation_id IS NULL';
    const params: any[] = [fiscalYear];
    if (organisationId != null) params.push(organisationId);

    const [periods] = await this.pool.execute<RowData>(
      `SELECT period_number, status FROM accounting_periods WHERE fiscal_year = ? AND ${orgWhere} ORDER BY period_number`,
      params,
    );

    if ((periods as any[]).length !== 12) throw new Error(`Fiscal year ${fiscalYear} has ${(periods as any[]).length} periods (expected 12)`);

    for (const p of periods as any[]) {
      if (p.period_number <= 11 && p.status !== 'closed' && p.status !== 'locked') {
        throw new Error(`Period ${p.period_number} must be closed (current: ${p.status})`);
      }
      if (p.period_number === 12 && requireOpen12 && p.status !== 'open') {
        throw new Error(`Period 12 must be open for year close (current: ${p.status})`);
      }
    }

    return (periods as any[]).map((p: any) => `P${p.period_number}:${p.status}`).join(', ');
  }

  private async resolvePeriod12(fiscalYear: number, organisationId: number | null): Promise<number> {
    const orgWhere = organisationId != null ? 'organisation_id = ?' : 'organisation_id IS NULL';
    const params: any[] = [fiscalYear];
    if (organisationId != null) params.push(organisationId);

    const [periods] = await this.pool.execute<RowData>(
      `SELECT id FROM accounting_periods WHERE fiscal_year = ? AND period_number = 12 AND ${orgWhere}`,
      params,
    );
    if (!periods.length) throw new Error(`Period 12 not found for fiscal year ${fiscalYear}`);
    return (periods as any[])[0].id;
  }

  private async getAccount(accountId: number): Promise<any> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT id, code, name, type, normal_side FROM chart_of_accounts WHERE id = ? LIMIT 1`,
      [accountId],
    );
    return rows.length ? (rows as any[])[0] : null;
  }

  private makeLine(periodId: number, orgId: number | null, accountId: number, side: EntrySide, amount: number, description: string): LedgerLineInput {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    return {
      transactionId: `year_close_${periodId}_${accountId}_${Date.now()}`,
      sourceType: 'year_close',
      sourceId: 0, // filled by createLedgerLines
      eventType: 'year_close',
      organisationId: orgId,
      chartAccountId: accountId,
      side,
      amount,
      currency: 'EGP',
      description,
      periodId,
      referenceId: String(accountId),
      recordedAt: now,
    } as any;
  }
}

export const yearClosingService = new YearClosingService();

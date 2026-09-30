import { getPool } from '../../../database/mysql.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { tournamentRepository } from '../../tournaments/infrastructure/repositories/tournament.repository.js';

/**
 * G11-Tournament Phase 4 — LEDGER-AUTHORITATIVE Tournament Finances / P&L.
 *
 * The posting ledger (`ledger_entries` + `chart_of_accounts`) is the financial
 * source of truth. The P&L is derived from the ACTUAL posted accounting entries
 * for the tournament — never recomputed from `payment_transactions`,
 * `entry_fee × registrations`, sponsor rows, or prize configuration alone.
 *
 * Recognized classification (each is a real posted event type / account):
 *   Revenue (org book, org-scoped 4140 Tournament / Event Revenue):
 *     tournament_org_registration_receivable   → Cr 4140 (CARD gross)
 *     tournament_org_cash_payment              → Cr 4140 (CASH gross)
 *     tournament_org_receivable_reversal       → Dr 4140 (CARD refund)
 *     tournament_org_cash_payment_reversal     → Dr 4140 (CASH refund)
 *   Prize expense (recognized only when actually posted):
 *     tournament_org_prize_award_book          → Dr 4140 (CARD prize)
 *     tournament_org_cash_prize_award_book     → Dr 4140 (CASH prize)
 *     tournament_org_prize_refund_book         → Cr 4140 (CARD clawback restores)
 *     tournament_org_cash_prize_refund_book    → Cr 4140 (CASH clawback restores)
 *   Commission expense (org book, posted MKT-COMM-EXP):
 *     tournament_org_registration_receivable   → Dr MKT-COMM-EXP
 *     tournament_org_cash_payment              → Dr MKT-COMM-EXP
 *     tournament_org_receivable_reversal       → Cr MKT-COMM-EXP (refund reduces)
 *     tournament_org_cash_payment_reversal     → Cr MKT-COMM-EXP (refund reduces)
 *   Platform (CourtZon book, org NULL) commission revenue:
 *     tournament_registration_card_payment     → Cr 4192
 *     tournament_cash_commission_receivable    → Cr 4192
 *     tournament_registration_card_refund      → Dr 4192 (refund reverses)
 *     tournament_registration_card_refund_settled → Dr 4192
 *     tournament_cash_commission_refund        → Dr 4192
 *   Platform liabilities (CourtZon book, org NULL) — NET movements:
 *     2202 Merchant Payable, 2100 Wallet (prize) Liability.
 *
 * DOUBLE-COUNTING RULE: only the posted ledger is counted, exactly once.
 * Refunds/reversals are separate events that reverse their original economic
 * effect — the exact inverse legs are subtracted, never double-counted.
 * IN-KIND sponsors/prizes are NOT recognized (no supported monetary ledger).
 * Courts/equipment have no financial representation → excluded.
 *
 * STRICTLY pure SELECTs — nothing is created/updated/deleted.
 */

const round2 = (n: number) => Math.round((Number(n ?? 0) + Number.EPSILON) * 100) / 100;

// ── Ledger classification sets (event_type → P&L role) ──────────────────────
const ORG_REVENUE_CREDIT_EVENTS = new Set(['tournament_org_registration_receivable', 'tournament_org_cash_payment']);
const ORG_REVENUE_REFUND_EVENTS = new Set(['tournament_org_receivable_reversal', 'tournament_org_cash_payment_reversal']);
const ORG_PRIZE_EXPENSE_EVENTS = new Set(['tournament_org_prize_award_book', 'tournament_org_cash_prize_award_book']);
const ORG_PRIZE_REFUND_EVENTS = new Set(['tournament_org_prize_refund_book', 'tournament_org_cash_prize_refund_book']);
const ORG_COMMISSION_DEBIT_EVENTS = new Set(['tournament_org_registration_receivable', 'tournament_org_cash_payment']);
const ORG_COMMISSION_REFUND_EVENTS = new Set(['tournament_org_receivable_reversal', 'tournament_org_cash_payment_reversal']);
const CZ_COMMISSION_CREDIT_EVENTS = new Set(['tournament_registration_card_payment', 'tournament_cash_commission_receivable']);
const CZ_COMMISSION_REFUND_EVENTS = new Set([
  'tournament_registration_card_refund',
  'tournament_registration_card_refund_settled',
  'tournament_cash_commission_refund',
]);

const ACCOUNT_TOURNAMENT_REVENUE = '4140';
const ACCOUNT_COMMISSION_EXPENSE = 'MKT-COMM-EXP';
const ACCOUNT_COMMISSION_REVENUE = '4192';
const ACCOUNT_MERCHANT_PAYABLE = '2202';
const ACCOUNT_PRIZE_LIABILITY = '2100';

export interface TournamentLedgerBucket {
  /** Organisation recognized revenue (4140) net of refunds — posted ledger only. */
  registrationRevenue: number;
  /** Posted prize expense (Dr 4140 on prize award books, net of clawbacks). */
  prizeExpense: number;
  /** Posted org commission expense (MKT-COMM-EXP) net of refunds. */
  commissionExpense: number;
  /** Recognized sponsor revenue from the ledger — 0 (sponsors never post). */
  sponsorCash: number;
  revenue: number;
  expenses: number;
  net: number;
}

export interface TournamentFinancialReport {
  tournamentId: number;
  organisationId: number | null;
  currency: string;
  revenue: { registration: number; sponsorCash: number; total: number };
  expenses: { cashPrizes: number; commissionExpense: number; total: number };
  net: number;
  /** CourtZon (platform) book, org NULL — recognized 4192 + net liabilities. */
  platform: {
    commissionRevenue: number;
    merchantPayable: number;
    prizeLiability: number;
  };
  counts: {
    paidRegistrations: number;
    cashSponsors: number;
    inKindSponsors: number;
    cashPrizes: number;
    inKindPrizes: number;
  };
  ledger: { postings: number; authoritative: true };
  excluded: { courtRental: boolean; ballsEquipment: boolean; otherExpenses: boolean };
}

export interface OrganisationTournamentFinanceAggregate {
  organisationId: number;
  totalTournaments: number;
  /** Independent P&L buckets per currency — never mixed numerically. */
  currencies: Record<string, TournamentLedgerBucket & { tournaments: number; postings: number }>;
}

export const tournamentFinancesService = {
  /** Org-scoped: enforces tenant ownership + excludes org-less/platform tournaments. */
  async forOrganisation(orgId: number, tournamentId: number): Promise<TournamentFinancialReport> {
    const t = await tournamentRepository.findById(tournamentId);
    if (!t) throw new NotFoundError('Tournament');
    if (t.organisation_id == null || t.organisation_id !== orgId) {
      throw new NotFoundError('Tournament');
    }
    return this.compute(t);
  },

  /** Admin variant (financial.reconcile) — no tenant enforcement at the service. */
  async forTournament(tournamentId: number): Promise<TournamentFinancialReport> {
    const t = await tournamentRepository.findById(tournamentId);
    if (!t) throw new NotFoundError('Tournament');
    return this.compute(t);
  },

  /** Org-level aggregate: each currency is an independent P&L bucket. */
  async aggregateForOrganisation(
    orgId: number,
  ): Promise<OrganisationTournamentFinanceAggregate> {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      `SELECT id, currency_code FROM tournaments
       WHERE organisation_id = ? AND deleted_at IS NULL AND status NOT IN ('cancelled','archived')
       ORDER BY id`,
      [orgId],
    );
    const currencies: Record<string, TournamentLedgerBucket & { tournaments: number; postings: number }> = {};
    for (const row of rows as any[]) {
      const report = await this.compute({ id: Number(row.id), currency_code: row.currency_code ?? 'EGP', organisation_id: orgId } as any);
      const code = report.currency;
      const b = (currencies[code] ??= {
        registrationRevenue: 0, prizeExpense: 0, commissionExpense: 0, sponsorCash: 0,
        revenue: 0, expenses: 0, net: 0, tournaments: 0, postings: 0,
      });
      b.registrationRevenue = round2(b.registrationRevenue + report.revenue.registration);
      b.prizeExpense = round2(b.prizeExpense + report.expenses.cashPrizes);
      b.commissionExpense = round2(b.commissionExpense + report.expenses.commissionExpense);
      b.revenue = round2(b.revenue + report.revenue.total);
      b.expenses = round2(b.expenses + report.expenses.total);
      b.net = round2(b.net + report.net);
      b.tournaments += 1;
      b.postings += report.ledger.postings;
    }
    return { organisationId: orgId, totalTournaments: (rows as any[]).length, currencies };
  },

  async compute(t: any): Promise<TournamentFinancialReport> {
    const pool = getPool();
    const tournamentId = Number(t.id);
    const orgId = t.organisation_id != null ? Number(t.organisation_id) : null;
    const currency = String(t.currency_code ?? 'EGP');

    // ── Collect the tournament's ledger source ids (payments + prize awards) ──
    const [payRows] = await pool.execute<any[]>(
      `SELECT pt.id FROM payment_transactions pt
       JOIN tournament_registrations r ON r.id = pt.reference_id
       WHERE pt.reference_type = 'tournament' AND r.tournament_id = ?`, [tournamentId],
    );
    const paymentIds = (payRows as any[]).map((r) => Number(r.id));
    const [awardRows] = await pool.execute<any[]>(
      `SELECT id FROM tournament_prize_awards WHERE tournament_id = ?`, [tournamentId],
    );
    const awardIds = (awardRows as any[]).map((r) => Number(r.id));
    const sourceIds = [...paymentIds, ...awardIds];

    // ── Read ALL posted tournament ledger entries for this tournament ──
    let entries: any[] = [];
    if (sourceIds.length > 0) {
      const inIds = sourceIds.map(() => '?').join(',');
      const [le] = await pool.execute<any[]>(
        `SELECT le.event_type, le.side, le.amount, le.organisation_id, c.code AS account_code
         FROM ledger_entries le
         JOIN chart_of_accounts c ON c.id = le.chart_account_id
         WHERE le.source_type = 'tournament' AND le.source_id IN (${inIds})`,
        sourceIds,
      );
      entries = le as any[];
    }

    // ── Classification (posted ledger only) ──
    let orgRegRevenue = 0;      // Cr 4140 org registration/cash events
    let orgRegRefunds = 0;      // Dr 4140 org reversal events
    let orgPrizeExpense = 0;    // Dr 4140 org prize award books
    let orgPrizeRefunds = 0;    // Cr 4140 org prize refund books
    let orgCommissionExpense = 0; // Dr MKT-COMM-EXP
    let orgCommissionRefunds = 0; // Cr MKT-COMM-EXP
    let czCommissionRevenue = 0;  // Cr 4192
    let czCommissionRefunds = 0;  // Dr 4192
    let cz2202Net = 0;            // Cr 2202 − Dr 2202 (CourtZon book)
    let cz2100Net = 0;            // Cr 2100 − Dr 2100 (CourtZon book)
    let orgPostings = 0;

    for (const e of entries) {
      const side = e.side;
      const amount = Number(e.amount ?? 0);
      const code = String(e.account_code ?? '');
      const isOrgBook = Number(e.organisation_id) === orgId;
      const isCourtZonBook = e.organisation_id == null;

      if (side === 'credit') {
        if (isOrgBook && ORG_REVENUE_CREDIT_EVENTS.has(e.event_type) && code === ACCOUNT_TOURNAMENT_REVENUE) orgRegRevenue += amount;
        if (isOrgBook && ORG_PRIZE_REFUND_EVENTS.has(e.event_type) && code === ACCOUNT_TOURNAMENT_REVENUE) orgPrizeRefunds += amount;
        if (isOrgBook && ORG_COMMISSION_REFUND_EVENTS.has(e.event_type) && code === ACCOUNT_COMMISSION_EXPENSE) orgCommissionRefunds += amount;
        if (isCourtZonBook && CZ_COMMISSION_CREDIT_EVENTS.has(e.event_type) && code === ACCOUNT_COMMISSION_REVENUE) czCommissionRevenue += amount;
        if (isCourtZonBook && code === ACCOUNT_MERCHANT_PAYABLE) cz2202Net += amount;
        if (isCourtZonBook && code === ACCOUNT_PRIZE_LIABILITY) cz2100Net += amount;
      } else if (side === 'debit') {
        if (isOrgBook && ORG_REVENUE_REFUND_EVENTS.has(e.event_type) && code === ACCOUNT_TOURNAMENT_REVENUE) orgRegRefunds += amount;
        if (isOrgBook && ORG_PRIZE_EXPENSE_EVENTS.has(e.event_type) && code === ACCOUNT_TOURNAMENT_REVENUE) orgPrizeExpense += amount;
        if (isOrgBook && ORG_COMMISSION_DEBIT_EVENTS.has(e.event_type) && code === ACCOUNT_COMMISSION_EXPENSE) orgCommissionExpense += amount;
        if (isCourtZonBook && CZ_COMMISSION_REFUND_EVENTS.has(e.event_type) && code === ACCOUNT_COMMISSION_REVENUE) czCommissionRefunds += amount;
        if (isCourtZonBook && code === ACCOUNT_MERCHANT_PAYABLE) cz2202Net -= amount;
        if (isCourtZonBook && code === ACCOUNT_PRIZE_LIABILITY) cz2100Net -= amount;
      }
      if (e.event_type) orgPostings += 1;
    }

    const registrationRevenue = round2(orgRegRevenue - orgRegRefunds);
    const prizeExpense = round2(orgPrizeExpense - orgPrizeRefunds);
    const commissionExpense = round2(orgCommissionExpense - orgCommissionRefunds);
    // Sponsors have no supported monetary ledger → recognized as 0 and excluded
    // from revenue. The config count is still reported for information only.
    const sponsorCash = 0;
    const revenue = round2(registrationRevenue);
    const expenses = round2(prizeExpense + commissionExpense);
    const net = round2(revenue - expenses);
    const platformCommissionRevenue = round2(czCommissionRevenue - czCommissionRefunds);

    // ── Informational counts (never monetary) ──
    const num = async (sql: string, params: any[] = []) => {
      const [rows] = await pool.execute<any[]>(sql, params);
      return round2(Number((rows as any[])[0]?.v ?? 0));
    };
    const paidRegistrations = await num(
      `SELECT COUNT(*) AS v FROM payment_transactions pt
       JOIN tournament_registrations r ON r.id = pt.reference_id
       WHERE pt.reference_type = 'tournament' AND r.tournament_id = ? AND pt.payment_status = 'paid'`,
      [tournamentId],
    );
    const sponsorRow = await (async () => {
      const [rows] = await pool.execute<any[]>(
        `SELECT
           SUM(support_type='cash') AS cashCount,
           SUM(support_type='inkind') AS inkindCount
         FROM tournament_sponsors WHERE tournament_id = ?`, [tournamentId],
      );
      const r = (rows as any[])[0] ?? {};
      return { cashSponsors: Number(r.cashCount ?? 0), inKindSponsors: Number(r.inkindCount ?? 0) };
    })();
    const creditedPrizes = await num(
      `SELECT COUNT(*) AS v FROM tournament_prize_awards WHERE tournament_id = ? AND status = 'credited'`, [tournamentId],
    );
    const inKindPrizes = await num(
      `SELECT COUNT(*) AS v FROM tournament_prizes WHERE tournament_id = ? AND prize_type <> 'cash'`, [tournamentId],
    );

    return {
      tournamentId,
      organisationId: orgId,
      currency,
      revenue: { registration: registrationRevenue, sponsorCash, total: revenue },
      expenses: { cashPrizes: prizeExpense, commissionExpense, total: expenses },
      net,
      platform: {
        commissionRevenue: platformCommissionRevenue,
        merchantPayable: round2(cz2202Net),
        prizeLiability: round2(cz2100Net),
      },
      counts: {
        paidRegistrations: Number(paidRegistrations),
        cashSponsors: sponsorRow.cashSponsors,
        inKindSponsors: sponsorRow.inKindSponsors,
        cashPrizes: Number(creditedPrizes),
        inKindPrizes: Number(inKindPrizes),
      },
      ledger: { postings: orgPostings, authoritative: true },
      excluded: { courtRental: true, ballsEquipment: true, otherExpenses: true },
    };
  },
};

export default tournamentFinancesService;
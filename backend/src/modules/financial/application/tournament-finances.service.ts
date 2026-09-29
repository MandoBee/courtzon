import { getPool } from '../../../database/mysql.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { tournamentRepository } from '../../tournaments/infrastructure/repositories/tournament.repository.js';

/**
 * G11-Tournament Phase 2 — READ-ONLY Tournament Finances / P&L.
 *
 * Authoritative, non-double-counting sources (never recomputes accounting
 * values):
 *   revenue.registration = Σ payment_transactions.amount (paid) joined to the
 *     tournament's registrations (reference_type='tournament',
 *     reference_id = registration id) — ONE financial source.
 *   revenue.sponsorCash = Σ tournament_sponsors.amount (support_type='cash').
 *   expense.cashPrizes  = Σ tournament_prize_awards.amount (status='credited').
 *   IN-KIND sponsors/prizes contribute 0 monetary value.
 *   net = revenue − expense.
 *
 * EXCLUDED (no financial representation exists — never invented):
 *   court rental (tournament bookings are non-financial reservations), balls,
 *   equipment, other expenses.
 *
 * STRICTLY pure SELECTs — nothing is created/updated/deleted.
 * Org-scoped: `forOrganisation` requires the tournament to belong to the org
 * (and be org-owned, never an org-less platform tournament).
 */
const round2 = (n: number) => Math.round((Number(n ?? 0) + Number.EPSILON) * 100) / 100;

export interface TournamentFinancialReport {
  tournamentId: number;
  organisationId: number | null;
  currency: string;
  revenue: { registration: number; sponsorCash: number; total: number };
  expenses: { cashPrizes: number; total: number };
  net: number;
  counts: {
    paidRegistrations: number;
    cashSponsors: number;
    inKindSponsors: number;
    cashPrizes: number;
    inKindPrizes: number;
  };
  excluded: { courtRental: boolean; ballsEquipment: boolean; otherExpenses: boolean };
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

  async compute(t: any): Promise<TournamentFinancialReport> {
    const pool = getPool();
    const num = async (sql: string, params: any[] = []) => {
      const [rows] = await pool.execute<any[]>(sql, params);
      return round2(Number((rows as any[])[0]?.v ?? 0));
    };
    const one = async (sql: string, params: any[] = []) => {
      const [rows] = await pool.execute<any[]>(sql, params);
      return (rows as any[])[0];
    };

    // Registration revenue — ONE source (paid payment_transactions per registration).
    const regRevRow = await one(
      `SELECT COALESCE(SUM(pt.amount),0) AS v, COUNT(*) AS c
       FROM payment_transactions pt
       JOIN tournament_registrations r ON r.id = pt.reference_id
       WHERE pt.reference_type = 'tournament'
         AND r.tournament_id = ?
         AND pt.payment_status = 'paid'`,
      [t.id],
    );
    const registrationRevenue = round2(Number((regRevRow as any)?.v ?? 0));
    const paidRegistrations = Number((regRevRow as any)?.c ?? 0);

    // Sponsor cash + counts.
    const sponsorRow = await one(
      `SELECT
         COALESCE(SUM(CASE WHEN support_type='cash' THEN amount ELSE 0 END),0) AS cash,
         SUM(support_type='cash') AS cashCount,
         SUM(support_type='inkind') AS inkindCount
       FROM tournament_sponsors WHERE tournament_id = ?`, [t.id],
    );
    const sponsorCash = round2(Number((sponsorRow as any)?.cash ?? 0));

    // Cash prize expense — authoritative award amounts (credited only).
    const prizeRow = await one(
      `SELECT COALESCE(SUM(amount),0) AS v, COUNT(*) AS c
       FROM tournament_prize_awards WHERE tournament_id = ? AND status = 'credited'`, [t.id],
    );
    const cashPrizeExpense = round2(Number((prizeRow as any)?.v ?? 0));
    const inKindPrizeCount = await num(
      `SELECT COUNT(*) AS v FROM tournament_prizes WHERE tournament_id = ? AND prize_type <> 'cash'`, [t.id],
    );

    const revenue = round2(registrationRevenue + sponsorCash);
    const expenses = round2(cashPrizeExpense);

    return {
      tournamentId: t.id,
      organisationId: t.organisation_id ?? null,
      currency: t.currency_code ?? 'EGP',
      revenue: {
        registration: registrationRevenue,
        sponsorCash,
        total: revenue,
      },
      expenses: {
        cashPrizes: cashPrizeExpense,
        total: expenses,
      },
      net: round2(revenue - expenses),
      counts: {
        paidRegistrations,
        cashSponsors: Number((sponsorRow as any)?.cashCount ?? 0),
        inKindSponsors: Number((sponsorRow as any)?.inkindCount ?? 0),
        cashPrizes: Number((prizeRow as any)?.c ?? 0),
        inKindPrizes: inKindPrizeCount,
      },
      excluded: { courtRental: true, ballsEquipment: true, otherExpenses: true },
    };
  },
};

export default tournamentFinancesService;
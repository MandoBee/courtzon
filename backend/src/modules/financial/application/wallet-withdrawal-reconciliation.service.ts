import { walletWithdrawalReconciliationRepository as repo } from '../infrastructure/repositories/wallet-withdrawal-reconciliation.repository.js';

/**
 * Wallet Withdrawal Reconciliation — READ-ONLY (G11.6).
 *
 * Reconciles the six independent wallet/withdrawal records:
 *   • withdrawal_requests
 *   • user_wallets.balance
 *   • user_wallets.reserved_balance
 *   • wallet_transactions ('withdrawal' debit rows)
 *   • GL 2100 Wallet Liability
 *   • GL 1130 Withdrawal Clearing
 *   • GL 1120 CourtZon Cash/Bank
 *
 * Invariants (locked accounting topology, CourtZon book org=NULL):
 *   C1 — active reservation parity:     Σ user_wallets.reserved_balance
 *                                            == Σ active request amounts
 *                                       (pending/under_review/approved/processing).
 *   C2 — debit-history parity:          Σ wallet_transactions 'withdrawal' debits
 *                                            == Σ completed request amounts.
 *   C3 — liability parity:              Σ (balance + reserved_balance)
 *                                            == GL 2100 signed liability balance.
 *   C4 — clearing parity:               Σ active request amounts
 *                                            == GL 1130 debit-side balance.
 *   C5 — cash parity:                   Σ completed request amounts
 *                                            == GL 1120 debit-side balance.
 *
 * STRICTLY pure reads via the reconciliation repository — this service must
 * never mutate either source. Every discrepancy is reported; nothing is
 * auto-adjusted (mirrors reconciliation.service.js conventions).
 */
const round2 = (n: number) => Math.round((Number(n ?? 0) + Number.EPSILON) * 100) / 100;

export interface ReconciliationCheck {
  key: string;
  label: string;
  itemsChecked: number;
  expected: number;
  actual: number;
  difference: number;
  issue: boolean;
  detail: string;
}

export interface WalletWithdrawalReconciliationReport {
  runId: string;
  generatedAt: string;
  readOnly: true;
  autoFixAvailable: false;
  checks: ReconciliationCheck[];
  summary: { checksRun: number; issuesFound: number; clean: boolean };
}

export const walletWithdrawalReconciliationService = {
  async run(): Promise<WalletWithdrawalReconciliationReport> {
    const [wallet, requests, debitHistory, liabAcct, clearAcct, cashAcct] = await Promise.all([
      repo.walletTotals(),
      repo.requestTotals(),
      repo.debitHistoryTotal(),
      repo.accountIdByCode('2100'),
      repo.accountIdByCode('1130'),
      repo.accountIdByCode('1120'),
    ]);
    const [gl2100, gl1130, gl1120] = await Promise.all([
      repo.glSides(liabAcct),
      repo.glSides(clearAcct),
      repo.glSides(cashAcct),
    ]);

    const liabilityExpected = round2(wallet.balance + wallet.reserved);

    const mk = (
      key: string,
      label: string,
      expected: number,
      actual: number,
      detailTail: string,
    ): ReconciliationCheck => {
      const difference = round2(expected - actual);
      return {
        key,
        label,
        itemsChecked: 1,
        expected: round2(expected),
        actual: round2(actual),
        difference,
        issue: Math.abs(difference) > 0.004,
        detail: `${detailTail} — expected=${round2(expected)}, actual=${round2(actual)}`,
      };
    };

    const checks = [
      mk('c1_active_reservation_parity', 'Σ active request amounts == Σ wallet.reserved_balance', requests.activeReserved, wallet.reserved,
        `Σ(active)=${round2(requests.activeReserved)}, Σ(wallet.reserved_balance)=${round2(wallet.reserved)}`),
      mk('c2_debit_history_parity', 'Σ wallet_transactions withdrawal debits == Σ completed request amounts', requests.completed, debitHistory,
        `Σ(completed)=${round2(requests.completed)}, Σ(debit rows)=${round2(debitHistory)}`),
      mk('c3_liability_parity', 'Σ(balance+reserved) == GL 2100 Wallet Liability (net)', liabilityExpected, gl2100.net,
        `Σ(balance+reserved)=${round2(liabilityExpected)}, GL 2100 net=${round2(gl2100.net)}`),
      mk('c4_clearing_parity', 'Σ active requests == GL 1130 Withdrawal Clearing (debit side)', requests.activeReserved, gl1130.debit,
        `Σ(active)=${round2(requests.activeReserved)}, GL 1130 debit=${round2(gl1130.debit)}`),
      mk('c5_cash_parity', 'Σ completed requests == GL 1120 CourtZon Cash/Bank (debit side)', requests.completed, gl1120.debit,
        `Σ(completed)=${round2(requests.completed)}, GL 1120 debit=${round2(gl1120.debit)}`),
    ];

    const issuesFound = checks.filter((c) => c.issue).length;
    return {
      runId: `wdr-${Date.now().toString(36)}`,
      generatedAt: new Date().toISOString(),
      readOnly: true,
      autoFixAvailable: false,
      checks,
      summary: { checksRun: checks.length, issuesFound, clean: issuesFound === 0 },
    };
  },
};

export default walletWithdrawalReconciliationService;
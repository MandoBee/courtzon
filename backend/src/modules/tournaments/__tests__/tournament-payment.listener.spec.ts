import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  getRegistrationById: vi.fn(),
  updateRegistrationPaymentStatus: vi.fn(),
  getOrganisationId: vi.fn(),
  findById: vi.fn(),
}));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ on: vi.fn(), emit: vi.fn() }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: bus }));

import {
  registerTournamentPaymentListeners,
  resetTournamentPaymentListenersForTest,
} from '../application/tournament-payment.listener.js';

function captureHandlers() {
  const handlers: Record<string, (data: any) => Promise<void> | void> = {};
  for (const call of bus.on.mock.calls) {
    handlers[call[0] as string] = call[1];
  }
  return handlers;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetTournamentPaymentListenersForTest();
  repo.getRegistrationById.mockResolvedValue({ id: 7, tournament_id: 1, player_id: 42, user_id: 42, payment_status: 'unpaid' });
  repo.updateRegistrationPaymentStatus.mockResolvedValue(undefined);
  repo.getOrganisationId.mockResolvedValue(6);
  repo.findById.mockResolvedValue({ id: 1, branch_id: 5, creator_id: 2 });
});

describe('Group 3 — tournament payment listener (shared Payment consumption)', () => {
  it('marks a tournament registration paid on payment:succeeded (referenceType=tournament)', async () => {
    registerTournamentPaymentListeners();
    const handlers = captureHandlers();
    expect(handlers['payment:succeeded']).toBeDefined();

    await handlers['payment:succeeded']({
      paymentId: 9001,
      referenceType: 'tournament',
      referenceId: 7,
      amount: 250,
      metadata: { paymentMethod: 'card', userId: 42 },
    });

    expect(repo.updateRegistrationPaymentStatus).toHaveBeenCalledWith(7, 'paid');
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'tournament.registration.paid', entityId: 7 }));
    expect(bus.emit).toHaveBeenCalledWith('tournament:registration-paid', expect.objectContaining({ tournamentId: 1, registrationId: 7, userId: 42, organisationId: 6, paymentId: 9001 }));
  });

  it('ignores payment:succeeded for other reference types (booking/academy/order)', async () => {
    registerTournamentPaymentListeners();
    const handlers = captureHandlers();
    for (const ref of ['booking', 'academy', 'order']) {
      await handlers['payment:succeeded']({ paymentId: 1, referenceType: ref, referenceId: 7 });
    }
    expect(repo.updateRegistrationPaymentStatus).not.toHaveBeenCalled();
    expect(bus.emit).not.toHaveBeenCalledWith('tournament:registration-paid', expect.anything());
  });

  it('is idempotent — an already-paid registration is not re-marked or re-emitted', async () => {
    repo.getRegistrationById.mockResolvedValue({ id: 7, tournament_id: 1, player_id: 42, user_id: 42, payment_status: 'paid' });
    registerTournamentPaymentListeners();
    const handlers = captureHandlers();
    await handlers['payment:succeeded']({ paymentId: 9002, referenceType: 'tournament', referenceId: 7 });
    expect(repo.updateRegistrationPaymentStatus).not.toHaveBeenCalled();
    expect(bus.emit).not.toHaveBeenCalledWith('tournament:registration-paid', expect.anything());
  });
});
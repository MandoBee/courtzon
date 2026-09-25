import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = '3306';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = '';
  process.env.DB_NAME = 'courtzon_test';
});

const eligibilityServiceMock = vi.hoisted(() => ({
  assertCanRegister: vi.fn(),
}));
const tournamentRepo = vi.hoisted(() => ({
  findById: vi.fn(),
  findRegistrationsByTournament: vi.fn(),
  createRegistration: vi.fn(),
  update: vi.fn(),
  getRegistrationById: vi.fn(),
  findByCode: vi.fn(),
  replacePrizes: vi.fn(),
  findPrizesByTournament: vi.fn(),
  hasActiveRuleSet: vi.fn(),
}));
const drawRepo = vi.hoisted(() => ({
  createParticipant: vi.fn(),
  getNextWaitingOrderByTournament: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: tournamentRepo }));
vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: drawRepo }));
vi.mock('../application/tournament-eligibility.service.js', () => ({ tournamentEligibilityService: eligibilityServiceMock }));

import { getPool } from '../../../database/mysql.js';
import { tournamentService } from '../application/tournament.service.js';
import { AppError } from '../../../shared/errors/app-error.js';

function fakePool() {
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue([[]]),
    query: vi.fn().mockResolvedValue([[]]),
    release: vi.fn(),
  };
  const pool = { getConnection: vi.fn().mockResolvedValue(conn), execute: vi.fn().mockResolvedValue([[]]) };
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue(pool);
  return { pool, conn };
}

const baseTournament = {
  id: 1,
  start_date: '2026-06-01',
  status: 'registration_open',
  max_participants: 16,
  min_participants: 2,
  entry_fee: 0,
  currency_code: 'USD',
  registration_payment_methods: null,
  age_mode: null,
  age_category_ids: null,
  gender_categories: null,
  level_ids: null,
};

const okSnapshot = {
  eligible: true,
  bypassed: false,
  members: [{ userId: 42, tournamentYear: 2026, calculatedAge: 20, birthYear: 2006, matchedAgeCategoryIds: [], tournamentAgeMode: 'open', tournamentGenderCategories: [], playerGender: 'male', tournamentLevelIds: [], playerLevelId: 3, eligible: true, bypassed: false, evaluatedAt: 'x', reasons: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  fakePool();
  tournamentRepo.findById.mockResolvedValue({ ...baseTournament });
  tournamentRepo.findRegistrationsByTournament.mockResolvedValue([]);
  tournamentRepo.createRegistration.mockReset().mockResolvedValue(999);
  tournamentRepo.getRegistrationById.mockResolvedValue({ id: 999, tournament_id: 1, player_id: 42, user_id: 42, status: 'registered', payment_status: 'unpaid', registered_at: '2026-01-01' });
  drawRepo.createParticipant.mockReset().mockResolvedValue(77);
  drawRepo.getNextWaitingOrderByTournament.mockResolvedValue(2);
});

describe('G7-B individual registration flow (TournamentService.register)', () => {
  it('28. All dimensions pass → registration + participant + snapshot persisted atomically', async () => {
    eligibilityServiceMock.assertCanRegister.mockResolvedValue({ evaluation: { eligible: true, members: [] }, snapshot: okSnapshot });

    const reg = await tournamentService.register(1, 42);

    expect(eligibilityServiceMock.assertCanRegister).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      [42],
      expect.objectContaining({ allowBypass: false }),
    );
    expect(tournamentRepo.createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ tournament_id: 1, player_id: 42, eligibility_snapshot: okSnapshot }),
      expect.anything(),
    );
    expect(drawRepo.createParticipant).toHaveBeenCalled();
    expect(reg.id).toBe(999);
  });

  it('29. Ineligible (age) → structured 422; NO registration, NO participant, NO slot consumed', async () => {
    eligibilityServiceMock.assertCanRegister.mockRejectedValue(new AppError('Player is not eligible for this tournament', 422, 'AGE_NOT_ELIGIBLE', { details: {} }));

    await expect(tournamentService.register(1, 42)).rejects.toMatchObject({ statusCode: 422, errorCode: 'AGE_NOT_ELIGIBLE' });
    expect(tournamentRepo.createRegistration).not.toHaveBeenCalled();
    expect(drawRepo.createParticipant).not.toHaveBeenCalled();
  });

  it('37. No payment initiation for ineligible registration', async () => {
    eligibilityServiceMock.assertCanRegister.mockRejectedValue(new AppError('Player is not eligible for this tournament', 422, 'GENDER_NOT_ELIGIBLE', { details: {} }));

    await expect(tournamentService.register(1, 42, undefined, 'cash')).rejects.toMatchObject({ errorCode: 'GENDER_NOT_ELIGIBLE' });
    // payment method resolution + charge must never run
    expect(tournamentRepo.createRegistration).not.toHaveBeenCalled();
  });

  it('38. Ineligible player never enters the waitlist', async () => {
    tournamentRepo.findRegistrationsByTournament.mockResolvedValue([
      { id: 1, player_id: 1, status: 'confirmed' },
      { id: 2, player_id: 2, status: 'confirmed' },
      { id: 3, player_id: 3, status: 'confirmed' },
      { id: 4, player_id: 4, status: 'confirmed' },
      { id: 5, player_id: 5, status: 'confirmed' },
      { id: 6, player_id: 6, status: 'confirmed' },
      { id: 7, player_id: 7, status: 'confirmed' },
      { id: 8, player_id: 8, status: 'confirmed' },
      { id: 9, player_id: 9, status: 'confirmed' },
      { id: 10, player_id: 10, status: 'confirmed' },
      { id: 11, player_id: 11, status: 'confirmed' },
      { id: 12, player_id: 12, status: 'confirmed' },
      { id: 13, player_id: 13, status: 'confirmed' },
      { id: 14, player_id: 14, status: 'confirmed' },
      { id: 15, player_id: 15, status: 'confirmed' },
      { id: 16, player_id: 16, status: 'confirmed' },
    ]);
    tournamentRepo.findById.mockResolvedValue({ ...baseTournament, waitlist_enabled: 1 });
    eligibilityServiceMock.assertCanRegister.mockRejectedValue(new AppError('ineligible', 422, 'LEVEL_NOT_ELIGIBLE', { details: {} }));

    await expect(tournamentService.register(1, 42)).rejects.toMatchObject({ errorCode: 'LEVEL_NOT_ELIGIBLE' });
    expect(tournamentRepo.createRegistration).not.toHaveBeenCalled();
  });

  it('39. Eligible full tournament still follows FIFO waitlist (snapshot stored)', async () => {
    const full = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, player_id: i + 1, status: 'confirmed' }));
    tournamentRepo.findRegistrationsByTournament.mockResolvedValue(full);
    tournamentRepo.findById.mockResolvedValue({ ...baseTournament, waitlist_enabled: 1 });
    tournamentRepo.getRegistrationById.mockResolvedValue({ id: 999, tournament_id: 1, player_id: 42, user_id: 42, status: 'waiting', payment_status: 'unpaid', registered_at: '2026-01-01' });
    eligibilityServiceMock.assertCanRegister.mockResolvedValue({ evaluation: { eligible: true, members: [] }, snapshot: okSnapshot });

    const reg = await tournamentService.register(1, 42);

    expect(tournamentRepo.createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'waiting', waiting_order: 2, eligibility_snapshot: okSnapshot }),
      expect.anything(),
    );
    expect(reg.status).toBe('waiting');
  });
});

describe('G7-B operator/admin bypass', () => {
  it('50/52. Authorized operator bypass passes allowBypass=true and records bypass in snapshot', async () => {
    const bypassSnapshot = { ...okSnapshot, eligible: false, bypassed: true, bypassReason: 'operator registration' };
    eligibilityServiceMock.assertCanRegister.mockResolvedValue({ evaluation: { eligible: false, members: [] }, snapshot: bypassSnapshot });

    await tournamentService.register(1, 42, undefined, undefined, { operatorBypass: true });

    expect(eligibilityServiceMock.assertCanRegister).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      [42],
      expect.objectContaining({ allowBypass: true, bypassReason: 'operator registration' }),
    );
    expect(tournamentRepo.createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ eligibility_snapshot: bypassSnapshot }),
      expect.anything(),
    );
  });

  it('51. Ineligible WITHOUT bypass → hard 422 (no bypass leak)', async () => {
    eligibilityServiceMock.assertCanRegister.mockRejectedValue(new AppError('ineligible', 422, 'AGE_NOT_ELIGIBLE', { details: {} }));
    await expect(tournamentService.register(1, 42)).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('G7-B historical eligibility lock (update)', () => {
  it('46. Eligibility editable BEFORE first registration', async () => {
    tournamentRepo.findRegistrationsByTournament.mockResolvedValue([]);
    tournamentRepo.update.mockResolvedValue(undefined);

    await tournamentService.update(1, { age_mode: 'categories', age_category_ids: [1] });

    expect(tournamentRepo.update).toHaveBeenCalled();
  });

  it('47. Eligibility change REJECTED after first registration (ELIGIBILITY_LOCKED)', async () => {
    tournamentRepo.findRegistrationsByTournament.mockResolvedValue([{ id: 1, player_id: 42, status: 'registered' }]);
    tournamentRepo.update.mockResolvedValue(undefined);

    await expect(tournamentService.update(1, { age_mode: 'categories', age_category_ids: [1] })).rejects.toMatchObject({ errorCode: 'ELIGIBILITY_LOCKED' });
    expect(tournamentRepo.update).not.toHaveBeenCalled();
  });

  it('48. Same-value eligibility update succeeds after registration (no false lock)', async () => {
    tournamentRepo.findRegistrationsByTournament.mockResolvedValue([{ id: 1, player_id: 42, status: 'registered' }]);
    tournamentRepo.findById.mockResolvedValue({
      ...baseTournament,
      age_mode: 'categories',
      age_category_ids: [1, 2],
      gender_categories: null,
      level_ids: null,
    });
    tournamentRepo.update.mockResolvedValue(undefined);

    await tournamentService.update(1, { age_mode: 'categories', age_category_ids: [2, 1] });
    expect(tournamentRepo.update).toHaveBeenCalled();
  });

  it('49. Non-eligibility fields remain editable after registration', async () => {
    tournamentRepo.findRegistrationsByTournament.mockResolvedValue([{ id: 1, player_id: 42, status: 'registered' }]);
    tournamentRepo.update.mockResolvedValue(undefined);

    await tournamentService.update(1, { description: 'still editable' });
    expect(tournamentRepo.update).toHaveBeenCalled();
  });
});
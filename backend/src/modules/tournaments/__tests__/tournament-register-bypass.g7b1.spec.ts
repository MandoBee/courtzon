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

const serviceMock = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock('../application/tournament.service.js', () => ({ tournamentService: serviceMock }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));

import { registerHandler, registerPlayerHandler } from '../presentation/tournament.controller.js';

interface FakeReply { status: (code: number) => any; send: (body: unknown) => any; }

function reply(): FakeReply {
  const replyMock: any = { payload: undefined };
  replyMock.status = vi.fn(() => replyMock);
  replyMock.send = vi.fn((body: unknown) => { replyMock.payload = body; return replyMock; });
  return replyMock;
}

function req(overrides: Record<string, unknown> = {}): any {
  return {
    userId: 42,
    params: { id: '7' },
    body: {},
    ip: '127.0.0.1',
    headers: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceMock.register.mockResolvedValue({ id: 999, status: 'registered' });
});

describe('G7-B.1 — player self-registration must NEVER bypass eligibility', () => {
  it('1. Player self-register + eligible player → registers with operatorBypass:false', async () => {
    await registerPlayerHandler(req(), reply());
    expect(serviceMock.register).toHaveBeenCalledWith(7, 42, undefined, undefined, { operatorBypass: false });
  });

  it('5. Client CANNOT activate operatorBypass through request input', async () => {
    // Even if the body tries to smuggle a bypass flag (or a legacy caller
    // includes one), the handler ignores it and hard-forces false.
    await registerPlayerHandler(req({ body: { operatorBypass: true, tournament_id: 7 } }), reply());
    expect(serviceMock.register).toHaveBeenCalledWith(7, 42, undefined, undefined, { operatorBypass: false });
    expect(serviceMock.register).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything(), { operatorBypass: true });
  });

  it('2/3/4. Ineligible player flows still reject (service enforces; bypass=false propagates)', async () => {
    const { AppError } = await import('../../../shared/errors/app-error.js');
    serviceMock.register.mockRejectedValueOnce(new AppError('x', 422, 'AGE_NOT_ELIGIBLE', { details: {} }));
    await expect(registerPlayerHandler(req(), reply())).rejects.toMatchObject({ statusCode: 422, errorCode: 'AGE_NOT_ELIGIBLE' });

    serviceMock.register.mockRejectedValueOnce(new AppError('x', 422, 'GENDER_NOT_ELIGIBLE', { details: {} }));
    await expect(registerPlayerHandler(req(), reply())).rejects.toMatchObject({ errorCode: 'GENDER_NOT_ELIGIBLE' });

    serviceMock.register.mockRejectedValueOnce(new AppError('x', 422, 'LEVEL_NOT_ELIGIBLE', { details: {} }));
    await expect(registerPlayerHandler(req(), reply())).rejects.toMatchObject({ errorCode: 'LEVEL_NOT_ELIGIBLE' });
  });

  it('6. Admin/operator registration MAY bypass eligibility (approved operator path)', async () => {
    await registerHandler(req({ body: { tournament_id: 7 } }), reply());
    expect(serviceMock.register).toHaveBeenCalledWith(7, 42, undefined, undefined, { operatorBypass: true });
  });

  it('9. Audit recording still runs for both routes (behavior unchanged)', async () => {
    const { recordAudit } = await import('../../audit-log/index.js');
    await registerPlayerHandler(req(), reply());
    await registerHandler(req({ body: { tournament_id: 8 } }), reply());
    expect(recordAudit).toHaveBeenCalledTimes(2);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.REGISTER' }));
  });
});
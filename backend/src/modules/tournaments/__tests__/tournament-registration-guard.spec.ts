import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.js';
import { initAuthMiddleware } from '../../../shared/middleware/auth.middleware.js';
import { initRouteGuard } from '../../../shared/middleware/route-guard.js';
import {
  requireAdminRegistrationOrgScope,
  PLATFORM_REGISTRATION_ROLES,
} from '../presentation/tournament-registration-guard.js';

/**
 * G11.21.4 — unit contract for the organisation-aware ADMIN registration guard.
 *
 * Policy:
 *   • org owner / super_admin-for-any-org / org-scope-granted holder of
 *     `tournament.register` → allowed (existing `checkOrgPermission`);
 *   • super_admin / super-admin / master-admin → allowed cross-org;
 *   • foreign or nonexistent resource → 404 with the SAME shape (no leak);
 *   • callers WITHOUT `tournament.register` are rejected earlier by the
 *     global `requirePermission` preHandler (403) — covered by the route-level
 *     integration spec, not this unit.
 */

let checkRoleMock: ReturnType<typeof vi.fn>;
let checkOrgPermissionMock: ReturnType<typeof vi.fn>;
let resolveOrgIdMock: ReturnType<typeof vi.fn>;

function makeGuard(overrides: Record<string, unknown> = {}) {
  const opts = {
    idParam: 'id' as const,
    errorCode: 'TOURNAMENT_NOT_FOUND',
    notFoundMessage: 'Tournament not found',
    resolveOrgId: resolveOrgIdMock,
    ...overrides,
  };
  return requireAdminRegistrationOrgScope(opts as any);
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return { userId: 42, params: { id: '500' }, ...overrides } as any;
}

function makeReply() {
  const calls: unknown[] = [];
  const reply: any = {
    status: vi.fn((c: number) => { calls.push(c); return reply; }),
    send: vi.fn((b: unknown) => { calls.push(b); return reply; }),
  };
  return reply;
}

async function capture(rejection: Promise<void>): Promise<AppError | null> {
  try {
    await rejection;
    return null;
  } catch (e) {
    return e as AppError;
  }
}

beforeAll(() => {
  resolveOrgIdMock = vi.fn(async () => 1001);
  checkOrgPermissionMock = vi.fn(async () => false);
  checkRoleMock = vi.fn(async () => false);

  initAuthMiddleware({
    resolveUser: vi.fn(),
    checkRole: checkRoleMock,
    checkPermission: vi.fn(async () => false),
    checkOrgApproved: vi.fn(async () => false),
  });
  initRouteGuard({
    checkOrgAccess: vi.fn(async () => false),
    checkOrgManage: vi.fn(async () => false),
    checkOrgPermission: checkOrgPermissionMock,
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  resolveOrgIdMock.mockResolvedValue(1001);
  checkOrgPermissionMock.mockResolvedValue(false);
  checkRoleMock.mockResolvedValue(false);
});

describe('G11.21.4 — admin registration org guard', () => {
  it('A1. a same-org authorized org-scoped user may register (guard passes)', async () => {
    checkOrgPermissionMock.mockResolvedValue(true);
    const guard = makeGuard();
    const reply = makeReply();
    await expect(guard(makeReq(), reply)).resolves.toBeUndefined();
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('A2. a foreign-org org-scoped user is denied with 404 TOURNAMENT_NOT_FOUND', async () => {
    const guard = makeGuard();
    const err = await capture(guard(makeReq(), makeReply()));
    expect(err).toBeInstanceOf(AppError);
    expect(err!.statusCode).toBe(404);
    expect(err!.errorCode).toBe('TOURNAMENT_NOT_FOUND');
  });

  it('A3. a nonexistent tournament is denied with the identical 404 shape', async () => {
    const foreignErr = await capture(makeGuard()(makeReq(), makeReply()));
    const guardNone = makeGuard({ resolveOrgId: vi.fn(async () => null) });
    const noneErr = await capture(guardNone(makeReq(), makeReply()));
    expect(foreignErr!.statusCode).toBe(noneErr!.statusCode);
    expect(foreignErr!.errorCode).toBe(noneErr!.errorCode);
    expect(foreignErr!.message).toBe(noneErr!.message);
  });

  it('A4. a user without tournament.register and no platform role is denied (guard-level 404; route-level 403 comes from requirePermission)', async () => {
    const err = await capture(makeGuard()(makeReq(), makeReply()));
    expect(err!.statusCode).toBe(404);
    expect(err!.errorCode).toBe('TOURNAMENT_NOT_FOUND');
  });

  it('A5. super_admin may operate cross-org (platform role exemption)', async () => {
    checkRoleMock.mockImplementation(async (_u: number, roles: string[]) => roles.includes('super_admin'));
    const guard = makeGuard({ resolveOrgId: vi.fn(async () => 1001) });
    await expect(guard(makeReq(), makeReply())).resolves.toBeUndefined();
    expect(checkRoleMock).toHaveBeenCalledWith(42, PLATFORM_REGISTRATION_ROLES);
  });

  it('A6. master-admin may operate cross-org (Tournament Workbench policy)', async () => {
    // master-admin is deliberately part of the platform registration roles.
    expect(PLATFORM_REGISTRATION_ROLES).toContain('master-admin');
    checkRoleMock.mockImplementation(async (_u: number, roles: string[]) => roles.includes('master-admin'));
    await expect(makeGuard()(makeReq(), makeReply())).resolves.toBeUndefined();
  });

  it('A7. a missing user id is rejected 401 before any org resolution', async () => {
    const reply = makeReply();
    await expect(makeGuard()(makeReq({ userId: undefined }), reply)).resolves.toBe(reply);
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(resolveOrgIdMock).not.toHaveBeenCalled();
  });

  it('A8. a non-positive resource id is a 400 validation error', async () => {
    const err = await capture(makeGuard()(makeReq({ params: { id: '0' } }), makeReply()));
    expect(err!.statusCode).toBe(400);
    expect(err!.errorCode).toBe('VALIDATION_ERROR');
  });
});
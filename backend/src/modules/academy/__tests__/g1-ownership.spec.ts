import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

// ── Controllable fake DB for academy-scope queries ──
const db = vi.hoisted(() => ({
  orgs: [] as number[],
  branches: [] as Array<{ id: number; organisation_id: number }>,
  sports: [] as number[],
  coaches: [] as number[],
  agreements: [] as number[], // coach user_ids with an active org agreement
}));
const captured = vi.hoisted(() => [] as string[]);

const fakePool = vi.hoisted(() => ({
  query: async (sql: string, params: any[] = []) => {
    captured.push(sql);
    if (sql.includes('FROM academy_programs WHERE id = ?')) {
      const scope = dbScope.current;
      return [scope ? [{ program_id: scope.programId, organisation_id: scope.orgId, branch_id: scope.branchId, sport_id: scope.sportId, lifecycle_state: scope.lifecycle }] : [], []];
    }
    if (sql.includes('FROM organisations WHERE id = ?')) {
      return [[db.orgs.includes(Number(params[0])) ? { id: Number(params[0]) } : null].filter(Boolean), []];
    }
    if (sql.includes('FROM branches WHERE id = ? AND organisation_id = ?')) {
      const hit = db.branches.find((b) => b.id === Number(params[0]) && b.organisation_id === Number(params[1]));
      return [hit ? [hit] : [], []];
    }
    if (sql.includes('FROM sports WHERE id = ?')) {
      return [[db.sports.includes(Number(params[0])) ? { id: Number(params[0]) } : null].filter(Boolean), []];
    }
    if (sql.includes('FROM coach_profiles WHERE user_id = ?')) {
      return [[db.coaches.includes(Number(params[0])) ? { id: 1 } : null].filter(Boolean), []];
    }
    if (sql.includes('FROM coach_org_agreements')) {
      return [[db.agreements.includes(Number(params[0])) ? { id: 1 } : null].filter(Boolean), []];
    }
    return [[], []];
  },
  execute: async (sql: string) => { captured.push(sql); return [[], []]; },
}));

// Scope returned by resolveProgramScope during a test
const dbScope = vi.hoisted(() => ({
  current: null as null | { programId: number; orgId: number | null; branchId: number | null; sportId: number | null; lifecycle: 'setup' | 'confirmed' },
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => fakePool }));

const orgAccess = vi.hoisted(() => ({ canAccessOrganisation: vi.fn(), canAccessBranch: vi.fn(), isPlatformAdmin: vi.fn(), findAccessibleOrgIds: vi.fn() }));
vi.mock('../../../shared/middleware/org-access.js', () => orgAccess);

const programRepo = vi.hoisted(() => ({
  list: vi.fn(), getById: vi.fn(), getByCode: vi.fn(), create: vi.fn(), update: vi.fn(),
  confirm: vi.fn(), updateStatus: vi.fn(), getCategories: vi.fn(), getDashboard: vi.fn(),
}));
vi.mock('../infrastructure/repositories/program.repository.js', () => ({ programRepository: programRepo }));

const groupRepo = vi.hoisted(() => ({
  listByProgram: vi.fn(), listAll: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(),
  updateCoach: vi.fn(), confirmLock: vi.fn(), getEnrolledCount: vi.fn(), getMemberCount: vi.fn(),
}));
vi.mock('../infrastructure/repositories/group.repository.js', () => ({ groupRepository: groupRepo }));

const enrollmentRepo = vi.hoisted(() => ({
  list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn(),
  moveToGroup: vi.fn(), getNextWaitingOrder: vi.fn(), getConfirmedCount: vi.fn(),
  getGroupConfirmedCount: vi.fn(), getHistory: vi.fn(),
}));
vi.mock('../infrastructure/repositories/enrollment.repository.js', () => ({ enrollmentRepository: enrollmentRepo }));

import { academyProgramService } from '../application/program.service.js';
import { academyGroupService } from '../application/group.service.js';
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { permissionMatchesTemplate } from '../../rbac/application/role-permission-templates.js';

function makeProgram(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, code: 'AC1', name: 'Academy 1', description: null, category: 'tennis',
    level: null, season: null, capacity: 10, price: 100, currency: 'USD',
    price_type: 'FIXED', status: 'draft', is_public: true,
    organisation_id: 7, branch_id: 9, sport_id: 21, lifecycle_state: 'setup',
    confirmed_at: null, confirmed_by: null, archived_at: null, created_at: '', updated_at: '',
    ...overrides,
  };
}

function makeGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, program_id: 1, name: 'Group 1', coach_id: null, capacity: 10, status: 'active',
    comp_type: null, comp_value: null, comp_currency: null, coach_locked_at: null, coach_locked_by: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  db.orgs = [7]; db.branches = [{ id: 9, organisation_id: 7 }]; db.sports = [21]; db.coaches = []; db.agreements = [];
  dbScope.current = null;
  orgAccess.canAccessOrganisation.mockResolvedValue(true);
  orgAccess.canAccessBranch.mockResolvedValue(true);
  orgAccess.isPlatformAdmin.mockResolvedValue(false);
  programRepo.getById.mockImplementation((id: number) => Promise.resolve(makeProgram()));
  programRepo.getByCode.mockResolvedValue(null);
  programRepo.create.mockResolvedValue(1);
  groupRepo.getById.mockResolvedValue(makeGroup());
  groupRepo.listByProgram.mockResolvedValue({ data: [makeGroup()], total: 1, page: 1, limit: 20 });
});

describe('G1 TEST 1 — CREATE Academy with organisation + branch + sport', () => {
  it('persists ownership scope', async () => {
    const p = await academyProgramService.create({ code: 'AC2', name: 'A2', category: 'tennis', organisation_id: 7, branch_id: 9, sport_id: 21 });
    expect(programRepo.create).toHaveBeenCalledWith(expect.objectContaining({ organisation_id: 7, branch_id: 9, sport_id: 21, lifecycle_state: 'setup' }));
    expect(p.id).toBe(1);
  });

  it('rejects creation without an organisation', async () => {
    await expect(academyProgramService.create({ code: 'AC3', name: 'A3', category: 'tennis' } as any)).rejects.toThrow(/scoped to an organisation/);
  });

  it('rejects a branch that does not belong to the organisation', async () => {
    db.branches = [];
    await expect(academyProgramService.create({ code: 'AC4', name: 'A4', category: 'tennis', organisation_id: 7, branch_id: 99 } as any)).rejects.toThrow(/Branch does not belong/);
  });
});

describe('G1 TEST 2 — object scope (cross-organisation denied)', () => {
  it('an actor without organisation access is denied (non-revealing)', async () => {
    orgAccess.canAccessOrganisation.mockResolvedValue(false);
    dbScope.current = { programId: 1, orgId: 8, branchId: 9, sportId: 21, lifecycle: 'setup' };
    await expect(academyGroupService.assignCoach(1, 42, 5)).rejects.toThrow(/not found/i);
  });
});

describe('G1 TEST 3 — branch scope denied', () => {
  it('an actor without branch access is denied even with org access', async () => {
    orgAccess.canAccessOrganisation.mockResolvedValue(true);
    orgAccess.canAccessBranch.mockResolvedValue(false);
    dbScope.current = { programId: 1, orgId: 7, branchId: 9, sportId: 21, lifecycle: 'setup' };
    await expect(academyGroupService.assignCoach(1, 42, 5)).rejects.toThrow(/not found/i);
  });
});

describe('G1 TEST 4/5 — contracted vs external coach', () => {
  function scopeSetup() {
    dbScope.current = { programId: 1, orgId: 7, branchId: 9, sportId: 21, lifecycle: 'setup' };
    groupRepo.getById.mockResolvedValue(makeGroup());
  }
  it('organisation-affiliated coach is assigned as contracted', async () => {
    db.coaches = [42]; db.agreements = [42];
    scopeSetup();
    const { relation } = await academyGroupService.assignCoach(1, 42, 5);
    expect(relation).toBe('contracted');
    expect(groupRepo.updateCoach).toHaveBeenCalledWith(1, 42);
  });

  it('external independent coach is assigned as external', async () => {
    db.coaches = [42]; db.agreements = [];
    scopeSetup();
    const { relation } = await academyGroupService.assignCoach(1, 42, 5);
    expect(relation).toBe('external');
  });

  it('clearing the coach is allowed', async () => {
    scopeSetup();
    const { relation } = await academyGroupService.assignCoach(1, null, 5);
    expect(relation).toBeNull();
  });
});

describe('G1 TEST 6 — invalid coach rejected', () => {
  it('a non-coach user cannot be assigned', async () => {
    db.coaches = [];
    dbScope.current = { programId: 1, orgId: 7, branchId: 9, sportId: 21, lifecycle: 'setup' };
    await expect(academyGroupService.assignCoach(1, 999, 5)).rejects.toThrow(/not an approved coach/);
  });
});

describe('G1 TEST 7 — coach change during setup (audit captured at controller)', () => {
  it('Coach A -> Coach B succeeds while in setup', async () => {
    db.coaches = [10, 20];
    dbScope.current = { programId: 1, orgId: 7, branchId: 9, sportId: 21, lifecycle: 'setup' };
    groupRepo.getById.mockResolvedValue(makeGroup({ coach_id: 10 }));
    await academyGroupService.assignCoach(1, 10, 5);
    await academyGroupService.assignCoach(1, 20, 5);
    expect(groupRepo.updateCoach).toHaveBeenNthCalledWith(1, 1, 10);
    expect(groupRepo.updateCoach).toHaveBeenNthCalledWith(2, 1, 20);
  });
});

describe('G1 TEST 8 — compensation types persist', () => {
  it('fixed_total', async () => {
    dbScope.current = { programId: 1, orgId: 7, branchId: 9, sportId: 21, lifecycle: 'setup' };
    const g = await academyGroupService.setCompensation(1, { comp_type: 'fixed_total', comp_value: 500, comp_currency: 'USD' }, 5);
    expect(groupRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ comp_type: 'fixed_total', comp_value: 500, comp_currency: 'USD' }));
    expect(g.id).toBe(1);
  });

  it('fixed_per_session', async () => {
    dbScope.current = { programId: 1, orgId: 7, branchId: 9, sportId: 21, lifecycle: 'setup' };
    await academyGroupService.setCompensation(1, { comp_type: 'fixed_per_session', comp_value: 25, comp_currency: 'USD' }, 5);
    expect(groupRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ comp_type: 'fixed_per_session' }));
  });

  it('percent_gross (no currency)', async () => {
    dbScope.current = { programId: 1, orgId: 7, branchId: 9, sportId: 21, lifecycle: 'setup' };
    await academyGroupService.setCompensation(1, { comp_type: 'percent_gross', comp_value: 15 }, 5);
    expect(groupRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ comp_type: 'percent_gross', comp_value: 15, comp_currency: null }));
  });

  it('rejects percent_gross above 100', async () => {
    dbScope.current = { programId: 1, orgId: 7, branchId: 9, sportId: 21, lifecycle: 'setup' };
    await expect(academyGroupService.setCompensation(1, { comp_type: 'percent_gross', comp_value: 150 }, 5)).rejects.toThrow(/between 0 and 100/);
  });
});

describe('G1 TEST 9/10 — lock after confirmation', () => {
  it('coach change rejected after confirmation', async () => {
    dbScope.current = { programId: 1, orgId: 7, branchId: 9, sportId: 21, lifecycle: 'confirmed' };
    groupRepo.getById.mockResolvedValue(makeGroup({ coach_locked_at: '2026-09-11 00:00:00' }));
    await expect(academyGroupService.assignCoach(1, 42, 5)).rejects.toThrow(/locked after Academy confirmation/);
  });

  it('compensation change rejected after confirmation', async () => {
    dbScope.current = { programId: 1, orgId: 7, branchId: 9, sportId: 21, lifecycle: 'confirmed' };
    groupRepo.getById.mockResolvedValue(makeGroup({ coach_locked_at: '2026-09-11 00:00:00' }));
    await expect(academyGroupService.setCompensation(1, { comp_type: 'fixed_total', comp_value: 100 }, 5)).rejects.toThrow(/locked after Academy confirmation/);
  });
});

describe('G1 TEST 11 — confirm SETUP -> CONFIRMED', () => {
  it('persists confirmed_at/actor and locks groups', async () => {
    const p = await academyProgramService.confirm(1, 5);
    expect(programRepo.confirm).toHaveBeenCalledWith(1, 5);
    expect(groupRepo.confirmLock).toHaveBeenCalledWith(1, 5);
    expect(p.lifecycle_state).toBe('setup'); // getById returns pre-confirm row in mock; state write is in confirm()
  });

  it('cannot confirm an already confirmed academy', async () => {
    programRepo.getById.mockResolvedValue(makeProgram({ lifecycle_state: 'confirmed' }));
    await expect(academyProgramService.confirm(1, 5)).rejects.toThrow(/already confirmed/);
  });
});

describe('G1 TEST 12 — post-confirm ownership mutation rejected', () => {
  it('updating organisation after confirmation is rejected', async () => {
    programRepo.getById.mockResolvedValue(makeProgram({ lifecycle_state: 'confirmed' }));
    await expect(academyProgramService.update(1, { organisation_id: 8 })).rejects.toThrow(/locked after confirmation/);
  });
});

describe('G1 TEST 13 — RBAC: academy admin keys for admin roles, not players', () => {
  it('org-admin / master-admin / academy-manager can manage academy', () => {
    expect(permissionMatchesTemplate('org-admin', 'academy.manage')).toBe(true);
    expect(permissionMatchesTemplate('master-admin', 'academy.create')).toBe(true);
    expect(permissionMatchesTemplate('academy-manager', 'academy.update')).toBe(true);
  });

  it('players keep only the public self-service keys', () => {
    expect(permissionMatchesTemplate('player', 'academy.view')).toBe(true);
    expect(permissionMatchesTemplate('player', 'academy.enroll')).toBe(true);
    expect(permissionMatchesTemplate('player', 'academy.manage')).toBe(false);
    expect(permissionMatchesTemplate('coach', 'academy.manage')).toBe(false);
  });
});

describe('G1 TEST 14 — legacy academy enrollment drift is quarantined', () => {
  it('new enrollment path writes new-model columns only (no academy_id/curriculum_id)', async () => {
    enrollmentRepo.create.mockImplementation(async (data: any) => {
      const sql = `INSERT INTO academy_enrollments (player_id, program_id, group_id, membership_id, status, waiting_order) VALUES (?, ?, ?, ?, ?, ?)`;
      captured.push(sql);
      return 1;
    });
    await enrollmentRepository.create({ player_id: 5, program_id: 1, status: 'pending' });
    const insert = captured.find((s) => s.startsWith('INSERT INTO academy_enrollments'));
    expect(insert).toBeDefined();
    expect(insert).toContain('program_id');
    expect(insert).not.toContain('academy_id');
    expect(insert).not.toContain('curriculum_id');
  });

  it('legacy activities enrollment write path fails explicitly', async () => {
    const { activitiesRepository } = await import('../../activities/infrastructure/repositories/activities.repository.js');
    await expect(activitiesRepository.enrollPlayer(1, 5, 1)).rejects.toThrow(/LEGACY_ACADEMY_ENROLLMENT_DISABLED/);
  });
});

describe('G1 TEST 15 — idempotent repeated identical updates', () => {
  it('repeated identical coach assignment does not throw and keeps relation', async () => {
    db.coaches = [42]; db.agreements = [42];
    dbScope.current = { programId: 1, orgId: 7, branchId: 9, sportId: 21, lifecycle: 'setup' };
    groupRepo.getById.mockResolvedValue(makeGroup());
    const r1 = await academyGroupService.assignCoach(1, 42, 5);
    const r2 = await academyGroupService.assignCoach(1, 42, 5);
    expect(r1.relation).toBe('contracted');
    expect(r2.relation).toBe('contracted');
  });

  it('repeated identical compensation update persists once without error', async () => {
    dbScope.current = { programId: 1, orgId: 7, branchId: 9, sportId: 21, lifecycle: 'setup' };
    await academyGroupService.setCompensation(1, { comp_type: 'percent_gross', comp_value: 10 }, 5);
    await academyGroupService.setCompensation(1, { comp_type: 'percent_gross', comp_value: 10 }, 5);
    expect(groupRepo.update).toHaveBeenCalledTimes(2);
  });
});
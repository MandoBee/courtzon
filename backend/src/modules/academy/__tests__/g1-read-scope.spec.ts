import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const captured = vi.hoisted(() => [] as string[]);
const fakePool = vi.hoisted(() => ({
  query: async (sql: string) => { captured.push(sql); return [[], []]; },
  execute: async (sql: string) => { captured.push(sql); return [[{ c: 0, present: 0, absent: 0, excused: 0, late: 0 }], []]; },
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => fakePool }));

const orgAccess = vi.hoisted(() => ({
  isPlatformAdmin: vi.fn(),
  findAccessibleOrgIds: vi.fn(),
  findAccessibleBranchIds: vi.fn(),
  canAccessOrganisation: vi.fn(),
  canAccessBranch: vi.fn(),
}));
vi.mock('../../../shared/middleware/org-access.js', () => orgAccess);

import { resolveAcademyReadScope, academyScopeWhere } from '../application/academy-scope.js';
import { programRepository } from '../infrastructure/repositories/program.repository.js';
import { groupRepository } from '../infrastructure/repositories/group.repository.js';
import { enrollmentRepository } from '../infrastructure/repositories/enrollment.repository.js';
import { attendanceRepository } from '../infrastructure/repositories/attendance.repository.js';

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  orgAccess.isPlatformAdmin.mockResolvedValue(false);
  orgAccess.findAccessibleOrgIds.mockResolvedValue([1]);
  orgAccess.findAccessibleBranchIds.mockResolvedValue([]);
});

describe('G1.1 — read scope resolution', () => {
  it('platform admin is unrestricted', async () => {
    orgAccess.isPlatformAdmin.mockResolvedValue(true);
    const scope = await resolveAcademyReadScope(5);
    expect(scope.unrestricted).toBe(true);
  });

  it('organisation user scopes to their orgs', async () => {
    orgAccess.findAccessibleOrgIds.mockResolvedValue([1, 2]);
    const scope = await resolveAcademyReadScope(5);
    expect(scope.unrestricted).toBe(false);
    expect(scope.orgIds).toEqual([1, 2]);
  });

  it('branch-scoped user scopes to their branches', async () => {
    orgAccess.findAccessibleOrgIds.mockResolvedValue([]);
    orgAccess.findAccessibleBranchIds.mockResolvedValue([9]);
    const scope = await resolveAcademyReadScope(5);
    expect(scope.branchIds).toEqual([9]);
  });
});

describe('G1.1 — scope WHERE builder', () => {
  it('org + branch produces an OR filter over the program alias', () => {
    const { where, params } = academyScopeWhere({ unrestricted: false, orgIds: [1], branchIds: [9] }, 'p');
    expect(where).toContain('p.organisation_id IN (?)');
    expect(where).toContain('p.branch_id IN (?)');
    expect(params).toEqual([1, 9]);
  });

  it('empty access produces a non-revealing 1 = 0', () => {
    const { where, params } = academyScopeWhere({ unrestricted: false, orgIds: [], branchIds: [] }, 'p');
    expect(where).toBe('1 = 0');
    expect(params).toEqual([]);
  });

  it('unrestricted produces no clause', () => {
    const { where, params } = academyScopeWhere({ unrestricted: true, orgIds: [], branchIds: [] }, 'p');
    expect(where).toBe('');
    expect(params).toEqual([]);
  });
});

describe('G1.1 — groups list is ownership-scoped', () => {
  it('TEST 1 — Org A request cannot return Org B groups (scope filter + program join)', async () => {
    const scope = await resolveAcademyReadScope(5); // orgIds=[1] (Org A)
    const { where, params } = academyScopeWhere(scope, 'p');
    await groupRepository.listAll({ scopeWhere: where, scopeParams: params });
    const sql = captured.join('\n');
    expect(sql).toContain('JOIN academy_programs p ON p.id = g.program_id');
    expect(sql).toContain('p.organisation_id IN (?)');
    expect(params).toEqual([1]); // only Org A is bound — Org B never bound
  });

  it('TEST 8 — nested group lookup by program id cannot bypass ownership', async () => {
    const { where, params } = academyScopeWhere({ unrestricted: false, orgIds: [1], branchIds: [] }, 'p');
    await groupRepository.listByProgram(99, { scopeWhere: where, scopeParams: params });
    const sql = captured.join('\n');
    expect(sql).toContain('g.program_id = ?');
    expect(sql).toContain('p.organisation_id IN (?)');
  });
});

describe('G1.1 — enrollments list is ownership-scoped', () => {
  it('TEST 3 — Org A request cannot return Org B enrollments', async () => {
    const scope = await resolveAcademyReadScope(5);
    const { where, params } = academyScopeWhere(scope, 'p');
    await enrollmentRepository.list({ scopeWhere: where, scopeParams: params });
    const sql = captured.join('\n');
    expect(sql).toContain('JOIN academy_programs p ON p.id = e.program_id');
    expect(sql).toContain('p.organisation_id IN (?)');
  });
});

describe('G1.1 — attendance list is ownership-scoped', () => {
  it('TEST 4 — Org A request cannot return Org B attendance', async () => {
    const scope = await resolveAcademyReadScope(5);
    const { where, params } = academyScopeWhere(scope, 'p');
    await attendanceRepository.list({ scopeWhere: where, scopeParams: params });
    const sql = captured.join('\n');
    expect(sql).toContain('JOIN academy_programs p ON p.id = g.program_id');
    expect(sql).toContain('p.organisation_id IN (?)');
  });
});

describe('G1.1 — program reads remain scoped', () => {
  it('TEST 9 — program list applies the scope filter', async () => {
    const scope = await resolveAcademyReadScope(5);
    const { where, params } = academyScopeWhere(scope, 'p');
    await programRepository.list({ scopeWhere: where, scopeParams: params });
    const sql = captured.join('\n');
    expect(sql).toContain('p.organisation_id IN (?)');
  });

  it('TEST 7 — dashboard aggregates only the caller scope (org filter present)', async () => {
    await programRepository.getDashboard({ orgIds: [1], branchIds: [] });
    const sql = captured.join('\n');
    expect(sql).toContain('p.organisation_id IN (?)');
    expect(sql).toContain('JOIN academy_programs p');
  });

  it('categories are scoped to the caller organisations', async () => {
    await programRepository.getCategories({ orgIds: [1], branchIds: [] });
    const sql = captured.join('\n');
    expect(sql).toContain('p.organisation_id IN (?)');
  });
});

describe('G1.1 — player self-service is not weakened', () => {
  it('TEST 10 — a player enrollment query filters by the player id', async () => {
    await enrollmentRepository.list({ playerId: 7 });
    const sql = captured.join('\n');
    expect(sql).toContain('e.player_id = ?');
  });
});
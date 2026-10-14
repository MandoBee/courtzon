import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'x'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379';
});

/**
 * Phase 3A — membership_plans application contract.
 *
 * Proves two things without any database:
 *   1. `CreateMembershipPlanSchema` / `UpdateMembershipPlanSchema` mirror the
 *      canonical `membership_plans` column enums and require the two
 *      NOT NULL-without-default columns (`plan_type`, `duration_days`).
 *   2. `MembershipPlanService.create()` sends BOTH columns in the INSERT and
 *      maps the caller-supplied values to the correct placeholders (no
 *      invented defaults).
 */

const planRow = {
  id: 42, code: 'corp-1', name: 'Corporate', description: null, category: 'general',
  duration_type: 'months', duration_value: 3, plan_type: 'corporate', duration_days: 90,
  price: 100, currency: 'EGP', status: 'active', is_default: 0, is_public: 1, sort_order: 0,
};

const poolMock = vi.hoisted(() => ({
  execute: vi.fn(async (sql: string) => {
    if (String(sql).includes('INSERT INTO membership_plans')) return [{ insertId: 42 }];
    if (String(sql).includes('FROM membership_benefits')) return [[]];
    if (String(sql).includes('FROM membership_plans WHERE id')) return [[/* plan */]];
    return [[]];
  }),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => poolMock }));

import {
  CreateMembershipPlanSchema,
  UpdateMembershipPlanSchema,
  MEMBERSHIP_PLAN_DURATION_TYPES,
  MEMBERSHIP_PLAN_TYPES,
  MEMBERSHIP_PLAN_STATUSES,
} from '../presentation/membership.dto.js';
import { membershipPlanService } from '../application/membership-plan.service.js';

const validCreate = {
  code: 'corp-1',
  name: 'Corporate',
  category: 'general',
  duration_type: 'months' as const,
  duration_value: 3,
  plan_type: 'corporate' as const,
  duration_days: 90,
  price: 100,
};

describe('Phase 3A — membership plan DTO mirrors the canonical column enums', () => {
  it('exposes exactly the deployed column domains', () => {
    expect([...MEMBERSHIP_PLAN_DURATION_TYPES]).toEqual(['days', 'months', 'years', 'perpetual']);
    expect([...MEMBERSHIP_PLAN_STATUSES]).toEqual(['draft', 'active', 'archived']);
    expect([...MEMBERSHIP_PLAN_TYPES]).toEqual([
      'monthly', 'quarterly', 'semiannual', 'annual', 'unlimited',
      'credits', 'session_bundle', 'corporate', 'family', 'student',
    ]);
  });

  it('accepts a fully valid create payload', () => {
    const parsed = CreateMembershipPlanSchema.parse(validCreate);
    expect(parsed.plan_type).toBe('corporate');
    expect(parsed.duration_days).toBe(90);
    expect(parsed.status).toBe('active'); // default
  });

  it('rejects the legacy singular duration_type values (column uses days|months|years|perpetual)', () => {
    for (const bad of ['day', 'week', 'month', 'year']) {
      expect(() => CreateMembershipPlanSchema.parse({ ...validCreate, duration_type: bad })).toThrow();
    }
  });

  it('rejects the legacy "inactive" status (column uses draft|active|archived)', () => {
    expect(() => CreateMembershipPlanSchema.parse({ ...validCreate, status: 'inactive' })).toThrow();
    expect(() => CreateMembershipPlanSchema.parse({ ...validCreate, status: 'draft' })).not.toThrow();
  });

  it('requires plan_type and duration_days (NOT NULL columns without a default)', () => {
    const { plan_type, duration_days, ...withoutBoth } = validCreate;
    expect(() => CreateMembershipPlanSchema.parse(withoutBoth)).toThrow();
    expect(() => CreateMembershipPlanSchema.parse({ ...validCreate, duration_days: 0 })).toThrow();
    expect(() => CreateMembershipPlanSchema.parse({ ...validCreate, plan_type: 'nonsense' })).toThrow();
  });

  it('update schema keeps plan_type/duration_days optional but domain-checked', () => {
    expect(() => UpdateMembershipPlanSchema.parse({ name: 'x' })).not.toThrow();
    expect(UpdateMembershipPlanSchema.parse({ plan_type: 'family', duration_days: 365 }).plan_type).toBe('family');
    expect(() => UpdateMembershipPlanSchema.parse({ plan_type: 'bogus' })).toThrow();
    expect(() => UpdateMembershipPlanSchema.parse({ duration_type: 'month' })).toThrow();
  });
});

describe('Phase 3A — MembershipPlanService.create INSERT mapping', () => {
  it('persists plan_type and duration_days with the caller-supplied values', async () => {
    poolMock.execute.mockClear();
    await membershipPlanService.create(validCreate, 7);

    const insertCall = poolMock.execute.mock.calls.find((c) => String(c[0]).includes('INSERT INTO membership_plans'));
    expect(insertCall).toBeTruthy();
    const sql = String(insertCall![0]);
    const params = insertCall![1] as unknown[];

    expect(sql).toContain('plan_type');
    expect(sql).toContain('duration_days');

    const cols = sql
      .match(/INSERT INTO membership_plans \(([^)]+)\)/)![1]
      .split(',')
      .map((s) => s.trim());
    const at = (name: string) => cols.indexOf(name);

    expect(at('plan_type')).toBeGreaterThanOrEqual(0);
    expect(at('duration_days')).toBeGreaterThanOrEqual(0);
    expect(params[at('plan_type')]).toBe('corporate');
    expect(params[at('duration_days')]).toBe(90);
    expect(params[at('duration_type')]).toBe('months');
    expect(params[at('duration_value')]).toBe(3);
    // NOT NULL columns must never arrive as undefined/null.
    expect(params[at('plan_type')]).not.toBeUndefined();
    expect(params[at('duration_days')]).not.toBeUndefined();
  });
});

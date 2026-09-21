import { describe, it, expect, vi, beforeEach } from 'vitest';

const pool = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../application/org-portal.service.js', () => ({ default: {} }));
vi.mock('../infrastructure/repositories/org-portal.repository.js', () => ({ default: {} }));
vi.mock('../application/organisation.service.js', () => ({ organisationService: {} }));
vi.mock('../infrastructure/repositories/cancellation-policy.repository.js', () => ({ cancellationPolicyRepository: {} }));
vi.mock('../../rbac/infrastructure/repositories/rbac.repository.js', () => ({ rbacRepository: {} }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../financial/application/position.service.js', () => ({ positionService: {} }));
vi.mock('../../settlement/application/unified-settlement.service.js', () => ({ unifiedSettlementService: {} }));
vi.mock('./organisation-audit.js', () => ({ auditOrganisationMutation: vi.fn() }));

import * as ctrl from '../presentation/org-portal.controller.js';

function req(overrides: any = {}): any {
  return { params: { orgId: '1001' }, userId: 1, ...overrides };
}
function res(): any {
  const r = { sent: null };
  r.send = vi.fn((val: any) => { r.sent = val; return r; });
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  pool.query.mockReset();
});

describe('getOrgPaymentSettingsHandler — payment_methods schema regression (T-1B-8)', () => {
  it('filters active payment methods on is_active (the real column), not status', async () => {
    pool.query
      .mockResolvedValueOnce([[]]) // branches
      .mockResolvedValueOnce([[{ id: 1, slug: 'card', name: 'Card', is_active: 1, sort_order: 0 }]]); // payment_methods

    const reply = res();
    await ctrl.getOrgPaymentSettingsHandler(req(), reply);

    const paymentSql = pool.query.mock.calls[1][0] as string;
    expect(paymentSql).toContain('FROM payment_methods pm');
    expect(paymentSql).toContain('pm.is_active = 1');
    expect(paymentSql).not.toContain('pm.status');
    expect(reply.sent.paymentMethods).toHaveLength(1);
  });

  it('returns branches scoped to the org', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 5, name: 'Main' }]])
      .mockResolvedValueOnce([[]]);

    const reply = res();
    await ctrl.getOrgPaymentSettingsHandler(req(), reply);

    const branchSql = pool.query.mock.calls[0][0] as string;
    expect(branchSql).toContain('WHERE b.organisation_id = ?');
    expect(pool.query.mock.calls[0][1]).toEqual([1001]);
    expect(reply.sent.branches).toHaveLength(1);
  });
});
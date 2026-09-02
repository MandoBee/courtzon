import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

/**
 * Canonical journal ENTITY SCOPE resolution.
 *
 * The canonical ownership of a journal entry is `general_ledger.organisation_id`
 * (NULL = CourtZon/platform; <orgId> = organisation, which includes marketplace
 * merchant sellers). The resolver builds the server-side condition, validates the
 * supplied id against the canonical organisation/seller sources, and enforces
 * entity access (platform admin OR org access) — an arbitrary client id is never
 * trusted.
 */

const executed: string[] = [];
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: async (sql: string, params: any[] = []) => {
      executed.push(`${sql}::${JSON.stringify(params)}`);
      // Orgs 77 and 88 exist; only org 88 is a marketplace seller.
      if (sql.includes('FROM organisations')) {
        return [[77, 88].includes(params[0]) ? [{ id: params[0] }] : [], []];
      }
      if (sql.includes('FROM products')) {
        return [params[0] === 88 ? [{ seller_id: 88 }] : [], []];
      }
      return [[], []];
    },
  }),
}));

vi.mock('../../../shared/middleware/org-access.js', () => ({
  isPlatformAdmin: vi.fn(),
  canAccessOrganisation: vi.fn(),
}));

vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));

vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: { emit: vi.fn(), on: vi.fn(), subscribe: vi.fn() },
}));

import { resolveJournalEntityScope } from '../presentation/accounting.controller.js';
import { isPlatformAdmin, canAccessOrganisation } from '../../../shared/middleware/org-access.js';

beforeEach(() => {
  executed.length = 0;
  vi.clearAllMocks();
  (isPlatformAdmin as any).mockResolvedValue(true);
});

describe('resolveJournalEntityScope — canonical entity filter', () => {
  it('maps CourtZon to the platform scope (organisation_id IS NULL)', async () => {
    const scope = await resolveJournalEntityScope({ entityType: 'courtzon' }, 1);
    expect(scope.condition).toBe('gl.organisation_id IS NULL');
    expect(scope.params).toEqual([]);
  });

  it('maps absent / all to no filter (existing behaviour unchanged)', async () => {
    expect((await resolveJournalEntityScope({}, 1)).condition).toBe('');
    expect((await resolveJournalEntityScope({ entityType: 'all' }, 1)).condition).toBe('');
  });

  it('maps an organisation id to its canonical GL scope', async () => {
    const scope = await resolveJournalEntityScope({ entityType: 'organisation', entityId: '77' }, 1);
    expect(scope.condition).toBe('gl.organisation_id = ?');
    expect(scope.params).toEqual([77]);
  });

  it('maps a merchant (seller org) to the same organisation_id GL scope', async () => {
    const scope = await resolveJournalEntityScope({ entityType: 'merchant', entityId: '88' }, 1);
    expect(scope.condition).toBe('gl.organisation_id = ?');
    expect(scope.params).toEqual([88]);
  });

  it('rejects a merchant id that is not a seller org', async () => {
    await expect(resolveJournalEntityScope({ entityType: 'merchant', entityId: '77' }, 1)).rejects.toThrow(/Merchant not found/);
  });

  it('rejects a non-existent organisation', async () => {
    await expect(resolveJournalEntityScope({ entityType: 'organisation', entityId: '999' }, 1)).rejects.toThrow(/Organisation not found/);
  });

  it('rejects a malformed entity id', async () => {
    await expect(resolveJournalEntityScope({ entityType: 'organisation', entityId: 'abc' }, 1)).rejects.toThrow(/Invalid entity id/);
    await expect(resolveJournalEntityScope({ entityType: 'organisation' }, 1)).rejects.toThrow(/Invalid entity id/);
  });

  it('denies a non-platform actor without access to the organisation', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (canAccessOrganisation as any).mockResolvedValue(false);
    await expect(resolveJournalEntityScope({ entityType: 'organisation', entityId: '77' }, 9)).rejects.toThrow(/Access to this organisation denied/);
    expect(canAccessOrganisation).toHaveBeenCalledWith(9, 77);
  });

  it('allows a non-platform actor with access to the organisation', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (canAccessOrganisation as any).mockResolvedValue(true);
    const scope = await resolveJournalEntityScope({ entityType: 'organisation', entityId: '77' }, 9);
    expect(scope.params).toEqual([77]);
  });
});
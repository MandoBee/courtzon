import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: mocks.execute }),
}));

import { ResourceMaintenanceSchema } from '../presentation/organisation.dto.js';
import {
  deriveMaintenanceStatus,
  mapMaintenanceRow,
  resourceRepository,
} from '../infrastructure/repositories/resource.repository.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResourceMaintenanceSchema', () => {
  it('merges title, description and reason and builds the DB datetime strings', () => {
    const parsed = ResourceMaintenanceSchema.parse({
      title: 'Court closed',
      description: 'Annual resurfacing',
      reason: 'Safety',
      startDate: '2026-11-01',
      startTime: '09:00',
      endDate: '2026-11-02',
      endTime: '12:00',
      status: 'scheduled',
    });

    expect(parsed).toEqual({
      reason: 'Court closed — Annual resurfacing — Safety',
      dateFrom: '2026-11-01 09:00:00',
      dateTo: '2026-11-02 12:00:00',
      isActive: 1,
      status: 'scheduled',
    });
  });

  it('defaults missing times and end date', () => {
    const parsed = ResourceMaintenanceSchema.parse({
      title: 'Court closed',
      startDate: '2026-11-01',
    });

    expect(parsed.dateFrom).toBe('2026-11-01 00:00:00');
    expect(parsed.dateTo).toBe('2026-11-01 23:59:00');
    expect(parsed.status).toBe('scheduled');
  });

  it('treats empty strings for endDate, startTime and endTime as missing', () => {
    const parsed = ResourceMaintenanceSchema.parse({
      title: 'Court closed',
      startDate: '2026-11-01',
      endDate: '',
      startTime: '',
      endTime: '',
    });

    expect(parsed.dateFrom).toBe('2026-11-01 00:00:00');
    expect(parsed.dateTo).toBe('2026-11-01 23:59:00');
    expect(parsed.isActive).toBe(1);
  });

  it('treats null values for endDate, startTime and endTime as missing', () => {
    const parsed = ResourceMaintenanceSchema.parse({
      title: 'Court closed',
      startDate: '2026-11-01',
      endDate: null,
      startTime: null,
      endTime: null,
    });

    expect(parsed.dateFrom).toBe('2026-11-01 00:00:00');
    expect(parsed.dateTo).toBe('2026-11-01 23:59:00');
  });

  it('accepts the exact frontend form payload with empty optional fields (regression)', () => {
    // Mirrors ResourceListPage.tsx maintenanceForm defaults/reset state.
    const frontendPayload = {
      title: 'Court closed',
      description: '',
      startDate: '2026-11-01',
      endDate: '',
      startTime: '',
      endTime: '',
      reason: '',
      status: 'scheduled',
    };

    const parsed = ResourceMaintenanceSchema.parse(frontendPayload);

    expect(parsed.reason).toBe('Court closed');
    expect(parsed.dateFrom).toBe('2026-11-01 00:00:00');
    expect(parsed.dateTo).toBe('2026-11-01 23:59:00');
    expect(parsed.status).toBe('scheduled');
    expect(parsed.isActive).toBe(1);
  });

  it.each([
    ['scheduled', 1],
    ['in_progress', 1],
    ['completed', 0],
    ['cancelled', 0],
  ])('maps status %s to is_active=%i', (status, expected) => {
    const parsed = ResourceMaintenanceSchema.parse({
      title: 'Court closed',
      startDate: '2026-11-01',
      status,
    });
    expect(parsed.isActive).toBe(expected);
  });

  it.each([
    ['2026-02-31'],
    ['2026-13-01'],
    ['01-02-2026'],
  ])('rejects invalid calendar date %s', (startDate) => {
    const result = ResourceMaintenanceSchema.safeParse({ title: 'X', startDate });
    expect(result.success).toBe(false);
  });

  it.each(['24:00', '9:00', '09:60', 'noon'])('rejects invalid time %s', (startTime) => {
    const result = ResourceMaintenanceSchema.safeParse({
      title: 'X',
      startDate: '2026-11-01',
      startTime,
    });
    expect(result.success).toBe(false);
  });

  it('still rejects a non-empty invalid endDate after empty-field normalisation', () => {
    const result = ResourceMaintenanceSchema.safeParse({
      title: 'X',
      startDate: '2026-11-01',
      endDate: '2026-02-31',
      startTime: '',
      endTime: '',
    });
    expect(result.success).toBe(false);
  });

  it('still rejects a non-empty invalid endTime after empty-field normalisation', () => {
    const result = ResourceMaintenanceSchema.safeParse({
      title: 'X',
      startDate: '2026-11-01',
      endDate: '',
      startTime: '',
      endTime: '24:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an end before the start', () => {
    const result = ResourceMaintenanceSchema.safeParse({
      title: 'X',
      startDate: '2026-11-01',
      startTime: '10:00',
      endDate: '2026-11-01',
      endTime: '09:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty merged reason', () => {
    const result = ResourceMaintenanceSchema.safeParse({
      title: '   ',
      description: '',
      reason: '',
      startDate: '2026-11-01',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a merged reason longer than 255 characters instead of truncating', () => {
    const result = ResourceMaintenanceSchema.safeParse({
      title: 'a'.repeat(256),
      startDate: '2026-11-01',
    });
    expect(result.success).toBe(false);
  });
});

describe('maintenance status derivation', () => {
  const from = '2026-11-01 09:00:00';
  const to = '2026-11-01 10:00:00';

  it.each([
    ['active before start', 1, '2026-11-01 08:00:00', 'scheduled'],
    ['active inside range', 1, '2026-11-01 09:30:00', 'in_progress'],
    ['active after range', 1, '2026-11-01 11:00:00', 'completed'],
    ['inactive before end', 0, '2026-11-01 09:30:00', 'cancelled'],
    ['inactive after end', 0, '2026-11-01 11:00:00', 'completed'],
  ])('%s', (_label, isActive, now, expected) => {
    expect(deriveMaintenanceStatus(isActive, from, to, now)).toBe(expected);
  });
});

describe('mapMaintenanceRow', () => {
  it('maps the real columns to the legacy response contract', () => {
    const mapped = mapMaintenanceRow({
      id: 4,
      resource_id: 9,
      reason: 'Court closed',
      start_date: '2026-11-01',
      start_time: '09:00',
      end_date: '2026-11-01',
      end_time: '10:00',
      date_from_value: '2026-11-01 09:00:00',
      date_to_value: '2026-11-01 10:00:00',
      now_value: '2026-11-01 09:30:00',
      is_active: 1,
      created_by: 7,
      created_at: '2026-10-29T00:00:00.000Z',
    });

    expect(mapped).toMatchObject({
      id: 4,
      resource_id: 9,
      title: 'Court closed',
      description: '',
      reason: '',
      start_date: '2026-11-01',
      start_time: '09:00',
      end_date: '2026-11-01',
      end_time: '10:00',
      status: 'in_progress',
      created_by: 7,
    });
  });
});

describe('resourceRepository maintenance SQL', () => {
  it('reads via the real maintenance columns and DATE_FORMAT aliases', async () => {
    mocks.execute.mockResolvedValue([[]]);

    await resourceRepository.getMaintenanceRecords(9);

    const sql = mocks.execute.mock.calls[0][0] as string;
    expect(sql).toContain('FROM resource_maintenance');
    expect(sql).toContain("DATE_FORMAT(date_from, '%Y-%m-%d')");
    expect(sql).toContain("DATE_FORMAT(date_to, '%H:%i')");
    expect(sql).not.toContain('start_date DESC');
    expect(sql).not.toMatch(/\btitle\b/);
  });

  it('inserts the real columns and the authenticated creator', async () => {
    mocks.execute.mockResolvedValue([{ insertId: 11 }]);

    const id = await resourceRepository.createMaintenance({
      resourceId: 9,
      reason: 'Court closed',
      dateFrom: '2026-11-01 00:00:00',
      dateTo: '2026-11-01 23:59:00',
      isActive: 1,
      createdBy: 7,
    });

    expect(id).toBe(11);
    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).toContain('(resource_id, reason, date_from, date_to, is_active, created_by)');
    expect(params).toEqual([9, 'Court closed', '2026-11-01 00:00:00', '2026-11-01 23:59:00', 1, 7]);
  });

  it('updates supported fields without touching created_by', async () => {
    mocks.execute.mockResolvedValue([{ affectedRows: 1 }]);

    await resourceRepository.updateMaintenance(11, {
      reason: 'Updated reason',
      dateFrom: '2026-11-02 00:00:00',
      dateTo: '2026-11-02 23:59:00',
      isActive: 0,
    });

    const [sql, params] = mocks.execute.mock.calls[0];
    expect(sql).not.toContain('created_by');
    expect(params).toEqual(['Updated reason', '2026-11-02 00:00:00', '2026-11-02 23:59:00', 0, 11]);
  });
});

describe('maintenance route authorization (static)', () => {
  it('keeps every maintenance route behind adminGuard', () => {
    const source = readFileSync(
      new URL('../presentation/organisation.routes.ts', import.meta.url),
      'utf8',
    );
    const maintenanceRoutes = source
      .split('\n')
      .filter((line) => line.includes('/maintenance'));

    expect(maintenanceRoutes.length).toBe(4);
    for (const line of maintenanceRoutes) {
      expect(line).toContain('adminGuard');
    }
  });
});

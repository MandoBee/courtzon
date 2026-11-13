// ============================================================================
// P0 — organization staff permission update payload validation.
// Pure schema tests: no service, DB or network.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { OrgStaffParamsSchema, UpdateStaffPermissionsSchema } from '../presentation/organisation.dto.js';

describe('UpdateStaffPermissionsSchema', () => {
  it('accepts a non-empty array of unique positive integers', () => {
    expect(UpdateStaffPermissionsSchema.parse({ permissionIds: [1, 2, 3] })).toEqual({
      permissionIds: [1, 2, 3],
    });
  });

  it.each([
    ['missing', {}],
    ['undefined', { permissionIds: undefined }],
    ['null', { permissionIds: null }],
    ['string', { permissionIds: '1,2' }],
    ['object', { permissionIds: { 1: true } }],
    ['empty', { permissionIds: [] }],
    ['zero', { permissionIds: [0] }],
    ['negative', { permissionIds: [-1] }],
    ['decimal', { permissionIds: [1.5] }],
    ['string id', { permissionIds: ['1'] }],
    ['NaN', { permissionIds: [Number.NaN] }],
    ['duplicate', { permissionIds: [1, 1] }],
    ['mixed valid/invalid', { permissionIds: [1, 0] }],
  ])('rejects %s', (_label, payload) => {
    expect(UpdateStaffPermissionsSchema.safeParse(payload).success).toBe(false);
  });
});

describe('OrgStaffParamsSchema', () => {
  it('coerces positive route ids', () => {
    expect(OrgStaffParamsSchema.parse({ orgId: '7', userId: '42' })).toEqual({
      orgId: 7,
      userId: 42,
    });
  });

  it.each([
    ['non-numeric org', { orgId: 'abc', userId: '42' }],
    ['zero org', { orgId: '0', userId: '42' }],
    ['negative user', { orgId: '7', userId: '-1' }],
    ['decimal user', { orgId: '7', userId: '1.5' }],
    ['missing user', { orgId: '7' }],
  ])('rejects %s', (_label, params) => {
    expect(OrgStaffParamsSchema.safeParse(params).success).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  ACCESS_MODEL_VALUES,
  BRANCH_ACCESS_TYPE_VALUES,
  isPublicClub,
  isMembershipClub,
  isValidAccessModel,
  resolveBranchAccessPolicy,
} from '../domain/organisation-access-model.js';
import {
  CreateOrganisationSchema,
  UpdateOrganisationSchema,
} from '../presentation/organisation.dto.js';

describe('G11.22 P0 — organisation access model', () => {
  it('exposes exactly the two supported access models', () => {
    expect(ACCESS_MODEL_VALUES).toEqual(['PUBLIC_CLUB', 'MEMBERSHIP_CLUB']);
  });

  it('exposes the existing branch access types unchanged', () => {
    expect(BRANCH_ACCESS_TYPE_VALUES).toEqual(['open', 'restricted', 'invite_only']);
  });

  it('isPublicClub / isMembershipClub classify correctly', () => {
    expect(isPublicClub('PUBLIC_CLUB')).toBe(true);
    expect(isPublicClub('MEMBERSHIP_CLUB')).toBe(false);
    expect(isPublicClub(null)).toBe(false);
    expect(isMembershipClub('MEMBERSHIP_CLUB')).toBe(true);
    expect(isMembershipClub('PUBLIC_CLUB')).toBe(false);
    expect(isMembershipClub(undefined)).toBe(false);
  });

  it('isValidAccessModel rejects unknown values', () => {
    expect(isValidAccessModel('PUBLIC_CLUB')).toBe(true);
    expect(isValidAccessModel('MEMBERSHIP_CLUB')).toBe(true);
    expect(isValidAccessModel('open')).toBe(false);
    expect(isValidAccessModel('')).toBe(false);
    expect(isValidAccessModel(undefined)).toBe(false);
  });

  describe('resolveBranchAccessPolicy', () => {
    it('PUBLIC_CLUB preserves current branch behaviour for every access_type', () => {
      expect(resolveBranchAccessPolicy('PUBLIC_CLUB', 'open')).toBe('public');
      expect(resolveBranchAccessPolicy('PUBLIC_CLUB', 'restricted')).toBe('restricted');
      expect(resolveBranchAccessPolicy('PUBLIC_CLUB', 'invite_only')).toBe('invite_only');
    });

    it('unknown/legacy organisation model falls back to PUBLIC_CLUB (open default)', () => {
      expect(resolveBranchAccessPolicy(null, 'open')).toBe('public');
      expect(resolveBranchAccessPolicy(undefined, 'restricted')).toBe('restricted');
    });

    it('MEMBERSHIP_CLUB gates otherwise-open branches as membership_required', () => {
      expect(resolveBranchAccessPolicy('MEMBERSHIP_CLUB', 'open')).toBe('membership_required');
    });

    it('MEMBERSHIP_CLUB keeps more restrictive branch types as-is', () => {
      expect(resolveBranchAccessPolicy('MEMBERSHIP_CLUB', 'restricted')).toBe('restricted');
      expect(resolveBranchAccessPolicy('MEMBERSHIP_CLUB', 'invite_only')).toBe('invite_only');
    });

    it('never silently flips an existing branch to members-only', () => {
      // PUBLIC_CLUB + open must stay fully public — the exact current
      // production read that users and bookings rely on.
      expect(resolveBranchAccessPolicy('PUBLIC_CLUB', 'open')).toBe('public');
    });
  });

  describe('DTO validation', () => {
    const base = {
      orgTypeId: 1,
      name: 'Test Club',
      slug: 'test-club',
      countryId: 1,
    };

    it('CreateOrganisationSchema accepts an explicit access model', () => {
      expect(CreateOrganisationSchema.parse({ ...base, accessModel: 'MEMBERSHIP_CLUB' }).accessModel).toBe('MEMBERSHIP_CLUB');
    });

    it('CreateOrganisationSchema defaults to PUBLIC_CLUB when omitted', () => {
      expect(CreateOrganisationSchema.parse(base).accessModel).toBe('PUBLIC_CLUB');
    });

    it('CreateOrganisationSchema rejects an invalid access model', () => {
      expect(() => CreateOrganisationSchema.parse({ ...base, accessModel: 'BOGUS' })).toThrow();
    });

    it('UpdateOrganisationSchema rejects an invalid access model', () => {
      expect(() => UpdateOrganisationSchema.parse({ accessModel: 'BOGUS' })).toThrow();
    });

    it('UpdateOrganisationSchema leaves accessModel undefined when omitted (no silent override)', () => {
      expect(UpdateOrganisationSchema.parse({ name: 'New Name' }).accessModel).toBeUndefined();
    });
  });
});
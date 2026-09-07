import { describe, it, expect } from 'vitest';
import { UpdateServiceLocationsSchema } from '../presentation/activities.dto.js';

/**
 * Service-location update validation.
 *
 * Business rule: a coach must explicitly select at least one branch where they
 * provide coaching services. Saving an empty selection is rejected server-side
 * so a coach can never be left (or silently become) non-bookable via the API.
 */
describe('UpdateServiceLocationsSchema', () => {
  it('accepts a non-empty list of branch ids', () => {
    const result = UpdateServiceLocationsSchema.safeParse({ branchIds: [1, 2, 3] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.branchIds).toEqual([1, 2, 3]);
  });

  it('accepts a single branch id', () => {
    const result = UpdateServiceLocationsSchema.safeParse({ branchIds: [7] });
    expect(result.success).toBe(true);
  });

  it('rejects an empty branchIds array (coach must serve at least one branch)', () => {
    const result = UpdateServiceLocationsSchema.safeParse({ branchIds: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues[0].path)).toContain('branchIds');
      expect(result.error.issues[0].message.toLowerCase()).toContain('required');
    }
  });

  it('rejects a missing branchIds payload', () => {
    const result = UpdateServiceLocationsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects negative and non-integer branch ids', () => {
    expect(UpdateServiceLocationsSchema.safeParse({ branchIds: [0] }).success).toBe(false);
    expect(UpdateServiceLocationsSchema.safeParse({ branchIds: [-1] }).success).toBe(false);
    expect(UpdateServiceLocationsSchema.safeParse({ branchIds: [1.5] }).success).toBe(false);
    expect(UpdateServiceLocationsSchema.safeParse({ branchIds: ['1'] }).success).toBe(false);
  });

  it('rejects branchIds above the 500 limit', () => {
    const many = Array.from({ length: 501 }, (_, i) => i + 1);
    expect(UpdateServiceLocationsSchema.safeParse({ branchIds: many }).success).toBe(false);
  });
});
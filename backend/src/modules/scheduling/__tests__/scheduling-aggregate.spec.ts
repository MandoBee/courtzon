import { describe, it, expect } from 'vitest';
import { isTimeSlotAvailable } from '../domain/scheduling-aggregate.js';

describe('Scheduling Aggregate', () => {
  const existing = [{ startTime: '09:00', endTime: '10:00' }, { startTime: '11:00', endTime: '12:00' }];

  it('allows slot when no overlap', () => {
    expect(isTimeSlotAvailable(existing, '10:00', '11:00')).toBe(true);
  });

  it('rejects slot when overlapping', () => {
    expect(isTimeSlotAvailable(existing, '09:30', '10:30')).toBe(false);
  });
});

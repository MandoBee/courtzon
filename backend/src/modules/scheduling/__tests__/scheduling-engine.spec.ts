import { describe, it, expect, vi } from 'vitest';
import { SchedulingEngine, type PricingFunction } from '../scheduling-engine.js';
import type { ResourceProvider, ResourceCapabilities, LocationInfo, TimeSlot, ActivityConfig, BookingRequest } from '../types.js';

function mockProvider(overrides: {
  type?: string;
  id?: number;
  available?: boolean;
  slots?: TimeSlot[];
  capabilities?: ResourceCapabilities;
  location?: LocationInfo | null;
}): ResourceProvider {
  return {
    resourceType: overrides.type ?? 'court',
    entityId: overrides.id ?? 1,
    getAvailableSlots: vi.fn().mockResolvedValue(overrides.slots ?? []),
    hasConflict: vi.fn().mockResolvedValue(false),
    getCapabilities: vi.fn().mockResolvedValue(overrides.capabilities ?? { sportIds: [] }),
    getLocation: vi.fn().mockResolvedValue(overrides.location ?? null),
    isAvailable: vi.fn().mockResolvedValue(overrides.available ?? true),
  } as unknown as ResourceProvider;
}

const COACH_SESSION_CONFIG: ActivityConfig = {
  activityType: 'coach_session',
  requiredResources: [
    { resourceType: 'coach' },
    { resourceType: 'court' },
  ],
  crossConstraints: [
    { type: 'sport_match', from: 'coach', to: 'court' },
    { type: 'location_match', from: 'coach', to: 'court' },
  ],
};

const baseRequest: BookingRequest = {
  activityType: 'coach_session',
  date: '2026-07-20',
  dayOfWeek: 1,
  durationMinutes: 60,
  constraints: {},
};

const flatPricing: PricingFunction = async () => 100;

describe('SchedulingEngine', () => {
  describe('search()', () => {
    it('returns empty when no providers are available', async () => {
      const engine = new SchedulingEngine();
      const coach = mockProvider({ type: 'coach', id: 10, available: false });
      const court = mockProvider({ type: 'court', id: 20, available: false });

      const result = await engine.search(baseRequest, [coach, court], COACH_SESSION_CONFIG, flatPricing);
      expect(result).toEqual([]);
    });

    it('returns empty when a provider has no slots', async () => {
      const engine = new SchedulingEngine();
      const coach = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '10:00' }],
        capabilities: { sportIds: [1] },
      });
      const court = mockProvider({
        type: 'court', id: 20,
        slots: [],
        capabilities: { sportIds: [1] },
      });

      const result = await engine.search(baseRequest, [coach, court], COACH_SESSION_CONFIG, flatPricing);
      expect(result).toEqual([]);
    });

    it('returns empty when no slot is long enough', async () => {
      const engine = new SchedulingEngine();
      const coach = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '09:30' }],
        capabilities: { sportIds: [1] },
      });
      const court = mockProvider({
        type: 'court', id: 20,
        slots: [{ startTime: '09:00', endTime: '09:30' }],
        capabilities: { sportIds: [1] },
      });

      const result = await engine.search(baseRequest, [coach, court], COACH_SESSION_CONFIG, flatPricing);
      expect(result).toEqual([]);
    });

    it('produces a valid candidate when both providers have matching slots', async () => {
      const engine = new SchedulingEngine();
      const coach = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1], hourlyRate: 200, currencyCode: 'EGP' },
        location: { branchId: 5 },
      });
      const court = mockProvider({
        type: 'court', id: 20,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
        location: { branchId: 5 },
      });

      const result = await engine.search(baseRequest, [coach, court], COACH_SESSION_CONFIG, flatPricing);
      expect(result.length).toBe(1);
      expect(result[0].activityType).toBe('coach_session');
      expect(result[0].date).toBe('2026-07-20');
      expect(result[0].startTime).toBe('09:00');
      expect(result[0].endTime).toBe('10:00');
      expect(result[0].resources.length).toBe(2);
      expect(result[0].totalPrice).toBe(200);
    });

    it('uses cartesian product for multiple coaches x multiple courts', async () => {
      const engine = new SchedulingEngine();
      const coach1 = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
      });
      const coach2 = mockProvider({
        type: 'coach', id: 11,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
      });
      const court1 = mockProvider({
        type: 'court', id: 20,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
      });
      const court2 = mockProvider({
        type: 'court', id: 21,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
      });

      const result = await engine.search(baseRequest, [coach1, coach2, court1, court2], COACH_SESSION_CONFIG, flatPricing);
      expect(result.length).toBe(1);
      expect(result[0].resources.length).toBe(4);
    });
  });

  describe('cross-validation — sport_match', () => {
    it('filters out mismatched sports', async () => {
      const engine = new SchedulingEngine();
      const coach = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
      });
      const court = mockProvider({
        type: 'court', id: 20,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [2] },
      });

      const result = await engine.search(baseRequest, [coach, court], COACH_SESSION_CONFIG, flatPricing);
      expect(result).toEqual([]);
    });

    it('passes when sports overlap', async () => {
      const engine = new SchedulingEngine();
      const coach = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1, 3] },
      });
      const court = mockProvider({
        type: 'court', id: 20,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [3, 4] },
      });

      const result = await engine.search(baseRequest, [coach, court], COACH_SESSION_CONFIG, flatPricing);
      expect(result.length).toBe(1);
    });

    it('passes when either has empty sportIds (wildcard)', async () => {
      const engine = new SchedulingEngine();
      const coach = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [] },
      });
      const court = mockProvider({
        type: 'court', id: 20,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [99] },
      });

      const result = await engine.search(baseRequest, [coach, court], COACH_SESSION_CONFIG, flatPricing);
      expect(result.length).toBe(1);
    });
  });

  describe('cross-validation — location_match', () => {
    it('filters out different branches', async () => {
      const engine = new SchedulingEngine();
      const coach = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
        location: { branchId: 1 },
      });
      const court = mockProvider({
        type: 'court', id: 20,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
        location: { branchId: 2 },
      });

      const result = await engine.search(baseRequest, [coach, court], COACH_SESSION_CONFIG, flatPricing);
      expect(result).toEqual([]);
    });

    it('passes when same branch', async () => {
      const engine = new SchedulingEngine();
      const coach = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
        location: { branchId: 5 },
      });
      const court = mockProvider({
        type: 'court', id: 20,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
        location: { branchId: 5 },
      });

      const result = await engine.search(baseRequest, [coach, court], COACH_SESSION_CONFIG, flatPricing);
      expect(result.length).toBe(1);
    });

    it('falls back to organisationId when branchId is absent', async () => {
      const engine = new SchedulingEngine();
      const coach = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
        location: { organisationId: 3 },
      });
      const court = mockProvider({
        type: 'court', id: 20,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
        location: { organisationId: 3 },
      });

      const result = await engine.search(baseRequest, [coach, court], COACH_SESSION_CONFIG, flatPricing);
      expect(result.length).toBe(1);
    });

    it('passes when either location is null (wildcard)', async () => {
      const engine = new SchedulingEngine();
      const coach = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
        location: null,
      });
      const court = mockProvider({
        type: 'court', id: 20,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
        location: { branchId: 99 },
      });

      const result = await engine.search(baseRequest, [coach, court], COACH_SESSION_CONFIG, flatPricing);
      expect(result.length).toBe(1);
    });
  });

  describe('pricing', () => {
    it('sums pricing from all providers', async () => {
      const engine = new SchedulingEngine();
      const coach = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
      });
      const court = mockProvider({
        type: 'court', id: 20,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
      });

      const pricingFn: PricingFunction = async (type) => type === 'coach' ? 200 : 50;

      const result = await engine.search(baseRequest, [coach, court], COACH_SESSION_CONFIG, pricingFn);
      expect(result.length).toBe(1);
      expect(result[0].totalPrice).toBe(250);
    });
  });

  describe('ranking', () => {
    it('sorts candidates by score descending (cheaper = higher score)', async () => {
      const engine = new SchedulingEngine();

      const coach1 = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
      });
      const court1 = mockProvider({
        type: 'court', id: 20,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
      });

      const coach2 = mockProvider({
        type: 'coach', id: 11,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
      });
      const court2 = mockProvider({
        type: 'court', id: 21,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1] },
      });

      const pricingFn: PricingFunction = async (type, id) => id === 10 ? 100 : 500;

      const result1 = await engine.search(baseRequest, [coach1, court1], COACH_SESSION_CONFIG, pricingFn);
      const result2 = await engine.search(baseRequest, [coach2, court2], COACH_SESSION_CONFIG, pricingFn);

      expect(result1.length).toBe(1);
      expect(result2.length).toBe(1);
      expect(result1[0].totalPrice).toBeLessThan(result2[0].totalPrice);
    });
  });

  describe('coach-only mode (single provider)', () => {
    it('returns single-resource candidates with no cross-validation', async () => {
      const engine = new SchedulingEngine();
      const coach = mockProvider({
        type: 'coach', id: 10,
        slots: [{ startTime: '09:00', endTime: '12:00' }],
        capabilities: { sportIds: [1], hourlyRate: 150, currencyCode: 'EGP' },
      });

      const singleConfig: ActivityConfig = {
        activityType: 'coach_session',
        requiredResources: [{ resourceType: 'coach' }],
        crossConstraints: [],
      };

      const result = await engine.search(baseRequest, [coach], singleConfig, flatPricing);
      expect(result.length).toBe(1);
      expect(result[0].resources.length).toBe(1);
    });
  });
});

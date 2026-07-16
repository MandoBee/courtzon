import { describe, it } from 'vitest';
import { SchedulingEngine, type PricingFunction } from '../scheduling-engine.js';
import type {
  ResourceProvider,
  ResourceCapabilities,
  LocationInfo,
  TimeSlot,
  ActivityConfig,
  BookingRequest,
} from '../types.js';

function createMockProvider(
  type: string,
  id: number,
  slots: TimeSlot[],
  sportIds: number[],
  branchId: number,
): ResourceProvider {
  return {
    resourceType: type,
    entityId: id,
    getAvailableSlots: async () => slots,
    hasConflict: async () => false,
    getCapabilities: async (): Promise<ResourceCapabilities> => ({ sportIds }),
    getLocation: async (): Promise<LocationInfo> => ({ branchId }),
    isAvailable: async () => true,
  };
}

const SESSION_CONFIG: ActivityConfig = {
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

const fixedPricing: PricingFunction = async () => 100;

const SLOT: TimeSlot = { startTime: '09:00', endTime: '12:00' };

function buildProviders(coachCount: number, courtCount: number): ResourceProvider[] {
  const providers: ResourceProvider[] = [];
  for (let i = 0; i < coachCount; i++) {
    providers.push(createMockProvider('coach', i + 1, [SLOT], [1], 1));
  }
  for (let i = 0; i < courtCount; i++) {
    providers.push(createMockProvider('court', coachCount + i + 1, [SLOT], [1], 1));
  }
  return providers;
}

describe('SchedulingEngine performance', () => {
  const scenarios = [
    { label: '2 coaches × 1 court', coaches: 2, courts: 1 },
    { label: '10 coaches × 5 courts', coaches: 10, courts: 5 },
    { label: '50 coaches × 20 courts', coaches: 50, courts: 20 },
    { label: '100 coaches × 50 courts', coaches: 100, courts: 50 },
  ];

  for (const { label, coaches, courts } of scenarios) {
    it(label, async () => {
      const engine = new SchedulingEngine();
      const providers = buildProviders(coaches, courts);

      const start = performance.now();
      const candidates = await engine.search(baseRequest, providers, SESSION_CONFIG, fixedPricing);
      const elapsed = performance.now() - start;

      console.log(`[${label}] providers=${providers.length} candidates=${candidates.length} time=${elapsed.toFixed(2)}ms`);
    });
  }
});

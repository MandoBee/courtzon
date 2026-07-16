import type {
  ResourceProvider, ResourceSlot, BookingRequest, BookingCandidate,
  ActivityConfig, CrossConstraint, ResourceCapabilities, LocationInfo,
} from './types.js';
import { createModuleLogger } from '../../shared/utils/logger.js';

const log = createModuleLogger('scheduling');

export type PricingFunction = (resourceType: string, resourceId: number, startTime: string, endTime: string) => Promise<number>;

export class SchedulingEngine {
  async search(
    request: BookingRequest,
    providers: ResourceProvider[],
    config: ActivityConfig,
    pricingFn: PricingFunction,
  ): Promise<BookingCandidate[]> {
    log.debug({ date: request.date, durationMinutes: request.durationMinutes, providerCount: providers.length }, 'Engine search started');

    const available = await this.getAvailableSlots(request, providers);
    if (available.length === 0) {
      log.debug({ date: request.date }, 'No available slot combinations');
      return [];
    }
    log.debug({ combinations: available.length }, 'Slot combinations generated');

    const valid = await this.crossValidate(available, config.crossConstraints);
    if (valid.length === 0) {
      log.debug({ date: request.date }, 'No combinations passed cross-validation');
      return [];
    }
    log.debug({ validCombinations: valid.length }, 'Cross-validation passed');

    const priced = await this.price(valid, request, pricingFn);
    const ranked = this.rank(priced);
    log.debug({ candidates: ranked.length }, 'Search ranking complete');

    return ranked;
  }

  private async getAvailableSlots(
    request: BookingRequest,
    providers: ResourceProvider[],
  ): Promise<ResourceSlot[][]> {
    const providerSlots: ResourceSlot[][] = [];

    for (const provider of providers) {
      if (!(await provider.isAvailable())) continue;

      const slots = await provider.getAvailableSlots(request.date, request.dayOfWeek);
      const capabilities = await provider.getCapabilities();
      const location = await provider.getLocation();

      const fitting: ResourceSlot[] = [];
      for (const slot of slots) {
        if (this.timeToMinutes(slot.endTime) - this.timeToMinutes(slot.startTime) >= request.durationMinutes) {
          fitting.push({ resourceType: provider.resourceType, resourceId: provider.entityId, provider, slot, capabilities, location });
        }
      }

      providerSlots.push(fitting);
    }

    return this.cartesianProduct(providerSlots);
  }

  private async crossValidate(
    combinations: ResourceSlot[][],
    constraints: CrossConstraint[],
  ): Promise<ResourceSlot[][]> {
    const valid: ResourceSlot[][] = [];

    for (const combo of combinations) {
      let ok = true;

      for (const constraint of constraints) {
        if (!this.satisfiesConstraint(combo, constraint)) {
          ok = false;
          break;
        }
      }

      if (ok) valid.push(combo);
    }

    return valid;
  }

  private satisfiesConstraint(combo: ResourceSlot[], constraint: CrossConstraint): boolean {
    const from = combo.find(r => r.resourceType === constraint.from);
    const to = combo.find(r => r.resourceType === constraint.to);
    if (!from || !to) return false;

    switch (constraint.type) {
      case 'sport_match':
        return this.sportMatches(from.capabilities, to.capabilities);
      case 'location_match':
        return this.locationMatches(from.location, to.location);
      default:
        return true;
    }
  }

  private sportMatches(a: ResourceCapabilities, b: ResourceCapabilities): boolean {
    if (a.sportIds.length === 0 || b.sportIds.length === 0) return true;
    return a.sportIds.some(id => b.sportIds.includes(id));
  }

  private locationMatches(a: LocationInfo | null, b: LocationInfo | null): boolean {
    if (!a || !b) return true;
    if (a.branchId && b.branchId) return a.branchId === b.branchId;
    if (a.organisationId && b.organisationId) return a.organisationId === b.organisationId;
    return true;
  }

  private async price(
    combinations: ResourceSlot[][],
    request: BookingRequest,
    pricingFn: PricingFunction,
  ): Promise<BookingCandidate[]> {
    const candidates: BookingCandidate[] = [];

    for (const combo of combinations) {
      let totalPrice = 0;
      let currencyCode: string | undefined;

      for (const rs of combo) {
        const endTime = this.addTime(rs.slot.startTime, request.durationMinutes);
        const price = await pricingFn(rs.resourceType, rs.resourceId, rs.slot.startTime, endTime);
        totalPrice += price;

        if (rs.capabilities.currencyCode && !currencyCode) {
          currencyCode = rs.capabilities.currencyCode;
        }
      }

      const startTime = combo[0]?.slot.startTime || '';
      const endTime = this.addTime(startTime, request.durationMinutes);

      candidates.push({
        activityType: request.activityType,
        date: request.date,
        startTime,
        endTime,
        resources: combo,
        totalPrice,
        currencyCode,
        score: 0,
      });
    }

    return candidates;
  }

  private rank(candidates: BookingCandidate[]): BookingCandidate[] {
    for (const c of candidates) {
      c.score = this.calculateScore(c);
    }
    return candidates.sort((a, b) => b.score - a.score);
  }

  private calculateScore(candidate: BookingCandidate): number {
    let score = 100;

    for (const rs of candidate.resources) {
      if (rs.capabilities.hourlyRate) {
        score -= (rs.capabilities.hourlyRate / 100);
      }
    }

    if (candidate.totalPrice > 0) {
      score -= (candidate.totalPrice / 500) * 10;
    }

    return Math.max(0, score);
  }

  private cartesianProduct(arrays: ResourceSlot[][]): ResourceSlot[][] {
    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0].map(slot => [slot]);

    const result: ResourceSlot[][] = [];
    const first = arrays[0];
    const rest = this.cartesianProduct(arrays.slice(1));

    for (const item of first) {
      for (const combo of rest) {
        result.push([item, ...combo]);
      }
    }

    return result;
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private addTime(time: string, minutes: number): string {
    const total = this.timeToMinutes(time) + minutes;
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

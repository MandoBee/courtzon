import { pricingRepository } from '../infrastructure/repositories/pricing.repository.js';
import { calculatePrice } from '../domain/pricing-engine.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import type { PriceRequest, PriceResult } from '../domain/pricing-aggregate.js';

export class PricingService {
  async previewPrice(request: PriceRequest): Promise<PriceResult> {
    const basePrice = request.endTime && request.startTime
      ? await this.calculateDurationPrice(request.resourceId, request.date, request.startTime, request.endTime)
      : await pricingRepository.getResourceBasePrice(request.resourceId);

    const [rules, seasons] = await Promise.all([
      pricingRepository.findRules({ resourceId: request.resourceId }),
      pricingRepository.findSeasons(),
    ]);

    const result = calculatePrice(basePrice, rules, seasons, [], request);

    eventBusV2.emit('price.calculated', {
      resourceId: request.resourceId,
      basePrice: result.basePrice,
      finalPrice: result.finalPrice,
    } as Record<string, unknown>, {
      aggregateType: 'pricing',
      aggregateId: String(request.resourceId),
      aggregateVersion: 1,
    });

    return result;
  }

  private async calculateDurationPrice(resourceId: number, _date: string, startTime: string, endTime: string): Promise<number> {
    const hourlyRate = await pricingRepository.getResourceBasePrice(resourceId);
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const durationHours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    return hourlyRate * Math.max(0, durationHours);
  }
}

export const pricingService = new PricingService();

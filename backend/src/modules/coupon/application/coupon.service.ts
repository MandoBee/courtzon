import { couponRepository } from '../infrastructure/coupon.repository.js';
import { couponAssignmentRepository } from '../infrastructure/coupon-assignment.repository.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { eventBus } from '../../../shared/event-bus/index.js';

class CouponService {
  async listCoupons(page = 1, limit = 20, is_active?: boolean) {
    return couponRepository.findAll({ page, limit, is_active });
  }

  async getCoupon(id: number) {
    const coupon = await couponRepository.findById(id);
    if (!coupon) throw new NotFoundError('Coupon');
    return coupon;
  }

  async createCoupon(data: {
    code: string; discount_type: 'percentage' | 'fixed'; discount_value: number;
    activity_type?: string; sport_id?: number;
    min_order_amount?: number; max_uses?: number; max_uses_per_user?: number;
    starts_at?: string; expires_at?: string; is_active?: boolean;
    assignments?: { entity_type: string; entity_id: number }[];
  }) {
    const existing = await couponRepository.findByCode(data.code);
    if (existing) throw new Error('Coupon code already exists');

    const coupon = await couponRepository.create(data);

    if (data.assignments?.length) {
      await couponAssignmentRepository.upsert(coupon.id, data.assignments);
    }

    return { ...coupon, assignments: data.assignments || [] };
  }

  async updateCoupon(id: number, data: any) {
    const coupon = await couponRepository.findById(id);
    if (!coupon) throw new NotFoundError('Coupon');
    await couponRepository.update(id, data);

    if (data.assignments) {
      await couponAssignmentRepository.upsert(id, data.assignments);
    }

    return { id, ...data };
  }

  async deleteCoupon(id: number) {
    const coupon = await couponRepository.findById(id);
    if (!coupon) throw new NotFoundError('Coupon');
    await couponAssignmentRepository.deleteByCouponId(id);
    await couponRepository.delete(id);
    return { success: true };
  }

  async publishCoupon(id: number, publishedBy: number) {
    const coupon = await couponRepository.findById(id);
    if (!coupon) throw new NotFoundError('Coupon');

    // Mark as active
    await couponRepository.update(id, { is_active: true });

    // Get assigned entities to notify
    const assignments = await couponAssignmentRepository.findByCouponId(id);
    const orgIds = assignments.filter((a: any) => a.entity_type === 'organisation').map((a: any) => a.entity_id);

    eventBus.emit('coupon:published', {
      couponId: coupon.id,
      code: coupon.code,
      discountValue: coupon.discount_value,
      discountType: coupon.discount_type,
      organisationIds: orgIds,
    });

    return { success: true, message: 'Coupon published and notifications sent' };
  }
}

export const couponService = new CouponService();

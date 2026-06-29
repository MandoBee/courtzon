import { couponRepository } from '../infrastructure/coupon.repository.js';
import { couponAssignmentRepository } from '../infrastructure/coupon-assignment.repository.js';
import { notificationService } from '../../notifications/application/notification.service.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';

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

    // Batch fetch all org users and create notifications
    const orgIds = assignments.filter((a: any) => a.entity_type === 'organisation').map((a: any) => a.entity_id);
    if (orgIds.length) {
      const pool = (await import('../../../database/mysql.js')).getPool();
      const placeholders = orgIds.map(() => '?').join(',');
      const [users] = await pool.execute(
        `SELECT u.id, ou.organisation_id FROM users u
         JOIN organisation_users ou ON ou.user_id = u.id
         WHERE ou.organisation_id IN (${placeholders})
           AND ou.role IN ('admin', 'manager')
         GROUP BY u.id, ou.organisation_id`,
        orgIds,
      );
      // Batch create notifications
      const notifTitle = 'New Coupon Published';
      const notifBody = `Coupon "${coupon.code}" (${coupon.discount_value}${coupon.discount_type === 'percentage' ? '%' : '$'} off) is now available.`;
      for (const u of users as any[]) {
        await notificationService.createNotification({
          userId: u.id,
          title: notifTitle,
          body: notifBody,
          categorySlug: 'promotions',
          actionKey: 'view_coupon',
          actionPayload: { couponId: coupon.id, orgId: u.organisation_id },
        });
      }
    }

    return { success: true, message: 'Coupon published and notifications sent' };
  }
}

export const couponService = new CouponService();

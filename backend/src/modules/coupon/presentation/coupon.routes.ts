import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './coupon.controller.js';

export async function couponRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requirePermission(['financial.view']));

  app.get('/admin/coupons', ctrl.listCouponsHandler);
  app.get('/admin/coupons/:id', ctrl.getCouponHandler);
  app.post('/admin/coupons', { preHandler: [requirePermission(['financial.process_payouts'])] }, ctrl.createCouponHandler);
  app.put('/admin/coupons/:id', { preHandler: [requirePermission(['financial.process_payouts'])] }, ctrl.updateCouponHandler);
  app.delete('/admin/coupons/:id', { preHandler: [requirePermission(['financial.process_payouts'])] }, ctrl.deleteCouponHandler);
  app.post('/admin/coupons/:id/publish', { preHandler: [requirePermission(['financial.process_payouts'])] }, ctrl.publishCouponHandler);
}

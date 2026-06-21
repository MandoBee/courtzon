import type { FastifyRequest, FastifyReply } from 'fastify';
import { couponService } from '../application/coupon.service.js';
import { CouponSchema, CouponUpdateSchema, CouponQuerySchema } from './coupon.dto.js';

export async function listCouponsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = CouponQuerySchema.parse(request.query);
  const result = await couponService.listCoupons(query.page, query.limit, query.is_active);
  return reply.send(result);
}

export async function getCouponHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const result = await couponService.getCoupon(Number(id));
  return reply.send(result);
}

export async function createCouponHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CouponSchema.parse(request.body);
  const result = await couponService.createCoupon(body);
  return reply.status(201).send(result);
}

export async function updateCouponHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = CouponUpdateSchema.parse(request.body);
  const result = await couponService.updateCoupon(Number(id), body);
  return reply.send(result);
}

export async function deleteCouponHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await couponService.deleteCoupon(Number(id));
  return reply.status(204).send();
}

export async function publishCouponHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const userId = (request as any).userId;
  const result = await couponService.publishCoupon(Number(id), userId);
  return reply.send(result);
}

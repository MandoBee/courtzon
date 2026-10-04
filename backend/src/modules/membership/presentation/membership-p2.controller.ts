import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  ConfirmInstallmentP2Schema,
  RenewMembershipP2Schema,
  CancelMembershipP2Schema,
  RefundMembershipP2Schema,
} from './membership-p2.dto.js';
import { membershipInstallmentService } from '../application/membership-installment.service.js';
import { membershipRenewalService } from '../application/membership-renewal.service.js';
import { membershipCancelRefundService } from '../application/membership-cancel-refund.service.js';
import { membershipEligibilityService } from '../application/membership-eligibility.service.js';

function getUserId(request: FastifyRequest): number {
  return (request as any).userId;
}

function getOrgId(request: FastifyRequest): number {
  return parseInt(String((request.params as any).orgId), 10);
}

function getSubscriptionId(request: FastifyRequest): number {
  return parseInt(String((request.params as any).subscriptionId), 10);
}

function getInstallmentSeq(request: FastifyRequest): number {
  return parseInt(String((request.params as any).seq), 10);
}

// ── Installment payments (cash / card; first installments activate) ───────
export async function confirmInstallmentCashHandler(request: FastifyRequest, reply: FastifyReply) {
  ConfirmInstallmentP2Schema.parse(request.body ?? {});
  const orgId = getOrgId(request);
  const subId = getSubscriptionId(request);
  const seq = getInstallmentSeq(request);
  await membershipInstallmentService.confirmInstallmentCash(orgId, subId, seq, getUserId(request));
  return reply.send({ subscriptionId: subId, seq, status: 'paid' });
}

export async function completeInstallmentCardHandler(request: FastifyRequest, reply: FastifyReply) {
  ConfirmInstallmentP2Schema.parse(request.body ?? {});
  const orgId = getOrgId(request);
  const subId = getSubscriptionId(request);
  const seq = getInstallmentSeq(request);
  await membershipInstallmentService.completeInstallmentCard(orgId, subId, seq, getUserId(request));
  return reply.send({ subscriptionId: subId, seq, status: 'paid' });
}

// ── Renewal (new subscription; overdue/grace never blocks) ────────────────
export async function renewSubscriptionHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = RenewMembershipP2Schema.parse(request.body ?? {});
  const result = await membershipRenewalService.renewSubscription(
    getOrgId(request), getSubscriptionId(request), getUserId(request), body.paymentMethod,
  );
  return reply.send(result);
}

// ── Cancellation (lifecycle only — never auto-reverses revenue) ───────────
export async function cancelSubscriptionHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CancelMembershipP2Schema.parse(request.body ?? {});
  await membershipCancelRefundService.cancelSubscription(getOrgId(request), getSubscriptionId(request), getUserId(request), body.reason ?? undefined);
  return reply.send({ subscriptionId: getSubscriptionId(request), status: 'cancelled' });
}

// ── Refund (separate financial operation — only actual refunded amounts) ──
export async function refundInstallmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = RefundMembershipP2Schema.parse(request.body ?? {});
  const result = await membershipCancelRefundService.refundInstallments(
    getOrgId(request), getSubscriptionId(request), getUserId(request), body.installmentIds, body.reason ?? undefined,
  );
  return reply.send({ subscriptionId: getSubscriptionId(request), ...result });
}

// ── Eligibility FACTs (org-scoped) ────────────────────────────────────────
export async function getOrgEligibilityHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await membershipEligibilityService.getEligibility(getSubscriptionId(request), { orgId: getOrgId(request) });
  if (!result) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Membership subscription not found' });
  return reply.send(result);
}

// ── Eligibility FACTs (owning player) ─────────────────────────────────────
export async function getMyEligibilityHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await membershipEligibilityService.getEligibility(getSubscriptionId(request), { userId: getUserId(request) });
  if (!result) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Membership subscription not found' });
  return reply.send(result);
}
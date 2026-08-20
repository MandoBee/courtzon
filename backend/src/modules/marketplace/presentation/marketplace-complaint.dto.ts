import { z } from 'zod';
import { COMPLAINT_TYPES, MAX_IMAGES_PER_COMPLAINT } from '../domain/complaint-aggregate.js';

const reasonSchema = z.string().trim().min(3, 'A written reason of at least 3 characters is required');

export const CreateComplaintSchema = z.object({
  orderId: z.number().int().positive(),
  orderItemId: z.number().int().positive(),
  complaintType: z.enum(COMPLAINT_TYPES as [string, ...string[]]),
  reason: reasonSchema,
  images: z.array(z.string().url()).max(MAX_IMAGES_PER_COMPLAINT).optional(),
});

export const ResolveComplaintSchema = z.object({
  resolutionType: z.enum(['refund', 'replacement', 'reshipment', 'rejected']),
  needsReturn: z.boolean().optional(),
  refundAmount: z.number().nonnegative().optional(),
  refundReason: reasonSchema.optional(),
  rejectionReason: reasonSchema.optional(),
});

export const ComplaintQuerySchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const ApproveRefundSchema = z.object({
  reason: z.string().trim().optional(),
});

export const RejectComplaintSchema = z.object({
  reason: reasonSchema,
});

export const CollectReturnSchema = z.object({
  status: z.enum(['collected', 'inspected']),
});
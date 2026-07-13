import { z } from 'zod';

export const CreateEventSchema = z.object({
  organisationId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
  resourceId: z.number().int().positive().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  eventType: z.enum(['match', 'training', 'social', 'tournament', 'other']).optional().default('other'),
  startTime: z.string(),
  endTime: z.string(),
  maxParticipants: z.number().int().positive().optional(),
  isPublic: z.boolean().optional().default(true),
});

export const RsvpSchema = z.object({
  status: z.enum(['going', 'maybe', 'declined']),
});

export const SendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

export const CreateCampaignSchema = z.object({
  organisationId: z.number().int().positive().optional(),
  placementId: z.number().int().positive(),
  name: z.string().min(1).max(255),
  startDate: z.string(),
  endDate: z.string(),
  dailyBudget: z.number().min(0).optional(),
  totalBudget: z.number().min(0).optional(),
  currencyCode: z.string().length(3),
  status: z.enum(['draft', 'active']).optional().default('draft'),
  imageUrl: z.string().min(1),
  clickUrl: z.string().optional(),
  altText: z.string().optional(),
});

export const AuditQuerySchema = z.object({
  entityType: z.string().optional(),
  actorId: z.string().transform(Number).optional(),
  action: z.string().optional(),
  page: z.string().transform(Number).optional().default(1),
  limit: z.string().transform(Number).optional().default(50),
});

export const RevertSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const CreateGroupSchema = z.object({
  name: z.string().min(1).max(255),
  avatarUrl: z.string().optional(),
  inviteeIds: z.array(z.number().int().positive()).min(1),
});

export const InviteToGroupSchema = z.object({
  inviteeId: z.number().int().positive(),
});

export const RespondToInvitationSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
});

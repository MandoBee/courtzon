import { z } from 'zod';

export const BroadcastSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  type: z.enum(['info', 'success', 'warning', 'error', 'reminder']).optional().default('info'),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional().default('normal'),
  actionKey: z.string().optional(),
  routePattern: z.string().optional(),
  imageUrls: z.record(z.string(), z.string()).optional(),
  actions: z.array(z.object({
    label: z.string(),
    actionKey: z.string(),
    routePattern: z.string().optional(),
    icon: z.string().optional(),
    confirmMessage: z.string().optional(),
  })).optional(),
  target: z.object({
    scope: z.enum(['all', 'role', 'organisation', 'branch', 'users']),
    roleSlug: z.string().optional(),
    organisationId: z.number().int().positive().optional(),
    branchId: z.number().int().positive().optional(),
    userIds: z.array(z.number().int().positive()).optional(),
  }),
  scheduledAt: z.string().datetime().optional(),
});

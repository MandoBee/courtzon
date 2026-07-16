import { z } from 'zod';

export const CoachSearchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  dayOfWeek: z.number().int().min(1).max(7),
  durationMinutes: z.number().int().min(30).max(480),
  coachId: z.number().int().positive().optional(),
  resourceId: z.number().int().positive().optional(),
  sportId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
});

export type CoachSearchInput = z.infer<typeof CoachSearchSchema>;

export const BookSessionSchema = z.object({
  coachId: z.number().int().positive(),
  resourceId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
}).refine((data) => data.startTime < data.endTime, {
  message: 'Start time must be before end time',
  path: ['endTime'],
});

export type BookSessionInput = z.infer<typeof BookSessionSchema>;

export const CoachAvailabilitySchema = z.object({
  coachId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  dayOfWeek: z.number().int().min(1).max(7),
});

export type CoachAvailabilityInput = z.infer<typeof CoachAvailabilitySchema>;

import { z } from 'zod';

const MatchmakingSchema = z.object({
  minAge: z.number().int().positive().optional(),
  maxAge: z.number().int().positive().optional(),
  targetGender: z.enum(['male', 'female', 'any']).optional().default('any'),
  targetLevelId: z.number().int().positive().optional(),
  maxPlayers: z.number().int().positive().min(2).optional().default(2),
  deadline: z.string().datetime().optional(),
  autoApply: z.boolean().optional().default(false),
}).optional();

export const CreateBookingSchema = z.object({
  branchId: z.number().int().positive(),
  resourceId: z.number().int().positive(),
  bookingType: z.enum(['public_match', 'private_match', 'academy', 'clinic', 'coach_session']).optional().default('private_match'),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
  paymentMethod: z.enum(['cash', 'card', 'online', 'wallet', 'cod']).optional().default('wallet'),
  returnUrl: z.string().optional(),
  notes: z.string().optional(),
  participants: z.array(z.object({
    phone: z.string().optional(),
  })).optional(),
  matchmaking: MatchmakingSchema,
}).refine((data) => {
  if (data.matchmaking?.deadline) {
    const bookingStart = new Date(`${data.bookingDate}T${data.startTime}`);
    const deadline = new Date(data.matchmaking.deadline);
    return deadline < bookingStart;
  }
  return true;
}, { message: 'Deadline must be before the booking start time', path: ['matchmaking.deadline'] });

export const StartMatchmakingSchema = z.object({
  minAge: z.number().int().positive().optional(),
  maxAge: z.number().int().positive().optional(),
  targetGender: z.enum(['male', 'female', 'any']).optional().default('any'),
  targetLevelId: z.number().int().positive().optional(),
  maxPlayers: z.number().int().positive().min(2).optional().default(2),
  deadline: z.string().datetime().optional(),
  autoApply: z.boolean().optional().default(false),
});

export const CancelBookingSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const AvailabilityQuerySchema = z.object({
  resourceId: z.string().transform(Number),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const BookingsQuerySchema = z.object({
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.string().transform(Number).optional().default(1),
  limit: z.string().transform(Number).optional().default(20),
  sortBy: z.enum(['date', 'nearest']).optional(),
  lat: z.string().transform(Number).optional(),
  lng: z.string().transform(Number).optional(),
});

export const MatchesQuerySchema = z.object({
  lat: z.string().transform(Number).optional(),
  lng: z.string().transform(Number).optional(),
  date: z.string().optional(),
});

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

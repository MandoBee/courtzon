import { z } from 'zod';

const MatchmakingSchema = z.object({
  minAge: z.number().int().positive().optional(),
  maxAge: z.number().int().positive().optional(),
  targetGender: z.enum(['male', 'female', 'any']).optional().default('any'),
  targetLevelId: z.number().int().positive().optional(),
  // maxPlayers = number of ADDITIONAL players to accept, EXCLUDING the creator
  // (e.g. 3 => creator + 3 accepted = 4 total). Consistent with the capacity
  // checks (accepted players are invitations/joiners, never the host).
  maxPlayers: z.number().int().positive().min(1).max(49).optional().default(2),
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
  // PHASE 1 (temporary) — wallet is not an active booking payment method.
  // Active methods: card/online (gateway) + cash/COD (offline). Wallet remains
  // the refund destination and value store; historical wallet bookings stay valid.
  paymentMethod: z.enum(['cash', 'card', 'online', 'cod']).optional().default('card'),
  // Coach session bookings (booking_type='coach_session') must reference a valid
  // coach. The coach fee is NEVER client-supplied — it is resolved server-side
  // (canonical pricing) and validated against the canonical coach-eligibility
  // rules. A client-supplied coachAmount is rejected by the schema.
  coachId: z.number().int().positive().optional(),
  returnUrl: z.string().optional(),
  notes: z.string().optional(),
  participants: z.array(z.object({
    phone: z.string().optional(),
  })).optional(),
  // NOTE: the "deadline must be before booking start" cross-field rule is NOT
  // enforced here. Reconstructing the booking start with
  // `new Date(\`${bookingDate}T${startTime}\`)` parses in the server/container
  // timezone, which is wrong for non-UTC branches (e.g. Africa/Cairo). The
  // authoritative check runs in the service layer against the branch-timezone
  // `start_at_utc` computed by TimeEngine.localToUtc(). This schema validates
  // shape/type only.
  matchmaking: MatchmakingSchema,
});

export const StartMatchmakingSchema = z.object({
  minAge: z.number().int().positive().optional(),
  maxAge: z.number().int().positive().optional(),
  targetGender: z.enum(['male', 'female', 'any']).optional().default('any'),
  targetLevelId: z.number().int().positive().optional(),
  // maxPlayers = ADDITIONAL players (excluding creator); 3 => 4 total.
  maxPlayers: z.number().int().positive().min(1).max(49).optional().default(2),
  deadline: z.string().datetime().optional(),
  autoApply: z.boolean().optional().default(false),
});

export const PrepareBookingSchema = z.object({
  branchId: z.number().int().positive(),
  resourceId: z.number().int().positive(),
  bookingType: z.enum(['public_match', 'private_match', 'academy', 'clinic', 'coach_session']).optional().default('private_match'),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
  paymentMethod: z.enum(['card', 'online']).default('card'),
  returnUrl: z.string().optional(),
  notes: z.string().optional(),
  participants: z.array(z.object({
    phone: z.string().optional(),
  })).optional(),
  matchmaking: MatchmakingSchema,
});

export const ConfirmBookingSchema = z.object({
  prepareId: z.string().min(1),
  paymentId: z.number().optional(),
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
export type PrepareBookingInput = z.infer<typeof PrepareBookingSchema>;
export type ConfirmBookingInput = z.infer<typeof ConfirmBookingSchema>;

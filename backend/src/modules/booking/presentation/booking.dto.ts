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

// ── R2 — Canonical recurring booking core ────────────────────────────────
// Weekly recurrence: one or more weekdays (1=Mon .. 7=Sun), a branch-local
// date range (inclusive), and branch-local start/end times. The branch timezone
// is resolved server-side from branches.timezone — never client-supplied.

// ── R2/R3 — Canonical recurring booking core ─────────────────────────────
// Weekly recurrence: one or more weekdays (1=Mon .. 7=Sun), a branch-local
// date range (inclusive), and branch-local start/end times. The branch timezone
// is resolved server-side from branches.timezone — never client-supplied.

const recurringBase = z.object({
  branchId: z.number().int().positive(),
  resourceId: z.number().int().positive(),
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
});

function withRecurringRefinements<T extends z.ZodTypeAny>(schema: T): T {
  return schema
    .refine((d: any) => d.endDate >= d.startDate, { message: 'endDate must be on or after startDate', path: ['endDate'] })
    .refine((d: any) => d.endTime !== d.startTime, { message: 'startTime and endTime must differ', path: ['endTime'] }) as T;
}

export const RecurringSeriesSchema = withRecurringRefinements(
  recurringBase.extend({ idempotencyKey: z.string().min(8).max(64).optional() }),
);
export type RecurringSeriesInput = z.infer<typeof RecurringSeriesSchema>;

/** Side-effect-free preview definition (no idempotency key). */
export const RecurringPreviewSchema = withRecurringRefinements(recurringBase);
export type RecurringPreviewInput = z.infer<typeof RecurringPreviewSchema>;

// ── R3 — conflict resolution plan ─────────────────────────────────────────
// The admin's per-occurrence decision. An occurrence with no resolution keeps
// its requested court/time. `skip` cancels one occurrence (no booking row is
// created for it). `book` with courtId/time moves to the chosen alternative
// (courts first; same-day alternative times only when no court is available).

export const RecurringResolutionSchema = z.object({
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  action: z.enum(['book', 'skip']),
  courtId: z.number().int().positive().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export const RecurringCreateSchema = withRecurringRefinements(
  recurringBase.extend({
    playerUserId: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(64).optional(),
    resolutions: z.array(RecurringResolutionSchema).max(370).optional().default([]),
  }),
);

export type RecurringCreateInput = z.infer<typeof RecurringCreateSchema>;
export type RecurrenceResolution = z.infer<typeof RecurringResolutionSchema>;

export const RecurringSeriesQuerySchema = z.object({
  organisationId: z.string().transform(Number).optional(),
  branchId: z.string().transform(Number).optional(),
});

export type RecurringSeriesQueryInput = z.infer<typeof RecurringSeriesQuerySchema>;

/**
 * R5-B — card payment initiation for ONE recurring series.
 *
 * DELIBERATELY has no `amount`, `playerUserId`, `referenceId`, `currency` or
 * `paymentMethod` field. The client may only supply an optional return URL; the
 * total, payment owner, series reference, currency and gateway amount are all
 * resolved server-side from persisted rows. `.strict()` makes an attempt to send
 * a client-controlled amount fail loudly rather than being silently ignored.
 */
export const RecurringPaymentSchema = z.object({
  returnUrl: z.string().url().max(2048).optional(),
}).strict();

export type RecurringPaymentInput = z.infer<typeof RecurringPaymentSchema>;

export const RecurringPlayerSearchSchema = z.object({
  search: z.string().min(1).max(80).optional().default(''),
  limit: z.string().transform(Number).optional().default(20),
});

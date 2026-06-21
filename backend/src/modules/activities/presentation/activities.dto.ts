import { z } from 'zod';

export const CreateTournamentSchema = z.object({
  organisationId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
  bracketTypeId: z.number().int().positive(),
  sportId: z.number().int().positive().optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  maxParticipants: z.number().int().positive(),
  minParticipants: z.number().int().positive().optional().default(2),
  entryFee: z.number().min(0).optional().default(0),
  currencyCode: z.string().length(3),
  prizeDescription: z.string().optional(),
  registrationOpens: z.string().optional(),
  registrationCloses: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  rules: z.string().optional(),
  imageUrl: z.string().optional(),
});

export const RegisterTournamentSchema = z.object({
  playerId: z.number().int().positive(),
});

export const MatchScoreSchema = z.object({
  winnerId: z.number().int().positive(),
  scoreSummary: z.string().optional(),
  sets: z.array(z.object({ setNumber: z.number().int().positive(), player1Score: z.string(), player2Score: z.string() })).optional(),
});

export const CreateAcademySchema = z.object({
  organisationId: z.number().int().positive(),
  branchId: z.number().int().positive().optional(),
  sportId: z.number().int().positive().optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
});

export const CreateCurriculumSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  levelRequired: z.number().int().positive().optional(),
  durationWeeks: z.number().int().positive().optional(),
  price: z.number().min(0).optional().default(0),
  currencyCode: z.string().length(3),
});

export const EnrollPlayerSchema = z.object({
  playerId: z.number().int().positive(),
  curriculumId: z.number().int().positive().optional(),
});

export const CreateAcademySessionSchema = z.object({
  curriculumId: z.number().int().positive().optional(),
  coachId: z.number().int().positive().optional(),
  resourceId: z.number().int().positive().optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
  maxParticipants: z.number().int().positive().optional().default(1),
});

export const MarkAttendanceSchema = z.object({
  playerId: z.number().int().positive(),
  status: z.enum(['present', 'absent', 'excused']),
});

export const CreateEvaluationSchema = z.object({
  playerId: z.number().int().positive(),
  skillScores: z.record(z.string(), z.number()),
  overallScore: z.number().optional(),
  notes: z.string().optional(),
  recommendedLevelId: z.number().int().positive().optional(),
});

export const CreateCoachProfileSchema = z.object({
  bio: z.string().optional(),
  experienceYears: z.number().int().positive().optional(),
  certifications: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
  sports: z.array(z.number().int().positive()).optional(),
  hourlyRate: z.number().min(0).optional(),
  currencyCode: z.string().length(3).optional(),
  isAvailable: z.boolean().optional(),
  sessionDurations: z.array(z.number().int().positive()).optional(),
});

export const UpsertOrgAgreementSchema = z.object({
  organisationId: z.number().int().positive(),
  coachSplitPct: z.number().min(0).max(100),
  orgSplitPct: z.number().min(0).max(100),
  isActive: z.boolean().optional(),
});

export const RespondOrgInviteSchema = z.object({
  accept: z.boolean(),
});

export const CreateCoachSessionSchema = z.object({
  organisationId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
  resourceId: z.number().int().positive().optional(),
  playerId: z.number().int().positive(),
  startTime: z.string(),
  endTime: z.string(),
  price: z.number().min(0),
  currencyCode: z.string().length(3),
});

export const CreateCoachReviewSchema = z.object({
  sessionId: z.number().int().positive().optional(),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().optional(),
});

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const SetCoachAvailabilitySchema = z.object({
  slots: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(TIME_RE, 'Expected HH:mm'),
        endTime: z.string().regex(TIME_RE, 'Expected HH:mm'),
      })
    )
    .max(100),
});

export const AddCoachBlackoutSchema = z.object({
  date: z.string().regex(DATE_RE, 'Expected YYYY-MM-DD'),
  reason: z.string().max(255).optional(),
});

export const BookCourtSchema = z.object({
  resourceId: z.number().int().positive(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export const DeclineSessionSchema = z.object({
  reason: z.string().max(500).optional(),
});

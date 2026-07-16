import { z } from 'zod';
import { localPhoneNumberSchema } from '../../../shared/validation/local-phone.js';
import { normalizeOptionalWebsiteUrl } from '../../../shared/validation/website-url.js';

export const RegisterSchema = z.object({
  countryId: z.number().int().positive(),
  countryCode: z.string().regex(/^\+\d+$/, 'Must start with +').optional(),
  phoneNumber: z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\D/g, '').slice(0, 11) : v),
    localPhoneNumberSchema,
  ),
  password: z.string().min(6).max(128),
  fullName: z.string().min(2).max(150).trim(),
  email: z.string().email().max(255),
  gender: z.enum(['male', 'female']),
  birthDate: z.preprocess(
    (v) => (typeof v === 'string' && !v.trim() ? undefined : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format').optional(),
  ),
  mainSportId: z.number().int().positive().optional(),
  mainLevelId: z.number().int().positive().optional(),
  timezone: z.string().max(50).optional().default('UTC'),
  darkMode: z.enum(['light', 'dark', 'system']).optional().default('system'),
  languageId: z.number().int().positive().optional(),
});

export const LoginSchema = z.object({
  phoneNumber: localPhoneNumberSchema,
  password: z.string().min(1, 'Password is required'),
  countryCode: z.string().optional(),
  deviceFingerprint: z.string().optional(),
  deviceName: z.string().optional(),
  deviceType: z.enum(['mobile', 'tablet', 'desktop', 'other']).optional(),
  os: z.string().optional(),
  browser: z.string().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  rememberMe: z.boolean().optional().default(false),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const UpdateProfileSchema = z.object({
  fullName: z.string().min(2).max(150).trim().optional(),
  email: z.string().email().max(255).optional(),
  gender: z.enum(['male', 'female']).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format').nullable().optional(),
  timezone: z.string().max(50).optional(),
  darkMode: z.enum(['light', 'dark', 'system']).optional(),
  languageId: z.number().int().positive().nullable().optional(),
  avatarUrl: z.string().max(5_000_000).nullable().optional(),
  mainSportId: z.number().int().positive().nullable().optional(),
  mainLevelId: z.number().int().positive().nullable().optional(),
  interestedSportIds: z.array(z.number().int().positive()).optional(),
  isPublic: z.boolean().optional(),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6).max(128),
});

export const LogoutSchema = z.object({
  refreshToken: z.string().optional(),
  allDevices: z.boolean().optional().default(false),
});

export const CheckUniquenessSchema = z.object({
  phoneNumber: localPhoneNumberSchema,
  countryCode: z.string().optional(),
  countryId: z.number().int().positive(),
  email: z.string().email(),
});

export const RequestReactivationSchema = z.object({
  phoneNumber: z.string().min(1),
  email: z.string().email(),
  countryId: z.number().int().positive().optional(),
});

/**
 * Temporary password reset — to be replaced with email-token flow.
 * TODO: Replace with email verification flow when email service is enabled.
 */
export const TemporaryResetVerifySchema = z.object({
  email: z.string().email(),
});

export const TemporaryResetSchema = z.object({
  email: z.string().email(),
  newPassword: z.string().min(6).max(128),
  confirmPassword: z.string().min(6).max(128),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type TemporaryResetVerifyInput = z.infer<typeof TemporaryResetVerifySchema>;
export type TemporaryResetInput = z.infer<typeof TemporaryResetSchema>;

export type CheckUniquenessInput = z.infer<typeof CheckUniquenessSchema>;

export const PlayerRegisterSchema = RegisterSchema.extend({
  mainSportId: z.number().int().positive().optional(),
  mainLevelId: z.number().int().positive().optional(),
  interestedSportIds: z.array(z.number().int().positive()).optional(),
});

export const SellerRegisterSchema = RegisterSchema.extend({
  shopName: z.string().min(1).max(200).trim(),
  paymentMethod: z.string().min(1).refine(
    (slug) => slug.trim().toLowerCase() !== 'wallet',
    { message: 'CourtZon Wallet is not available during registration' },
  ),
  planId: z.number().int().positive().optional(),
  billingCycle: z.enum(['monthly', 'yearly']).optional().default('monthly'),
});

const optionalUrlOrEmpty = z.preprocess(
  normalizeOptionalWebsiteUrl,
  z.union([z.literal(''), z.string().url('Enter a valid URL (https://...)')]),
);

const optionalEmailOrEmpty = z.preprocess(
  (v) => (typeof v === 'string' && !v.trim() ? undefined : v),
  z.string().email().max(255).optional(),
);

export const OrganizationRegisterSchema = RegisterSchema.extend({
  planId: z.number().int().positive(),
  billingCycle: z.enum(['monthly', 'yearly']).optional().default('monthly'),
  orgName: z.string().min(2).max(200).trim(),
  orgWebsite: optionalUrlOrEmpty.optional().default(''),
  orgTypeId: z.number().int().positive(),
  orgEmail: optionalEmailOrEmpty,
  orgDocuments: z.array(z.string()).optional().default([]),
  paymentMethod: z.string().min(1).refine(
    (slug) => slug.trim().toLowerCase() !== 'wallet',
    { message: 'CourtZon Wallet is not available during registration' },
  ),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type PlayerRegisterInput = z.infer<typeof PlayerRegisterSchema>;
export type SellerRegisterInput = z.infer<typeof SellerRegisterSchema>;
export type OrganizationRegisterInput = z.infer<typeof OrganizationRegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;
export type LogoutInput = z.infer<typeof LogoutSchema>;

export const AuthResponseSchema = z.object({
  user: z.object({
      id: z.number(),
      publicId: z.string(),
      fullName: z.string(),
      email: z.string(),
      phoneNumber: z.string(),
      fullPhone: z.string(),
      gender: z.string(),
      birthDate: z.string().nullable(),
      avatarUrl: z.string().nullable(),
      languageId: z.number().nullable(),
      timezone: z.string(),
      darkMode: z.enum(['light', 'dark', 'system']),
      isCoach: z.boolean(),
      coachStatus: z.string().optional(),
      isSeller: z.boolean(),
      mainSportId: z.number().nullable(),
      mainLevelId: z.number().nullable(),
      roles: z.array(z.string()).optional(),
  }),
  session: z.object({
    sessionToken: z.string(),
    refreshToken: z.string(),
    expiresAt: z.string(),
    refreshTokenExpiresAt: z.string().optional(),
    rememberMe: z.boolean().optional(),
  }),
  isApproved: z.boolean().optional(),
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

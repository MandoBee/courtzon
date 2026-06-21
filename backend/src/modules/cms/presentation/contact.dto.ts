import { z } from 'zod';

export const GENERAL_SUBJECTS = [
  { value: 'bookings', label: 'Bookings & Reservations' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'academies', label: 'Academies' },
  { value: 'tournaments', label: 'Tournaments' },
  { value: 'sports', label: 'Sports' },
  { value: 'partnership', label: 'Partnership / Business' },
  { value: 'billing', label: 'Billing & Payments' },
  { value: 'technical', label: 'Technical Support' },
] as const;

export const REFERRAL_SOURCES = [
  { value: 'google', label: 'Google Search' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'friend_family', label: 'Friend or Family' },
  { value: 'coach_trainer', label: 'Coach / Trainer' },
  { value: 'sports_club', label: 'Sports Club / Facility' },
  { value: 'app_store', label: 'App Store / Play Store' },
  { value: 'advertisement', label: 'Advertisement' },
  { value: 'event', label: 'Event / Tournament' },
  { value: 'other', label: 'Other' },
] as const;

export const ContactSubmitSchema = z.object({
  fullName: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(255),
  countryId: z.coerce.number().int().positive(),
  phone: z.string().trim().regex(/^\d{11}$/, 'Phone number must be exactly 11 digits (e.g. 01012345678)'),
  subject: z.string().trim().min(1).max(500),
  subjectOther: z.string().trim().max(255).optional().nullable(),
  message: z.string().trim().min(10).max(10000),
  referralSource: z.enum(REFERRAL_SOURCES.map((r) => r.value) as [string, ...string[]]),
  referralOther: z.string().trim().max(255).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.subject === 'other' && !data.subjectOther?.trim()) {
    ctx.addIssue({ code: 'custom', message: 'Please specify your subject', path: ['subjectOther'] });
  }
  if (data.referralSource === 'other' && !data.referralOther?.trim()) {
    ctx.addIssue({ code: 'custom', message: 'Please tell us how you heard about us', path: ['referralOther'] });
  }
});

export type ContactSubmitInput = z.infer<typeof ContactSubmitSchema>;

export const CONTACT_MAX_FILES = 5;
export const CONTACT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const CONTACT_ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;
export const CONTACT_ACCEPTED_LABEL =
  'JPEG, PNG, WebP, GIF, HEIC, or PDF (max 5 files, 5 MB each)';

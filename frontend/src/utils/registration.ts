import { normalizePhoneDigits } from './phone';
import { normalizeOptionalWebsiteUrl } from './website';

/** Wallet requires an existing member account — hide during signup. */
export const REGISTRATION_EXCLUDED_PAYMENT_SLUGS = new Set(['wallet']);

export function filterRegistrationPaymentMethods<T extends { slug: string; isActive?: boolean }>(
  methods: T[],
): T[] {
  return methods.filter(
    (m) => m.isActive !== false && !REGISTRATION_EXCLUDED_PAYMENT_SLUGS.has(m.slug.toLowerCase()),
  );
}

export function buildAuthRegisterPayload(form: {
  countryId: number;
  phoneNumber: string;
  fullName: string;
  email: string;
  password: string;
  gender: string;
  birthDate: string;
  orgWebsite?: string;
  orgEmail?: string;
  timezone?: string;
}) {
  const website = normalizeOptionalWebsiteUrl(form.orgWebsite || '');
  const orgEmail = (form.orgEmail || '').trim();
  const timezone = form.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    countryId: form.countryId,
    phoneNumber: normalizePhoneDigits(form.phoneNumber),
    fullName: form.fullName.trim(),
    email: form.email.trim(),
    password: form.password,
    gender: form.gender as 'male' | 'female',
    birthDate: form.birthDate,
    timezone,
    ...(website ? { orgWebsite: website } : { orgWebsite: '' as const }),
    ...(orgEmail ? { orgEmail } : {}),
  };
}

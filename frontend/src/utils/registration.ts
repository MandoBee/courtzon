import { normalizePhoneDigits } from './phone';
import { normalizeOptionalWebsiteUrl } from './website';

/** Wallet requires an existing member account — hide during signup. */
export const REGISTRATION_EXCLUDED_PAYMENT_SLUGS = new Set(['wallet']);

/** Seller registration: only card (auto-approve after online payment) and cash are offered. */
export const SELLER_REGISTRATION_PAYMENT_SLUGS = new Set(['card', 'cash']);

export function filterRegistrationPaymentMethods<T extends { slug: string; isActive?: boolean }>(
  methods: T[],
): T[] {
  return methods.filter(
    (m) => m.isActive !== false && !REGISTRATION_EXCLUDED_PAYMENT_SLUGS.has(m.slug.toLowerCase()),
  );
}

/** Keep only the seller registration payment methods (card + cash), card first. */
export function filterSellerRegistrationPaymentMethods<T extends { slug: string; isActive?: boolean }>(
  methods: T[],
): T[] {
  const allowed = methods.filter(
    (m) => m.isActive !== false && SELLER_REGISTRATION_PAYMENT_SLUGS.has(m.slug.toLowerCase()),
  );
  return allowed.sort((a, b) => {
    const pa = a.slug.toLowerCase() === 'card' ? 0 : 1;
    const pb = b.slug.toLowerCase() === 'card' ? 0 : 1;
    return pa - pb;
  });
}

/**
 * Mirrors the backend `organization-registration` context allowlist
 * (shared/constants/payment-methods.ts). The server already filters
 * `/public/payment-methods?context=organization-registration` — this client
 * guard only defends against an API that returns a broader list, and orders
 * card first because it is the default organization payment method.
 */
export const ORGANIZATION_REGISTRATION_PAYMENT_SLUGS = new Set(['card', 'cash']);

export const DEFAULT_ORGANIZATION_PAYMENT_METHOD = 'card';

export function filterOrganizationRegistrationPaymentMethods<T extends { slug: string; isActive?: boolean }>(
  methods: T[],
): T[] {
  const allowed = methods.filter(
    (m) => m.isActive !== false && ORGANIZATION_REGISTRATION_PAYMENT_SLUGS.has(m.slug.toLowerCase()),
  );
  return allowed.sort((a, b) => {
    const pa = a.slug.toLowerCase() === DEFAULT_ORGANIZATION_PAYMENT_METHOD ? 0 : 1;
    const pb = b.slug.toLowerCase() === DEFAULT_ORGANIZATION_PAYMENT_METHOD ? 0 : 1;
    return pa - pb;
  });
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

import { z } from 'zod';

/** Local mobile number length (e.g. Egyptian 01012345678). */
export const LOCAL_PHONE_LENGTH = 11;

export const PHONE_PLACEHOLDER = '010xxxxxxxx';

const LOCAL_PHONE_REGEX = /^\d{11}$/;

export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, LOCAL_PHONE_LENGTH);
}

export function isValidLocalPhone(value: string): boolean {
  return LOCAL_PHONE_REGEX.test(normalizePhoneDigits(value));
}

export function localPhoneZod(message: string) {
  return z
    .string()
    .min(1, message)
    .refine(isValidLocalPhone, { message });
}

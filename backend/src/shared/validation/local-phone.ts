import { z } from 'zod';

export const LOCAL_PHONE_LENGTH = 11;

const LOCAL_PHONE_REGEX = /^\d{11}$/;

export const localPhoneNumberSchema = z
  .string()
  .regex(LOCAL_PHONE_REGEX, 'Phone number must be exactly 11 digits (e.g. 01012345678)');

export function normalizeLocalPhoneDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, LOCAL_PHONE_LENGTH);
}

export function isValidLocalPhone(value: string): boolean {
  return LOCAL_PHONE_REGEX.test(normalizeLocalPhoneDigits(value));
}

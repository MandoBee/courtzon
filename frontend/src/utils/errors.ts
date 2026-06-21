import { isAxiosError } from 'axios';

type ZodIssue = { path?: (string | number)[]; message?: string };

/** Extract a user-facing message from API errors, Error, or unknown values. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (isAxiosError(err)) {
    const body = err.response?.data;
    if (body && typeof body === 'object') {
      const details = (body as { details?: ZodIssue[] }).details;
      if (Array.isArray(details) && details.length > 0) {
        const first = details[0];
        const field = first.path?.length ? `${String(first.path.join('.'))}: ` : '';
        if (first.message) return `${field}${first.message}`;
      }
      if ('message' in body) {
        const msg = (body as { message: unknown }).message;
        if (typeof msg === 'string' && msg.length > 0) return msg;
      }
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.length > 0) return err;
  return fallback;
}

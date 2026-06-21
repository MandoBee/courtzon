import { ZodError } from 'zod';

export function formatZodErrorDetails(error: ZodError): { path: (string | number)[]; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
    message: issue.message,
  }));
}

export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

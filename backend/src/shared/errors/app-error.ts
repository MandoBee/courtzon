import type { ErrorCode } from './error-codes.js';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly code?: ErrorCode;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, errorCode: string, options?: { code?: ErrorCode; details?: unknown }) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.code = options?.code;
    this.details = options?.details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code?: ErrorCode, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', { code, details });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', code?: ErrorCode) {
    super(message, 401, 'AUTHENTICATION_ERROR', { code });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied', code?: ErrorCode) {
    super(message, 403, 'FORBIDDEN', { code });
  }
}

export class NotFoundError extends AppError {
  constructor(entity = 'Resource', code?: ErrorCode) {
    super(`${entity} not found`, 404, 'NOT_FOUND', { code });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code?: ErrorCode, details?: unknown) {
    super(message, 409, 'CONFLICT', { code, details });
  }
}

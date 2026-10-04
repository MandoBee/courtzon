import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/app-error.js';

/** G11.22 P1 membership error helpers (consistent with the project AppError model). */
export function notFoundError(entity: string, _code?: string): NotFoundError {
  return new NotFoundError(entity);
}

export function conflictError(message: string): ConflictError {
  return new ConflictError(message);
}

export function validationError(message: string): ValidationError {
  return new ValidationError(message);
}
import { describe, it, expect } from 'vitest';
import { AppError, ValidationError, AuthenticationError, ForbiddenError, NotFoundError, ConflictError } from './app-error.js';

describe('AppError', () => {
  it('should set name, statusCode, errorCode, message', () => {
    const err = new AppError('test', 418, 'TEAPOT', { detail: 'x' });
    expect(err.name).toBe('AppError');
    expect(err.statusCode).toBe(418);
    expect(err.errorCode).toBe('TEAPOT');
    expect(err.message).toBe('test');
    expect(err.details).toEqual({ detail: 'x' });
  });
});

describe('ValidationError', () => {
  it('should have 400 status and VALIDATION_ERROR code', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('bad input');
  });

  it('should accept optional details', () => {
    const err = new ValidationError('bad', ['field']);
    expect(err.details).toEqual(['field']);
  });
});

describe('AuthenticationError', () => {
  it('should have 401 status', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.errorCode).toBe('AUTHENTICATION_ERROR');
  });

  it('should use custom message', () => {
    const err = new AuthenticationError('Login required');
    expect(err.message).toBe('Login required');
  });
});

describe('ForbiddenError', () => {
  it('should have 403 status', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.errorCode).toBe('FORBIDDEN');
  });
});

describe('NotFoundError', () => {
  it('should have 404 status', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.errorCode).toBe('NOT_FOUND');
    expect(err.message).toContain('not found');
  });

  it('should accept entity name', () => {
    const err = new NotFoundError('Booking');
    expect(err.message).toBe('Booking not found');
  });
});

describe('ConflictError', () => {
  it('should have 409 status', () => {
    const err = new ConflictError('already exists');
    expect(err.statusCode).toBe(409);
    expect(err.errorCode).toBe('CONFLICT');
  });
});

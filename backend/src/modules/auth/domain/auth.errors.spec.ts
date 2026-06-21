import { describe, it, expect } from 'vitest';
import {
  InvalidCredentialsError,
  PhoneAlreadyRegisteredError,
  EmailAlreadyRegisteredError,
  SessionExpiredError,
  InvalidRefreshTokenError,
} from './auth.errors.js';

describe('InvalidCredentialsError', () => {
  it('should have 401 status and INVALID_CREDENTIALS code', () => {
    const err = new InvalidCredentialsError();
    expect(err.statusCode).toBe(401);
    expect(err.errorCode).toBe('INVALID_CREDENTIALS');
    expect(err.message).toMatch(/phone number or password/i);
  });
});

describe('PhoneAlreadyRegisteredError', () => {
  it('should have 409 status', () => {
    const err = new PhoneAlreadyRegisteredError();
    expect(err.statusCode).toBe(409);
    expect(err.errorCode).toBe('PHONE_EXISTS');
  });
});

describe('EmailAlreadyRegisteredError', () => {
  it('should have 409 status', () => {
    const err = new EmailAlreadyRegisteredError();
    expect(err.statusCode).toBe(409);
    expect(err.errorCode).toBe('EMAIL_EXISTS');
  });
});

describe('SessionExpiredError', () => {
  it('should have 401 status', () => {
    const err = new SessionExpiredError();
    expect(err.statusCode).toBe(401);
    expect(err.errorCode).toBe('SESSION_EXPIRED');
  });
});

describe('InvalidRefreshTokenError', () => {
  it('should have 401 status', () => {
    const err = new InvalidRefreshTokenError();
    expect(err.statusCode).toBe(401);
    expect(err.errorCode).toBe('INVALID_REFRESH_TOKEN');
  });
});

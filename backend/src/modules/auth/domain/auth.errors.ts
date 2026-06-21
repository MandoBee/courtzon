import { AppError } from '../../../shared/errors/app-error.js';

export class InvalidCredentialsError extends AppError {
  constructor() {
    super('Invalid phone number or password', 401, 'INVALID_CREDENTIALS');
  }
}

export class PhoneAlreadyRegisteredError extends AppError {
  constructor() {
    super('This phone number is already registered', 409, 'PHONE_EXISTS');
  }
}

export class EmailAlreadyRegisteredError extends AppError {
  constructor() {
    super('This email is already registered', 409, 'EMAIL_EXISTS');
  }
}

export class SessionExpiredError extends AppError {
  constructor() {
    super('Session expired, please login again', 401, 'SESSION_EXPIRED');
  }
}

export class InvalidRefreshTokenError extends AppError {
  constructor() {
    super('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }
}

export class AccountNotActiveError extends AppError {
  constructor(status: string) {
    super(`Your account is ${status}. Please wait for admin approval.`, 403, 'ACCOUNT_NOT_ACTIVE', { status });
  }
}

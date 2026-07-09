export class PlatformError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown> | undefined;
  public readonly platform: string;
  public readonly httpStatus: number;

  constructor(opts: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    platform?: string;
    httpStatus?: number;
  }) {
    super(opts.message);
    this.name = 'PlatformError';
    this.code = opts.code;
    this.details = opts.details;
    this.platform = opts.platform ?? 'unknown';
    this.httpStatus = opts.httpStatus ?? 500;
  }
}

export class PlatformValidationError extends PlatformError {
  constructor(opts: {
    message: string;
    details?: Record<string, unknown>;
    platform?: string;
  }) {
    super({ ...opts, code: 'VALIDATION_ERROR', httpStatus: 400 });
    this.name = 'PlatformValidationError';
  }
}

export class PlatformPermissionError extends PlatformError {
  constructor(opts: {
    message: string;
    details?: Record<string, unknown>;
    platform?: string;
    code?: string;
  }) {
    super({ ...opts, code: opts.code ?? 'PERMISSION_DENIED', httpStatus: 403 });
    this.name = 'PlatformPermissionError';
  }
}

export class PlatformNotFoundError extends PlatformError {
  constructor(opts: {
    message: string;
    details?: Record<string, unknown>;
    platform?: string;
  }) {
    super({ ...opts, code: 'NOT_FOUND', httpStatus: 404 });
    this.name = 'PlatformNotFoundError';
  }
}

export class PlatformConflictError extends PlatformError {
  constructor(opts: {
    message: string;
    details?: Record<string, unknown>;
    platform?: string;
  }) {
    super({ ...opts, code: 'CONFLICT', httpStatus: 409 });
    this.name = 'PlatformConflictError';
  }
}

export class PlatformTenantIsolationError extends PlatformPermissionError {
  constructor(opts: {
    message: string;
    details?: Record<string, unknown>;
    platform?: string;
  }) {
    super({ ...opts, code: 'TENANT_ISOLATION_VIOLATION' });
    this.name = 'PlatformTenantIsolationError';
  }
}

export type ErrorDetail = { path: string; message: string };

export type ErrorBody = {
  error: { code: string; message: string; details?: ErrorDetail[]; request_id: string };
};

type AppErrorOptions = { details?: ErrorDetail[]; retryable?: boolean; cause?: unknown };

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details: ErrorDetail[] | undefined;
  readonly retryable: boolean;
  override readonly cause: unknown;

  constructor(code: string, httpStatus: number, message: string, opts: AppErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = opts.details;
    this.retryable = opts.retryable ?? false;
    this.cause = opts.cause;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid input', details?: ErrorDetail[]) {
    super('VALIDATION_FAILED', 400, message, { details });
  }
}
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHENTICATED', 401, message);
  }
}
export class MfaRequiredError extends AppError {
  constructor() {
    super('MFA_REQUIRED', 401, 'Second factor required');
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Not permitted') {
    super('FORBIDDEN', 403, message);
  }
}
export class NotFoundError extends AppError {
  constructor(entity = 'Resource') {
    super('NOT_FOUND', 404, `${entity} not found`);
  }
}
export class ConflictError extends AppError {
  constructor(message: string, details?: ErrorDetail[]) {
    super('CONFLICT', 409, message, { details });
  }
}
export class InvalidTransitionError extends AppError {
  constructor(from: string, to: string) {
    super('INVALID_TRANSITION', 422, `Cannot move from ${from} to ${to}`);
  }
}
export class RateLimitedError extends AppError {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super('RATE_LIMITED', 429, 'Too many requests');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
export class ExternalServiceError extends AppError {
  readonly service: string;
  constructor(service: string, message: string, opts: { retryable: boolean; cause?: unknown }) {
    super(
      opts.retryable ? 'EXTERNAL_SERVICE_UNAVAILABLE' : 'EXTERNAL_SERVICE_FAILED',
      opts.retryable ? 503 : 502,
      message,
      opts,
    );
    this.service = service;
  }
}
export class InternalError extends AppError {
  constructor(cause?: unknown) {
    super('INTERNAL_ERROR', 500, 'Something went wrong. Quote the request id when reporting this.', {
      cause,
    });
  }
}

const PG_UNIQUE = '23505';
const PG_FK = '23503';
const PG_CHECK = '23514';
const PG_SERIALIZATION = '40001';
const PG_STATEMENT_TIMEOUT = '57014';

type PgLikeError = Error & { code?: string; constraint?: string; column?: string };

/** Translate node-postgres errors into domain errors; returns undefined if not a pg error. */
export function fromPgError(err: unknown): AppError | undefined {
  if (!(err instanceof Error)) return undefined;
  const pg = err as PgLikeError;
  if (typeof pg.code !== 'string') return undefined;
  switch (pg.code) {
    case PG_UNIQUE:
      return new ConflictError(
        `Already exists (${pg.constraint ?? 'unique constraint'})`,
        pg.constraint ? [{ path: pg.constraint, message: 'must be unique' }] : undefined,
      );
    case PG_FK:
      return new ValidationError(`Referenced record does not exist (${pg.constraint ?? 'foreign key'})`);
    case PG_CHECK:
      return new ValidationError(`Value violates ${pg.constraint ?? 'a check constraint'}`);
    case PG_SERIALIZATION:
      return new ConflictError('Concurrent update; retry the request');
    case PG_STATEMENT_TIMEOUT:
      return new ExternalServiceError('database', 'Query timed out', { retryable: true, cause: err });
    default:
      return undefined;
  }
}

export function toErrorResponse(
  err: unknown,
  requestId: string,
): { status: number; body: ErrorBody; logLevel: 'warn' | 'error' } {
  const appError = err instanceof AppError ? err : (fromPgError(err) ?? new InternalError(err));
  const isServerFault = appError.httpStatus >= 500;
  return {
    status: appError.httpStatus,
    body: {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
        request_id: requestId,
      },
    },
    logLevel: isServerFault ? 'error' : 'warn',
  };
}

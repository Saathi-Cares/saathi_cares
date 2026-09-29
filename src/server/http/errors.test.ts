import { describe, expect, it } from 'vitest';
import { ConflictError, ExternalServiceError, ValidationError, fromPgError, toErrorResponse } from './errors';

describe('toErrorResponse', () => {
  it('maps a ValidationError to 400 with details', () => {
    const r = toErrorResponse(
      new ValidationError('Invalid input', [{ path: 'phone', message: 'Required' }]),
      'req-1',
    );
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
    expect(r.body.error.details).toEqual([{ path: 'phone', message: 'Required' }]);
    expect(r.body.error.request_id).toBe('req-1');
    expect(r.logLevel).toBe('warn');
  });

  it('maps unknown errors to 500 without leaking the message', () => {
    const r = toErrorResponse(new Error('SELECT * FROM secrets failed'), 'req-2');
    expect(r.status).toBe(500);
    expect(r.body.error.code).toBe('INTERNAL_ERROR');
    expect(r.body.error.message).not.toContain('secrets');
    expect(r.logLevel).toBe('error');
  });

  it('marks retryable external errors with 503 and Retry-After semantics', () => {
    const r = toErrorResponse(new ExternalServiceError('smtp', 'timeout', { retryable: true }), 'req-3');
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('EXTERNAL_SERVICE_UNAVAILABLE');
  });
});

describe('fromPgError', () => {
  it('translates a unique violation into a ConflictError naming the constraint', () => {
    const pgErr = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'users_email_key' });
    const mapped = fromPgError(pgErr);
    expect(mapped).toBeInstanceOf(ConflictError);
    expect(mapped?.message).toContain('users_email_key');
  });

  it('returns undefined for non-pg errors', () => {
    expect(fromPgError(new Error('x'))).toBeUndefined();
  });
});

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
    const err = new ExternalServiceError('smtp', 'timeout', { retryable: true });
    const r = toErrorResponse(err, 'req-3');
    expect(err.retryable).toBe(true);
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('EXTERNAL_SERVICE_UNAVAILABLE');
  });

  it('does not leak the internal message of an external service error', () => {
    const err = new ExternalServiceError('storage', 'Media root is not writable: /data/media', {
      retryable: true,
    });
    const r = toErrorResponse(err, 'req-4');
    expect(r.body.error.message).toBe('storage is temporarily unavailable; please retry');
    expect(r.body.error.message).not.toContain('/data/media');
    expect(err.message).toBe('Media root is not writable: /data/media');
  });

  it('gives a generic message for non-retryable external service errors', () => {
    const r = toErrorResponse(
      new ExternalServiceError('sms', 'provider said: bad key abc', { retryable: false }),
      'req-5',
    );
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('EXTERNAL_SERVICE_FAILED');
    expect(r.body.error.message).toBe('sms request failed');
  });
});

describe('fromPgError', () => {
  it('translates a unique violation into a ConflictError naming the constraint', () => {
    const pgErr = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'users_email_key' });
    const mapped = fromPgError(pgErr);
    expect(mapped).toBeInstanceOf(ConflictError);
    expect(mapped?.details?.[0]?.path).toBe('users_email_key');
    expect(mapped?.message).not.toContain('users_email_key');
  });

  it('keeps foreign key and check constraint names out of the message but in details', () => {
    const fk = fromPgError(Object.assign(new Error('fk'), { code: '23503', constraint: 'orders_user_fk' }));
    expect(fk).toBeInstanceOf(ValidationError);
    expect(fk?.message).toBe('Referenced record does not exist');
    expect(fk?.details?.[0]?.path).toBe('orders_user_fk');

    const check = fromPgError(Object.assign(new Error('chk'), { code: '23514', constraint: 'age_positive' }));
    expect(check).toBeInstanceOf(ValidationError);
    expect(check?.message).toBe('Value not allowed');
    expect(check?.details?.[0]?.path).toBe('age_positive');
  });

  it('returns undefined for non-pg errors', () => {
    expect(fromPgError(new Error('x'))).toBeUndefined();
  });
});

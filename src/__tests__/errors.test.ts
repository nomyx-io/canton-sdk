import {
  CantonError,
  LedgerApiError,
  HttpError,
  AuthError,
  ConnectionError,
} from '../errors.js';

describe('CantonError', () => {
  it('sets message and name', () => {
    const err = new CantonError('boom');
    expect(err.message).toBe('boom');
    expect(err.name).toBe('CantonError');
    expect(err).toBeInstanceOf(Error);
  });

  it('stores cause when provided', () => {
    const cause = new Error('root');
    const err = new CantonError('wrapped', cause);
    expect(err.cause).toBe(cause);
  });

  it('has undefined cause when not provided', () => {
    const err = new CantonError('no cause');
    expect(err.cause).toBeUndefined();
  });
});

describe('LedgerApiError', () => {
  it('is instanceof CantonError and Error', () => {
    const err = new LedgerApiError('bad request', '/v1/create', 400, ['missing field']);
    expect(err).toBeInstanceOf(CantonError);
    expect(err).toBeInstanceOf(Error);
  });

  it('stores path, ledgerStatus, and ledgerErrors', () => {
    const errors = ['err1', 'err2'];
    const err = new LedgerApiError('fail', '/v1/exercise', 422, errors);
    expect(err.path).toBe('/v1/exercise');
    expect(err.ledgerStatus).toBe(422);
    expect(err.ledgerErrors).toEqual(errors);
    expect(err.name).toBe('LedgerApiError');
  });

  it('chains cause', () => {
    const cause = new Error('underlying');
    const err = new LedgerApiError('fail', '/v1/query', 500, [], cause);
    expect(err.cause).toBe(cause);
  });
});

describe('HttpError', () => {
  it('is instanceof CantonError', () => {
    const err = new HttpError('non-json', 502, 'http://localhost:7575/v1/create');
    expect(err).toBeInstanceOf(CantonError);
  });

  it('stores httpStatus and url', () => {
    const err = new HttpError('bad gateway', 502, 'http://example.com/api');
    expect(err.httpStatus).toBe(502);
    expect(err.url).toBe('http://example.com/api');
    expect(err.name).toBe('HttpError');
  });

  it('chains cause', () => {
    const cause = new TypeError('parse error');
    const err = new HttpError('non-json', 200, 'http://example.com', cause);
    expect(err.cause).toBe(cause);
  });
});

describe('AuthError', () => {
  it('is instanceof CantonError', () => {
    const err = new AuthError('bad token');
    expect(err).toBeInstanceOf(CantonError);
  });

  it('stores cause', () => {
    const cause = new Error('expired');
    const err = new AuthError('token expired', cause);
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('AuthError');
  });
});

describe('ConnectionError', () => {
  it('is instanceof CantonError', () => {
    const err = new ConnectionError('unreachable');
    expect(err).toBeInstanceOf(CantonError);
  });

  it('stores cause', () => {
    const cause = new Error('ECONNREFUSED');
    const err = new ConnectionError('cannot connect', cause);
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('ConnectionError');
  });

  it('message and cause chaining works end to end', () => {
    const root = new Error('DNS failed');
    const conn = new ConnectionError('cannot reach server', root);
    const ledger = new LedgerApiError('operation failed', '/v1/create', 503, ['timeout'], conn);

    expect(ledger.message).toBe('operation failed');
    expect(ledger.cause).toBe(conn);
    expect((ledger.cause as ConnectionError).cause).toBe(root);
    expect((ledger.cause as ConnectionError).message).toBe('cannot reach server');
  });
});

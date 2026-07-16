import { SandboxAuth } from '../auth/sandbox.js';
import { OAuth2Auth } from '../auth/oauth2.js';
import { StaticAuth } from '../auth/static.js';
import { AuthError } from '../errors.js';

// ---------------------------------------------------------------------------
// SandboxAuth
// ---------------------------------------------------------------------------

describe('SandboxAuth', () => {
  it('produces a JWT-shaped string (three base64url segments)', () => {
    const auth = new SandboxAuth();
    const token = auth.getToken({ actAs: ['Alice'] });
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    // Each part must be non-empty base64url (letters, digits, -, _)
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
      expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('includes correct claims in the payload', () => {
    const auth = new SandboxAuth({ ledgerId: 'test-ledger', applicationId: 'my-app' });
    const token = auth.getToken({ actAs: ['Alice'], readAs: ['Bob'] });
    const payloadJson = Buffer.from(token.split('.')[1], 'base64url').toString();
    const payload = JSON.parse(payloadJson);
    const claims = payload['https://daml.com/ledger-api'];
    expect(claims.ledgerId).toBe('test-ledger');
    expect(claims.applicationId).toBe('my-app');
    expect(claims.actAs).toEqual(['Alice']);
    expect(claims.readAs).toEqual(['Bob']);
    expect(claims.admin).toBe(false);
  });

  it('sets admin claim when requested', () => {
    const auth = new SandboxAuth();
    const token = auth.getToken({ admin: true });
    const payloadJson = Buffer.from(token.split('.')[1], 'base64url').toString();
    const payload = JSON.parse(payloadJson);
    expect(payload['https://daml.com/ledger-api'].admin).toBe(true);
  });

  it('produces different tokens for different parties', () => {
    const auth = new SandboxAuth();
    const tokenAlice = auth.getToken({ actAs: ['Alice'] });
    const tokenBob = auth.getToken({ actAs: ['Bob'] });
    expect(tokenAlice).not.toBe(tokenBob);
  });

  it('returns cached token for same input', () => {
    const auth = new SandboxAuth();
    const first = auth.getToken({ actAs: ['Alice'] });
    const second = auth.getToken({ actAs: ['Alice'] });
    expect(first).toBe(second);
  });

  it('uses default secret and ledgerId', () => {
    const auth = new SandboxAuth();
    const token = auth.getToken({ actAs: [] });
    const payloadJson = Buffer.from(token.split('.')[1], 'base64url').toString();
    const payload = JSON.parse(payloadJson);
    const claims = payload['https://daml.com/ledger-api'];
    expect(claims.ledgerId).toBe('sandbox');
    expect(claims.applicationId).toBe('canton-sdk');
  });
});

// ---------------------------------------------------------------------------
// OAuth2Auth
// ---------------------------------------------------------------------------

describe('OAuth2Auth', () => {
  const VALID_CONFIG = {
    tokenUrl: 'https://auth.example.com/token',
    clientId: 'my-client',
    clientSecret: 'my-secret',
  };

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('throws AuthError if tokenUrl is missing', () => {
    expect(() => new OAuth2Auth({ tokenUrl: '', clientId: 'c', clientSecret: 's' }))
      .toThrow(AuthError);
  });

  it('throws AuthError if clientId is missing', () => {
    expect(() => new OAuth2Auth({ tokenUrl: 'http://x', clientId: '', clientSecret: 's' }))
      .toThrow(AuthError);
  });

  it('throws AuthError if clientSecret is missing', () => {
    expect(() => new OAuth2Auth({ tokenUrl: 'http://x', clientId: 'c', clientSecret: '' }))
      .toThrow(AuthError);
  });

  it('fetches a token from the token endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok123', expires_in: 3600 }),
    });

    const auth = new OAuth2Auth(VALID_CONFIG);
    const token = await auth.getToken({ actAs: ['Alice'] });

    expect(token).toBe('tok123');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://auth.example.com/token');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = new URLSearchParams(opts.body);
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe('my-client');
    expect(body.get('client_secret')).toBe('my-secret');
  });

  it('caches token and does not refetch within TTL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'cached-tok', expires_in: 3600 }),
    });

    const auth = new OAuth2Auth(VALID_CONFIG);
    const first = await auth.getToken({ actAs: ['Alice'] });
    const second = await auth.getToken({ actAs: ['Alice'] });

    expect(first).toBe('cached-tok');
    expect(second).toBe('cached-tok');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes token near expiry (within refreshBuffer)', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok-1', expires_in: 120 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok-2', expires_in: 3600 }),
      });

    const auth = new OAuth2Auth({ ...VALID_CONFIG, refreshBufferSeconds: 60 });

    const first = await auth.getToken({ actAs: ['Alice'] });
    expect(first).toBe('tok-1');

    // Advance time to 61 seconds later -- within the 60s refresh buffer of 120s expiry
    vi.advanceTimersByTime(61_000);

    const refreshed = await auth.getToken({ actAs: ['Alice'] });
    expect(refreshed).toBe('tok-2');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws AuthError on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    const auth = new OAuth2Auth(VALID_CONFIG);
    await expect(auth.getToken({ actAs: ['Alice'] })).rejects.toThrow(AuthError);
  });

  it('throws AuthError on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const auth = new OAuth2Auth(VALID_CONFIG);
    await expect(auth.getToken({ actAs: ['Alice'] })).rejects.toThrow(AuthError);
  });

  it('sends scope and audience when configured', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok', expires_in: 3600 }),
    });

    const auth = new OAuth2Auth({
      ...VALID_CONFIG,
      scope: 'daml_ledger_api',
      audience: 'https://ledger.example.com',
    });
    await auth.getToken({ actAs: ['Alice'] });

    const body = new URLSearchParams(mockFetch.mock.calls[0][1].body);
    expect(body.get('scope')).toBe('daml_ledger_api');
    expect(body.get('audience')).toBe('https://ledger.example.com');
  });
});

// ---------------------------------------------------------------------------
// StaticAuth
// ---------------------------------------------------------------------------

describe('StaticAuth', () => {
  it('returns the provided static token', () => {
    const auth = new StaticAuth('my-fixed-token');
    expect(auth.getToken({ actAs: ['Alice'] })).toBe('my-fixed-token');
  });

  it('returns the same token regardless of options', () => {
    const auth = new StaticAuth('static-123');
    expect(auth.getToken({ actAs: ['Alice'] })).toBe('static-123');
    expect(auth.getToken({ actAs: ['Bob'] })).toBe('static-123');
    expect(auth.getToken({ admin: true })).toBe('static-123');
    expect(auth.getToken({})).toBe('static-123');
  });
});

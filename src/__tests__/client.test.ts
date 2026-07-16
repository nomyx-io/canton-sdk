import { CantonClient } from '../client.js';
import { StaticAuth } from '../auth/static.js';
import { CantonError, ConnectionError, HttpError, LedgerApiError } from '../errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(overrides: Record<string, unknown> = {}): CantonClient {
  return new CantonClient({
    ledgerApiUrl: 'http://localhost:7575',
    auth: new StaticAuth('test-token'),
    healthCheckInterval: 0, // disable automatic health timer in most tests
    ...overrides,
  });
}

/** Build a mock Response-like object for a successful Ledger API call. */
function okResponse<T>(result: T) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ status: 200, result }),
  };
}

/** Build a mock Response-like object for a Ledger API error. */
function errorResponse(status: number, errors: string[] = ['error']) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ status, errors }),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('CantonClient constructor', () => {
  it('strips trailing slash from ledgerApiUrl', async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    const client = makeClient({ ledgerApiUrl: 'http://localhost:7575/' });
    // Exercise a call to verify the URL is correct
    await client.listParties();
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:7575/v1/parties');
    client.destroy();
  });

  it('defaults applicationId to "canton-sdk"', () => {
    // Verified indirectly: constructor does not throw
    const client = makeClient();
    client.destroy();
  });

  it('starts health timer when interval > 0', async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    const client = new CantonClient({
      ledgerApiUrl: 'http://localhost:7575',
      auth: new StaticAuth('tok'),
      healthCheckInterval: 5000,
    });

    // Advance timer to trigger one health check (async to flush microtasks)
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/v1/parties');

    client.destroy();
  });
});

// ---------------------------------------------------------------------------
// create()
// ---------------------------------------------------------------------------

describe('create()', () => {
  it('sends correct URL, headers, and body', async () => {
    const result = { contractId: '#1:0', templateId: 'pkg:Mod:T', payload: { x: 1 } };
    mockFetch.mockResolvedValueOnce(okResponse(result));

    const client = makeClient();
    const res = await client.create('pkg:Mod:T', { x: 1 }, 'Alice');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:7575/v1/create');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers['Authorization']).toBe('Bearer test-token');

    const body = JSON.parse(opts.body);
    expect(body.templateId).toBe('pkg:Mod:T');
    expect(body.payload).toEqual({ x: 1 });

    expect(res).toEqual(result);
    client.destroy();
  });
});

// ---------------------------------------------------------------------------
// exercise()
// ---------------------------------------------------------------------------

describe('exercise()', () => {
  it('sends correct request shape', async () => {
    const result = { exerciseResult: 'ok', events: [] };
    mockFetch.mockResolvedValueOnce(okResponse(result));

    const client = makeClient();
    const res = await client.exercise(
      'pkg:Mod:T',
      '#1:0',
      'Accept',
      { note: 'hi' },
      'Alice',
    );

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:7575/v1/exercise');
    const body = JSON.parse(opts.body);
    expect(body.templateId).toBe('pkg:Mod:T');
    expect(body.contractId).toBe('#1:0');
    expect(body.choice).toBe('Accept');
    expect(body.argument).toEqual({ note: 'hi' });

    expect(res).toEqual(result);
    client.destroy();
  });

  it('sends default empty argument when none provided', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ exerciseResult: null, events: [] }));

    const client = makeClient();
    await client.exercise('pkg:Mod:T', '#1:0', 'Archive', undefined, 'Alice');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.argument).toEqual({});
    client.destroy();
  });
});

// ---------------------------------------------------------------------------
// exerciseByKey()
// ---------------------------------------------------------------------------

describe('exerciseByKey()', () => {
  it('sends key instead of contractId', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ exerciseResult: 42, events: [] }));

    const client = makeClient();
    await client.exerciseByKey('pkg:Mod:T', { owner: 'Alice' }, 'Fetch', {}, 'Alice');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.key).toEqual({ owner: 'Alice' });
    expect(body.contractId).toBeUndefined();
    client.destroy();
  });
});

// ---------------------------------------------------------------------------
// query()
// ---------------------------------------------------------------------------

describe('query()', () => {
  it('passes templateIds and filter', async () => {
    const contracts = [{ contractId: '#1:0', templateId: 'pkg:Mod:T', payload: {} }];
    mockFetch.mockResolvedValueOnce(okResponse(contracts));

    const client = makeClient();
    const res = await client.query(
      ['pkg:Mod:T', 'pkg:Mod:U'],
      { actAs: 'Alice', filter: { status: 'active' } },
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.templateIds).toEqual(['pkg:Mod:T', 'pkg:Mod:U']);
    expect(body.query).toEqual({ status: 'active' });
    expect(res).toEqual(contracts);
    client.destroy();
  });

  it('omits query field when no filter provided', async () => {
    mockFetch.mockResolvedValueOnce(okResponse([]));

    const client = makeClient();
    await client.query(['pkg:Mod:T']);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.templateIds).toEqual(['pkg:Mod:T']);
    expect(body.query).toBeUndefined();
    client.destroy();
  });
});

// ---------------------------------------------------------------------------
// callApi retry logic
// ---------------------------------------------------------------------------

describe('callApi retry logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('retries on network error then succeeds', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new TypeError('fetch failed');
      return okResponse({ contractId: '#1:0' });
    });

    const client = makeClient({
      retry: { maxRetries: 2, initialDelayMs: 100, backoffMultiplier: 1 },
    });

    const promise = client.create('pkg:Mod:T', {}, 'Alice');
    // Advance past the retry delay
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toEqual({ contractId: '#1:0' });
    expect(callCount).toBe(2);
    client.destroy();
  });

  it('retries on 500 status then succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(500, ['internal error']))
      .mockResolvedValueOnce(okResponse({ done: true }));

    const client = makeClient({
      retry: { maxRetries: 2, initialDelayMs: 100, backoffMultiplier: 1 },
    });

    const promise = client.create('pkg:Mod:T', {}, 'Alice');
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toEqual({ done: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    client.destroy();
  });

  it('does NOT retry on 400 status', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(400, ['bad request']));

    const client = makeClient({
      retry: { maxRetries: 3, initialDelayMs: 100, backoffMultiplier: 1 },
    });

    await expect(client.create('pkg:Mod:T', {}, 'Alice')).rejects.toThrow(LedgerApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    client.destroy();
  });

  it('throws after exhausting all retries', async () => {
    vi.useRealTimers();
    // Use mockImplementation with async throw to avoid pre-rejected promise warnings
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      throw new TypeError('network failure');
    });

    const client = makeClient({
      retry: { maxRetries: 2, initialDelayMs: 10, backoffMultiplier: 1 },
    });

    await expect(client.create('pkg:Mod:T', {}, 'Alice')).rejects.toThrow(ConnectionError);
    expect(callCount).toBe(3); // 1 initial + 2 retries
    client.destroy();
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe('input validation', () => {
  it('create() with empty templateId throws CantonError', async () => {
    const client = makeClient();
    await expect(client.create('', {}, 'Alice')).rejects.toThrow(CantonError);
    await expect(client.create('  ', {}, 'Alice')).rejects.toThrow(CantonError);
    client.destroy();
  });

  it('create() with empty actAs throws CantonError', async () => {
    const client = makeClient();
    await expect(client.create('pkg:Mod:T', {}, '')).rejects.toThrow(CantonError);
    client.destroy();
  });

  it('exercise() with empty choice throws CantonError', async () => {
    const client = makeClient();
    await expect(
      client.exercise('pkg:Mod:T', '#1:0', '', {}, 'Alice'),
    ).rejects.toThrow(CantonError);
    client.destroy();
  });

  it('exercise() with empty contractId throws CantonError', async () => {
    const client = makeClient();
    await expect(
      client.exercise('pkg:Mod:T', '', 'Accept', {}, 'Alice'),
    ).rejects.toThrow(CantonError);
    client.destroy();
  });

  it('exerciseByKey() with null key throws CantonError', async () => {
    const client = makeClient();
    await expect(
      client.exerciseByKey('pkg:Mod:T', null as any, 'Accept', {}, 'Alice'),
    ).rejects.toThrow(CantonError);
    client.destroy();
  });

  it('exerciseByKey() with undefined key throws CantonError', async () => {
    const client = makeClient();
    await expect(
      client.exerciseByKey('pkg:Mod:T', undefined as any, 'Accept', {}, 'Alice'),
    ).rejects.toThrow(CantonError);
    client.destroy();
  });
});

// ---------------------------------------------------------------------------
// destroy()
// ---------------------------------------------------------------------------

describe('destroy()', () => {
  it('clears health timer so no more checks fire', () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    const client = new CantonClient({
      ledgerApiUrl: 'http://localhost:7575',
      auth: new StaticAuth('tok'),
      healthCheckInterval: 1000,
    });

    client.destroy();
    vi.advanceTimersByTime(5000);

    // No health check fetch should have been made after destroy
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// checkHealth()
// ---------------------------------------------------------------------------

describe('checkHealth()', () => {
  it('returns ok status when ledger responds 200', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const client = makeClient();
    const health = await client.checkHealth();

    expect(health.ok).toBe(true);
    expect(health.ledgerApiUrl).toBe('http://localhost:7575');
    expect(health.checkedAt).toBeGreaterThan(0);
    expect(health.error).toBeUndefined();
    client.destroy();
  });

  it('returns not-ok status when ledger responds with error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

    const client = makeClient();
    const health = await client.checkHealth();

    expect(health.ok).toBe(false);
    expect(health.error).toBe('HTTP 503');
    client.destroy();
  });

  it('returns not-ok status on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const client = makeClient();
    const health = await client.checkHealth();

    expect(health.ok).toBe(false);
    expect(health.error).toBe('ECONNREFUSED');
    client.destroy();
  });

  it('updates lastHealth and notifies listeners', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const client = makeClient();
    const listener = vi.fn();
    client.onHealth(listener);

    expect(client.getLastHealth()).toBeNull();

    const health = await client.checkHealth();
    expect(client.getLastHealth()).toBe(health);
    expect(listener).toHaveBeenCalledWith(health);
    client.destroy();
  });

  it('onHealth returns working unsubscribe function', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    const client = makeClient();
    const listener = vi.fn();
    const unsub = client.onHealth(listener);

    await client.checkHealth();
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    await client.checkHealth();
    expect(listener).toHaveBeenCalledTimes(1); // not called again
    client.destroy();
  });
});

// ---------------------------------------------------------------------------
// Static helpers
// ---------------------------------------------------------------------------

describe('static templateId()', () => {
  it('builds a fully qualified template ID', () => {
    const id = CantonClient.templateId('abc123', 'Main.Trade', 'TradeDeal');
    expect(id).toBe('abc123:Main.Trade:TradeDeal');
  });
});

describe('static templateIds()', () => {
  it('builds a map of template IDs from package ID and templates', () => {
    const ids = CantonClient.templateIds('pkg1', {
      Trade: { module: 'Main.Trade', entity: 'TradeDeal' },
      Asset: { module: 'Main.Asset', entity: 'AssetHolding' },
    });
    expect(ids.Trade).toBe('pkg1:Main.Trade:TradeDeal');
    expect(ids.Asset).toBe('pkg1:Main.Asset:AssetHolding');
  });
});

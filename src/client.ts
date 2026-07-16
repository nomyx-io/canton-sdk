/**
 * CantonClient — core client for the Daml JSON Ledger API.
 *
 * Extracted and generalized from the Nomyx canton-ledger.mjs sidecar.
 * Provides typed create/exercise/query operations with pluggable auth,
 * retry with exponential backoff, and periodic health checks.
 */

import type {
  AuthProvider,
  CantonConfig,
  ContractId,
  ContractKey,
  ExerciseResult,
  HealthStatus,
  LedgerContract,
  LedgerEvent,
  Party,
  PartyDetails,
  QueryOptions,
  RetryConfig,
  TemplateId,
  TokenRequest,
} from './types.js';
import {
  CantonError,
  ConnectionError,
  HttpError,
  LedgerApiError,
} from './errors.js';

const DEFAULT_RETRY: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 30000,
};

export class CantonClient {
  private readonly ledgerApiUrl: string;
  private readonly auth: AuthProvider;
  private readonly applicationId: string;
  private readonly retryConfig: Required<RetryConfig>;
  private readonly requestTimeoutMs: number;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private lastHealth: HealthStatus | null = null;
  private healthListeners: Set<(status: HealthStatus) => void> = new Set();

  constructor(config: CantonConfig) {
    this.ledgerApiUrl = config.ledgerApiUrl.replace(/\/$/, '');
    this.auth = config.auth;
    this.applicationId = config.applicationId ?? 'canton-sdk';
    this.retryConfig = { ...DEFAULT_RETRY, ...config.retry };
    this.requestTimeoutMs = config.requestTimeoutMs ?? 30000;

    const interval = config.healthCheckInterval ?? 30000;
    if (interval > 0) {
      this.healthTimer = setInterval(() => void this.checkHealth(), interval);
      if (typeof this.healthTimer === 'object' && 'unref' in this.healthTimer) {
        this.healthTimer.unref();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Token helpers
  // ---------------------------------------------------------------------------

  private async getToken(opts: TokenRequest): Promise<string> {
    return this.auth.getToken(opts);
  }

  private async actorToken(actAs: Party | Party[], readAs?: Party[]): Promise<string> {
    const actAsArr = Array.isArray(actAs) ? actAs : [actAs];
    return this.getToken({
      actAs: actAsArr,
      readAs: readAs?.length ? readAs : actAsArr,
    });
  }

  private async adminToken(): Promise<string> {
    return this.getToken({ admin: true });
  }

  // ---------------------------------------------------------------------------
  // HTTP transport with retry
  // ---------------------------------------------------------------------------

  private async callApi<T = unknown>(
    path: string,
    token: string,
    body?: unknown,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<T> {
    const url = `${this.ledgerApiUrl}${path}`;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(
          this.retryConfig.initialDelayMs * this.retryConfig.backoffMultiplier ** (attempt - 1),
          this.retryConfig.maxDelayMs,
        );
        await new Promise((r) => setTimeout(r, delay));
      }

      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'TimeoutError') {
          lastError = new ConnectionError(`Ledger API request timed out after ${this.requestTimeoutMs}ms: ${url}`, err);
        } else {
          lastError = new ConnectionError(`Failed to reach ledger API at ${url}`, err);
        }
        continue;
      }

      let json: any;
      let isJson = true;
      try {
        json = await res.json();
      } catch {
        isJson = false;
      }

      if (!isJson) {
        lastError = new HttpError(
          `Ledger API returned non-JSON response (${res.status})`,
          res.status,
          url,
        );
        if (res.status >= 500) continue;
        throw lastError;
      }

      if (json.status === 200) {
        return json.result as T;
      }

      const errors: string[] = json.errors || [JSON.stringify(json)];
      lastError = new LedgerApiError(
        `Ledger API ${path}: ${errors.join('; ')}`,
        path,
        json.status ?? res.status,
        errors,
      );

      const statusCode = json.status ?? res.status;
      if (statusCode >= 500) continue;
      throw lastError;
    }

    throw lastError;
  }

  // ---------------------------------------------------------------------------
  // Party management
  // ---------------------------------------------------------------------------

  /** Allocate a new party on the participant. */
  async allocateParty(hint: string, displayName?: string): Promise<PartyDetails> {
    const token = await this.adminToken();
    const body: Record<string, string> = { identifierHint: hint };
    if (displayName) body.displayName = displayName;
    return this.callApi<PartyDetails>('/v1/parties/allocate', token, body);
  }

  /** List all known parties on the participant. */
  async listParties(): Promise<PartyDetails[]> {
    const token = await this.adminToken();
    return this.callApi<PartyDetails[]>('/v1/parties', token, undefined, 'GET');
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  private assertNonEmpty(value: string | undefined, name: string): asserts value is string {
    if (!value || value.trim() === '') {
      throw new CantonError(`${name} must be a non-empty string`);
    }
  }

  // ---------------------------------------------------------------------------
  // Contract operations
  // ---------------------------------------------------------------------------

  /** Create a contract from a template. */
  async create<T = Record<string, unknown>>(
    templateId: TemplateId,
    payload: T,
    actAs: Party,
  ): Promise<LedgerContract<T>> {
    this.assertNonEmpty(templateId, 'templateId');
    this.assertNonEmpty(actAs, 'actAs');
    const token = await this.actorToken(actAs);
    return this.callApi<LedgerContract<T>>('/v1/create', token, { templateId, payload });
  }

  /** Exercise a choice on a contract by contract ID. */
  async exercise<R = unknown>(
    templateId: TemplateId,
    contractId: ContractId,
    choice: string,
    argument: Record<string, unknown> = {},
    actAs: Party | Party[],
    readAs?: Party[],
  ): Promise<ExerciseResult<R>> {
    this.assertNonEmpty(templateId, 'templateId');
    this.assertNonEmpty(contractId, 'contractId');
    this.assertNonEmpty(choice, 'choice');
    const token = await this.actorToken(actAs, readAs);
    return this.callApi<ExerciseResult<R>>('/v1/exercise', token, {
      templateId,
      contractId,
      choice,
      argument,
    });
  }

  /** Exercise a choice on a contract by contract key. */
  async exerciseByKey<R = unknown>(
    templateId: TemplateId,
    key: ContractKey,
    choice: string,
    argument: Record<string, unknown> = {},
    actAs: Party | Party[],
    readAs?: Party[],
  ): Promise<ExerciseResult<R>> {
    this.assertNonEmpty(templateId, 'templateId');
    this.assertNonEmpty(choice, 'choice');
    if (key === null || key === undefined) {
      throw new CantonError('key must not be null or undefined');
    }
    const token = await this.actorToken(actAs, readAs);
    return this.callApi<ExerciseResult<R>>('/v1/exercise', token, {
      templateId,
      key,
      choice,
      argument,
    });
  }

  /** Query active contracts for one or more templates. */
  async query<T = Record<string, unknown>>(
    templateIds: TemplateId[],
    options: QueryOptions = {},
  ): Promise<LedgerContract<T>[]> {
    const actAs = options.actAs ? [options.actAs] : [];
    const readAs = options.readAs?.length ? options.readAs : undefined;
    const token = await this.getToken({ actAs, readAs });

    const body: Record<string, unknown> = { templateIds };
    if (options.filter) body.query = options.filter;
    if (options.readAs?.length) body.readAs = options.readAs;

    return this.callApi<LedgerContract<T>[]>('/v1/query', token, body);
  }

  // ---------------------------------------------------------------------------
  // Health checks
  // ---------------------------------------------------------------------------

  /** Check whether the ledger API is reachable. */
  async checkHealth(): Promise<HealthStatus> {
    const status: HealthStatus = {
      ok: false,
      ledgerApiUrl: this.ledgerApiUrl,
      checkedAt: Date.now(),
    };

    try {
      const res = await fetch(`${this.ledgerApiUrl}/v1/parties`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${await this.adminToken()}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      status.ok = res.ok;
      if (!res.ok) status.error = `HTTP ${res.status}`;
    } catch (err) {
      status.error = err instanceof Error ? err.message : String(err);
    }

    this.lastHealth = status;
    for (const listener of this.healthListeners) {
      try { listener(status); } catch { /* ignore listener errors */ }
    }
    return status;
  }

  /** Get the last health check result (null if never checked). */
  getLastHealth(): HealthStatus | null {
    return this.lastHealth;
  }

  /** Subscribe to health status changes. Returns an unsubscribe function. */
  onHealth(listener: (status: HealthStatus) => void): () => void {
    this.healthListeners.add(listener);
    return () => this.healthListeners.delete(listener);
  }

  // ---------------------------------------------------------------------------
  // Template ID helpers
  // ---------------------------------------------------------------------------

  /** Build a fully qualified template ID from package ID, module, and entity. */
  static templateId(packageId: string, module: string, entity: string): TemplateId {
    return `${packageId}:${module}:${entity}`;
  }

  /** Build a template ID map from a package ID and a module→entity mapping. */
  static templateIds<K extends string>(
    packageId: string,
    templates: Record<K, { module: string; entity: string }>,
  ): Record<K, TemplateId> {
    const result = {} as Record<K, TemplateId>;
    for (const key of Object.keys(templates) as K[]) {
      const { module, entity } = templates[key];
      result[key] = CantonClient.templateId(packageId, module, entity);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Stop health checks and clean up resources. */
  destroy(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    this.healthListeners.clear();
  }
}

/**
 * CantonClient — core client for the Daml JSON Ledger API.
 *
 * Extracted and generalized from the Nomyx canton-ledger.mjs sidecar.
 * Provides typed create/exercise/query operations with pluggable auth,
 * retry with exponential backoff, and periodic health checks.
 */
import { CantonError, ConnectionError, HttpError, LedgerApiError, } from './errors.js';
const DEFAULT_RETRY = {
    maxRetries: 3,
    initialDelayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 30000,
};
export class CantonClient {
    ledgerApiUrl;
    auth;
    applicationId;
    retryConfig;
    requestTimeoutMs;
    healthTimer = null;
    lastHealth = null;
    healthListeners = new Set();
    constructor(config) {
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
    async getToken(opts) {
        return this.auth.getToken(opts);
    }
    async actorToken(actAs, readAs) {
        const actAsArr = Array.isArray(actAs) ? actAs : [actAs];
        return this.getToken({
            actAs: actAsArr,
            readAs: readAs?.length ? readAs : actAsArr,
        });
    }
    async adminToken() {
        return this.getToken({ admin: true });
    }
    // ---------------------------------------------------------------------------
    // HTTP transport with retry
    // ---------------------------------------------------------------------------
    async callApi(path, token, body, method = 'POST') {
        const url = `${this.ledgerApiUrl}${path}`;
        let lastError;
        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
            if (attempt > 0) {
                const delay = Math.min(this.retryConfig.initialDelayMs * this.retryConfig.backoffMultiplier ** (attempt - 1), this.retryConfig.maxDelayMs);
                await new Promise((r) => setTimeout(r, delay));
            }
            let res;
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
            }
            catch (err) {
                if (err instanceof DOMException && err.name === 'TimeoutError') {
                    lastError = new ConnectionError(`Ledger API request timed out after ${this.requestTimeoutMs}ms: ${url}`, err);
                }
                else {
                    lastError = new ConnectionError(`Failed to reach ledger API at ${url}`, err);
                }
                continue;
            }
            let json;
            let isJson = true;
            try {
                json = await res.json();
            }
            catch {
                isJson = false;
            }
            if (!isJson) {
                lastError = new HttpError(`Ledger API returned non-JSON response (${res.status})`, res.status, url);
                if (res.status >= 500)
                    continue;
                throw lastError;
            }
            if (json.status === 200) {
                return json.result;
            }
            const errors = json.errors || [JSON.stringify(json)];
            lastError = new LedgerApiError(`Ledger API ${path}: ${errors.join('; ')}`, path, json.status ?? res.status, errors);
            const statusCode = json.status ?? res.status;
            if (statusCode >= 500)
                continue;
            throw lastError;
        }
        throw lastError;
    }
    // ---------------------------------------------------------------------------
    // Party management
    // ---------------------------------------------------------------------------
    /** Allocate a new party on the participant. */
    async allocateParty(hint, displayName) {
        const token = await this.adminToken();
        const body = { identifierHint: hint };
        if (displayName)
            body.displayName = displayName;
        return this.callApi('/v1/parties/allocate', token, body);
    }
    /** List all known parties on the participant. */
    async listParties() {
        const token = await this.adminToken();
        return this.callApi('/v1/parties', token, undefined, 'GET');
    }
    // ---------------------------------------------------------------------------
    // Validation
    // ---------------------------------------------------------------------------
    assertNonEmpty(value, name) {
        if (!value || value.trim() === '') {
            throw new CantonError(`${name} must be a non-empty string`);
        }
    }
    // ---------------------------------------------------------------------------
    // Contract operations
    // ---------------------------------------------------------------------------
    /** Create a contract from a template. */
    async create(templateId, payload, actAs) {
        this.assertNonEmpty(templateId, 'templateId');
        this.assertNonEmpty(actAs, 'actAs');
        const token = await this.actorToken(actAs);
        return this.callApi('/v1/create', token, { templateId, payload });
    }
    /** Exercise a choice on a contract by contract ID. */
    async exercise(templateId, contractId, choice, argument = {}, actAs, readAs) {
        this.assertNonEmpty(templateId, 'templateId');
        this.assertNonEmpty(contractId, 'contractId');
        this.assertNonEmpty(choice, 'choice');
        const token = await this.actorToken(actAs, readAs);
        return this.callApi('/v1/exercise', token, {
            templateId,
            contractId,
            choice,
            argument,
        });
    }
    /** Exercise a choice on a contract by contract key. */
    async exerciseByKey(templateId, key, choice, argument = {}, actAs, readAs) {
        this.assertNonEmpty(templateId, 'templateId');
        this.assertNonEmpty(choice, 'choice');
        if (key === null || key === undefined) {
            throw new CantonError('key must not be null or undefined');
        }
        const token = await this.actorToken(actAs, readAs);
        return this.callApi('/v1/exercise', token, {
            templateId,
            key,
            choice,
            argument,
        });
    }
    /** Query active contracts for one or more templates. */
    async query(templateIds, options = {}) {
        const actAs = options.actAs ? [options.actAs] : [];
        const readAs = options.readAs?.length ? options.readAs : undefined;
        const token = await this.getToken({ actAs, readAs });
        const body = { templateIds };
        if (options.filter)
            body.query = options.filter;
        if (options.readAs?.length)
            body.readAs = options.readAs;
        return this.callApi('/v1/query', token, body);
    }
    // ---------------------------------------------------------------------------
    // Health checks
    // ---------------------------------------------------------------------------
    /** Check whether the ledger API is reachable. */
    async checkHealth() {
        const status = {
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
            if (!res.ok)
                status.error = `HTTP ${res.status}`;
        }
        catch (err) {
            status.error = err instanceof Error ? err.message : String(err);
        }
        this.lastHealth = status;
        for (const listener of this.healthListeners) {
            try {
                listener(status);
            }
            catch { /* ignore listener errors */ }
        }
        return status;
    }
    /** Get the last health check result (null if never checked). */
    getLastHealth() {
        return this.lastHealth;
    }
    /** Subscribe to health status changes. Returns an unsubscribe function. */
    onHealth(listener) {
        this.healthListeners.add(listener);
        return () => this.healthListeners.delete(listener);
    }
    // ---------------------------------------------------------------------------
    // Template ID helpers
    // ---------------------------------------------------------------------------
    /** Build a fully qualified template ID from package ID, module, and entity. */
    static templateId(packageId, module, entity) {
        return `${packageId}:${module}:${entity}`;
    }
    /** Build a template ID map from a package ID and a module→entity mapping. */
    static templateIds(packageId, templates) {
        const result = {};
        for (const key of Object.keys(templates)) {
            const { module, entity } = templates[key];
            result[key] = CantonClient.templateId(packageId, module, entity);
        }
        return result;
    }
    // ---------------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------------
    /** Stop health checks and clean up resources. */
    destroy() {
        if (this.healthTimer) {
            clearInterval(this.healthTimer);
            this.healthTimer = null;
        }
        this.healthListeners.clear();
    }
}
//# sourceMappingURL=client.js.map
/**
 * CantonClient — core client for the Daml JSON Ledger API.
 *
 * Extracted and generalized from the Nomyx canton-ledger.mjs sidecar.
 * Provides typed create/exercise/query operations with pluggable auth,
 * retry with exponential backoff, and periodic health checks.
 */
import type { CantonConfig, ContractId, ContractKey, ExerciseResult, HealthStatus, LedgerContract, Party, PartyDetails, QueryOptions, TemplateId } from './types.js';
export declare class CantonClient {
    private readonly ledgerApiUrl;
    private readonly auth;
    private readonly applicationId;
    private readonly retryConfig;
    private readonly requestTimeoutMs;
    private healthTimer;
    private lastHealth;
    private healthListeners;
    constructor(config: CantonConfig);
    private getToken;
    private actorToken;
    private adminToken;
    private callApi;
    /** Allocate a new party on the participant. */
    allocateParty(hint: string, displayName?: string): Promise<PartyDetails>;
    /** List all known parties on the participant. */
    listParties(): Promise<PartyDetails[]>;
    private assertNonEmpty;
    /** Create a contract from a template. */
    create<T = Record<string, unknown>>(templateId: TemplateId, payload: T, actAs: Party): Promise<LedgerContract<T>>;
    /** Exercise a choice on a contract by contract ID. */
    exercise<R = unknown>(templateId: TemplateId, contractId: ContractId, choice: string, argument: Record<string, unknown> | undefined, actAs: Party | Party[], readAs?: Party[]): Promise<ExerciseResult<R>>;
    /** Exercise a choice on a contract by contract key. */
    exerciseByKey<R = unknown>(templateId: TemplateId, key: ContractKey, choice: string, argument: Record<string, unknown> | undefined, actAs: Party | Party[], readAs?: Party[]): Promise<ExerciseResult<R>>;
    /** Query active contracts for one or more templates. */
    query<T = Record<string, unknown>>(templateIds: TemplateId[], options?: QueryOptions): Promise<LedgerContract<T>[]>;
    /** Check whether the ledger API is reachable. */
    checkHealth(): Promise<HealthStatus>;
    /** Get the last health check result (null if never checked). */
    getLastHealth(): HealthStatus | null;
    /** Subscribe to health status changes. Returns an unsubscribe function. */
    onHealth(listener: (status: HealthStatus) => void): () => void;
    /** Build a fully qualified template ID from package ID, module, and entity. */
    static templateId(packageId: string, module: string, entity: string): TemplateId;
    /** Build a template ID map from a package ID and a module→entity mapping. */
    static templateIds<K extends string>(packageId: string, templates: Record<K, {
        module: string;
        entity: string;
    }>): Record<K, TemplateId>;
    /** Stop health checks and clean up resources. */
    destroy(): void;
}
//# sourceMappingURL=client.d.ts.map
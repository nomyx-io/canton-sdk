/**
 * Sandbox auth provider — generates HS256 JWTs for the Daml sandbox.
 *
 * The sandbox does not verify signatures when ledger auth is disabled, but
 * the claims identify the acting party. Do NOT use in production.
 */
import type { AuthProvider, TokenRequest } from '../types.js';
export interface SandboxAuthConfig {
    /** HS256 secret for signing sandbox JWTs (default: "secret"). */
    secret?: string;
    /** Daml ledger ID (default: "sandbox"). */
    ledgerId?: string;
    /** Daml application ID (default: "canton-sdk"). */
    applicationId?: string;
}
export declare class SandboxAuth implements AuthProvider {
    private readonly secret;
    private readonly ledgerId;
    private readonly applicationId;
    private readonly cache;
    constructor(config?: SandboxAuthConfig);
    getToken(opts: TokenRequest): string;
    private evictExpired;
}
//# sourceMappingURL=sandbox.d.ts.map
/**
 * OAuth2/OIDC auth provider — for production Canton participant nodes.
 *
 * Obtains tokens from an OAuth2 authorization server using the
 * client_credentials grant. The token is cached until near-expiry.
 */
import type { AuthProvider, TokenRequest } from '../types.js';
export interface OAuth2AuthConfig {
    /** OAuth2 token endpoint URL. */
    tokenUrl: string;
    /** Client ID for the client_credentials grant. */
    clientId: string;
    /** Client secret. */
    clientSecret: string;
    /** OAuth2 scope (e.g. "daml_ledger_api"). */
    scope?: string;
    /** Audience claim (some IdPs require this). */
    audience?: string;
    /** Seconds before expiry to refresh (default: 60). */
    refreshBufferSeconds?: number;
}
export declare class OAuth2Auth implements AuthProvider {
    private readonly config;
    private readonly refreshBuffer;
    private cache;
    constructor(config: OAuth2AuthConfig);
    getToken(opts: TokenRequest): Promise<string>;
    private evictExpired;
}
//# sourceMappingURL=oauth2.d.ts.map
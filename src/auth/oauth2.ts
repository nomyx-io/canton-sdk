/**
 * OAuth2/OIDC auth provider — for production Canton participant nodes.
 *
 * Obtains tokens from an OAuth2 authorization server using the
 * client_credentials grant. The token is cached until near-expiry.
 */

import type { AuthProvider, TokenRequest } from '../types.js';
import { AuthError } from '../errors.js';

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

interface CachedToken {
  token: string;
  expiresAt: number;
}

export class OAuth2Auth implements AuthProvider {
  private readonly config: Required<Pick<OAuth2AuthConfig, 'tokenUrl' | 'clientId' | 'clientSecret'>> &
    OAuth2AuthConfig;
  private readonly refreshBuffer: number;
  private cache: Map<string, CachedToken> = new Map();

  constructor(config: OAuth2AuthConfig) {
    if (!config.tokenUrl || !config.clientId || !config.clientSecret) {
      throw new AuthError('OAuth2Auth requires tokenUrl, clientId, and clientSecret');
    }
    this.config = config;
    this.refreshBuffer = (config.refreshBufferSeconds ?? 60) * 1000;
  }

  async getToken(opts: TokenRequest): Promise<string> {
    this.evictExpired();

    const cacheKey = JSON.stringify({
      actAs: opts.actAs ?? [],
      readAs: opts.readAs ?? [],
      admin: opts.admin ?? false,
    });
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt - this.refreshBuffer) {
      return cached.token;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    if (this.config.scope) body.set('scope', this.config.scope);
    if (this.config.audience) body.set('audience', this.config.audience);

    let res: Response;
    try {
      res = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch (err) {
      throw new AuthError('Failed to reach OAuth2 token endpoint', err);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AuthError(`OAuth2 token request failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
      throw new AuthError('OAuth2 token response missing access_token field');
    }

    const expiresIn = Math.max(0, (json.expires_in ?? 3600)) * 1000;

    const entry: CachedToken = {
      token: json.access_token,
      expiresAt: Date.now() + expiresIn,
    };
    this.cache.set(cacheKey, entry);

    return entry.token;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now >= entry.expiresAt) this.cache.delete(key);
    }
  }
}

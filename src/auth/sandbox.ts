/**
 * Sandbox auth provider — generates HS256 JWTs for the Daml sandbox.
 *
 * The sandbox does not verify signatures when ledger auth is disabled, but
 * the claims identify the acting party. Do NOT use in production.
 */

import { createHmac } from 'crypto';
import type { AuthProvider, TokenRequest } from '../types.js';

export interface SandboxAuthConfig {
  /** HS256 secret for signing sandbox JWTs (default: "secret"). */
  secret?: string;
  /** Daml ledger ID (default: "sandbox"). */
  ledgerId?: string;
  /** Daml application ID (default: "canton-sdk"). */
  applicationId?: string;
}

function b64url(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlFromBase64(b64: string): string {
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

const TOKEN_TTL_MS = 5 * 60 * 1000;

interface CachedEntry {
  token: string;
  expiresAt: number;
}

export class SandboxAuth implements AuthProvider {
  private readonly secret: string;
  private readonly ledgerId: string;
  private readonly applicationId: string;
  private readonly cache: Map<string, CachedEntry> = new Map();

  constructor(config: SandboxAuthConfig = {}) {
    this.secret = config.secret || 'secret';
    this.ledgerId = config.ledgerId || 'sandbox';
    this.applicationId = config.applicationId || 'canton-sdk';
  }

  getToken(opts: TokenRequest): string {
    this.evictExpired();

    const cacheKey = JSON.stringify({
      actAs: opts.actAs ?? [],
      readAs: opts.readAs ?? [],
      admin: opts.admin ?? false,
    });
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) return cached.token;

    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      iat: Math.floor(Date.now() / 1000),
      'https://daml.com/ledger-api': {
        ledgerId: this.ledgerId,
        applicationId: this.applicationId,
        actAs: opts.actAs || [],
        readAs: opts.readAs?.length ? opts.readAs : opts.actAs || [],
        admin: opts.admin || false,
      },
    };
    const h = b64url(JSON.stringify(header));
    const p = b64url(JSON.stringify(payload));
    const sig = b64urlFromBase64(
      createHmac('sha256', this.secret).update(`${h}.${p}`).digest('base64'),
    );
    const token = `${h}.${p}.${sig}`;
    this.cache.set(cacheKey, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
    return token;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now >= entry.expiresAt) this.cache.delete(key);
    }
  }
}

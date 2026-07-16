/**
 * Static token auth provider — for environments where the token is
 * pre-provisioned (e.g. testing, CI, or browser-side where the sidecar
 * handles auth and the frontend just needs a pass-through).
 */

import type { AuthProvider, TokenRequest } from '../types.js';

export class StaticAuth implements AuthProvider {
  constructor(private readonly token: string) {}

  getToken(_opts: TokenRequest): string {
    return this.token;
  }
}

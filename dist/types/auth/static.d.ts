/**
 * Static token auth provider — for environments where the token is
 * pre-provisioned (e.g. testing, CI, or browser-side where the sidecar
 * handles auth and the frontend just needs a pass-through).
 */
import type { AuthProvider, TokenRequest } from '../types.js';
export declare class StaticAuth implements AuthProvider {
    private readonly token;
    constructor(token: string);
    getToken(_opts: TokenRequest): string;
}
//# sourceMappingURL=static.d.ts.map
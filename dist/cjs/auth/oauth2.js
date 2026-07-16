"use strict";
/**
 * OAuth2/OIDC auth provider — for production Canton participant nodes.
 *
 * Obtains tokens from an OAuth2 authorization server using the
 * client_credentials grant. The token is cached until near-expiry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuth2Auth = void 0;
const errors_js_1 = require("../errors.js");
class OAuth2Auth {
    config;
    refreshBuffer;
    cache = new Map();
    constructor(config) {
        if (!config.tokenUrl || !config.clientId || !config.clientSecret) {
            throw new errors_js_1.AuthError('OAuth2Auth requires tokenUrl, clientId, and clientSecret');
        }
        this.config = config;
        this.refreshBuffer = (config.refreshBufferSeconds ?? 60) * 1000;
    }
    async getToken(opts) {
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
        if (this.config.scope)
            body.set('scope', this.config.scope);
        if (this.config.audience)
            body.set('audience', this.config.audience);
        let res;
        try {
            res = await fetch(this.config.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            });
        }
        catch (err) {
            throw new errors_js_1.AuthError('Failed to reach OAuth2 token endpoint', err);
        }
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new errors_js_1.AuthError(`OAuth2 token request failed (${res.status}): ${text.slice(0, 200)}`);
        }
        const json = (await res.json());
        if (!json.access_token) {
            throw new errors_js_1.AuthError('OAuth2 token response missing access_token field');
        }
        const expiresIn = Math.max(0, (json.expires_in ?? 3600)) * 1000;
        const entry = {
            token: json.access_token,
            expiresAt: Date.now() + expiresIn,
        };
        this.cache.set(cacheKey, entry);
        return entry.token;
    }
    evictExpired() {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now >= entry.expiresAt)
                this.cache.delete(key);
        }
    }
}
exports.OAuth2Auth = OAuth2Auth;
//# sourceMappingURL=oauth2.js.map
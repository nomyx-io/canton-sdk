"use strict";
/**
 * Sandbox auth provider — generates HS256 JWTs for the Daml sandbox.
 *
 * The sandbox does not verify signatures when ledger auth is disabled, but
 * the claims identify the acting party. Do NOT use in production.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxAuth = void 0;
const crypto_1 = require("crypto");
function b64url(data) {
    return Buffer.from(data)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}
function b64urlFromBase64(b64) {
    return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
const TOKEN_TTL_MS = 5 * 60 * 1000;
class SandboxAuth {
    secret;
    ledgerId;
    applicationId;
    cache = new Map();
    constructor(config = {}) {
        this.secret = config.secret || 'secret';
        this.ledgerId = config.ledgerId || 'sandbox';
        this.applicationId = config.applicationId || 'canton-sdk';
    }
    getToken(opts) {
        this.evictExpired();
        const cacheKey = JSON.stringify({
            actAs: opts.actAs ?? [],
            readAs: opts.readAs ?? [],
            admin: opts.admin ?? false,
        });
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt)
            return cached.token;
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
        const sig = b64urlFromBase64((0, crypto_1.createHmac)('sha256', this.secret).update(`${h}.${p}`).digest('base64'));
        const token = `${h}.${p}.${sig}`;
        this.cache.set(cacheKey, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
        return token;
    }
    evictExpired() {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now >= entry.expiresAt)
                this.cache.delete(key);
        }
    }
}
exports.SandboxAuth = SandboxAuth;
//# sourceMappingURL=sandbox.js.map
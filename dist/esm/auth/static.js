/**
 * Static token auth provider — for environments where the token is
 * pre-provisioned (e.g. testing, CI, or browser-side where the sidecar
 * handles auth and the frontend just needs a pass-through).
 */
export class StaticAuth {
    token;
    constructor(token) {
        this.token = token;
    }
    getToken(_opts) {
        return this.token;
    }
}
//# sourceMappingURL=static.js.map
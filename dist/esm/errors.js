/**
 * Typed error hierarchy for Canton SDK operations.
 */
/** Base error for all Canton SDK errors. */
export class CantonError extends Error {
    constructor(message, cause) {
        super(message, cause !== undefined ? { cause } : undefined);
        this.name = 'CantonError';
    }
}
/** Error from the Daml JSON Ledger API (non-200 status in response body). */
export class LedgerApiError extends CantonError {
    path;
    ledgerStatus;
    ledgerErrors;
    constructor(message, path, ledgerStatus, ledgerErrors, cause) {
        super(message, cause);
        this.path = path;
        this.ledgerStatus = ledgerStatus;
        this.ledgerErrors = ledgerErrors;
        this.name = 'LedgerApiError';
    }
}
/** HTTP-level error (network failure, non-JSON response, etc.). */
export class HttpError extends CantonError {
    httpStatus;
    url;
    constructor(message, httpStatus, url, cause) {
        super(message, cause);
        this.httpStatus = httpStatus;
        this.url = url;
        this.name = 'HttpError';
    }
}
/** Authentication error (bad token, expired, wrong secret). */
export class AuthError extends CantonError {
    constructor(message, cause) {
        super(message, cause);
        this.name = 'AuthError';
    }
}
/** Connection error (ledger API unreachable, health check failed). */
export class ConnectionError extends CantonError {
    constructor(message, cause) {
        super(message, cause);
        this.name = 'ConnectionError';
    }
}
//# sourceMappingURL=errors.js.map
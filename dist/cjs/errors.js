"use strict";
/**
 * Typed error hierarchy for Canton SDK operations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionError = exports.AuthError = exports.HttpError = exports.LedgerApiError = exports.CantonError = void 0;
/** Base error for all Canton SDK errors. */
class CantonError extends Error {
    constructor(message, cause) {
        super(message, cause !== undefined ? { cause } : undefined);
        this.name = 'CantonError';
    }
}
exports.CantonError = CantonError;
/** Error from the Daml JSON Ledger API (non-200 status in response body). */
class LedgerApiError extends CantonError {
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
exports.LedgerApiError = LedgerApiError;
/** HTTP-level error (network failure, non-JSON response, etc.). */
class HttpError extends CantonError {
    httpStatus;
    url;
    constructor(message, httpStatus, url, cause) {
        super(message, cause);
        this.httpStatus = httpStatus;
        this.url = url;
        this.name = 'HttpError';
    }
}
exports.HttpError = HttpError;
/** Authentication error (bad token, expired, wrong secret). */
class AuthError extends CantonError {
    constructor(message, cause) {
        super(message, cause);
        this.name = 'AuthError';
    }
}
exports.AuthError = AuthError;
/** Connection error (ledger API unreachable, health check failed). */
class ConnectionError extends CantonError {
    constructor(message, cause) {
        super(message, cause);
        this.name = 'ConnectionError';
    }
}
exports.ConnectionError = ConnectionError;
//# sourceMappingURL=errors.js.map
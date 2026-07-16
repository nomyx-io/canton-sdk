/**
 * Typed error hierarchy for Canton SDK operations.
 */
/** Base error for all Canton SDK errors. */
export declare class CantonError extends Error {
    constructor(message: string, cause?: unknown);
}
/** Error from the Daml JSON Ledger API (non-200 status in response body). */
export declare class LedgerApiError extends CantonError {
    readonly path: string;
    readonly ledgerStatus: number;
    readonly ledgerErrors: string[];
    constructor(message: string, path: string, ledgerStatus: number, ledgerErrors: string[], cause?: unknown);
}
/** HTTP-level error (network failure, non-JSON response, etc.). */
export declare class HttpError extends CantonError {
    readonly httpStatus: number;
    readonly url: string;
    constructor(message: string, httpStatus: number, url: string, cause?: unknown);
}
/** Authentication error (bad token, expired, wrong secret). */
export declare class AuthError extends CantonError {
    constructor(message: string, cause?: unknown);
}
/** Connection error (ledger API unreachable, health check failed). */
export declare class ConnectionError extends CantonError {
    constructor(message: string, cause?: unknown);
}
//# sourceMappingURL=errors.d.ts.map
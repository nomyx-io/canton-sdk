/**
 * Typed error hierarchy for Canton SDK operations.
 */

/** Base error for all Canton SDK errors. */
export class CantonError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'CantonError';
  }
}

/** Error from the Daml JSON Ledger API (non-200 status in response body). */
export class LedgerApiError extends CantonError {
  constructor(
    message: string,
    public readonly path: string,
    public readonly ledgerStatus: number,
    public readonly ledgerErrors: string[],
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = 'LedgerApiError';
  }
}

/** HTTP-level error (network failure, non-JSON response, etc.). */
export class HttpError extends CantonError {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly url: string,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = 'HttpError';
  }
}

/** Authentication error (bad token, expired, wrong secret). */
export class AuthError extends CantonError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AuthError';
  }
}

/** Connection error (ledger API unreachable, health check failed). */
export class ConnectionError extends CantonError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ConnectionError';
  }
}

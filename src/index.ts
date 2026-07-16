// Core client
export { CantonClient } from './client.js';

// Auth providers
export { SandboxAuth, type SandboxAuthConfig } from './auth/sandbox.js';
export { OAuth2Auth, type OAuth2AuthConfig } from './auth/oauth2.js';
export { StaticAuth } from './auth/static.js';

// Errors
export {
  CantonError,
  LedgerApiError,
  HttpError,
  AuthError,
  ConnectionError,
} from './errors.js';

// Types
export type {
  TemplateId,
  ContractId,
  Party,
  LedgerContract,
  ExerciseResult,
  LedgerEvent,
  PartyDetails,
  ContractKey,
  CantonConfig,
  AuthProvider,
  TokenRequest,
  RetryConfig,
  HealthStatus,
  QueryOptions,
} from './types.js';

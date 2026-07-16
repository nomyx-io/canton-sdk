# @nomyx/canton-sdk

TypeScript SDK for interacting with Canton Network participant nodes via the Daml JSON Ledger API.

## Installation

```bash
npm install @nomyx/canton-sdk
```

## Quick Start

```ts
import { CantonClient, SandboxAuth } from '@nomyx/canton-sdk';

const client = new CantonClient({
  ledgerUrl: 'http://localhost:7575',
  auth: new SandboxAuth('Alice'),
});

// Query active contracts
const contracts = await client.query({
  templateId: 'Main:Asset',
  query: { owner: 'Alice' },
});

// Create a contract
const { contractId } = await client.create({
  templateId: 'Main:Asset',
  payload: { owner: 'Alice', name: 'Token-1', quantity: '100' },
});

// Exercise a choice
await client.exercise({
  templateId: 'Main:Asset',
  contractId,
  choice: 'Transfer',
  argument: { newOwner: 'Bob' },
});
```

## Auth Providers

| Provider | Use case |
|----------|----------|
| `SandboxAuth` | Local development with Canton Sandbox |
| `OAuth2Auth` | Production deployments with OAuth 2.0 token exchange |
| `StaticAuth` | Pre-issued bearer tokens or service accounts |

## Error Types

All errors extend the base `CantonError` class:

- `LedgerApiError` -- ledger rejected the command (e.g., missing contract, invalid argument)
- `HttpError` -- non-2xx response from the JSON API
- `AuthError` -- authentication or token refresh failure
- `ConnectionError` -- network-level connectivity issue

## License

Apache-2.0 -- see [LICENSE](./LICENSE) for details.

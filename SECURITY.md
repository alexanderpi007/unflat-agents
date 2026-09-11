# Security invariants

## Signing

The only signing-capable dependency is `WalletPort`. It is private to `SigningGateway`. API routes and the MCP server can call gateway methods but cannot import a wallet instance.

Before `signX402` or `depositEarn`, the gateway calls `MandateService.decideAndReserve`. That operation checks the current clock and reserves the amount under one store lock. Network preflight happens before this final check so a mandate that expires during a slow request still refuses.

## AIMorgan

AIMorgan is external and untrusted. Its failures close the gate. Both dry and paid strategy payloads need `priceValidation.allPassed === true`. A strategy used for a deposit must be the exact strategy previously retained by the gateway; request bodies cannot supply or override validation.

AIMorgan vault IDs are retained only as advisory statement data. The deposit target is loaded from the unflat allowlist.

## Mandates and retries

Mandates and idempotency keys live in `GatewayStore`, never AIMorgan. Expiry uses `now >= expiresAt`, so the boundary is closed at the exact expiry instant. There is no revoke operation.

An idempotent replay returns the stored result without another signature. Reusing a key for different input is refused. A failed attempt stays failed to prevent ambiguous double execution.

## Statements

The owner supplies a random 32-byte key only at export time. The key is not added to an agent, mandate, event, or gateway store record. The gateway uploads only an AES-256-GCM envelope to Swarm.

## Tests

`npm run test` covers:

- expired mandate refuses before signing;
- false/missing AIMorgan validation refuses before signing;
- `dry: true` precedes the paid strategize call;
- expiry during preflight is caught by the final check;
- AIMorgan vault advice cannot replace the unflat allowlist;
- a caller cannot forge a validated strategy;
- an idempotent replay cannot sign twice.


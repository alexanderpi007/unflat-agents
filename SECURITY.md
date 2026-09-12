# Security invariants

## Signing

The only signing-capable dependency is `WalletPort`. It is private to `SigningGateway`. API routes and the MCP server can call gateway methods but cannot import a wallet instance.

Before `transferUsdc`, `signX402`, or `depositEarn`, the gateway calls `MandateService.decideAndReserve`. For a direct Morpho deposit it calls `decide` immediately before the exact-amount approval, confirms that receipt, simulates the deposit, then calls `decideAndReserve` immediately before the deposit signature. A mandate that expires anywhere in that sequence stops the next signing call.

## AIMorgan

AIMorgan is external and untrusted. Its failures close the gate. Dry and final strategy payloads need `priceValidation.allPassed === true`. The Base USDC transfer also requires a successful AIMorgan dry validation before signing. A strategy used for a deposit must be the exact strategy previously retained by the gateway; request bodies cannot supply or override validation.

The temporary fee-waived strategy call uses `?free=true` only after `dry:true` succeeds. The AIMorgan x402 quote/signing path is dormant unless `AIMORGAN_X402=true`.

AIMorgan vault IDs are retained only as advisory statement data. The deposit target is loaded from the unflat allowlist.

The default direct path targets only the allowlisted Steakhouse Prime USDC Vault V2. The gateway independently reads `asset()` and the wallet's canonical Base USDC balance, signs an exact-amount approval through Privy, then requires an `eth_call` simulation of `deposit(amount, agent)` to succeed before reserving the mandate and signing the deposit. It does not gate on Vault V2 `maxDeposit`. The Privy Earn wrapper path remains dormant unless `EARN_VIA_PRIVY=true`.

## Mandates and retries

Mandates and idempotency keys live in `GatewayStore`, never AIMorgan. Authorization requires the matching entity/commitment in a fresh Arkiv query with `$expiresAt > current_head`; absence refuses. The displayed wall-clock expiry is an estimate, not an authorization cache. There is no revoke operation.

## Dashboard execution boundary

`MOCK_MODE=true` mocks money while retaining configured Arkiv and browser Swarm. `demo:mock` explicitly forces every adapter to mock. Vercel unconditionally forces mock financial adapters, hides LIVE controls, and rejects LIVE requests even with spoofed loopback headers. Mutating financial/agent/mandate routes require a loopback URL and matching Host, matching Origin, and no mismatching forwarded-host header (Next automatically inserts an exact matching one). The dev/start commands bind to loopback. Local LIVE dashboard runs require typed CONFIRM, complete live adapters, a persisted wallet matching the expected address, fixed 5-cent transfer/100-cent deposit, and a durable run idempotency claim. This is not production owner authentication: do not expose localhost through proxies/tunnels. CLI/MCP operators must supply the local Origin header.

Public mock-money runs hold accounting in memory for one streamed request and use unique agent IDs, preventing public runs from overwriting the persistent live agent's mandate. Arkiv remains the authorization source on every action. Testnet abuse protection is limited to one concurrent run per process; a public multi-tenant service needs durable rate limiting and owner authentication. No Privy credentials are deployed for the public demo.

An idempotent replay returns the stored result without another signature. Reusing a key for different input is refused. A failed attempt stays failed to prevent ambiguous double execution.

## Statements

The browser uploads the displayed agent, mandate and decisions through Swarm ID with native encryption. The 128-hex reference contains the content address and decryption key; it remains only in browser memory and the owner's private copy. No publication callback sends it to the gateway, no URL embeds it, and no gateway record stores it. Retrieval goes through the Swarm ID iframe. The prior server upload endpoint now returns JSON 409 without reading the body. AES-256-GCM publication remains only in the CLI mock safety net.

Swarm ID protects the saved copy; it does not hide the source statement from the gateway that produced it. The browser export contains displayed mandate terms and decisions, not the private commitment opening or provider credentials. Existing dashboard/API access control is unchanged.

## Tests

`npm run test` covers:

- expired mandate refuses before signing;
- false/missing AIMorgan validation refuses before signing;
- `dry: true` precedes the fee-waived or x402 strategize call;
- an expired transfer stops before AIMorgan validation, Base preflight, and Privy signing;
- a completed transfer stores the verified Base transaction hash in the statement;
- expiry during preflight is caught by the final check;
- AIMorgan vault advice cannot replace the unflat allowlist;
- a caller cannot forge a validated strategy;
- an idempotent replay cannot sign twice.

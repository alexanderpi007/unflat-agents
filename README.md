# unflat × agents

An expiring bank account for AI agents, built for ETHRome 2026.

Public GitHub repository: [alexanderpi007/unflat-agents](https://github.com/alexanderpi007/unflat-agents).

Deployed dapp: https://unflat-agents.vercel.app

The gateway creates a Privy agent wallet and an ENSv2 identity, enforces a short-lived spending mandate through Arkiv's live TTL query surface, makes guarded Base USDC payments, asks AIMorgan for advisory strategy, sweeps idle USDC to an unflat allowlisted Morpho vault, and publishes an owner-encrypted statement to Swarm.

## Demo

Requires Node 22 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and click **Run the 2-minute mandate**.

The dashboard runs an accelerated mock sequence with runtime-generated timestamps and no credentials or external availability:

1. create `atlas.agents.unflat.eth` and a Privy agent wallet;
2. grant a two-minute mandate;
3. transfer 0.05 USDC through the same mandate and signing gateway;
4. call AIMorgan `/api/strategize` with `dry: true`, then `?free=true`;
5. deposit exactly 1 USDC into the unflat allowlisted Morpho vault through the mocked direct path;
6. advance past expiry and show the next action as `REFUSED`;
7. encrypt the statement with an owner-held AES-256-GCM key and publish the ciphertext.

The fully mocked safety-net sequence runs in a terminal:

```bash
npm run demo:mock
```

## Mission completed: Mission 02 — Built to expire

Mission completed: Mission 02

- [x] 02 Built to expire
      what changes when the entity lapses: the gateway changes from approved to REFUSED and completes no signing-capable action
      lifetime used: 60 blocks — requested as 120 seconds at the nominal two-second block conversion
      evidence: the same `agent_id + $expiresAt + $creator` query returned `found=true` at block 349722 and `found=false, entities=[]` at block 349784, with no delete call in between

Arkiv Entity Expiration is the authorization primitive: the gateway changes from approval to refusal because the entity disappears from Arkiv's live query surface, not because a job deletes or revokes it. Lifetime Extension is intentionally unavailable for mandates.

Live evidence captured on Tiramisu:

- Entity: [`0xab606…12582f`](https://tiramisu.explorer.arkiv.network/entity/0xab606272c6fffe0338e5dfd0cb56e55d8233978499607f1483938d597d12582f)
- Creation transaction: [`0x91262…cc7126`](https://tiramisu.explorer.arkiv.network/tx/0x91262da1e7d7aa80c82d20b9f635dbc27448d6d6154452ecc2db4d77a0cc7126)
- Before expiry: the public query found the entity at block `349722`.
- Entity Expiration: `$expiresAt = 349781`.
- After expiry: the same query returned an empty entity list at block `349784`.
- Gateway result: `REFUSED — mandate expired or absent: Arkiv returned no matching unexpired entity at block 349784.` No signing-capable action completed.

### Mission 02 before/after evidence

- Applied lifetime: `60` Tiramisu blocks = `120` seconds at the nominal two-second block time; creation returned `$expiresAt = 349781`.
- Query used on both sides: `agent_id = str('1c111642-1d96-4e7d-b7fd-87cd550c692f') AND $expiresAt > u64(<current_head>) AND $creator = addr(0x5B64003476D76dd22FA78B01D2EB8b3D078b9dAf)`.
- Before natural expiration, at block `349722`: `found=true`, with entity `0xab606272c6fffe0338e5dfd0cb56e55d8233978499607f1483938d597d12582f`.
- No delete call, revoke call, Lifetime Extension, or cleanup job occurred between the reads.
- After natural expiration, at block `349784`: `found=false`, `entities=[]`.
- Visible application change: the gateway changed from an approved live mandate to `REFUSED`, and the signing-capable action completed count remained `0`.

Run `npm run demo:arkiv` to create a fresh two-minute proof, or `npm run verify:mandate <agent>` for the public amount-free query.
The compact reviewer index is [arkiv/submission.md](./arkiv/submission.md).

`npm run demo` is the interactive Base mainnet run. It creates one persistent Privy agent wallet on first use, reuses that wallet from `GATEWAY_STORE_PATH` on every later run, prints its funding address, and previews the exact 0.05 USDC recipient plus the fixed 1 USDC vault deposit. No signing call occurs until the wallet is funded and the operator types the exact confirmation phrase.

The live run verifies and prints a BaseScan link for the canonical Base USDC transfer, then prints the exact-amount approval and direct ERC-4626 deposit hashes, BaseScan links, and vault shares received. The transfer recipient must exactly equal `DEMO_PAYMENT_RECIPIENT`.

**Privy Earn status:** its API currently returns `409 invalid_state` for this app, so the default fallback is a direct deposit into the allowlisted Steakhouse Prime USDC Morpho Vault V2, with both transactions signed through Privy; set `EARN_VIA_PRIVY=true` to retry the pending Privy Earn path.

**AIMorgan fee waived for the demo (our own service; x402 relay offline)**. The live sequence still calls `strategize` with `dry:true` first, requires `priceValidation.allPassed === true`, and then calls `strategize?free=true`. Set `AIMORGAN_X402=true` to restore the guarded x402 quote/signing path when the relay is available again.

## Security boundary

`src/core/gateway.ts` is the only application path to any signing-capable adapter. The gateway:

- keeps private mandate terms, accounting and idempotency records in the unflat store, never AIMorgan;
- performs a fresh Arkiv `agent_id + not expired + $creator` query for every authorization decision and fails closed on an empty or failed query;
- checks action scope, per-action limit, and remaining total only after Arkiv proves the mandate entity is still live;
- checks the mandate immediately before every signing call and atomically reserves spend immediately before transfers, x402 signing, Privy Earn, or the direct deposit;
- refuses unless AIMorgan returned `priceValidation.allPassed === true`;
- runs `dry: true` strategize before the fee-waived or x402 call;
- stores validated paid strategies server-side and accepts only their opaque ID for sweep;
- ignores AIMorgan vault picks and selects only from `UNFLAT_VAULT_ALLOWLIST`;
- independently checks Base USDC balance plus `eth_estimateGas` before transfer; before a vault deposit it verifies the allowlisted address, canonical Base USDC as the on-chain asset, and sufficient wallet balance, then simulates the direct deposit with `eth_call` after its exact approval confirms;
- uses `?free=true` only for the explicitly labelled fee-waived demo path; the x402 path remains available only behind `AIMORGAN_X402=true`.

Every decision has a human-readable reason and is appended to the statement. See [SECURITY.md](./SECURITY.md) for the invariants and tests.

## Commands

```bash
npm run dev        # Next.js App Router dashboard and API
npm run test       # invariant tests
npm run typecheck  # strict TypeScript
npm run build      # production build
npm run demo       # interactive, confirmed Base mainnet sequence
npm run demo:arkiv # live Tiramisu entity, two-minute expiry, empty query, gateway refusal
npm run demo:earn  # interactive Earn-only retry; does not repeat the proof transfer
npm run demo:mock  # all-mock safety-net sequence
npm run verify:mandate <agent> # public, amount-free Arkiv existence check
npm run mcp        # stdio MCP adapter (gateway must be running)
```

`npm run test` includes a live Tiramisu integration test and therefore requires a funded `ARKIV_PRIVATE_KEY`; it creates one short-lived test entity. Other gateway safety tests keep Base, Privy, AIMorgan, Swarm and ENS mocked.

## API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/agents` | Create an agent wallet and identity |
| `POST` | `/api/mandates` | Grant an expiring mandate |
| `POST` | `/api/actions/pay` | Pay an x402 resource through the gate |
| `POST` | `/api/actions/transfer` | Transfer Base USDC to the configured demo recipient through the gate |
| `POST` | `/api/actions/strategize` | Dry, then fee-waived or flagged x402 AIMorgan strategize |
| `POST` | `/api/actions/sweep` | Sweep by trusted server-side strategy ID |
| `GET` | `/api/agents/:agentId` | Agent, mandate, and readable statement events |
| `POST` | `/api/statements` | Owner-key encryption and Swarm upload |
| `POST` | `/api/demo` | Isolated accelerated demo run |
| `GET` | `/api/vault` | Live Morpho API APY or an unavailable marker in mock mode |
| `GET` | `/api/health` | Per-adapter live/mock mode and reason |

## MCP

The stdio MCP server is deliberately a thin client of the HTTP gateway. It has no signing adapter and cannot bypass mandate checks.

```json
{
  "mcpServers": {
    "unflat-agents": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/unflat-agents",
      "env": { "UNFLAT_GATEWAY_URL": "http://localhost:3000" }
    }
  }
}
```

Tools: `create_agent`, `grant_mandate`, `pay_x402`, `transfer_usdc`, `strategize`, `sweep_idle`, and `get_agent_statement`.

## Adapter modes

Copy `.env.example` to `.env`. `MOCK_MODE=true` is the global all-mock override. With `MOCK_MODE=false` or unset, each adapter independently becomes live only when its complete configuration is present; otherwise that adapter uses a clearly labelled mock. Missing or malformed configuration never crashes module evaluation.

Live mode atomically persists private mandate terms, commitment openings, accounting and idempotency state at `GATEWAY_STORE_PATH` (default `.data/gateway.json`, permissions `0600`). Arkiv's uncached live query is the authorization source; local presence or timestamps cannot make an expired entity valid. Point the store at durable storage for deployment; mock and scripted demo runs remain isolated in memory.

Live adapters use:

- Privy Node's wallet-backed x402 client and `eth_sendTransaction` for Base USDC approvals, transfers, and direct Morpho deposits; the Privy Earn API remains available behind `EARN_VIA_PRIVY=true`;
- Arkiv SDK `0.8.0` on Tiramisu (`eip155:7738577`), with a two-minute entity TTL and a fresh `$expiresAt` query before every signing-capable action;
- viem on Base for independent transfer gas checks and Earn vault asset/balance checks, and on Sepolia to verify ENSv2 resolution;
- a hosted Swarm upload endpoint; no local Bee node is required;
- AIMorgan at fixed origin `https://aimorgan.net`, treated as fail-closed advisory input; it needs no credentials. Its x402 path is disabled unless `AIMORGAN_X402=true`.

`UNFLAT_VAULT_ALLOWLIST` is a JSON array of `{ id, address, label, execution }`. `execution` is `direct-morpho` for the underlying vault or `privy-earn-api` for Privy's fee wrapper. AIMorgan cannot select or modify this list.

Privy's Morpho fee wrappers are Vault V2 contracts. Their ERC-4626 `maxDeposit`, `maxMint`, `maxWithdraw`, and `maxRedeem` views deliberately return zero as a conservative, revert-free underestimate because access may be controlled by gates. The gateway therefore does not treat `maxDeposit == 0` as a capacity failure for a Privy Earn API deposit; it verifies the actual gate-independent facts above and lets Privy's authenticated Earn action manage approval and execution.

The dashboard does not embed an illustrative rate. It reads the allowlisted Vault V2's realized six-hour average APY from Morpho's public API and labels that source; mock mode displays APY as unavailable and substitutes no number.

## Arkiv: built to expire

The public mandate entity has an empty payload and only `agent_id`, `expiry`, and a `bytes32` keccak256 commitment. Raw caps, action scope and the random commitment secret stay in the private unflat store and owner-encrypted statement. The gateway queries by `agent_id`, `$expiresAt > current head`, and immutable `$creator`; after Arkiv TTL removes the entity, absence itself causes refusal. See [arkiv/schema.md](./arkiv/schema.md) and the reproducible [friction log](./arkiv/friction.md).

## Source policy

This repository was initialized empty for the hackathon. It contains no vendored AIMorgan code and no source copied from the older projects beside it on disk.

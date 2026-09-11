# unflat × agents

An expiring bank account for AI agents, built for ETHRome 2026.

The gateway creates a Privy agent wallet and an ENSv2 identity, enforces a short-lived spending mandate stored by unflat and projected to Arkiv with TTL, pays x402 resources, asks AIMorgan for advisory strategy, sweeps idle USDC only through Privy Earn to an unflat allowlisted Morpho vault, and publishes an owner-encrypted statement to Swarm.

## Demo

Requires Node 22 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and click **Run the 2-minute mandate**.

The dashboard runs a deterministic mock sequence with no credentials or external availability:

1. create `atlas.agents.unflat.eth` and a Privy agent wallet;
2. grant a two-minute mandate;
3. pay an x402 resource;
4. call AIMorgan `/api/strategize` with `dry: true`, then make the paid REST call;
5. sweep idle USDC to the unflat allowlisted vault through Privy Earn;
6. advance past expiry and show the next action as `REFUSED`;
7. encrypt the statement with an owner-held AES-256-GCM key and publish the ciphertext.

The same sequence runs in a terminal:

```bash
npm run demo
```

## Security boundary

`src/core/gateway.ts` is the only application path to any signing-capable adapter. The gateway:

- reads mandates and idempotency records only from the unflat store;
- checks TTL, action scope, per-action limit, and remaining total;
- atomically reserves spend immediately before every Privy x402 or Earn call;
- refuses unless AIMorgan returned `priceValidation.allPassed === true`;
- runs free `dry: true` strategize before constructing the paid call;
- stores validated paid strategies server-side and accepts only their opaque ID for sweep;
- ignores AIMorgan vault picks and selects only from `UNFLAT_VAULT_ALLOWLIST`;
- independently checks `eth_estimateGas` and USDC allowance before Privy Earn;
- never routes paid AIMorgan traffic through its MCP or `?free=true` paths.

Every decision has a human-readable reason and is appended to the statement. See [SECURITY.md](./SECURITY.md) for the invariants and tests.

## Commands

```bash
npm run dev        # Next.js App Router dashboard and API
npm run test       # invariant tests
npm run typecheck  # strict TypeScript
npm run build      # production build
npm run demo       # scripted end-to-end sequence
npm run mcp        # stdio MCP adapter (gateway must be running)
```

## API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/agents` | Create an agent wallet and identity |
| `POST` | `/api/mandates` | Grant an expiring mandate |
| `POST` | `/api/actions/pay` | Pay an x402 resource through the gate |
| `POST` | `/api/actions/strategize` | Dry, then paid AIMorgan strategize |
| `POST` | `/api/actions/sweep` | Sweep by trusted server-side strategy ID |
| `GET` | `/api/agents/:agentId` | Agent, mandate, and readable statement events |
| `POST` | `/api/statements` | Owner-key encryption and Swarm upload |
| `POST` | `/api/demo` | Isolated deterministic demo run |

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

Tools: `create_agent`, `grant_mandate`, `pay_x402`, `strategize`, `sweep_idle`, and `get_agent_statement`.

## Live mode

Mock mode is the default. Copy `.env.example` to `.env`, set `MOCK_MODE=false`, and provide credentials and deployment-specific addresses. No secret has a source-code fallback.

Live mode atomically persists the unflat-owned source of truth at `GATEWAY_STORE_PATH` (default `.data/gateway.json`, permissions `0600`). Point this at durable storage for deployment; mock and scripted demo runs remain isolated in memory.

The live adapters use:

- Privy Node's wallet-backed x402 client and Privy Earn deposit API;
- Arkiv SDK `0.7.0` on its Braga testnet with TTL rounded to its two-second block interval;
- viem on Base for independent gas/allowance checks and on Sepolia to verify ENSv2 resolution;
- a hosted Swarm upload endpoint; no local Bee node is required;
- AIMorgan only at `https://aimorgan.net`, treated as fail-closed advisory input.

`UNFLAT_VAULT_ALLOWLIST` is a JSON array of `{ id, address, label }`, where `id` is the Privy Earn vault ID and `address` is the matching Base vault/wrapper address used by the independent preflight.

## Source policy

This repository was initialized empty for the hackathon. It contains no vendored AIMorgan code and no source copied from the older projects beside it on disk.

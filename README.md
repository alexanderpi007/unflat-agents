# unflat × agents

An expiring bank account for AI agents, built for ETHRome 2026.

Public GitHub repository: [alexanderpi007/unflat-agents](https://github.com/alexanderpi007/unflat-agents).

Deployed dapp: https://unflat-agents.vercel.app

The gateway creates a Privy agent wallet and an ENSv2 identity, enforces a short-lived spending mandate through Arkiv's live TTL query surface, makes guarded Base USDC payments, asks AIMorgan for advisory strategy, and sweeps idle USDC to an unflat allowlisted Morpho vault. The owner publishes the statement to Swarm with native encryption through browser-side Swarm ID.

## Demo

Requires Node 22 or newer.

```bash
npm install
npm run dev
```

The dashboard opens on **nova’s September 13 owner-owned wallet run via Claude.ai**. **Previous real runs** switches to **Atlas’s September 12 run via Claude Code**. Both are committed read-only statements: [nova](public/real-runs/nova-2026-09-13.json), [Atlas](public/real-runs/atlas-2026-09-12.json). Each has its own Base, Arkiv and ENS proofs and expiry refusal with $0.15 left. The six-line Story is a retelling of recorded decisions, not a chat transcript; client attribution and the public owner label are supplied by the demo owner, not inferred from transactions. **Run a simulation →**, at the bottom, temporarily replaces the view with simulated money and real Arkiv expiry; **Back to the real run** restores the selected archive. Loading or switching archives sends no transactions and never authorizes spending.

`npm run export:real-run` exports those two explicitly approved account/date selections from the local gateway store into `public/real-runs/*.json`, and keeps `public/real-run.json` as the latest-run compatibility URL. It rejects incomplete/mock runs and unexpected dates, and whitelists public fields: no emails, tokens, wallet-service IDs, mandate openings/secrets, idempotency data or Swarm references. It never signs or broadcasts. For a new approved video take, update the selections in `scripts/export-real-run.ts` and page imports, then export, review, commit and redeploy; new enrolled accounts are never automatically made public. Public deployments cannot refresh snapshots from the private store. Set the funded `ARKIV_PRIVATE_KEY` in `.env` for simulations with real expiry.

The dashboard streams each step with runtime timestamps and a real 60-block (nominally two-minute) Arkiv lifetime:

1. reuse the displayed persistent wallet `0xe35285DDaBDD0d0C2F70F4067f7E06341E8a44e7`; no new Privy wallet is created;
2. grant a two-minute mandate;
3. transfer 0.05 USDC through the same mandate and signing gateway;
4. call AIMorgan `/api/strategize` with `dry: true`, then `?free=true`;
5. deposit exactly 1 USDC into the unflat allowlisted Morpho vault through the mocked direct path;
6. wait for the uncached Arkiv query to become empty, attempt the next action and show `EXPIRED` and `REFUSED`;
7. connect Swarm ID in OWNER RECORD, then publish the statement with native encryption to the owner's drive.

Deployed Swarm storage and the mocked agent sequence are labelled separately. The owner keeps the full 128-hex encrypted reference; it never reaches the gateway. Retrieve it from a fresh browser session without running the demo again. See [Swarm setup and click steps](./swarm/README.md).

The fully mocked safety-net sequence runs in a terminal:

```bash
npm run demo:mock
```

On the local gateway or its temporary HTTPS tunnel, **Owner mode** uses Privy email OTP. It lists only accounts matching the verified email and stored Privy user ID. Follow the agent's `/owner?request=<id>` link and type **CONFIRM** to approve its two-minute budget. `OWNER_TOKEN` remains an API-only bank-operator override for legacy Atlas and operator recovery, never a UI login. Vercel never renders Owner mode and rejects owner/MCP execution even with valid credentials or spoofed hosts. Keep the tunnel open only during the demo.

## What is live vs mock

| Component | Public / MOCK money dashboard | Local LIVE dashboard | `demo:mock` |
|---|---|---|---|
| Wallet | Persistent address displayed; no provisioning/signing | Existing Privy wallet ID from private store | Isolated simulated wallet |
| 0.05 USDC transfer + 1 USDC deposit | Two real archived runs with Base proof links; optional simulations never broadcast | Real Base transactions, gated and confirmed | Simulated |
| Arkiv mandate | Real Tiramisu creation, uncached query, natural expiry | Same real TTL/query checks | Simulated, accelerated |
| AIMorgan | Simulated strategy/validation | External dry then fee-waived strategy; validation required | Simulated |
| APY card | Read-only Morpho API, or explicitly unavailable | Same source | No invented APY |
| Swarm ID | Real owner-selected drive after browser connection | Same | Simulated CLI storage |
| ENS | **LIVE — read-only Sepolia resolution** of the registered Atlas name; no ENS signing keys | **LIVE** ENSv2 registration, delegated roles and resolve-back with configured keys | Mock |

`MOCK_MODE=true` means **mock money**, not mock Arkiv. Missing Arkiv configuration refuses the dashboard run rather than fabricating an entity. Each public run uses an isolated agent/session ID and in-memory accounting with the same displayed wallet; no local record authorizes an action without Arkiv. The public demo consumes testnet gas and depends on the funded creator key/network. It is a hackathon demo, not an authenticated multi-tenant financial service.

## Four live proofs

Deposit recovery: [confirmed 1 USDC deposit, block 51217477](https://basescan.org/tx/0xd16a7ee70eacd0b22e260bf841c41a0016027d42b58efdb9fc8a6636604a8b0a), receiving `961301103141262720` raw shares (`0.961301103141262720`). An RPC rate limit on the optional decimals lookup prevented the original completion entry; `npm run reconcile:deposit` restores it idempotently from the receipt, without signing, recharging the mandate, or resending the deposit. It updates the local gateway statement, not previously published owner-held Swarm statements. Confirmed deposits now retain receipt evidence if display lookups fail: raw shares and the transaction link remain; formatted shares/decimals are labelled unavailable. Base read clients use three bounded retries with exponential backoff (1s, 2s, 4s; provider Retry-After respected). A keyed `BASE_RPC_URL` can replace the public endpoint in `.env`; never commit its value.

1. **Base mainnet (historical live run):** [0.05 USDC transfer](https://basescan.org/tx/0xb082890bd85d47e8488b0bc268f04a3cd6ce5636a223f300192e033ff36a7c12), [exact approval](https://basescan.org/tx/0x655042d61c625741c24c97588b9af62113c171b0a692d9c4b3684eee1a1a0e6b), [1 USDC Morpho deposit](https://basescan.org/tx/0x3d82d0a3e51fc99655736a02831a2a93599c2628ea58888a6de427202afd313f). Recorded shares: `0.961330596878870251`. These are not the synthetic hashes in the Swarm mock-statement proof.
2. **Arkiv:** [entity and natural-expiration proof](https://tiramisu.explorer.arkiv.network/entity/0xab606272c6fffe0338e5dfd0cb56e55d8233978499607f1483938d597d12582f), found at block 349722, empty at 349784; gateway refused without delete/extend. See [Mission 02 evidence](./arkiv/submission.md).
3. **Swarm:** owner verified a 5,582-byte mock-demo statement uploaded with native encryption + deferred mode and retrieved as matching plaintext, with approximately four-day drive TTL. See [retrieval evidence and reproduction](./swarm/README.md). The owner-held secret reference is never committed or sent to the gateway.
4. **ENSv2 Sepolia:** [Atlas identity](https://explorer.ens.dev/atlas.agents.unflat.eth), [registration transaction](https://sepolia.etherscan.io/tx/0xb3026ea2ad2d53cd463fbe47a3cfcda39c218d7f53b78a6836fc9a54adfaf5bf), independently resolved to `0xe35285DDaBDD0d0C2F70F4067f7E06341E8a44e7`. The public site reads this live; [roles and record evidence](ens/README.md).

## Swarm bounty — browser identity and owner storage

Swarm ID supplies the trusted popup/proxy iframe, owner drive postage, native encryption and retrieval. Live round-trip verified by the owner; no Bee node or server postage configuration is required. [Implementation and evidence](./swarm/README.md).

## ENS bounty — verified on Sepolia

[`atlas.agents.unflat.eth`](https://explorer.ens.dev/atlas.agents.unflat.eth) resolves on ENSv2 Sepolia to the persistent Privy wallet `0xe35285DDaBDD0d0C2F70F4067f7E06341E8a44e7`. [Registration transaction](https://sepolia.etherscan.io/tx/0xb3026ea2ad2d53cd463fbe47a3cfcda39c218d7f53b78a6836fc9a54adfaf5bf), [gateway record-role delegation](https://sepolia.etherscan.io/tx/0x15696848e642e3389d200ee0dfa7fbc136509ca60236e158882b78ffd061df8b), [Arkiv commitment record update](https://sepolia.etherscan.io/tx/0xa7df8c7f43d9463860574f1b5a9fb76ebb2eef4d83769872277c253233b3fbb5). The deployer owns the parent; a distinct gateway signer has only child-registration authority and name-scoped address/text roles. The gateway refuses unresolved or mismatched identities and re-resolves before every financial signing reservation. Records bind the wallet, owner, gateway URL and latest locally signed Arkiv commitment. The public dashboard resolves ENS live with only `SEPOLIA_RPC_URL`: no ENS private keys are deployed, and Vercel always selects the keyless reader. Public mock-money runs create real Arkiv mandates but do not update ENS records; their statements explicitly disclose this. See [ENS architecture, contracts and proof](ens/README.md).

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

`npm run test` includes a live Tiramisu integration test requiring a funded `ARKIV_PRIVATE_KEY` (one short-lived test entity) and a read-only Sepolia resolve-back test for the created Atlas identity using `SEPOLIA_RPC_URL`. Gateway safety tests mock external services and prove missing/changing ENS resolution refuses before signing. `npm run demo:mock` stays fully offline.

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
| `POST` | `/api/statements` | Returns JSON 409 directing publication to the owner's browser; accepts no reference/key |
| `POST` | `/api/demo` | NDJSON mock-money/real-Arkiv run, or owner-token + CONFIRM LIVE run (never Vercel) |
| `POST` | `/api/mcp` | Six tools; enrollment token creates an account, account token required thereafter; disabled on Vercel |
| `GET` / `POST` | `/api/owner/accounts` | Owner-token protected account balances/funding addresses; grant per account with CONFIRM |
| `GET` / `POST` | `/api/owner/approvals` | Owner-token protected pending queue / approve or deny; approval also requires CONFIRM |
| `GET` | `/api/vault` | Live Morpho API APY or an unavailable marker in mock mode |
| `GET` | `/api/health` | Per-adapter live/mock mode and reason |

## MCP

New accounts are **owner-owned Privy user wallets**, pregenerated for `owner_email`; the gateway is only a policy-limited additional signer. Atlas remains app-owned legacy. See [wallet ownership, recovery and configuration](docs/OWNERSHIP.md). This change is developed on `owner-wallets`, not merged into main.

Streamable HTTP at `/api/mcp` and the retained `npm run mcp` stdio bridge expose exactly `get_account`, `request_mandate`, `pay`, `strategize`, `save`, and `statement`. No agent tool grants permission. Owner approval is a separate bearer-token role, with typed CONFIRM for a two-minute, $1.20 cap mandate. Financial/advice tools still go through the gateway and fresh Arkiv checks. Read/request tools work without an active mandate.

Use the [owner laptop / agent laptop quickstart](docs/QUICKSTART-AGENT.md) and [tool inputs/outputs](docs/MCP.md). Owners log in with Privy email OTP. `OWNER_TOKEN` is a bank-operator API override only, hidden from the UI. Existing raw operator mutation APIs still require the operator bearer token plus `X-Unflat-Confirmation: CONFIRM`; the agent token cannot use them. Legacy account-state REST reads remain operator-only; `/api/owner/accounts` provides identity-scoped owner reads. Vercel exposes neither owner execution nor MCP execution.

Enrollment is anonymous and store-rate-limited (five/IP/hour, ten/gateway/hour): `get_account({name:"nova",owner_email:"owner@example.com"})` pregenerates an owner-owned Privy wallet and `nova.agents.unflat.eth`, returning its funding address and a **per-account token once**. The same MCP session is bound after get_account; later calls need no repeated token. In a new session pass the saved `account_token` argument to get_account; Bearer headers and private token URLs remain supported. The store retains only token hashes; names cannot be reclaimed to recover a token. Owner mode lists accounts, emails and addresses, supports per-account grants/approvals and owner-only recovery, and links to a separate Privy owner login for direct withdrawal, export and revocation. A stable public owner ID is written to ENS, never the email or owner secret. Atlas's wallet, name and history stay unchanged. Restart the local server after this store-schema upgrade; public Vercel behavior is unchanged.

## Adapter modes

Copy `.env.example` to `.env`. `MOCK_MODE=true` mocks financial actions; configured Arkiv/ENS, read-only Morpho APY and browser Swarm remain live. `SEPOLIA_RPC_URL` alone enables live read-only ENS. Local ENS writes require `ENS_DEPLOYER_PRIVATE_KEY` and the distinct `ENS_GATEWAY_PRIVATE_KEY`, funded on Sepolia and granted roles through `npm run setup:ens`. No HTTP registrar service is needed. `demo:mock` explicitly forces all mocks. Local LIVE dashboard execution requires complete Privy/AIMorgan/Arkiv configuration and rejects any financial mock fallback. Vercel forces mock money and keyless ENS regardless of signing-key environment values. Missing or malformed configuration never crashes module evaluation.

Live mode atomically persists private mandate terms, commitment openings, accounting and idempotency state at `GATEWAY_STORE_PATH` (default `.data/gateway.json`, permissions `0600`). Arkiv's uncached live query is the authorization source; local presence or timestamps cannot make an expired entity valid. Point the store at durable storage for deployment; mock and scripted demo runs remain isolated in memory.

Live adapters use:

- Privy Node's wallet-backed x402 client and `eth_sendTransaction` for Base USDC approvals, transfers, and direct Morpho deposits; the Privy Earn API remains available behind `EARN_VIA_PRIVY=true`;
- Arkiv SDK `0.8.0` on Tiramisu (`eip155:7738577`), with a two-minute entity TTL and a fresh `$expiresAt` query before every signing-capable action;
- viem on Base for independent transfer gas checks and Earn vault asset/balance checks, and on Sepolia to verify ENSv2 resolution;
- browser-side Swarm ID for native encrypted uploads/downloads using the owner's drive; no server postage configuration;
- AIMorgan at fixed origin `https://aimorgan.net`, treated as fail-closed advisory input; it needs no credentials. Its x402 path is disabled unless `AIMORGAN_X402=true`.

`UNFLAT_VAULT_ALLOWLIST` is a JSON array of `{ id, address, label, execution }`. `execution` is `direct-morpho` for the underlying vault or `privy-earn-api` for Privy's fee wrapper. AIMorgan cannot select or modify this list.

Privy's Morpho fee wrappers are Vault V2 contracts. Their ERC-4626 `maxDeposit`, `maxMint`, `maxWithdraw`, and `maxRedeem` views deliberately return zero as a conservative, revert-free underestimate because access may be controlled by gates. The gateway therefore does not treat `maxDeposit == 0` as a capacity failure for a Privy Earn API deposit; it verifies the actual gate-independent facts above and lets Privy's authenticated Earn action manage approval and execution.

The dashboard does not embed an illustrative rate. It reads the allowlisted Vault V2's realized six-hour average APY from Morpho's public API and labels that source; mock mode displays APY as unavailable and substitutes no number.

## Arkiv: built to expire

The public mandate entity has an empty payload and only `agent_id`, `expiry`, and a `bytes32` keccak256 commitment. Raw caps, action scope and the random commitment secret stay in the private unflat store. The browser statement includes displayed mandate terms, but not the private commitment opening. The gateway queries by `agent_id`, `$expiresAt > current head`, and immutable `$creator`; after Arkiv TTL removes the entity, absence itself causes refusal. See [arkiv/schema.md](./arkiv/schema.md) and the reproducible [friction log](./arkiv/friction.md).

## Source policy

This repository was initialized empty for the hackathon. It contains no vendored AIMorgan code and no source copied from the older projects beside it on disk.

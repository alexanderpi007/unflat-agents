# Arkiv mandate schema

## Network and client

- Network: Tiramisu public testnet, chain ID `7738577`.
- Runtime: `@arkiv-network/sdk@0.8.0` with the built-in `tiramisu` chain.
- Writer: the funded unflat backend address `0x5B64003476D76dd22FA78B01D2EB8b3D078b9dAf`.
- Reader: a keyless Arkiv public client. Every trusted query filters by immutable `$creator`.

## Entity types

### `spending_mandate`

This schema defines Arkiv entities. Each Arkiv entity represents one short-lived spending mandate, has an empty `application/octet-stream` payload, and carries exactly three application attributes:

| Attribute | Arkiv type | Meaning |
|---|---|---|
| `agent_id` | `str` | The gateway agent UUID. It is the public lookup key. |
| `expiry` | `u64` | The owner-requested wall-clock expiry in Unix milliseconds, for display and audit. |
| `commitment` | `bytes32` | A keccak256 commitment to the private spending terms. |

Arkiv also supplies its protocol metadata: entity key, creator, owner, creation/update blocks and `$expiresAt`. Those are system fields, not additional application data. `$expiresAt` is the authoritative expiry block.

The commitment is:

```text
keccak256(abi.encode(
  string agent,
  uint256 cap_usdc_cents,
  uint256 per_action_cap_usdc_cents,
  bytes32 secret
))
```

The order and ABI types are fixed. String concatenation is not used.

## Why Arkiv and Entity Expiration

The user-visible capability is a bank account whose delegated signing permission ends by itself. A Web2 database could compare a timestamp, but its operator could retain or alter that state; Arkiv Entity Expiration changes the independently queryable network state without a cron job or revocation transaction. The trade-offs are testnet gas, block-time approximation and dependence on the public query RPC.

The owner grant requests two minutes nominally and creates the entity with `ExpirationTime.fromBlocks(60)`, applying the profile's nominal two-second interval explicitly. The creation receipt's `$expiresAt` height is authoritative because Tiramisu wall-clock cadence can vary. No revoke method or cleanup job exists. Arkiv removes an expired entity from its live query surface; absence is the refusal signal. Lifetime Extension is deliberately not exposed: extending a spending mandate would undermine the demo's promise that authorization ends without revocation. A later mandate must be a newly committed entity after the old one disappears.

Immediately before every signing-capable call, the gateway performs a new public-client query equivalent to:

```ts
const head = await publicClient.getBlockNumber();
const result = await publicClient
  .select({ key: true, creator: true, expiresAt: true, attributes: true })
  .where(
    eq("agent_id", str(agentId)),
    gt("$expiresAt", u64(head)),
  )
  .createdBy("0x5B64003476D76dd22FA78B01D2EB8b3D078b9dAf")
  .fetch();
```

The returned entity key and commitment must match the stored mandate in the gateway. The query result is not cached. An empty result or query failure refuses the action before AIMorgan validation, x402 submission, or any Privy signing call.

## What deliberately stays OFF Arkiv

- Raw total and per-action caps stay in the unflat gateway store because they are private enforcement inputs.
- Allowed actions, spend consumed, owner identity and idempotency keys stay in the gateway store because Arkiv is not trusted as the mutable accounting store.
- The random 32-byte commitment secret stays in the private gateway store, so observers cannot brute-force tiny cent-denominated caps. The browser statement export does not include this private commitment opening.
- The native-encrypted statement stays on Swarm. Its full 128-hex reference contains both the data address and decryption key: it is private to the owner, never public or stored by the gateway.

Anyone can run `npm run verify:mandate <agent>` to query the public existence proof. It reports the entity key, commitment and expiry metadata, never the caps or secret.

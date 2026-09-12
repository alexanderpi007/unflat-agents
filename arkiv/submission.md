# ETHRome Arkiv evidence index

Public GitHub repository: [alexanderpi007/unflat-agents](https://github.com/alexanderpi007/unflat-agents).

Deployed dapp: https://unflat-agents.vercel.app

## Missions completed (tick at least one)

- [x] 02 Built to expire
      what changes when the entity lapses: the gateway changes from approved to REFUSED and completes no signing-capable action
      lifetime used: 60 blocks — requested as 120 seconds at the nominal two-second block conversion
      evidence: the same `agent_id + $expiresAt + $creator` query returned `found=true` at block 349722 and `found=false, entities=[]` at block 349784, with no delete call in between

Mission completed: Mission 02. Something in the app changes because Arkiv data expires on its own, not because a job deletes it.

- Network: Tiramisu, chain ID `7738577`.
- SDK: `@arkiv-network/sdk@0.8.0`.
- Creator wallet: `0x5B64003476D76dd22FA78B01D2EB8b3D078b9dAf`.
- Requested lifetime: `120` seconds.
- Lifetime in blocks: `60` Tiramisu blocks at the network's nominal two-second block time.
- Applied expiration height: `$expiresAt = 349781`, returned by the creation receipt.
- Entity key: [`0xab606272c6fffe0338e5dfd0cb56e55d8233978499607f1483938d597d12582f`](https://tiramisu.explorer.arkiv.network/entity/0xab606272c6fffe0338e5dfd0cb56e55d8233978499607f1483938d597d12582f).
- Creation transaction: [`0x91262da1e7d7aa80c82d20b9f635dbc27448d6d6154452ecc2db4d77a0cc7126`](https://tiramisu.explorer.arkiv.network/tx/0x91262da1e7d7aa80c82d20b9f635dbc27448d6d6154452ecc2db4d77a0cc7126).
- Query before expiration at block `349722`: `agent_id = str('1c111642-1d96-4e7d-b7fd-87cd550c692f') AND $expiresAt > u64(349722) AND $creator = addr(0x5B64003476D76dd22FA78B01D2EB8b3D078b9dAf)` returned `found=true` and the entity key above.
- Query after expiration at block `349784`: the same query, with only the current-head operand changed to `u64(349784)`, returned `found=false` and `entities=[]`.
- Before behavior: the mandate query found the entity and the gateway authorization decision was approved.
- After behavior: the gateway returned `REFUSED — mandate expired or absent: Arkiv returned no matching unexpired entity at block 349784.` Zero signing-capable action events completed after expiry.
- Natural expiration evidence: no `deleteEntity`, revoke call, Lifetime Extension, cleanup job, or local authorization cache exists in this path. The script observed Tiramisu blocks until the unchanged query returned no entity.
- Reproduce: `npm run demo:arkiv` writes a fresh two-minute entity and displays both queries plus the refusal. `npm run verify:mandate <agent>` is the keyless public existence check.
- Implementation: `src/adapters/live/arkiv.ts`, `src/core/mandates.ts`, `src/core/gateway.ts`, `scripts/demo-arkiv.ts`, and `scripts/verify-mandate.ts`.
- Real integration test: `src/adapters/live/arkiv.integration.test.ts` creates a funded test entity, authorizes through the real query, waits for natural expiry, and asserts refusal.
- Schema and privacy boundary: `arkiv/schema.md`.
- Reproducible Arkiv feedback: `arkiv/friction.md`.

## Mission 02 evidence

Entity ID: `0xab606272c6fffe0338e5dfd0cb56e55d8233978499607f1483938d597d12582f`.

[Entity history](https://tiramisu.explorer.arkiv.network/entity/0xab606272c6fffe0338e5dfd0cb56e55d8233978499607f1483938d597d12582f) · [Creation transaction](https://tiramisu.explorer.arkiv.network/tx/0x91262da1e7d7aa80c82d20b9f635dbc27448d6d6154452ecc2db4d77a0cc7126).

The identical query template was executed on both sides of natural expiration. Only `current_head` changes with the chain; the agent and creator predicates remain identical:

```text
agent_id = str('1c111642-1d96-4e7d-b7fd-87cd550c692f') AND $expiresAt > u64(current_head) AND $creator = addr(0x5B64003476D76dd22FA78B01D2EB8b3D078b9dAf)
```

```text
Before: current_head=349722, found=true
entities=[0xab606272c6fffe0338e5dfd0cb56e55d8233978499607f1483938d597d12582f]
Applied expiration: $expiresAt=349781 (60 blocks, nominally two minutes)
After:  current_head=349784, found=false, entities=[]
```

Gateway refusal captured from `npm run demo:arkiv`:

```text
REFUSED — mandate expired or absent: Arkiv returned no matching unexpired entity at block 349784. TTL expiry removed authorization. No revocation was needed.
Signing-capable action events completed after expiry: 0
```

The [creator's Tiramisu transaction history](https://tiramisu.explorer.arkiv.network/address/0x5B64003476D76dd22FA78B01D2EB8b3D078b9dAf) contains only the creation transaction during this proof window (blocks 349720–349784): transaction `0x91262da1e7d7aa80c82d20b9f635dbc27448d6d6154452ecc2db4d77a0cc7126` was mined at block 349721 with nonce 4. Independent `eth_getTransactionCount` reads returned 4 at block 349720, 5 at block 349722, and still 5 at block 349784. No delete or extend transaction was sent by the creator during this interval. Earlier test transactions also appear in the address's full history.

Visible app change: the dashboard renders the mandate state as `EXPIRED` and an “Action refused” card containing the gateway reason and `HTTP 403 / MANDATE_EXPIRED` ([dashboard source](https://github.com/alexanderpi007/unflat-agents/blob/main/src/components/dashboard.tsx)). The captured live Arkiv proof above is a terminal run; its temporary agent is not persisted to the deployed dashboard. The dashboard's public demo uses an accelerated mock sequence; its expiry label uses the display timestamp, while live signing authorization uses the uncached Arkiv query.
